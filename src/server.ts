/**
 * MCP HTTP/SSE 서버
 *
 * Model Context Protocol SDK를 사용하여 HTTP/SSE 기반 MCP 서버 구현.
 * StreamableHTTPServerTransport를 사용하여 MCP 표준 프로토콜 지원.
 */

import express, { type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { RestTools } from './tools/rest.js';
import type { ScribeTools } from './tools/scribe.js';
import type { MemorizeTools } from './tools/memorize.js';
import type { AdminTools } from './tools/admin.js';
import type { ChronicleTools } from './tools/chronicle.js';
import type { RecallTools } from './tools/recall.js';
import type { ScrollTools } from './tools/scroll.js';
import type { MaintenanceTools } from './tools/maintenance.js';
import type { LoreManager } from './core/lore-manager.js';
import { getFilterGuide } from './core/filter-utils.js';

export interface ToolHandlers {
  rest: RestTools;
  scribe: ScribeTools;
  memorize: MemorizeTools;
  admin: AdminTools;
  chronicle: ChronicleTools;
  recall: RecallTools;
  loreManager: LoreManager;
  scroll: ScrollTools;
  maintenance: MaintenanceTools;
}

export class MCPServer {
  private app: express.Application;
  private tools: ToolHandlers;
  private transports: Record<string, StreamableHTTPServerTransport> = {};

  constructor(tools: ToolHandlers) {
    this.app = express();
    this.tools = tools;
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use((req, res, next) => {
      // CORS 설정
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      next();
    });
  }

  /**
   * MCP 서버 인스턴스 생성 및 도구 등록
   */
  private createMcpServer(): McpServer {
    const server = new McpServer(
      {
        name: 'spellbook',
        version: '1.0.0',
      },
      {
        instructions: [
          'Spellbook은 세 종류의 저장소를 제공합니다:',
          '- Canon: 기본 컬렉션. 범용 지식이 축적되는 메인 저장소 (scribe, memorize, find, erase, revise, get_topic, list_chunks, stats, get_index, export, import)',
          '- Lore: 이름 붙은 서브 컬렉션. 용도별로 분리된 독립 저장소 (chronicle, recall, recall_find, recall_list, recall_topic, erase_lore, revise_lore, export_lore, import_lore, list_lores, delete_lore, lore_stats, update_lore)',
          '- Scroll: 엄격한 문서 저장소. 독립적인 문서를 카테고리/라벨로 분류하여 보관 (write_scroll, read_scroll, modify_scroll, delete_scroll, get_scroll_index)',
          'Canon과 Lore는 완전히 격리된 API입니다. Canon API로 Lore 데이터에 접근할 수 없고, 그 반대도 마찬가지입니다.',
          'Scroll은 Canon/Lore와 별도의 SQLite 저장소로, 의미검색 없이 CRUD + 필터 조회만 지원합니다.',
          '저장(scribe/chronicle)은 REST 모드에서만 가능합니다. rest() → scribe/chronicle → rest_end() 순서로 호출하세요.',
          'Scroll은 REST 모드 없이 바로 write_scroll로 저장 가능합니다.',
        ].join('\n'),
      },
    );

    // === REST 도구 ===
    server.tool(
      'rest',
      'REST 모드 진입, 청킹 가이드 로드',
      {},
      async () => {
        const result = await this.tools.rest.rest();
        return result;
      }
    );

    server.tool(
      'rest_end',
      'REST 모드 종료',
      {
        session_id: z.string().describe('REST 세션 ID'),
      },
      async ({ session_id }) => {
        const result = await this.tools.rest.restEnd(session_id);
        return result;
      }
    );

    // === Scribe 도구 ===
    server.tool(
      'scribe',
      'Canon(기본 컬렉션)에 청크 저장 (REST 모드 필수)',
      {
        chunk: z.object({
          id: z.string().optional(),
          text: z.string(),
          metadata: z.object({
            topic_id: z.string(),
            topic_name: z.string().optional().describe('토픽의 사람이 읽을 수 있는 이름'),
            category: z.string(),
            sub_category: z.string().optional().describe('카테고리 하위 분류'),
            keywords: z.array(z.string()),
            questions: z.array(z.string()),
            entities: z.array(z.object({
              name: z.string(),
              type: z.enum(['person', 'project', 'technology', 'organization', 'concept']),
            })),
            importance: z.enum(['high', 'medium', 'low']),
            source: z.string().optional(),
          }),
        }).describe('저장할 청크 데이터'),
        session_id: z.string().describe('REST 세션 ID'),
        category: z.string().optional().describe('카테고리 (선택)'),
        source: z.string().optional().describe('출처 (선택)'),
      },
      async (args) => {
        const result = await this.tools.scribe.scribe(args as any);
        return result;
      }
    );

    server.tool(
      'erase',
      'Canon에서 청크 삭제',
      {
        chunk_id: z.string().describe('삭제할 청크 ID'),
      },
      async ({ chunk_id }) => {
        const result = await this.tools.scribe.erase(chunk_id);
        return result;
      }
    );

    server.tool(
      'revise',
      'Canon에서 청크 수정',
      {
        chunk_id: z.string().describe('수정할 청크 ID'),
        new_text: z.string().describe('새로운 텍스트'),
      },
      async ({ chunk_id, new_text }) => {
        const result = await this.tools.scribe.revise(chunk_id, new_text);
        return result;
      }
    );

    // === Memorize 도구 ===
    server.tool(
      'memorize',
      'Canon에서 의미 기반 검색 (벡터 유사도)',
      {
        query: z.string().describe('검색 쿼리'),
        limit: z.number().optional().describe('결과 수 제한 (기본: 5)'),
        filter: z.record(z.string(), z.any()).optional().describe('메타데이터 필터'),
        threshold: z.number().optional().describe('벡터 유사도 임계값 (기본: 0.7). 낮추면 더 많은 결과'),
      },
      async (args) => {
        const result = await this.tools.memorize.memorize(args);
        return result;
      }
    );

    server.tool(
      'find',
      'Canon에서 키워드 기반 검색 (기본: 순수 필터 매칭, 벡터 threshold 게이팅 없음)',
      {
        keywords: z.array(z.string()).describe('검색 키워드 목록'),
        limit: z.number().optional().describe('결과 수 제한 (기본: 5)'),
        filter: z.record(z.string(), z.any()).optional().describe('메타데이터 필터'),
        hybrid: z.boolean().optional().describe('true 시 벡터 확장 하이브리드 검색 (기본: false, 순수 필터)'),
        threshold: z.number().optional().describe('hybrid 모드 벡터 유사도 임계값 (기본: 0.6)'),
      },
      async (args) => {
        const result = await this.tools.memorize.find(args);
        return result;
      }
    );

    server.tool(
      'get_topic',
      'Canon에서 특정 토픽의 모든 청크 조회',
      {
        topic_id: z.string().describe('토픽 ID'),
      },
      async ({ topic_id }) => {
        const result = await this.tools.memorize.getTopic(topic_id);
        return result;
      }
    );

    // === Admin 도구 ===
    server.tool(
      'stats',
      'Canon 저장소 통계',
      {},
      async () => {
        const result = await this.tools.admin.stats();
        return result;
      }
    );

    server.tool(
      'get_index',
      'Canon 메타 목차 조회',
      {
        scope: z.string().optional().describe('범위 제한 (선택)'),
      },
      async ({ scope }) => {
        const result = await this.tools.admin.getIndex(scope);
        return result;
      }
    );

    server.tool(
      'filter_guide',
      '필터 사용법 가이드 조회',
      {},
      async () => {
        return {
          content: [{ type: 'text', text: getFilterGuide() }],
        };
      }
    );

    server.tool(
      'list_chunks',
      'Canon의 모든 청크를 검색 없이 나열 (스크롤). memorize/find로 누락될 수 있는 청크까지 전부 반환. id는 revise/erase에 사용 가능.',
      {
        limit: z.number().optional().describe('반환할 최대 청크 수 (미지정 시 전체)'),
      },
      async ({ limit }) => {
        const result = await this.tools.admin.listChunks(limit);
        return result;
      }
    );

    server.tool(
      'export',
      'Canon JSON 백업 내보내기',
      {},
      async () => {
        const result = await this.tools.admin.export();
        return result;
      }
    );

    server.tool(
      'import',
      'Canon JSON 백업 가져오기',
      {
        data: z.object({
          version: z.string().optional().describe('백업 버전 (선택)'),
          chunks: z.array(z.object({
            id: z.string().optional(),
            text: z.string(),
            topic_id: z.string().optional(),
            topic_name: z.string().optional(),
            category: z.string().optional(),
            sub_category: z.string().optional(),
            keywords: z.array(z.string()).optional(),
            questions: z.array(z.string()).optional(),
            entities: z.array(z.any()).optional(),
            importance: z.string().optional(),
            source: z.string().optional(),
            created_at: z.string().optional(),
            updated_at: z.string().optional(),
          })).describe('가져올 청크 배열'),
        }).describe('백업 데이터'),
      },
      async ({ data }) => {
        const result = await this.tools.admin.import(data);
        return result;
      }
    );

    // === Chronicle 도구 (Lore 저장) ===
    server.tool(
      'chronicle',
      'Lore에 청크 저장 (REST 모드 필수)',
      {
        lore: z.string().describe('Lore 이름'),
        lore_description: z.string().optional().describe('Lore 설명 (신규 생성 시 설정, 기존 Lore면 갱신)'),
        chunk: z.object({
          id: z.string().optional(),
          text: z.string(),
          metadata: z.object({
            topic_id: z.string(),
            topic_name: z.string().optional().describe('토픽의 사람이 읽을 수 있는 이름'),
            category: z.string(),
            sub_category: z.string().optional().describe('카테고리 하위 분류'),
            keywords: z.array(z.string()),
            questions: z.array(z.string()),
            entities: z.array(z.object({
              name: z.string(),
              type: z.enum(['person', 'project', 'technology', 'organization', 'concept']),
            })),
            importance: z.enum(['high', 'medium', 'low']),
            source: z.string().optional(),
          }),
        }).describe('저장할 청크 데이터'),
        session_id: z.string().describe('REST 세션 ID'),
        category: z.string().optional().describe('카테고리 (선택)'),
        source: z.string().optional().describe('출처 (선택)'),
      },
      async (args) => {
        const result = await this.tools.chronicle.chronicle(args as any);
        return result;
      }
    );

    server.tool(
      'erase_lore',
      'Lore에서 청크 삭제',
      {
        lore: z.string().describe('Lore 이름'),
        chunk_id: z.string().describe('삭제할 청크 ID'),
      },
      async ({ lore, chunk_id }) => {
        const result = await this.tools.chronicle.eraseLore(lore, chunk_id);
        return result;
      }
    );

    server.tool(
      'revise_lore',
      'Lore에서 청크 수정',
      {
        lore: z.string().describe('Lore 이름'),
        chunk_id: z.string().describe('수정할 청크 ID'),
        new_text: z.string().describe('새로운 텍스트'),
      },
      async ({ lore, chunk_id, new_text }) => {
        const result = await this.tools.chronicle.reviseLore(lore, chunk_id, new_text);
        return result;
      }
    );

    server.tool(
      'export_lore',
      'Lore 전체를 JSON으로 백업 내보내기 (임베딩 제외, id/text/metadata 포함)',
      {
        lore: z.string().describe('Lore 이름'),
      },
      async ({ lore }) => {
        const result = await this.tools.chronicle.exportLore(lore);
        return result;
      }
    );

    server.tool(
      'import_lore',
      'Lore JSON 백업 가져오기 (재임베딩 후 복원, 없으면 생성)',
      {
        lore: z.string().describe('복원 대상 Lore 이름'),
        data: z.object({
          version: z.string().optional().describe('백업 버전 (선택)'),
          lore_description: z.string().optional().describe('Lore 설명 (신규 생성 시)'),
          chunks: z.array(z.object({
            id: z.string().optional(),
            text: z.string(),
            topic_id: z.string().optional(),
            topic_name: z.string().optional(),
            category: z.string().optional(),
            sub_category: z.string().optional(),
            keywords: z.array(z.string()).optional(),
            questions: z.array(z.string()).optional(),
            entities: z.array(z.any()).optional(),
            importance: z.string().optional(),
            source: z.string().optional(),
            created_at: z.string().optional(),
            updated_at: z.string().optional(),
          })).describe('가져올 청크 배열'),
        }).describe('백업 데이터'),
      },
      async ({ lore, data }) => {
        const result = await this.tools.chronicle.importLore(lore, data);
        return result;
      }
    );

    // === Recall 도구 (Lore 검색) ===
    server.tool(
      'recall',
      'Lore에서 의미 기반 검색',
      {
        lore: z.string().describe('Lore 이름'),
        query: z.string().describe('검색 쿼리'),
        limit: z.number().optional().describe('결과 수 제한 (기본: 5)'),
        filter: z.record(z.string(), z.any()).optional().describe('메타데이터 필터'),
        threshold: z.number().optional().describe('벡터 유사도 임계값 (기본: 0.7). 낮추면 더 많은 결과'),
      },
      async (args) => {
        const result = await this.tools.recall.recall(args);
        return result;
      }
    );

    server.tool(
      'recall_find',
      'Lore에서 키워드 기반 검색 (기본: 순수 필터 매칭, 벡터 threshold 게이팅 없음)',
      {
        lore: z.string().describe('Lore 이름'),
        keywords: z.array(z.string()).describe('검색 키워드 목록'),
        limit: z.number().optional().describe('결과 수 제한 (기본: 5)'),
        filter: z.record(z.string(), z.any()).optional().describe('메타데이터 필터'),
        hybrid: z.boolean().optional().describe('true 시 벡터 확장 하이브리드 검색 (기본: false, 순수 필터)'),
        threshold: z.number().optional().describe('hybrid 모드 벡터 유사도 임계값 (기본: 0.6)'),
      },
      async (args) => {
        const result = await this.tools.recall.recallFind(args);
        return result;
      }
    );

    server.tool(
      'recall_topic',
      'Lore에서 특정 토픽의 모든 청크 조회 (Canon get_topic의 Lore 대응)',
      {
        lore: z.string().describe('Lore 이름'),
        topic_id: z.string().describe('토픽 ID'),
      },
      async ({ lore, topic_id }) => {
        const result = await this.tools.recall.recallTopic(lore, topic_id);
        return result;
      }
    );

    server.tool(
      'recall_list',
      'Lore의 모든 청크를 검색 없이 나열 (스크롤). recall/recall_find는 벡터 유사도 기반이라 누락될 수 있는 청크까지 전부 반환. id는 revise_lore/erase_lore에 사용 가능.',
      {
        lore: z.string().describe('Lore 이름'),
        limit: z.number().optional().describe('반환할 최대 청크 수 (기본: 1000)'),
      },
      async ({ lore, limit }) => {
        try {
          const chunks = await this.tools.loreManager.listChunks(lore, limit);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    lore,
                    count: chunks.length,
                    chunks,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error: any) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: error.message }, null, 2) }],
            isError: true,
          };
        }
      }
    );

    // === Lore 관리 도구 ===
    server.tool(
      'list_lores',
      '모든 Lore 목록 조회',
      {},
      async () => {
        try {
          const lores = await this.tools.loreManager.listLores();
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    count: lores.length,
                    lores,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error: any) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: error.message }, null, 2) }],
            isError: true,
          };
        }
      }
    );

    server.tool(
      'delete_lore',
      'Lore 삭제 (전체 컬렉션 삭제, 복구 불가)',
      {
        lore: z.string().describe('삭제할 Lore 이름'),
      },
      async ({ lore }) => {
        try {
          await this.tools.loreManager.deleteLore(lore);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    status: 'success',
                    message: `Lore "${lore}" 삭제 완료`,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error: any) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: error.message }, null, 2) }],
            isError: true,
          };
        }
      }
    );

    server.tool(
      'lore_stats',
      '특정 Lore 통계 조회',
      {
        lore: z.string().describe('Lore 이름'),
      },
      async ({ lore }) => {
        try {
          const stats = await this.tools.loreManager.getLoreStats(lore);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    lore,
                    ...stats,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error: any) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: error.message }, null, 2) }],
            isError: true,
          };
        }
      }
    );

    server.tool(
      'update_lore',
      'Lore 설명 수정',
      {
        lore: z.string().describe('Lore 이름'),
        description: z.string().describe('새로운 Lore 설명'),
      },
      async ({ lore, description }) => {
        try {
          await this.tools.loreManager.updateLoreDescription(lore, description);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    status: 'success',
                    message: `Lore "${lore}" 설명 수정 완료`,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error: any) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: error.message }, null, 2) }],
            isError: true,
          };
        }
      }
    );

    // === 유지보수/운영 도구 (Canon/Lore 공용) ===
    server.tool(
      'reindex',
      '대상 저장소의 모든 청크를 현재 임베딩 모델로 재생성 (모델 교체/vector_count:0/손상 복구). lore 미지정 시 Canon.',
      {
        lore: z.string().optional().describe('Lore 이름 (미지정 시 Canon)'),
      },
      async ({ lore }) => {
        return await this.tools.maintenance.reindex(lore);
      }
    );

    server.tool(
      'health',
      '저장소 정합성 진단 (total_count vs vector_count 불일치, 고아 메타데이터 감지). lore 미지정 시 Canon.',
      {
        lore: z.string().optional().describe('Lore 이름 (미지정 시 Canon)'),
      },
      async ({ lore }) => {
        return await this.tools.maintenance.health(lore);
      }
    );

    // === Scroll 도구 ===
    server.tool(
      'write_scroll',
      'Scroll에 문서 저장',
      {
        title: z.string().describe('문서 제목'),
        content: z.string().describe('문서 내용'),
        category: z.string().describe('카테고리 (필수)'),
        sub_category: z.string().optional().describe('서브카테고리 (선택)'),
        labels: z.array(z.string()).optional().describe('라벨 목록 (선택)'),
      },
      async (args) => {
        return await this.tools.scroll.writeScroll(args);
      }
    );

    server.tool(
      'read_scroll',
      'Scroll 문서 조회 (ID 단건 또는 필터 조회)',
      {
        id: z.string().optional().describe('스크롤 ID (단건 조회)'),
        category: z.string().optional().describe('카테고리 필터'),
        sub_category: z.string().optional().describe('서브카테고리 필터'),
        label: z.string().optional().describe('라벨 필터'),
      },
      async (args) => {
        return await this.tools.scroll.readScroll(args);
      }
    );

    server.tool(
      'modify_scroll',
      'Scroll 문서 수정',
      {
        id: z.string().describe('수정할 스크롤 ID'),
        title: z.string().optional().describe('새 제목'),
        content: z.string().optional().describe('새 내용'),
        category: z.string().optional().describe('새 카테고리'),
        sub_category: z.string().optional().describe('새 서브카테고리 (빈 문자열로 제거)'),
        labels: z.array(z.string()).optional().describe('새 라벨 목록 (전체 교체)'),
      },
      async (args) => {
        return await this.tools.scroll.modifyScroll(args);
      }
    );

    server.tool(
      'delete_scroll',
      'Scroll 문서 삭제',
      {
        id: z.string().describe('삭제할 스크롤 ID'),
      },
      async ({ id }) => {
        return await this.tools.scroll.deleteScroll(id);
      }
    );

    server.tool(
      'get_scroll_index',
      'Scroll 인덱스 조회 (카테고리, 서브카테고리, 라벨 목록과 개수)',
      {},
      async () => {
        return await this.tools.scroll.getScrollIndex();
      }
    );

    return server;
  }

  private setupRoutes(): void {
    // 헬스체크 (MCP 외부 엔드포인트)
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // MCP 엔드포인트 (POST - 주요 요청 처리)
    this.app.post('/mcp', async (req: Request, res: Response) => {
      try {
        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        let transport: StreamableHTTPServerTransport;

        if (sessionId && this.transports[sessionId]) {
          // 기존 세션 재사용
          transport = this.transports[sessionId];
        } else if (!sessionId && isInitializeRequest(req.body)) {
          // 새 세션 초기화
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (id) => {
              this.transports[id] = transport;
              console.log('MCP 세션 초기화:', id);
            },
          });

          transport.onclose = () => {
            if (transport.sessionId) {
              delete this.transports[transport.sessionId];
              console.log('MCP 세션 종료:', transport.sessionId);
            }
          };

          transport.onerror = (error) => {
            console.error('MCP Transport 에러:', error);
          };

          const server = this.createMcpServer();
          await server.connect(transport);
        } else {
          res.status(400).json({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Invalid session or missing session ID' },
            id: null,
          });
          return;
        }

        await transport.handleRequest(req, res, req.body);
      } catch (error: any) {
        console.error('MCP 요청 처리 에러:', error);
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: error.message || 'Internal error' },
          id: null,
        });
      }
    });

    // MCP 엔드포인트 (GET - SSE 스트리밍)
    this.app.get('/mcp', async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string;
      const transport = this.transports[sessionId];
      if (transport) {
        await transport.handleRequest(req, res);
      } else {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Invalid session' },
          id: null,
        });
      }
    });

    // MCP 엔드포인트 (DELETE - 세션 종료)
    this.app.delete('/mcp', async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string;
      const transport = this.transports[sessionId];
      if (transport) {
        await transport.handleRequest(req, res);
        delete this.transports[sessionId];
      } else {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Invalid session' },
          id: null,
        });
      }
    });

    // 레거시 호환: 기존 /tools 엔드포인트 (참조용)
    this.app.get('/tools', (req, res) => {
      res.json({
        message: 'Use MCP protocol at /mcp endpoint',
        tools: [
          'rest', 'rest_end', 'scribe', 'erase', 'revise',
          'memorize', 'find', 'get_topic', 'list_chunks',
          'chronicle', 'erase_lore', 'revise_lore', 'export_lore', 'import_lore',
          'recall', 'recall_find', 'recall_list', 'recall_topic',
          'list_lores', 'delete_lore', 'lore_stats', 'update_lore',
          'stats', 'get_index', 'filter_guide', 'export', 'import',
          'reindex', 'health',
          'write_scroll', 'read_scroll', 'modify_scroll', 'delete_scroll', 'get_scroll_index',
        ],
      });
    });
  }

  start(port: number, host: string): void {
    this.app.listen(port, host, () => {
      console.log(`🚀 Spellbook MCP 서버 시작`);
      console.log(`   - MCP: http://${host}:${port}/mcp`);
      console.log(`   - 헬스체크: http://${host}:${port}/health`);
    });
  }
}
