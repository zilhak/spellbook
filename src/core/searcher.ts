/**
 * 검색 서비스
 *
 * - 의미 기반 검색 (memorize)
 * - 키워드 기반 검색 (find)
 * - 중복 감지
 */

import type { EmbeddingService } from './embedder.js';
import type { QdrantService } from '../db/qdrant.js';
import type { SearchResult } from '../types/models.js';
import { convertToQdrantFilter } from './filter-utils.js';

export class SearchService {
  constructor(
    private qdrant: QdrantService,
    private embedder: EmbeddingService
  ) {}

  /**
   * 의미 기반 검색 (memorize 도구)
   * collection 지정 시 해당 컬렉션에서 검색 (lore용)
   * threshold: 벡터 유사도 임계값 (기본 0.7)
   */
  async semanticSearch(
    query: string,
    limit: number = 5,
    filter?: Record<string, any>,
    collection?: string,
    threshold: number = 0.7
  ): Promise<SearchResult[]> {
    // 쿼리 임베딩 생성
    const queryEmbedding = await this.embedder.embed(query);

    // 필터 변환 (단순 형식 → Qdrant 형식)
    const qdrantFilter = convertToQdrantFilter(filter || {});

    // 벡터 유사도 검색
    const results = collection
      ? await this.qdrant.searchInCollection(collection, queryEmbedding, limit, qdrantFilter, threshold)
      : await this.qdrant.search(queryEmbedding, limit, qdrantFilter, threshold);

    return results.map(r => ({
      id: r.id,
      score: r.score,
      chunk: r.payload,
    }));
  }

  /**
   * 키워드/필터 직접 검색 (find/recall_find 기본 경로)
   * collection 지정 시 해당 컬렉션에서 검색 (lore용)
   *
   * 벡터 유사도와 무관하게 payload/keyword 필터 매칭 결과를 scroll로 반환한다.
   * keywordSearch의 벡터 확장은 score threshold로 정확히 맞는 키워드를 조용히
   * 탈락시키는 문제가 있어, 확실한 키워드 매칭이 필요할 때 이 경로를 사용한다.
   */
  async keywordFilterSearch(
    keywords: string[],
    limit: number = 5,
    filter?: Record<string, any>,
    collection?: string
  ): Promise<SearchResult[]> {
    const combinedFilter = this.buildKeywordFilter(keywords, filter);

    const points = collection
      ? await this.qdrant.scrollInCollection(collection, limit, combinedFilter)
      : await this.qdrant.scroll(limit, combinedFilter);

    return points.map(r => ({
      id: r.id,
      score: 1.0, // 필터 결과이므로 score는 의미없음
      chunk: r.payload,
    }));
  }

  /**
   * 키워드 기반 하이브리드 검색 (find 도구, hybrid 옵션)
   * collection 지정 시 해당 컬렉션에서 검색 (lore용)
   *
   * 하이브리드 접근:
   * 1. 키워드 필터링 (payload 검색)
   * 2. 키워드로 임베딩 생성 → 의미 확장
   * threshold: 벡터 유사도 임계값 (기본 0.6)
   */
  async keywordSearch(
    keywords: string[],
    limit: number = 5,
    filter?: Record<string, any>,
    collection?: string,
    threshold: number = 0.6
  ): Promise<SearchResult[]> {
    const combinedFilter = this.buildKeywordFilter(keywords, filter);

    // 키워드로 임베딩 생성 (의미 확장)
    const queryEmbedding = await this.embedder.embed(keywords.join(' '));

    // 하이브리드 검색
    const results = collection
      ? await this.qdrant.searchInCollection(collection, queryEmbedding, limit, combinedFilter, threshold)
      : await this.qdrant.search(queryEmbedding, limit, combinedFilter, threshold);

    return results.map(r => ({
      id: r.id,
      score: r.score,
      chunk: r.payload,
    }));
  }

  /**
   * 키워드 should 필터 + 사용자 필터 병합
   * keywords가 비어있으면 사용자 필터만 적용한다.
   */
  private buildKeywordFilter(
    keywords: string[],
    filter?: Record<string, any>
  ): Record<string, any> | undefined {
    const userFilter = convertToQdrantFilter(filter || {});
    const must: any[] = userFilter?.must ? [...userFilter.must] : [];

    if (keywords.length > 0) {
      must.push({
        should: keywords.map(kw => ({
          key: 'keywords',
          // 저장된 keywords는 원본 대소문자를 유지하므로 원본+소문자 둘 다 매칭
          match: { any: [...new Set([kw, kw.toLowerCase()])] },
        })),
      });
    }

    return must.length > 0 ? { must } : undefined;
  }

  /**
   * 중복 감지
   * collection 지정 시 해당 컬렉션에서 감지 (lore용)
   *
   * 유사도가 threshold 이상인 청크 검색
   */
  async detectDuplicates(
    text: string,
    threshold: number = 0.95,
    collection?: string
  ): Promise<SearchResult[] | null> {
    const embedding = await this.embedder.embed(text);

    const results = collection
      ? await this.qdrant.searchInCollection(collection, embedding, 5, undefined, threshold)
      : await this.qdrant.search(embedding, 5, undefined, threshold);

    return results.length > 0
      ? results.map(r => ({
          id: r.id,
          score: r.score,
          chunk: r.payload,
        }))
      : null;
  }

  /**
   * 토픽별 모든 청크 조회
   * collection 지정 시 해당 컬렉션에서 조회 (lore용)
   */
  async getTopicChunks(topicId: string, collection?: string): Promise<SearchResult[]> {
    const filter = {
      must: [{ key: 'topic_id', match: { value: topicId } }],
    };
    const results = collection
      ? await this.qdrant.scrollInCollection(collection, 100, filter)
      : await this.qdrant.scroll(100, filter);

    return results.map((r, index) => ({
      id: r.id,
      score: 1.0, // 필터 결과이므로 score는 의미없음
      chunk: r.payload,
    }));
  }

  /**
   * 카테고리별 청크 검색
   */
  async searchByCategory(
    category: string,
    limit: number = 10
  ): Promise<SearchResult[]> {
    const results = await this.qdrant.scroll(limit, {
      must: [{ key: 'category', match: { value: category } }],
    });

    return results.map(r => ({
      id: r.id,
      score: 1.0,
      chunk: r.payload,
    }));
  }
}
