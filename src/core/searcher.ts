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
   */
  async semanticSearch(
    query: string,
    limit: number = 5,
    filter?: Record<string, any>
  ): Promise<SearchResult[]> {
    // 쿼리 임베딩 생성
    const queryEmbedding = await this.embedder.embed(query);

    // 필터 변환 (단순 형식 → Qdrant 형식)
    const qdrantFilter = convertToQdrantFilter(filter || {});

    // 벡터 유사도 검색
    const results = await this.qdrant.search(
      queryEmbedding,
      limit,
      qdrantFilter,
      0.7 // 유사도 임계값
    );

    return results.map(r => ({
      id: r.id,
      score: r.score,
      chunk: r.payload,
    }));
  }

  /**
   * 키워드 기반 검색 (find 도구)
   *
   * 하이브리드 접근:
   * 1. 키워드 필터링 (payload 검색)
   * 2. 키워드로 임베딩 생성 → 의미 확장
   */
  async keywordSearch(
    keywords: string[],
    limit: number = 5,
    filter?: Record<string, any>
  ): Promise<SearchResult[]> {
    // 키워드 필터 생성
    const keywordFilter = {
      should: keywords.map(kw => ({
        key: 'keywords',
        match: { any: [kw.toLowerCase()] },
      })),
    };

    // 사용자 필터 변환 (단순 형식 → Qdrant 형식)
    const userFilter = convertToQdrantFilter(filter || {});

    // 필터 병합
    const combinedFilter = userFilter?.must
      ? { must: [...userFilter.must, keywordFilter] }
      : keywordFilter;

    // 키워드로 임베딩 생성 (의미 확장)
    const queryEmbedding = await this.embedder.embed(keywords.join(' '));

    // 하이브리드 검색
    const results = await this.qdrant.search(
      queryEmbedding,
      limit,
      combinedFilter,
      0.6 // 키워드 검색은 임계값 낮게
    );

    return results.map(r => ({
      id: r.id,
      score: r.score,
      chunk: r.payload,
    }));
  }

  /**
   * 중복 감지
   *
   * 유사도가 threshold 이상인 청크 검색
   */
  async detectDuplicates(
    text: string,
    threshold: number = 0.95
  ): Promise<SearchResult[] | null> {
    const embedding = await this.embedder.embed(text);

    const results = await this.qdrant.search(
      embedding,
      5,
      undefined,
      threshold
    );

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
   */
  async getTopicChunks(topicId: string): Promise<SearchResult[]> {
    const results = await this.qdrant.scroll(100, {
      must: [{ key: 'topic_id', match: { value: topicId } }],
    });

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
