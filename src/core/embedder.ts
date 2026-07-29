/**
 * 임베딩 생성 서비스
 *
 * Ollama API를 사용하여 텍스트 임베딩 생성.
 * - 캐싱으로 중복 임베딩 방지
 * - 벡터 정규화 (코사인 유사도 최적화)
 * - 배치 처리 지원
 */

import axios, { type AxiosInstance } from 'axios';
import http from 'node:http';
import https from 'node:https';
import type { EmbeddingConfig } from '../types/models.js';

/** Ollama 호출 재시도 설정 */
const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 300;

/** 5xx 재시도 시 입력을 절반으로 줄이는 하한 (이 아래로는 길이 문제로 보지 않음) */
const MIN_SHRINK_CHARS = 80;

/**
 * 임베딩 입력 토큰 상한.
 *
 * Ollama(0.13.x)의 nomic-embed-text 러너는 입력 토큰이 llama.cpp 기본 마이크로배치
 * 크기(n_ubatch = 512)를 넘어가면 출력 버퍼 재할당(output_reserve) 직후
 * llama_decode 안에서 SIGTRAP으로 프로세스가 죽는다. 그러면 Ollama는 해당 요청과
 * 러너 재기동 창에 들어온 요청에 HTTP 500을 돌려준다
 * (`llama runner process no longer running: 2`, `do embedding request: ... EOF`).
 *
 * 실측 경계: 영문 약 500토큰 성공 / 600토큰 실패, 한국어 600자 성공 / 800자 실패.
 * 512에서 안전 마진을 둔 420토큰을 상한으로 잡고 초과분은 잘라서 보낸다.
 * (청킹 가이드도 청크당 100~512 토큰을 규정하므로 정상 청크는 잘릴 일이 없다.)
 *
 * 문자 기반 추정은 혼합 텍스트에서 빗나갈 수 있으므로, 그래도 5xx가 나면
 * callOllama 가 입력을 절반씩 줄이며 재시도한다(추정에 의존하지 않는 안전망).
 */
const MAX_INPUT_TOKENS = 420;

/** 토큰 추정 계수 (실측 기반, 안전하게 과대추정) */
const TOKENS_PER_CJK_CHAR = 1.0; // 실측 약 0.7
const TOKENS_PER_OTHER_CHAR = 0.5; // 실측 약 0.25

/** CJK(한중일) 문자 판정용 */
const CJK_PATTERN =
  /[ᄀ-ᇿ　-鿿가-힯豈-﫿＀-￯]/;

export class EmbeddingService {
  private config: EmbeddingConfig;
  private cache: Map<string, number[]>;
  private http: AxiosInstance;

