/**
 * Chronicle 도구 (Lore 저장/쓰기)
 *
 * Canon의 scribe에 대응하는 Lore 전용 저장 도구.
 * - chronicle: Lore에 청크 저장 (REST 세션 필수)
 * - eraseLore: Lore에서 청크 삭제
 * - reviseLore: Lore에서 청크 수정
 */

import { v4 as uuidv4 } from 'uuid';
import type { RestSessionManager } from '../core/rest-session.js';
import type { SearchService } from '../core/searcher.js';
import type { EmbeddingService } from '../core/embedder.js';
import type { QdrantService } from '../db/qdrant.js';
import type { LoreManager } from '../core/lore-manager.js';
import type { ChronicleRequest, ScribeResponse } from '../types/models.js';

export class ChronicleTools {
  constructor(
    private sessionManager: RestSessionManager,
    private searcher: SearchService,
    private embedder: EmbeddingService,
    private qdrant: QdrantService,
    private loreManager: LoreManager
  ) {}

  /**
   * chronicle 도구 실행
   *
   * 1. REST 세션 검증
   * 2. Lore 존재 확인 (없으면 자동 생성)
   * 3. 해당 Lore 컬렉션 내 중복 감지
   * 4. 임베딩 생성
   * 5. Lore 컬렉션에 저장
   * 6. Lore 메타데이터 업데이트
   * 7. 세션 카운트 증가
   */
  async chronicle(args: ChronicleRequest): Promise<any> {
    try {
      // 1. REST 세션 검증
      this.sessionManager.validateSession(args.session_id);

      // 2. Lore 존재 확인 (없으면 자동 생성, description 있으면 갱신)
      await this.loreManager.ensureLoreExists(args.lore, args.lore_description);

      const chunk = args.chunk;
      const collectionName = this.loreManager.getCollectionName(args.lore);

      // ID가 없으면 생성
      if (!chunk.id) {
        chunk.id = uuidv4();
      }

      // 타임스탬프 설정
      const now = new Date().toISOString();
      chunk.metadata.created_at = now;
      chunk.metadata.updated_at = now;
      chunk.metadata.rest_session_id = args.session_id;

      // category 오버라이드
      if (args.category) {
        chunk.metadata.category = args.category;
      }

      // source 오버라이드
      if (args.source) {
        chunk.metadata.source = args.source;
      }

      // 3. 해당 Lore 내 중복 감지
      const duplicates = await this.searcher.detectDuplicates(chunk.text, 0.95, collectionName);
      if (duplicates && duplicates.length > 0) {
        const response: ScribeResponse = {
          status: 'warning',
          message: `Lore "${args.lore}"에 유사한 청크가 ${duplicates.length}개 존재합니다. 저장을 계속하시겠습니까?`,
          duplicates,
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
        };
      }

      // 4. 임베딩 생성
      const embedding = await this.embedder.embed(chunk.text);

      // 5. Lore 컬렉션에 저장
      await this.qdrant.upsertChunkInCollection(collectionName, chunk.id, embedding, {
        text: chunk.text,
        ...chunk.metadata,
      });

      // 6. Lore 메타데이터 업데이트
      const metadataService = this.loreManager.getMetadataService(args.lore);
      await metadataService.onChunkScribed(chunk.metadata);

      // 7. 세션 카운트 증가
      this.sessionManager.incrementScribeCount(args.session_id);

      const response: ScribeResponse = {
        status: 'success',
        message: `Lore "${args.lore}"에 청크 저장 완료`,
        chunk_id: chunk.id,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
      };
    } catch (error: any) {
      console.error('chronicle 에러:', error.message, error.stack || '');
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
   * erase_lore 도구 실행
   */
  async eraseLore(loreName: string, chunkId: string): Promise<any> {
    try {
      this.loreManager.validateLoreName(loreName);
      const collectionName = this.loreManager.getCollectionName(loreName);

      const exists = await this.loreManager.loreExists(loreName);
      if (!exists) {
        throw new Error(`Lore를 찾을 수 없습니다: "${loreName}"`);
      }

      // 삭제 전 페이로드 조회 (메타데이터 업데이트용)
      const existing = await this.qdrant.getByIdInCollection(collectionName, chunkId);

      await this.qdrant.deleteChunkInCollection(collectionName, chunkId);

      // 메타데이터 업데이트
      if (existing?.payload) {
        const metadataService = this.loreManager.getMetadataService(loreName);
        await metadataService.onChunkErased(existing.payload);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              message: `Lore "${loreName}"에서 청크 삭제 완료: ${chunkId}`,
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
   * revise_lore 도구 실행
   */
  async reviseLore(loreName: string, chunkId: string, newText: string): Promise<any> {
    try {
      this.loreManager.validateLoreName(loreName);
      const collectionName = this.loreManager.getCollectionName(loreName);

      const exists = await this.loreManager.loreExists(loreName);
      if (!exists) {
        throw new Error(`Lore를 찾을 수 없습니다: "${loreName}"`);
      }

      // 기존 청크 조회
      const existing = await this.qdrant.getByIdInCollection(collectionName, chunkId);
      if (!existing) {
        throw new Error(`Lore "${loreName}"에서 청크를 찾을 수 없습니다: ${chunkId}`);
      }

      // 새 임베딩 생성
      const embedding = await this.embedder.embed(newText);

      // 업데이트
      const payload = {
        ...existing.payload,
        text: newText,
        updated_at: new Date().toISOString(),
      };

      await this.qdrant.upsertChunkInCollection(collectionName, chunkId, embedding, payload);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              message: `Lore "${loreName}"에서 청크 수정 완료: ${chunkId}`,
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
