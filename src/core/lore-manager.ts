/**
 * Lore Manager
 *
 * Lore(서브 컬렉션) 생명주기 관리
 * - 생성, 삭제, 목록, 통계
 * - 각 Lore는 독립 Qdrant 컬렉션 (lore_{name})
 * - 각 Lore는 독립 메타데이터 컬렉션 (lore_{name}_metadata)
 * - Lore 목록은 메인 메타데이터 컬렉션에서 type:'lore' 엔트리로 관리
 */

import type { QdrantService } from '../db/qdrant.js';
import type { LoreInfo, LoreMetadata } from '../types/models.js';
import { MetadataService } from './metadata-service.js';

const LORE_PREFIX = 'lore_';
const LORE_METADATA_SUFFIX = '_metadata';
const LORE_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const LORE_POINT_PREFIX = 'lore:';

export class LoreManager {
  private metadataServices: Map<string, MetadataService> = new Map();

  constructor(
    private qdrant: QdrantService,
    private vectorSize: number,
    private mainMetadataCollection: string
  ) {}

  /**
   * Lore 이름 → Qdrant 벡터 컬렉션명
   */
  getCollectionName(loreName: string): string {
    return `${LORE_PREFIX}${loreName}`;
  }

  /**
   * Lore 이름 → Lore 전용 메타데이터 컬렉션명
   */
  getMetadataCollectionName(loreName: string): string {
    return `${LORE_PREFIX}${loreName}${LORE_METADATA_SUFFIX}`;
  }

  /**
   * Lore 이름 → 메인 메타데이터 컬렉션의 포인트 ID
   */
  private getLorePointId(loreName: string): string {
    return `${LORE_POINT_PREFIX}${loreName}`;
  }

  /**
   * Lore 이름 검증
   * 영문, 숫자, 하이픈, 언더스코어만 허용. 첫 글자는 영문/숫자.
   */
  validateLoreName(name: string): void {
    if (!name || name.length === 0) {
      throw new Error('Lore 이름이 비어있습니다.');
    }
    if (name.length > 64) {
      throw new Error('Lore 이름은 64자 이하여야 합니다.');
    }
    if (!LORE_NAME_PATTERN.test(name)) {
      throw new Error(
        `유효하지 않은 Lore 이름: "${name}". 영문, 숫자, 하이픈(-), 언더스코어(_)만 사용 가능하며 첫 글자는 영문 또는 숫자여야 합니다.`
      );
    }
  }

  /**
   * Lore 존재 여부 확인 (메인 메타데이터 컬렉션 기준)
   */
  async loreExists(loreName: string): Promise<boolean> {
    const pointId = this.getLorePointId(loreName);
    const point = await this.qdrant.getPointById(this.mainMetadataCollection, pointId);
    return point !== null;
  }

  /**
   * Lore가 존재하지 않으면 생성 (vector + metadata 컬렉션 + 메인 메타데이터 등록)
   * description이 전달되고 이미 존재하는 lore면 설명만 갱신
   */
  async ensureLoreExists(loreName: string, description?: string): Promise<void> {
    this.validateLoreName(loreName);

    const pointId = this.getLorePointId(loreName);
    const existing = await this.qdrant.getPointById(this.mainMetadataCollection, pointId);

    // 이미 존재하면: description 갱신 요청이 있을 때만 업데이트
    if (existing) {
      if (description !== undefined) {
        const payload = existing.payload as LoreMetadata;
        await this.qdrant.upsertPoint(this.mainMetadataCollection, pointId, {
          ...payload,
          description,
          last_updated: new Date().toISOString(),
        });
      }
      return;
    }

    const collectionName = this.getCollectionName(loreName);
    const metadataName = this.getMetadataCollectionName(loreName);
    const now = new Date().toISOString();

    // 벡터 컬렉션 생성
    await this.qdrant.createVectorCollection(collectionName, this.vectorSize);

    // Lore 전용 메타데이터 컬렉션 생성
    await this.qdrant.initializePayloadCollection(metadataName);

    // 메인 메타데이터 컬렉션에 lore 엔트리 등록
    const loreMetadata: LoreMetadata = {
      type: 'lore',
      name: loreName,
      description: description || '',
      collection_name: collectionName,
      metadata_collection_name: metadataName,
      created_at: now,
      last_updated: now,
    };

    await this.qdrant.upsertPoint(
      this.mainMetadataCollection,
      this.getLorePointId(loreName),
      loreMetadata
    );

    console.log(`📚 Lore 생성 완료: "${loreName}" (${collectionName})`);
  }

