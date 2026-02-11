/**
 * Qdrant VectorDB 연동
 *
 * - 컬렉션 초기화
 * - 청크 저장/검색
 * - 벡터 유사도 검색
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { v5 as uuidv5 } from 'uuid';
import type { QdrantConfig } from '../types/models.js';

// UUID v5 네임스페이스 (Spellbook 메타데이터 전용)
const METADATA_UUID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

/**
 * 문자열 ID를 Qdrant 호환 ID로 변환
 * Qdrant는 unsigned integer 또는 UUID만 허용
 * 비-UUID 문자열은 UUID v5로 변환 (결정적 매핑)
 */
function toQdrantId(id: string): string {
  // UUID 형식인지 확인
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (UUID_REGEX.test(id)) {
    return id;
  }
  // 비-UUID 문자열은 결정적 UUID v5로 변환
  return uuidv5(id, METADATA_UUID_NAMESPACE);
}

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

  // ============================================================================
  // 컬렉션 관리 메서드
  // ============================================================================

  /**
   * 벡터 컬렉션 생성 (범용)
   */
  async createVectorCollection(name: string, vectorSize: number): Promise<void> {
    try {
      const exists = await this.collectionExists(name);
      if (exists) {
        console.log(`✅ Qdrant 컬렉션 이미 존재: ${name}`);
        return;
      }

      await this.client.createCollection(name, {
        vectors: {
          size: vectorSize,
          distance: 'Cosine',
        },
      });

      console.log(`✅ Qdrant 벡터 컬렉션 생성 완료: ${name}`);
    } catch (error) {
      throw new Error(`Qdrant 벡터 컬렉션 생성 실패 (${name}): ${error}`);
    }
  }

  /**
   * 컬렉션 존재 여부 확인
   */
  async collectionExists(name: string): Promise<boolean> {
    const collections = await this.client.getCollections();
    return collections.collections.some(c => c.name === name);
  }

  /**
   * 컬렉션 삭제
   */
  async deleteCollection(name: string): Promise<void> {
    await this.client.deleteCollection(name);
  }

  /**
   * 모든 컬렉션 목록
   */
  async listCollections(): Promise<string[]> {
    const collections = await this.client.getCollections();
    return collections.collections.map(c => c.name);
  }

  /**
   * 특정 컬렉션 통계
   */
  async getCollectionStats(name: string): Promise<{
    total_count: number;
    vector_count: number;
  }> {
    const info = await this.client.getCollection(name);
    return {
      total_count: info.points_count || 0,
      vector_count: info.indexed_vectors_count || 0,
    };
  }

  // ============================================================================
  // 컬렉션 지정 벡터 연산 (Lore 등에서 사용)
  // ============================================================================

  /**
   * 지정 컬렉션에서 벡터 유사도 검색
   */
  async searchInCollection(
    collection: string,
    queryVector: number[],
    limit: number = 5,
    filter?: Record<string, any>,
    scoreThreshold?: number
  ): Promise<any[]> {
    return await this.client.search(collection, {
      vector: queryVector,
      limit,
      filter,
      score_threshold: scoreThreshold,
      with_payload: true,
    });
  }

  /**
   * 지정 컬렉션에 청크 저장
   */
  async upsertChunkInCollection(
    collection: string,
    id: string,
    vector: number[],
    payload: Record<string, any>
  ): Promise<void> {
    await this.client.upsert(collection, {
      wait: true,
      points: [{ id, vector, payload }],
    });
  }

  /**
   * 지정 컬렉션에서 ID로 조회
   */
  async getByIdInCollection(collection: string, id: string): Promise<any | null> {
    const result = await this.client.retrieve(collection, {
      ids: [id],
      with_payload: true,
      with_vector: false,
    });
    return result.length > 0 ? result[0] : null;
  }

  /**
   * 지정 컬렉션에서 청크 삭제
   */
  async deleteChunkInCollection(collection: string, id: string): Promise<void> {
    await this.client.delete(collection, {
      wait: true,
      points: [id],
    });
  }

  /**
   * 지정 컬렉션 스크롤
   */
  async scrollInCollection(
    collection: string,
    limit: number = 100,
    filter?: Record<string, any>
  ): Promise<any[]> {
    const result = await this.client.scroll(collection, {
      limit,
      filter,
      with_payload: true,
      with_vector: false,
    });
    return result.points;
  }

  // ============================================================================
  // 범용 멀티 컬렉션 메서드 (metadata 컬렉션 등에 사용)
  // ============================================================================

  /**
   * 페이로드 전용 컬렉션 초기화
   * Qdrant JS 클라이언트는 벡터 설정이 필수이므로 size:1 더미 벡터 사용
   */
  async initializePayloadCollection(name: string): Promise<void> {
    try {
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(c => c.name === name);

      if (exists) {
        console.log(`✅ Qdrant 컬렉션 이미 존재: ${name}`);
        return;
      }

      await this.client.createCollection(name, {
        vectors: {
          size: 1,
          distance: 'Cosine',
        },
      });

      console.log(`✅ Qdrant 페이로드 컬렉션 생성 완료: ${name}`);
    } catch (error) {
      throw new Error(`Qdrant 페이로드 컬렉션 초기화 실패: ${error}`);
    }
  }

  /**
   * 범용 포인트 upsert (더미 벡터 [0] 사용)
   * ID는 자동으로 Qdrant 호환 UUID로 변환됨
   */
  async upsertPoint(
    collection: string,
    id: string,
    payload: Record<string, any>
  ): Promise<void> {
    await this.client.upsert(collection, {
      wait: true,
      points: [
        {
          id: toQdrantId(id),
          vector: [0],
          payload,
        },
      ],
    });
  }

  /**
   * 범용 포인트 조회
   * ID는 자동으로 Qdrant 호환 UUID로 변환됨
   */
  async getPointById(collection: string, id: string): Promise<any | null> {
    try {
      const result = await this.client.retrieve(collection, {
        ids: [toQdrantId(id)],
        with_payload: true,
        with_vector: false,
      });
      return result.length > 0 ? result[0] : null;
    } catch {
      return null;
    }
  }

  /**
   * 범용 포인트 삭제
   * ID는 자동으로 Qdrant 호환 UUID로 변환됨
   */
  async deletePoint(collection: string, id: string): Promise<void> {
    await this.client.delete(collection, {
      wait: true,
      points: [toQdrantId(id)],
    });
  }

  /**
   * 범용 컬렉션 스크롤
   */
  async scrollCollection(
    collection: string,
    limit: number = 100,
    filter?: Record<string, any>
  ): Promise<any[]> {
    const result = await this.client.scroll(collection, {
      limit,
      filter,
      with_payload: true,
      with_vector: false,
    });

    return result.points;
  }
}