  constructor(config: EmbeddingConfig) {
    this.config = config;
    this.cache = new Map();
    this.http = axios.create({
      timeout: 30000,
      // 커넥션 재사용 정책을 명시적으로 고정 (기본 globalAgent 의존 제거)
      httpAgent: new http.Agent({ keepAlive: true, maxSockets: 4, timeout: 60000 }),
      httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 4, timeout: 60000 }),
    });
  }

  /**
   * 단일 텍스트 임베딩 생성
   */
  async embed(text: string): Promise<number[]> {
    // 캐시 확인
    const cached = this.cache.get(text);
    if (cached) {
      return cached;
    }

    // Ollama API 호출 (러너 크래시를 피하기 위해 토큰 상한으로 잘라서 전송)
    const embedding = await this.callOllama(this.truncateForEmbedding(text));

    // 벡터 정규화 (코사인 유사도 최적화)
    const normalized = this.normalize(embedding);

    // 캐시 저장
    this.cache.set(text, normalized);

    return normalized;
  }

  /**
   * 배치 임베딩 생성
   */
  async batchEmbed(texts: string[]): Promise<number[][]> {
    // 병렬 처리 (캐시 활용)
    const embeddings = await Promise.all(
      texts.map(text => this.embed(text))
    );
    return embeddings;
  }

  /**
   * 토큰 추정 (문자 종류별 가중합, 안전하게 과대추정)
   */
  private estimateTokens(text: string): number {
    let cjk = 0;
    for (const ch of text) {
      if (CJK_PATTERN.test(ch)) cjk++;
    }
    const other = [...text].length - cjk;
    return cjk * TOKENS_PER_CJK_CHAR + other * TOKENS_PER_OTHER_CHAR;
  }

  /**
   * MAX_INPUT_TOKENS 를 넘는 텍스트를 잘라낸다.
   * 저장되는 원문(payload.text)은 그대로이고, 벡터만 앞부분 기준으로 생성된다.
   */
  private truncateForEmbedding(text: string): string {
    if (this.estimateTokens(text) <= MAX_INPUT_TOKENS) {
      return text;
    }

    const chars = [...text];
    // 추정 토큰이 상한 이하가 되는 지점까지 이진 탐색
    let lo = 0;
    let hi = chars.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (this.estimateTokens(chars.slice(0, mid).join('')) <= MAX_INPUT_TOKENS) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }

    const truncated = chars.slice(0, lo).join('');
    console.error(
      `[embed] 입력이 임베딩 토큰 상한(${MAX_INPUT_TOKENS})을 초과해 잘라냈습니다: ` +
      `${chars.length}자 → ${lo}자. 청크를 더 작게 나누는 것을 권장합니다.`
    );
    return truncated;
  }

  /**
   * Ollama API 호출
   */
  private async callOllama(text: string): Promise<number[]> {
    const url = `${this.config.ollamaHost}/api/embeddings`;
    let payload = text;
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const startedAt = Date.now();
      try {
        const response = await this.http.post(url, {
          model: this.config.model,
          prompt: payload,
        });

        if (!response.data.embedding) {
          throw new Error('Ollama API가 임베딩을 반환하지 않았습니다');
        }

        if (process.env.SPELLBOOK_DEBUG_EMBED === '1') {
          const reused = (response.request as { reusedSocket?: boolean } | undefined)?.reusedSocket;
          console.error(
            `[embed] ok attempt=${attempt} ${Date.now() - startedAt}ms ` +
            `len=${payload.length} reusedSocket=${reused}`
          );
        }

        return response.data.embedding;
      } catch (error) {
        lastError = error;

        // Ollama가 준 실제 응답 본문을 남긴다 (원인 규명의 핵심)
        if (axios.isAxiosError(error)) {
          const reused = (error.request as { reusedSocket?: boolean } | undefined)?.reusedSocket;
          console.error(
            `[embed] FAIL attempt=${attempt}/${MAX_ATTEMPTS} ${Date.now() - startedAt}ms ` +
            `url=${url} model=${this.config.model} promptLen=${payload.length} ` +
            `code=${error.code} status=${error.response?.status} reusedSocket=${reused} ` +
            `body=${JSON.stringify(error.response?.data)?.slice(0, 1000)}`
          );
        } else {
          console.error(`[embed] FAIL attempt=${attempt}/${MAX_ATTEMPTS}`, error);
        }

        if (attempt < MAX_ATTEMPTS && this.isRetryable(error)) {
          // 5xx 는 러너가 입력 길이 때문에 죽은 경우가 대부분이므로,
          // 같은 입력을 반복해 러너를 또 죽이지 말고 절반으로 줄여서 재시도한다.
          const status = axios.isAxiosError(error) ? error.response?.status : undefined;
          if (status !== undefined && status >= 500) {
            const chars = [...payload];
            if (chars.length > MIN_SHRINK_CHARS) {
              const next = Math.max(MIN_SHRINK_CHARS, Math.floor(chars.length / 2));
              payload = chars.slice(0, next).join('');
              console.error(`[embed] 5xx 재시도: 입력 축소 ${chars.length}자 → ${next}자`);
            }
          }

          // 지수 백오프 (300ms → 600ms → ...)
          await new Promise(r => setTimeout(r, BASE_BACKOFF_MS * 2 ** (attempt - 1)));
          continue;
        }
        break;
      }
    }

    throw this.toFriendlyError(lastError);
  }

  /** 5xx / 네트워크 오류(끊긴 커넥션 포함)는 재시도 대상 */
  private isRetryable(error: unknown): boolean {
    if (!axios.isAxiosError(error)) return false;

    const status = error.response?.status;
    if (status !== undefined) return status >= 500;

    // 응답 자체가 없는 경우: 커넥션 리셋/타임아웃 등
    return [
      'ECONNRESET',
      'ECONNABORTED',
      'ETIMEDOUT',
      'EPIPE',
      'EAI_AGAIN',
      'ERR_SOCKET_CONNECTION_TIMEOUT',
    ].includes(error.code ?? '');
  }

  private toFriendlyError(error: unknown): Error {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNREFUSED') {
        return new Error(
          `Ollama에 연결할 수 없습니다: ${this.config.ollamaHost}\n` +
          'Ollama가 실행 중인지 확인하세요.'
        );
      }
      if (error.response?.status === 404) {
        return new Error(
          `모델을 찾을 수 없습니다: ${this.config.model}\n` +
          `실행: ollama pull ${this.config.model}`
        );
      }
      const status = error.response?.status;
      if (status !== undefined && status >= 500) {
        return new Error(
          `Ollama 임베딩 실패 (HTTP ${status}, ${MAX_ATTEMPTS}회 재시도 후): ` +
          `${JSON.stringify(error.response?.data)?.slice(0, 300)}`
        );
      }
    }
    return error instanceof Error ? error : new Error(String(error));
  }

  /**
   * 벡터 정규화 (L2 norm)
   * 코사인 유사도 계산 시 내적만으로 계산 가능하게 함
   */
  private normalize(vector: number[]): number[] {
    const magnitude = Math.sqrt(
      vector.reduce((sum, val) => sum + val * val, 0)
    );

    if (magnitude === 0) {
      throw new Error('영벡터는 정규화할 수 없습니다');
    }

    return vector.map(v => v / magnitude);
  }

  /**
   * 캐시 정리
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 캐시 통계
   */
  getCacheStats(): { size: number; hitRate: number } {
    return {
      size: this.cache.size,
      hitRate: 0, // TODO: 실제 hit rate 추적
    };
  }
}