  /**
   * Lore 설명 업데이트
   */
  async updateLoreDescription(loreName: string, description: string): Promise<void> {
    this.validateLoreName(loreName);

    const pointId = this.getLorePointId(loreName);
    const existing = await this.qdrant.getPointById(this.mainMetadataCollection, pointId);
    if (!existing) {
      throw new Error(`Lore를 찾을 수 없습니다: "${loreName}"`);
    }

    const payload = existing.payload as LoreMetadata;
    await this.qdrant.upsertPoint(this.mainMetadataCollection, pointId, {
      ...payload,
      description,
      last_updated: new Date().toISOString(),
    });
  }

  /**
   * Lore 삭제 (vector + metadata 컬렉션 + 메인 메타데이터 제거)
   */
  async deleteLore(loreName: string): Promise<void> {
    this.validateLoreName(loreName);

    // 메인 메타데이터에서 존재 확인
    const exists = await this.loreExists(loreName);
    if (!exists) {
      throw new Error(`Lore를 찾을 수 없습니다: "${loreName}"`);
    }

    const collectionName = this.getCollectionName(loreName);
    const metadataName = this.getMetadataCollectionName(loreName);

    // 벡터 컬렉션 삭제
    const collectionExists = await this.qdrant.collectionExists(collectionName);
    if (collectionExists) {
      await this.qdrant.deleteCollection(collectionName);
    }

    // Lore 전용 메타데이터 컬렉션 삭제
    const metadataExists = await this.qdrant.collectionExists(metadataName);
    if (metadataExists) {
      await this.qdrant.deleteCollection(metadataName);
    }

    // 메인 메타데이터 컬렉션에서 lore 엔트리 제거
    await this.qdrant.deletePoint(
      this.mainMetadataCollection,
      this.getLorePointId(loreName)
    );

    // 캐시된 MetadataService 제거
    this.metadataServices.delete(loreName);

    console.log(`📚 Lore 삭제 완료: "${loreName}"`);
  }

  /**
   * 모든 Lore 목록 반환 (메인 메타데이터 컬렉션에서 조회)
   */
  async listLores(): Promise<LoreInfo[]> {
    const allPoints = await this.qdrant.scrollCollection(this.mainMetadataCollection, 1000);
    const lores: LoreInfo[] = [];

    for (const point of allPoints) {
      if (point.payload.type !== 'lore') continue;

      const lm = point.payload as LoreMetadata;

      // 실제 컬렉션 통계 조회
      let totalChunks = 0;
      try {
        const exists = await this.qdrant.collectionExists(lm.collection_name);
        if (exists) {
          const stats = await this.qdrant.getCollectionStats(lm.collection_name);
          totalChunks = stats.total_count;
        }
      } catch {
        // 통계 조회 실패 시 0으로 유지
      }

      lores.push({
        name: lm.name,
        description: lm.description || '',
        collection_name: lm.collection_name,
        total_chunks: totalChunks,
        created_at: lm.created_at,
      });
    }

    return lores;
  }

  /**
   * 특정 Lore 통계
   */
  async getLoreStats(loreName: string): Promise<{
    total_count: number;
    vector_count: number;
    categories: Record<string, number>;
  }> {
    this.validateLoreName(loreName);

    const exists = await this.loreExists(loreName);
    if (!exists) {
      throw new Error(`Lore를 찾을 수 없습니다: "${loreName}"`);
    }

    const collectionName = this.getCollectionName(loreName);
    const stats = await this.qdrant.getCollectionStats(collectionName);
    const metadataService = this.getMetadataService(loreName);
    const categories = await metadataService.getCategoryStats();

    return {
      ...stats,
      categories,
    };
  }

  /**
   * Lore별 MetadataService 인스턴스 반환 (캐싱)
   */
  getMetadataService(loreName: string): MetadataService {
    let service = this.metadataServices.get(loreName);
    if (!service) {
      const metadataName = this.getMetadataCollectionName(loreName);
      service = new MetadataService(this.qdrant, metadataName);
      this.metadataServices.set(loreName, service);
    }
    return service;
  }
}
