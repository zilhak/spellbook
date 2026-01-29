/**
 * 관리 도구
 *
 * - stats: 저장소 통계
 * - export: 백업 내보내기
 * - get_index: 메타 목차 조회
 */

import type { QdrantService } from '../db/qdrant.js';
import type { SearchService } from '../core/searcher.js';

export class AdminTools {
  constructor(
    private qdrant: QdrantService,
    private searcher: SearchService
  ) {}

  /**
   * stats 도구 실행
   */
  async stats(): Promise<any> {
    try {
      const qdrantStats = await this.qdrant.getStats();

      // 카테고리별 통계 (간단 버전)
      const allChunks = await this.qdrant.scroll(1000);
      const categories = new Map<string, number>();

      for (const chunk of allChunks) {
        const category = chunk.payload.category || 'unknown';
        categories.set(category, (categories.get(category) || 0) + 1);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                total_chunks: qdrantStats.total_count,
                vector_count: qdrantStats.vector_count,
                categories: Object.fromEntries(categories),
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

  /**
   * get_index 도구 실행 (메타 목차)
   */
  async getIndex(scope?: string): Promise<any> {
    try {
      // 모든 청크 조회
      const chunks = await this.qdrant.scroll(1000);

      // 카테고리별 그룹화
      const categories = new Map<string, any[]>();
      for (const chunk of chunks) {
        const category = chunk.payload.category || 'unknown';
        if (!categories.has(category)) {
          categories.set(category, []);
        }
        categories.get(category)!.push(chunk.payload);
      }

      // 메타 인덱스 생성
      const categoryInfos = Array.from(categories.entries()).map(
        ([name, chunks]) => ({
          id: name,
          name,
          topic_count: new Set(chunks.map(c => c.topic_id)).size,
          description: `${chunks.length} chunks`,
        })
      );

      const index = {
        categories: categoryInfos,
        total_topics: categoryInfos.reduce((sum, c) => sum + c.topic_count, 0),
        total_chunks: chunks.length,
        last_updated: new Date().toISOString(),
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(index, null, 2),
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

  /**
   * export 도구 실행 (JSON 백업)
   */
  async export(): Promise<any> {
    try {
      const chunks = await this.qdrant.scroll(10000);

      const backup = {
        version: '0.1.0',
        exported_at: new Date().toISOString(),
        total_chunks: chunks.length,
        chunks: chunks.map(c => c.payload),
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(backup, null, 2),
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
