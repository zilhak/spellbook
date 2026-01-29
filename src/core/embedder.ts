/**
 * 임베딩 생성 서비스
 *
 * Ollama API를 사용하여 텍스트 임베딩 생성.
 * - 캐싱으로 중복 임베딩 방지
 * - 벡터 정규화 (코사인 유사도 최적화)
 * - 배치 처리 지원
 */

import axios from 'axios';
import type { EmbeddingConfig } from '../types/models.js';

export class EmbeddingService {
  private config: EmbeddingConfig;
  private cache: Map<string, number[]>;

  constructor(config: EmbeddingConfig) {
    this.config = config;
    this.cache = new Map();
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

    // Ollama API 호출
    const embedding = await this.callOllama(text);

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
   * Ollama API 호출
   */
  private async callOllama(text: string): Promise<number[]> {
    try {
      const response = await axios.post(
        `${this.config.ollamaHost}/api/embeddings`,
        {
          model: this.config.model,
          prompt: text,
        },
        {
          timeout: 30000, // 30초 타임아웃
        }
      );

      if (!response.data.embedding) {
        throw new Error('Ollama API가 임베딩을 반환하지 않았습니다');
      }

      return response.data.embedding;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          throw new Error(
            `Ollama에 연결할 수 없습니다: ${this.config.ollamaHost}\n` +
            'Ollama가 실행 중인지 확인하세요.'
          );
        }
        if (error.response?.status === 404) {
          throw new Error(
            `모델을 찾을 수 없습니다: ${this.config.model}\n` +
            `실행: ollama pull ${this.config.model}`
          );
        }
      }
      throw error;
    }
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
