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

export interface ToolHandlers {
  rest: RestTools;
  scribe: ScribeTools;
  memorize: MemorizeTools;
  admin: AdminTools;
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
    const server = new McpServer({
      name: 'spellbook',
      version: '0.1.0',
    });

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
      '청크 저장 (REST 모드 필수)',
      {
        chunk: z.object({
          id: z.string().optional(),
          text: z.string(),
          metadata: z.object({
            topic_id: z.string(),
            category: z.string(),
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
      '청크 삭제',
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
      '청크 수정',
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
      '의미 기반 검색',
      {
        query: z.string().describe('검색 쿼리'),
        limit: z.number().optional().describe('결과 수 제한 (기본: 5)'),
        filter: z.record(z.string(), z.any()).optional().describe('메타데이터 필터'),
      },
      async (args) => {
        const result = await this.tools.memorize.memorize(args);
        return result;
      }
    );

    server.tool(
      'find',
      '키워드 기반 검색',
      {
        keywords: z.array(z.string()).describe('검색 키워드 목록'),
        limit: z.number().optional().describe('결과 수 제한 (기본: 5)'),
        filter: z.record(z.string(), z.any()).optional().describe('메타데이터 필터'),
      },
      async (args) => {
        const result = await this.tools.memorize.find(args);
        return result;
      }
    );

    server.tool(
      'get_topic',
      '특정 토픽의 모든 청크 조회',
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
      '저장소 통계',
      {},
      async () => {
        const result = await this.tools.admin.stats();
        return result;
      }
    );

    server.tool(
      'get_index',
      '메타 목차 조회',
      {
        scope: z.string().optional().describe('범위 제한 (선택)'),
      },
      async ({ scope }) => {
        const result = await this.tools.admin.getIndex(scope);
        return result;
      }
    );

    server.tool(
      'export',
      'JSON 백업 내보내기',
      {},
      async () => {
        const result = await this.tools.admin.export();
        return result;
      }
    );

    server.tool(
      'import',
      'JSON 백업 가져오기',
      {
        data: z.object({
          version: z.string().optional().describe('백업 버전 (선택)'),
          chunks: z.array(z.object({
            id: z.string().optional(),
            text: z.string(),
            topic_id: z.string().optional(),
            category: z.string().optional(),
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
          'memorize', 'find', 'get_topic',
          'stats', 'get_index', 'export', 'import',
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
