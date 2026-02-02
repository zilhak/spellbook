/**
 * 관리 도구
 *
 * - stats: 저장소 통계
 * - export: 백업 내보내기
 * - import: 백업 가져오기
 * - get_index: 메타 목차 조회
 */

import type { QdrantService } from '../db/qdrant.js';
import type { SearchService } from '../core/searcher.js';
import type { EmbeddingService } from '../core/embedder.js';

interface BackupChunk {
  id?: string;
  text: string;
  topic_id?: string;
  category?: string;
  keywords?: string[];
  questions?: string[];
  entities?: any[];
  importance?: string;
  source?: string;
  created_at?: string;
  updated_at?: string;
}

interface BackupData {
  version?: string;
  chunks: BackupChunk[];
}

export class AdminTools {
  constructor(
    private qdrant: QdrantService,
    private searcher: SearchService,
    private embedder: EmbeddingService
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

  /**
   * import 도구 실행 (JSON 백업 복원)
   *
   * 1. JSON 파싱 및 검증
   * 2. 각 chunk에 대해 임베딩 재생성
   * 3. VectorDB에 저장
   */
  async import(data: BackupData): Promise<any> {
    try {
      // 데이터 검증
      if (!data || !Array.isArray(data.chunks)) {
        throw new Error('유효하지 않은 백업 데이터: chunks 배열이 필요합니다.');
      }

      const results = {
        total: data.chunks.length,
        success: 0,
        failed: 0,
        errors: [] as string[],
      };

      // 각 chunk 처리
      for (let i = 0; i < data.chunks.length; i++) {
        const chunk = data.chunks[i];

        try {
          // 필수 필드 검증
          if (!chunk.text) {
            throw new Error(`청크 ${i}: text 필드가 없습니다.`);
          }

          // ID 생성 (없으면)
          const id = chunk.id || `imported-${Date.now()}-${i}`;

          // 임베딩 생성
          const embedding = await this.embedder.embed(chunk.text);

          // payload 구성
          const payload = {
            text: chunk.text,
            topic_id: chunk.topic_id || 'imported',
            category: chunk.category || 'imported',
            keywords: chunk.keywords || [],
            questions: chunk.questions || [],
            entities: chunk.entities || [],
            importance: chunk.importance || 'medium',
            source: chunk.source || 'backup-import',
            created_at: chunk.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          // VectorDB 저장
          await this.qdrant.upsertChunk(id, embedding, payload);
          results.success++;

        } catch (chunkError: any) {
          results.failed++;
          results.errors.push(chunkError.message);
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: results.failed === 0 ? 'success' : 'partial',
              message: `${results.success}/${results.total} 청크 가져오기 완료`,
              ...results,
            }, null, 2),
          },
        ],
      };

    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'error',
              message: error.message,
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }
}
