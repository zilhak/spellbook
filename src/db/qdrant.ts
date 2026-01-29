/**
 * Qdrant VectorDB 연동
 *
 * - 컬렉션 초기화
 * - 청크 저장/검색
 * - 벡터 유사도 검색
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import type { QdrantConfig } from '../types/models.js';

export class QdrantService {
  private client: QdrantClient;
  private collectionName: string;

  constructor(config: QdrantConfig) {
    this.client = new QdrantClient({ url: config.url });
    this.collectionName = config.collectionName;
  }

  /**
   * 컬렉션 초기화
   * - 이미 존재하면 스킵
   * - 없으면 생성
   */
  async initializeCollection(vectorSize: number): Promise<void> {
    try {
      // 컬렉션 존재 여부 확인
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(
        c => c.name === this.collectionName
      );

      if (exists) {
        console.log(`✅ Qdrant 컬렉션 이미 존재: ${this.collectionName}`);
        return;
      }

      // 컬렉션 생성
      await this.client.createCollection(this.collectionName, {
        vectors: {
          size: vectorSize,
          distance: 'Cosine', // 코사인 유사도
        },
      });

      console.log(`✅ Qdrant 컬렉션 생성 완료: ${this.collectionName}`);
    } catch (error) {
      throw new Error(`Qdrant 컬렉션 초기화 실패: ${error}`);
    }
  }

  /**
   * 청크 저장 (upsert)
   */
  async upsertChunk(
    id: string,
    vector: number[],
    payload: Record<string, any>
  ): Promise<void> {
    await this.client.upsert(this.collectionName, {
      wait: true,
      points: [
        {
          id,
          vector,
          payload,
        },
      ],
    });
  }

  /**
   * 벡터 유사도 검색
   */
  async search(
    queryVector: number[],
    limit: number = 5,
    filter?: Record<string, any>,
    scoreThreshold?: number
  ): Promise<any[]> {
    const results = await this.client.search(this.collectionName, {
      vector: queryVector,
      limit,
      filter,
      score_threshold: scoreThreshold,
      with_payload: true,
    });

    return results;
  }

  /**
   * ID로 청크 조회
   */
  async getById(id: string): Promise<any | null> {
    const result = await this.client.retrieve(this.collectionName, {
      ids: [id],
      with_payload: true,
      with_vector: false,
    });

    return result.length > 0 ? result[0] : null;
  }

  /**
   * 청크 삭제
   */
  async deleteChunk(id: string): Promise<void> {
    await this.client.delete(this.collectionName, {
      wait: true,
      points: [id],
    });
  }

  /**
   * 컬렉션 통계
   */
  async getStats(): Promise<{
    total_count: number;
    vector_count: number;
  }> {
    const info = await this.client.getCollection(this.collectionName);
    return {
      total_count: info.points_count || 0,
      vector_count: info.indexed_vectors_count || 0,
    };
  }

  /**
   * 컬렉션 비어있는지 확인
   */
  async isEmpty(): Promise<boolean> {
    const stats = await this.getStats();
    return stats.total_count === 0;
  }

  /**
   * 스크롤 (페이지네이션)
   */
  async scroll(
    limit: number = 100,
    filter?: Record<string, any>
  ): Promise<any[]> {
    const result = await this.client.scroll(this.collectionName, {
      limit,
      filter,
      with_payload: true,
      with_vector: false,
    });

    return result.points;
  }
}
