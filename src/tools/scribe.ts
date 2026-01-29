/**
 * Scribe 도구 (저장/쓰기)
 *
 * - scribe: 청크 저장 (REST 세션 필수)
 * - erase: 청크 삭제
 * - revise: 청크 수정
 */

import { v4 as uuidv4 } from 'uuid';
import type { RestSessionManager } from '../core/rest-session.js';
import type { SearchService } from '../core/searcher.js';
import type { EmbeddingService } from '../core/embedder.js';
import type { QdrantService } from '../db/qdrant.js';
import type { Chunk, ScribeRequest, ScribeResponse } from '../types/models.js';

export class ScribeTools {
  constructor(
    private sessionManager: RestSessionManager,
    private searcher: SearchService,
    private embedder: EmbeddingService,
    private qdrant: QdrantService
  ) {}

  /**
   * scribe 도구 실행
   *
   * 1. REST 세션 검증
   * 2. 중복 감지
   * 3. 임베딩 생성
   * 4. VectorDB 저장
   */
  async scribe(args: ScribeRequest): Promise<any> {
    try {
      // 1. REST 세션 검증 (필수)
      const session = this.sessionManager.validateSession(args.session_id);

      const chunk = args.chunk;

      // ID가 없으면 생성
      if (!chunk.id) {
        chunk.id = uuidv4();
      }

      // 타임스탬프 설정
      const now = new Date().toISOString();
      chunk.metadata.created_at = now;
      chunk.metadata.updated_at = now;
      chunk.metadata.rest_session_id = args.session_id;

      // category 오버라이드 (인자로 전달된 경우)
      if (args.category) {
        chunk.metadata.category = args.category;
      }

      // source 오버라이드
      if (args.source) {
        chunk.metadata.source = args.source;
      }

      // 2. 중복 감지
      const duplicates = await this.searcher.detectDuplicates(chunk.text);
      if (duplicates && duplicates.length > 0) {
        const response: ScribeResponse = {
          status: 'warning',
          message: `유사한 청크가 ${duplicates.length}개 존재합니다. 저장을 계속하시겠습니까?`,
          duplicates,
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
        };
      }

      // 3. 임베딩 생성
      const embedding = await this.embedder.embed(chunk.text);

      // 4. VectorDB 저장
      await this.qdrant.upsertChunk(chunk.id, embedding, {
        text: chunk.text,
        ...chunk.metadata,
      });

      // 5. 세션 카운트 증가
      this.sessionManager.incrementScribeCount(args.session_id);

      const response: ScribeResponse = {
        status: 'success',
        message: '청크 저장 완료',
        chunk_id: chunk.id,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
      };
    } catch (error: any) {
      const response: ScribeResponse = {
        status: 'error',
        message: error.message || '저장 실패',
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
        isError: true,
      };
    }
  }

  /**
   * erase 도구 실행
   */
  async erase(chunkId: string): Promise<any> {
    try {
      await this.qdrant.deleteChunk(chunkId);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              message: `청크 삭제 완료: ${chunkId}`,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'error',
              message: error.message,
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * revise 도구 실행
   */
  async revise(chunkId: string, newText: string): Promise<any> {
    try {
      // 기존 청크 조회
      const existing = await this.qdrant.getById(chunkId);
      if (!existing) {
        throw new Error(`청크를 찾을 수 없습니다: ${chunkId}`);
      }

      // 새 임베딩 생성
      const embedding = await this.embedder.embed(newText);

      // 업데이트
      const payload = {
        ...existing.payload,
        text: newText,
        updated_at: new Date().toISOString(),
      };

      await this.qdrant.upsertChunk(chunkId, embedding, payload);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              message: `청크 수정 완료: ${chunkId}`,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'error',
              message: error.message,
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }
}
