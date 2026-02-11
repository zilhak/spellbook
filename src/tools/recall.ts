/**
 * Recall 도구 (Lore 검색/읽기)
 *
 * Canon의 memorize/find에 대응하는 Lore 전용 검색 도구.
 * - recall: Lore에서 의미 기반 검색
 * - recallFind: Lore에서 키워드 기반 검색
 */

import type { SearchService } from '../core/searcher.js';
import type { LoreManager } from '../core/lore-manager.js';
import type { RecallRequest, RecallFindRequest } from '../types/models.js';
import { createFilterErrorMessage } from '../core/filter-utils.js';

export class RecallTools {
  constructor(
    private searcher: SearchService,
    private loreManager: LoreManager
  ) {}

  /**
   * recall 도구 실행 (Lore 의미 기반 검색)
   */
  async recall(args: RecallRequest): Promise<any> {
    try {
      this.loreManager.validateLoreName(args.lore);

      const exists = await this.loreManager.loreExists(args.lore);
      if (!exists) {
        throw new Error(`Lore를 찾을 수 없습니다: "${args.lore}"`);
      }

      const collectionName = this.loreManager.getCollectionName(args.lore);

      const results = await this.searcher.semanticSearch(
        args.query,
        args.limit || 5,
        args.filter,
        collectionName
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                lore: args.lore,
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
   * recall_find 도구 실행 (Lore 키워드 기반 검색)
   */
  async recallFind(args: RecallFindRequest): Promise<any> {
    try {
      this.loreManager.validateLoreName(args.lore);

      const exists = await this.loreManager.loreExists(args.lore);
      if (!exists) {
        throw new Error(`Lore를 찾을 수 없습니다: "${args.lore}"`);
      }

      const collectionName = this.loreManager.getCollectionName(args.lore);

      const results = await this.searcher.keywordSearch(
        args.keywords,
        args.limit || 5,
        args.filter,
        collectionName
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                lore: args.lore,
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
}
