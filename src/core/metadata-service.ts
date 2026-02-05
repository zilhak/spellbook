/**
 * 메타데이터 서비스
 *
 * metadata 컬렉션을 통해 카테고리/토픽 메타데이터를 관리
 * - scribe 시: 카테고리/토픽 엔트리 upsert
 * - erase 시: 카운트 감소, 빈 항목 삭제
 * - getIndex: metadata 컬렉션에서 MetaIndex 반환
 */

import type { QdrantService } from '../db/qdrant.js';
import type {
  ChunkMetadata,
  CategoryMetadata,
  TopicMetadata,
  MetaIndex,
  CategoryInfo,
} from '../types/models.js';

export class MetadataService {
  constructor(
    private qdrant: QdrantService,
    private collectionName: string
  ) {}

  async initialize(): Promise<void> {
    await this.qdrant.initializePayloadCollection(this.collectionName);
  }

  /**
   * Called after a chunk is scribed
   * Updates topic and category metadata
   */
  async onChunkScribed(metadata: ChunkMetadata): Promise<void> {
    const now = new Date().toISOString();
    const topicId = `topic:${metadata.topic_id}`;
    const catId = `cat:${metadata.category}`;

    // --- Topic upsert ---
    const existingTopic = await this.qdrant.getPointById(this.collectionName, topicId);
    if (existingTopic) {
      const tp = existingTopic.payload as TopicMetadata;
      const mergedKeywords = [...new Set([...tp.keywords, ...metadata.keywords])];
      await this.qdrant.upsertPoint(this.collectionName, topicId, {
        type: 'topic',
        topic_id: metadata.topic_id,
        topic_name: metadata.topic_name || tp.topic_name,
        category: metadata.category,
        sub_category: metadata.sub_category || tp.sub_category,
        chunk_count: tp.chunk_count + 1,
        keywords: mergedKeywords,
        last_updated: now,
      } as TopicMetadata);
    } else {
      await this.qdrant.upsertPoint(this.collectionName, topicId, {
        type: 'topic',
        topic_id: metadata.topic_id,
        topic_name: metadata.topic_name || metadata.topic_id,
        category: metadata.category,
        sub_category: metadata.sub_category,
        chunk_count: 1,
        keywords: [...metadata.keywords],
        last_updated: now,
      } as TopicMetadata);
    }

    // --- Category upsert ---
    const existingCat = await this.qdrant.getPointById(this.collectionName, catId);
    if (existingCat) {
      const cp = existingCat.payload as CategoryMetadata;
      const subCats = [
        ...new Set([
          ...cp.sub_categories,
          ...(metadata.sub_category ? [metadata.sub_category] : []),
        ]),
      ];
      // Count topics for this category
      const topicCount = await this.countTopicsForCategory(metadata.category);
      await this.qdrant.upsertPoint(this.collectionName, catId, {
        type: 'category',
        name: metadata.category,
        sub_categories: subCats,
        topic_count: topicCount,
        chunk_count: cp.chunk_count + 1,
        last_updated: now,
      } as CategoryMetadata);
    } else {
      await this.qdrant.upsertPoint(this.collectionName, catId, {
        type: 'category',
        name: metadata.category,
        sub_categories: metadata.sub_category ? [metadata.sub_category] : [],
        topic_count: 1,
        chunk_count: 1,
        last_updated: now,
      } as CategoryMetadata);
    }
  }

  /**
   * Called after a chunk is erased
   * Decrements counts and removes empty entries
   */
  async onChunkErased(metadata: ChunkMetadata): Promise<void> {
    const now = new Date().toISOString();
    const topicId = `topic:${metadata.topic_id}`;
    const catId = `cat:${metadata.category}`;

    // --- Topic update ---
    const existingTopic = await this.qdrant.getPointById(this.collectionName, topicId);
    if (existingTopic) {
      const tp = existingTopic.payload as TopicMetadata;
      const newCount = tp.chunk_count - 1;
      if (newCount <= 0) {
        await this.qdrant.deletePoint(this.collectionName, topicId);
      } else {
        await this.qdrant.upsertPoint(this.collectionName, topicId, {
          ...tp,
          chunk_count: newCount,
          last_updated: now,
        });
      }
    }

    // --- Category update ---
    const existingCat = await this.qdrant.getPointById(this.collectionName, catId);
    if (existingCat) {
      const cp = existingCat.payload as CategoryMetadata;
      const newChunkCount = cp.chunk_count - 1;
      if (newChunkCount <= 0) {
        await this.qdrant.deletePoint(this.collectionName, catId);
      } else {
        const topicCount = await this.countTopicsForCategory(metadata.category);
        await this.qdrant.upsertPoint(this.collectionName, catId, {
          ...cp,
          chunk_count: newChunkCount,
          topic_count: topicCount,
          last_updated: now,
        });
      }
    }
  }

  /**
   * Get full index from metadata collection
   * Returns hierarchical view of categories and topics
   */
  async getIndex(scope?: string): Promise<MetaIndex> {
    const allPoints = await this.qdrant.scrollCollection(this.collectionName, 1000);

    const categories: CategoryInfo[] = [];
    let totalTopics = 0;
    let totalChunks = 0;

    for (const point of allPoints) {
      const payload = point.payload;
      if (payload.type === 'category') {
        const cat = payload as CategoryMetadata;
        if (scope && cat.name !== scope) continue;
        categories.push({
          id: cat.name,
          name: cat.name,
          sub_categories: cat.sub_categories || [],
          topic_count: cat.topic_count,
          chunk_count: cat.chunk_count,
          description: `${cat.chunk_count} chunks, ${cat.topic_count} topics`,
        });
        totalTopics += cat.topic_count;
        totalChunks += cat.chunk_count;
      }
    }

    return {
      categories,
      total_topics: totalTopics,
      total_chunks: totalChunks,
      last_updated: new Date().toISOString(),
    };
  }

  /**
   * Get category statistics for stats tool
   * Returns map of category name to chunk count
   */
  async getCategoryStats(): Promise<Record<string, number>> {
    const allPoints = await this.qdrant.scrollCollection(this.collectionName, 1000);
    const stats: Record<string, number> = {};

    for (const point of allPoints) {
      if (point.payload.type === 'category') {
        stats[point.payload.name] = point.payload.chunk_count;
      }
    }

    return stats;
  }

  /**
   * Helper: count topic entries for a given category
   */
  private async countTopicsForCategory(category: string): Promise<number> {
    const allPoints = await this.qdrant.scrollCollection(this.collectionName, 1000);
    let count = 0;
    for (const point of allPoints) {
      if (point.payload.type === 'topic' && point.payload.category === category) {
        count++;
      }
    }
    return count;
  }
}
