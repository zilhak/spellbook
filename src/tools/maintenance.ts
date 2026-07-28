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

import type { QdrantService } from '../db/qdrant.js';
import type { EmbeddingService } from '../core/embedder.js';
import type { LoreManager } from '../core/lore-manager.js';
import type { MetadataService } from '../core/metadata-service.js';
import type { ChunkMetadata } from '../types/models.js';
import { convertToQdrantFilter } from '../core/filter-utils.js';

/**
 * text를 건드리지 않고 수정 가능한 메타데이터 필드
 */
export interface MetadataPatch {
  topic_id?: string;
  topic_name?: string;
  category?: string;
  sub_category?: string;
  keywords?: string[];
  questions?: string[];
  entities?: any[];
  importance?: 'high' | 'medium' | 'low';
  source?: string;
}

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

  /**
   * 플랫 payload → ChunkMetadata 추출
   */
  private payloadToMeta(payload: Record<string, any>): ChunkMetadata {
    return {
      topic_id: payload.topic_id,
      topic_name: payload.topic_name,
      category: payload.category,
      sub_category: payload.sub_category,
      keywords: payload.keywords || [],
      questions: payload.questions || [],
      entities: payload.entities || [],
      importance: payload.importance || 'medium',
      source: payload.source,
      created_at: payload.created_at,
      updated_at: payload.updated_at,
    };
  }

  /**
   * 단일 청크에 메타데이터 패치 적용 (text 유지 + 카운트 정합성 갱신)
   * text는 그대로이므로 재임베딩해 벡터를 유지한 채 payload만 교체한다.
   */
  private async applyPatch(target: TargetOps, point: any, patch: MetadataPatch): Promise<void> {
    const oldPayload = point.payload as Record<string, any>;
    const oldMeta = this.payloadToMeta(oldPayload);

    const now = new Date().toISOString();
    const newPayload: Record<string, any> = { ...oldPayload };
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) newPayload[k] = v;
    }
    newPayload.updated_at = now;

    const newMeta = this.payloadToMeta(newPayload);

    // text 불변 → 재임베딩(embedder 캐시로 저렴), 벡터 유지
    const embedding = await this.embedder.embed(oldPayload.text);
    await target.upsert(point.id, embedding, newPayload);

    // 카테고리/토픽 카운트 정합성: 기존 감소 후 신규 증가 (변경 없으면 net-neutral)
    await target.metadataService.onChunkErased(oldMeta);
    await target.metadataService.onChunkScribed(newMeta);
  }

  /**
   * edit_metadata 도구: 단일 청크의 메타데이터만 수정 (text 불변).
   * revise는 text만 바꾸므로 잘못된 keywords/category 수정 수단이 부재한 것을 보완.
   */
  async editMetadata(chunkId: string, patch: MetadataPatch, lore?: string): Promise<any> {
    try {
      const target = await this.resolveTarget(lore);
      const point = await target.getById(chunkId);
      if (!point) {
        throw new Error(`${target.label}에서 청크를 찾을 수 없습니다: ${chunkId}`);
      }

      await this.applyPatch(target, point, patch);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              message: `${target.label} 청크 메타데이터 수정 완료: ${chunkId}`,
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
   * batch_erase 도구: 필터에 매칭되는 청크를 일괄 삭제.
   * 안전을 위해 빈 필터는 거부한다.
   */
  async batchErase(filter: Record<string, any>, lore?: string): Promise<any> {
    try {
      if (!filter || Object.keys(filter).length === 0) {
        throw new Error('안전을 위해 batch_erase에는 비어있지 않은 필터가 필요합니다.');
      }
      const target = await this.resolveTarget(lore);
      const qdrantFilter = convertToQdrantFilter(filter);
      const points = await target.scrollAll(qdrantFilter);

      const result = { total: points.length, success: 0, failed: 0, errors: [] as string[] };
      for (const p of points) {
        try {
          await target.del(p.id);
          await target.metadataService.onChunkErased(this.payloadToMeta(p.payload));
          result.success++;
        } catch (e: any) {
          result.failed++;
          result.errors.push(`${p.id}: ${e.message}`);
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: result.failed === 0 ? 'success' : 'partial',
              message: `${target.label}에서 ${result.success}/${result.total} 청크 삭제`,
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
   * batch_edit_metadata 도구: 필터에 매칭되는 청크의 메타데이터를 일괄 패치.
   * (예: 잘못 분류된 배너 청크 8개의 category를 한 번에 교정)
   * 안전을 위해 빈 필터는 거부한다.
   */
  async batchEditMetadata(filter: Record<string, any>, patch: MetadataPatch, lore?: string): Promise<any> {
    try {
      if (!filter || Object.keys(filter).length === 0) {
        throw new Error('안전을 위해 batch_edit_metadata에는 비어있지 않은 필터가 필요합니다.');
      }
      const target = await this.resolveTarget(lore);
      const qdrantFilter = convertToQdrantFilter(filter);
      const points = await target.scrollAll(qdrantFilter);

      const result = { total: points.length, success: 0, failed: 0, errors: [] as string[] };
      for (const p of points) {
        try {
          await this.applyPatch(target, p, patch);
          result.success++;
        } catch (e: any) {
          result.failed++;
          result.errors.push(`${p.id}: ${e.message}`);
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: result.failed === 0 ? 'success' : 'partial',
              message: `${target.label}에서 ${result.success}/${result.total} 청크 메타데이터 수정`,
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
   * move_chunk / copy_chunk 공통 로직
   * Canon↔Lore, Lore간 청크 이관/복제. 목적지에서 text 재임베딩.
   */
  private async transfer(
    chunkId: string,
    fromLore: string | undefined,
    toLore: string | undefined,
    mode: 'move' | 'copy'
  ): Promise<any> {
    try {
      const from = await this.resolveTarget(fromLore);

      // 목적지 Lore는 없으면 자동 생성 (chronicle과 동일한 ensure 시맨틱)
      if (toLore) {
        this.loreManager.validateLoreName(toLore);
        await this.loreManager.ensureLoreExists(toLore);
      }
      const to = await this.resolveTarget(toLore);

      if (from.collection === to.collection) {
        throw new Error('출발지와 목적지가 동일합니다.');
      }

      const existing = await from.getById(chunkId);
      if (!existing) {
        throw new Error(`${from.label}에서 청크를 찾을 수 없습니다: ${chunkId}`);
      }

      const payload = existing.payload as Record<string, any>;
      if (!payload.text) {
        throw new Error(`청크 ${chunkId}: text 필드가 없어 이관 불가`);
      }

      const now = new Date().toISOString();
      const newPayload = { ...payload, updated_at: now };

      // 목적지 저장 (재임베딩)
      const embedding = await this.embedder.embed(payload.text);
      await to.upsert(chunkId, embedding, newPayload);
      await to.metadataService.onChunkScribed(this.payloadToMeta(newPayload));

      // move면 출발지 삭제
      if (mode === 'move') {
        await from.del(chunkId);
        await from.metadataService.onChunkErased(this.payloadToMeta(payload));
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              message: `${mode === 'move' ? '이동' : '복사'} 완료: ${from.label} → ${to.label} (${chunkId})`,
              chunk_id: chunkId,
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
   * move_chunk 도구: 청크를 다른 저장소로 이동 (출발지에서 제거)
   */
  async moveChunk(chunkId: string, fromLore?: string, toLore?: string): Promise<any> {
    return this.transfer(chunkId, fromLore, toLore, 'move');
  }

  /**
   * copy_chunk 도구: 청크를 다른 저장소로 복사 (출발지 유지)
   */
  async copyChunk(chunkId: string, fromLore?: string, toLore?: string): Promise<any> {
    return this.transfer(chunkId, fromLore, toLore, 'copy');
  }
}
