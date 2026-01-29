/**
 * REST 세션 관리
 *
 * - rest() 도구: 세션 생성, 가이드 로드
 * - rest_end() 도구: 세션 종료
 * - 세션 검증 (타임아웃, 유효성)
 */

import { v4 as uuidv4 } from 'uuid';
import type { SearchService } from './searcher.js';
import type {
  RestSession,
  ChunkingGuide,
  MetadataRules,
  RestStartResponse,
  RestEndResponse,
} from '../types/models.js';

export class RestSessionManager {
  private sessions: Map<string, RestSession>;
  private readonly SESSION_TIMEOUT = 3600000; // 1시간 (ms)

  constructor(private searcher: SearchService) {
    this.sessions = new Map();
  }

  /**
   * REST 모드 시작
   *
   * 1. 시스템 가이드 검색 (category: "system")
   * 2. 세션 생성
   * 3. 가이드 반환
   */
  async startRest(): Promise<RestStartResponse> {
    // 시스템 가이드 검색
    const guides = await this.searcher.searchByCategory('system', 10);

    // 가이드 추출
    const chunkingGuide = this.extractChunkingGuide(guides);
    const metadataRules = this.extractMetadataRules(guides);

    // 세션 생성
    const session: RestSession = {
      id: `rest-${uuidv4()}`,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + this.SESSION_TIMEOUT).toISOString(),
      chunking_guide: chunkingGuide,
      metadata_rules: metadataRules,
      scribed_count: 0,
      status: 'active',
    };

    this.sessions.set(session.id, session);

    return {
      session_id: session.id,
      chunking_guide: chunkingGuide,
      metadata_rules: metadataRules,
      status: `REST 모드 활성화. scribe 가능. 세션 만료: ${session.expires_at}`,
    };
  }

  /**
   * REST 모드 종료
   */
  async endRest(sessionId: string): Promise<RestEndResponse> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`세션을 찾을 수 없습니다: ${sessionId}`);
    }

    const count = session.scribed_count;
    this.sessions.delete(sessionId);

    return {
      status: 'REST 모드 종료. 청킹 가이드 정리 가능.',
      scribed_count: count,
    };
  }

  /**
   * 세션 검증
   *
   * - 세션 존재 여부
   * - 만료 여부
   */
  validateSession(sessionId: string): RestSession {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(
        'REST 모드가 아닙니다. rest()를 먼저 호출하세요.'
      );
    }

    if (new Date() > new Date(session.expires_at)) {
      this.sessions.delete(sessionId);
      throw new Error(
        'REST 세션이 만료되었습니다. rest()를 다시 호출하세요.'
      );
    }

    return session;
  }

  /**
   * scribe 카운트 증가
   */
  incrementScribeCount(sessionId: string): void {
    const session = this.validateSession(sessionId);
    session.scribed_count++;
  }

  /**
   * 청킹 가이드 추출
   */
  private extractChunkingGuide(guides: any[]): ChunkingGuide {
    // 시스템 가이드에서 청킹 원칙 찾기
    const chunkingPrinciples = guides.find(
      g => g.chunk.topic === 'chunking_principles'
    );

    if (!chunkingPrinciples) {
      // 가이드가 없으면 기본값 반환
      return {
        principles: [
          '의미적으로 독립된 단위로 분할',
          '문맥 이해 가능한 최소 단위 유지',
          '질문에 답할 수 있는 완결성',
        ],
        ideal_chunk_size: {
          min_tokens: 100,
          max_tokens: 512,
        },
        examples: [],
      };
    }

    // 가이드 텍스트 반환 (Agent가 참고)
    return {
      principles: [chunkingPrinciples.chunk.text],
      ideal_chunk_size: {
        min_tokens: 100,
        max_tokens: 512,
      },
      examples: [],
    };
  }

  /**
   * 메타데이터 규칙 추출
   */
  private extractMetadataRules(guides: any[]): MetadataRules {
    const metadataRules = guides.find(
      g => g.chunk.topic === 'metadata_rules'
    );

    if (!metadataRules) {
      return {
        required_fields: ['topic', 'keywords', 'questions', 'entities'],
        keyword_count: { min: 3, max: 10 },
        question_guidelines: [
          '이 청크가 답할 수 있는 질문 작성',
          '구체적이고 검색 가능한 질문',
        ],
        entity_extraction: [
          '기술명, 프로젝트명, 인물명 추출',
          '타입 명시 필수',
        ],
      };
    }

    return {
      required_fields: ['topic', 'keywords', 'questions', 'entities'],
      keyword_count: { min: 3, max: 10 },
      question_guidelines: [metadataRules.chunk.text],
      entity_extraction: ['타입별로 분류'],
    };
  }

  /**
   * 활성 세션 수
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * 만료된 세션 정리
   */
  cleanupExpiredSessions(): void {
    const now = new Date();
    for (const [id, session] of this.sessions.entries()) {
      if (now > new Date(session.expires_at)) {
        this.sessions.delete(id);
      }
    }
  }
}
