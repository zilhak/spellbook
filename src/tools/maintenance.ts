/**
 * 유지보수/운영 도구
 *
 * Canon과 Lore 공통으로 동작하는 운영성 도구 모음.
 * - reindex: 전체 청크 재임베딩 (모델 교체/손상 복구)
 * - health: total_count vs vector_count 불일치, 고아 메타데이터 진단
 * - batch_erase / batch_edit_metadata: 필터 기준 일괄 처리
 * - edit_metadata: text는 두고 메타데이터만 수정
 * - move_chunk / copy_chunk: Canon↔Lore, Lore간 청크 이동/복사 (재임베딩)
 *
 * target 관례: lore 미지정 시 Canon, 지정 시 해당 Lore.
 */

import { v4 as uuidv4 } from 'uuid';
import type { QdrantService } from '../db/qdrant.js';
import type { EmbeddingService } from '../core/embedder.js';
import type { LoreManager } from '../core/lore-manager.js';
import type { MetadataService } from '../core/metadata-service.js';
import type { ChunkMetadata } from '../types/models.js';

/**
 * Canon/Lore를 동일 인터페이스로 다루기 위한 타겟 핸들
 */
interface TargetOps {
  label: string;
  collection?: string; // undefined = Canon 기본 컬렉션
  metadataCollection: string;
  metadataService: MetadataService;
  scrollAll: (filter?: Record<string, any>) => Promise<any[]>;
  getById: (id: string) => Promise<any | null>;
  upsert: (id: string, vector: number[], payload: Record<string, any>) => Promise<void>;
  del: (id: string) => Promise<void>;
  stats: () => Promise<{ total_count: number; vector_count: number }>;
}

export class MaintenanceTools {
  constructor(
    private qdrant: QdrantService,
    private embedder: EmbeddingService,
    private loreManager: LoreManager,
    private metadataService: MetadataService,
    private canonMetadataCollection: string
  ) {}

  /**
   * lore 여부에 따라 Canon/Lore 연산 핸들 반환. Lore면 존재 검증.
   */
  private async resolveTarget(lore?: string): Promise<TargetOps> {
    if (lore) {
      this.loreManager.validateLoreName(lore);
      const exists = await this.loreManager.loreExists(lore);
      if (!exists) {
        throw new Error(`Lore를 찾을 수 없습니다: "${lore}"`);
      }
      const collection = this.loreManager.getCollectionName(lore);
      return {
        label: `Lore "${lore}"`,
        collection,
        metadataCollection: this.loreManager.getMetadataCollectionName(lore),
        metadataService: this.loreManager.getMetadataService(lore),
        scrollAll: (filter) => this.qdrant.scrollAll(collection, 1000, filter),
        getById: (id) => this.qdrant.getByIdInCollection(collection, id),
        upsert: (id, vector, payload) => this.qdrant.upsertChunkInCollection(collection, id, vector, payload),
        del: (id) => this.qdrant.deleteChunkInCollection(collection, id),
        stats: () => this.qdrant.getCollectionStats(collection),
      };
    }
    return {
      label: 'Canon',
      collection: undefined,
      metadataCollection: this.canonMetadataCollection,
      metadataService: this.metadataService,
      scrollAll: (filter) => this.qdrant.scrollAll(undefined, 1000, filter),
      getById: (id) => this.qdrant.getById(id),
      upsert: (id, vector, payload) => this.qdrant.upsertChunk(id, vector, payload),
      del: (id) => this.qdrant.deleteChunk(id),
      stats: () => this.qdrant.getStats(),
    };
  }

  /**
   * reindex 도구: 대상 저장소의 모든 청크를 현재 임베딩 모델로 재생성.
   * scroll → 각 청크 text 재임베딩 → upsert (payload 유지).
   */
  async reindex(lore?: string): Promise<any> {
    try {
      const target = await this.resolveTarget(lore);
      const points = await target.scrollAll();

      const result = { total: points.length, success: 0, failed: 0, errors: [] as string[] };

      for (const p of points) {
        try {
          const text = p.payload?.text;
          if (!text) {
            throw new Error(`청크 ${p.id}: text 필드가 없어 재임베딩 불가`);
          }
          const embedding = await this.embedder.embed(text);
          await target.upsert(p.id, embedding, p.payload);
          result.success++;
        } catch (e: any) {
          result.failed++;
          result.errors.push(e.message);
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: result.failed === 0 ? 'success' : 'partial',
              message: `${target.label} 재임베딩: ${result.success}/${result.total} 완료`,
              ...result,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ status: 'error', message: error.message }, null, 2) }],
        isError: true,
      };
    }
  }

  /**
   * health 도구: 저장소 정합성 진단.
   * - total_count vs vector_count 불일치 (소형 컬렉션은 vector_count:0 정상 가능)
   * - 메타데이터 카테고리/토픽 chunk_count vs 실제 청크 수 불일치 (고아 메타데이터)
   */
  async health(lore?: string): Promise<any> {
    try {
      const target = await this.resolveTarget(lore);
      const stats = await target.stats();

      // 실제 청크에서 카테고리/토픽별 카운트 집계
      const points = await target.scrollAll();
      const actualByCategory: Record<string, number> = {};
      const actualByTopic: Record<string, number> = {};
      for (const p of points) {
        const cat = p.payload?.category;
        const topic = p.payload?.topic_id;
        if (cat) actualByCategory[cat] = (actualByCategory[cat] || 0) + 1;
        if (topic) actualByTopic[topic] = (actualByTopic[topic] || 0) + 1;
      }

      // 메타데이터 컬렉션의 category/topic 엔트리 조회
      const metaPoints = await this.qdrant.scrollCollection(target.metadataCollection, 1000);

      const categoryIssues: any[] = [];
      const topicIssues: any[] = [];
      for (const mp of metaPoints) {
        const pl = mp.payload;
        if (pl?.type === 'category') {
          const actual = actualByCategory[pl.name] || 0;
          if (actual !== pl.chunk_count) {
            categoryIssues.push({ category: pl.name, metadata_count: pl.chunk_count, actual_count: actual });
          }
        } else if (pl?.type === 'topic') {
          const actual = actualByTopic[pl.topic_id] || 0;
          if (actual !== pl.chunk_count) {
            topicIssues.push({ topic_id: pl.topic_id, metadata_count: pl.chunk_count, actual_count: actual });
          }
        }
      }

      const vectorMismatch = stats.total_count !== stats.vector_count;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              target: target.label,
              total_count: stats.total_count,
              vector_count: stats.vector_count,
              vector_mismatch: vectorMismatch,
              vector_mismatch_note: vectorMismatch
                ? 'total_count와 vector_count 불일치. 소형 컬렉션은 인덱싱 임계 미달로 vector_count:0가 정상일 수 있음. 손상 의심 시 reindex 권장.'
                : undefined,
              orphan_category_metadata: categoryIssues,
              orphan_topic_metadata: topicIssues,
              healthy: !vectorMismatch && categoryIssues.length === 0 && topicIssues.length === 0,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ status: 'error', message: error.message }, null, 2) }],
        isError: true,
      };
    }
  }
}
