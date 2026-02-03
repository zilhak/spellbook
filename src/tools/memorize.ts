/**
 * Memorize 도구 (검색/읽기)
 *
 * - memorize: 의미 기반 검색
 * - find: 키워드 기반 검색
 * - get_topic: 토픽별 청크 조회
 */

import type { SearchService } from '../core/searcher.js';
import type { MemorizeRequest, FindRequest } from '../types/models.js';
import { createFilterErrorMessage } from '../core/filter-utils.js';

export class MemorizeTools {
  constructor(private searcher: SearchService) {}

  /**
   * memorize 도구 실행 (의미 기반 검색)
   */
  async memorize(args: MemorizeRequest): Promise<any> {
    try {
      const results = await this.searcher.semanticSearch(
        args.query,
        args.limit || 5,
        args.filter
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                query: args.query,
                count: results.length,
                results: results.map(r => ({
                  id: r.id,
                  score: r.score,
                  text: r.chunk.text,
                  metadata: r.chunk,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      // 필터 관련 에러면 가이드 참조 메시지 추가
      const errorMessage = args.filter
        ? createFilterErrorMessage(error.message)
        : error.message;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: errorMessage,
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * find 도구 실행 (키워드 기반 검색)
   */
  async find(args: FindRequest): Promise<any> {
    try {
      const results = await this.searcher.keywordSearch(
        args.keywords,
        args.limit || 5,
        args.filter
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                keywords: args.keywords,
                count: results.length,
                results: results.map(r => ({
                  id: r.id,
                  score: r.score,
                  text: r.chunk.text,
                  metadata: r.chunk,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      // 필터 관련 에러면 가이드 참조 메시지 추가
      const errorMessage = args.filter
        ? createFilterErrorMessage(error.message)
        : error.message;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: errorMessage,
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * get_topic 도구 실행
   */
  async getTopic(topicId: string): Promise<any> {
    try {
      const results = await this.searcher.getTopicChunks(topicId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                topic_id: topicId,
                count: results.length,
                chunks: results.map(r => r.chunk),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: error.message,
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }
}
