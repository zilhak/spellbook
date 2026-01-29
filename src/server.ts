/**
 * MCP HTTP/SSE 서버
 *
 * Model Context Protocol을 HTTP/SSE로 구현.
 * Express를 사용하여 HTTP API 제공.
 */

import express, { type Request, type Response } from 'express';
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
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      next();
    });
  }

  private setupRoutes(): void {
    // 헬스체크
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // MCP 도구 목록
    this.app.get('/tools', (req, res) => {
      res.json({
        tools: [
          {
            name: 'rest',
            description: 'REST 모드 진입, 청킹 가이드 로드',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
            },
          },
          {
            name: 'rest_end',
            description: 'REST 모드 종료',
            inputSchema: {
              type: 'object',
              properties: {
                session_id: { type: 'string', description: 'REST 세션 ID' },
              },
              required: ['session_id'],
            },
          },
          {
            name: 'scribe',
            description: '청크 저장 (REST 모드 필수)',
            inputSchema: {
              type: 'object',
              properties: {
                chunk: {
                  type: 'object',
                  description: '저장할 청크 데이터',
                },
                session_id: {
                  type: 'string',
                  description: 'REST 세션 ID',
                },
                category: {
                  type: 'string',
                  description: '카테고리 (선택)',
                },
                source: {
                  type: 'string',
                  description: '출처 (선택)',
                },
              },
              required: ['chunk', 'session_id'],
            },
          },
          {
            name: 'memorize',
            description: '의미 기반 검색',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string', description: '검색 쿼리' },
                limit: { type: 'number', description: '결과 수 제한 (기본: 5)' },
                filter: { type: 'object', description: '메타데이터 필터' },
              },
              required: ['query'],
            },
          },
          {
            name: 'find',
            description: '키워드 기반 검색',
            inputSchema: {
              type: 'object',
              properties: {
                keywords: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '검색 키워드 목록',
                },
                limit: { type: 'number', description: '결과 수 제한 (기본: 5)' },
                filter: { type: 'object', description: '메타데이터 필터' },
              },
              required: ['keywords'],
            },
          },
          {
            name: 'get_topic',
            description: '특정 토픽의 모든 청크 조회',
            inputSchema: {
              type: 'object',
              properties: {
                topic_id: { type: 'string', description: '토픽 ID' },
              },
              required: ['topic_id'],
            },
          },
          {
            name: 'erase',
            description: '청크 삭제',
            inputSchema: {
              type: 'object',
              properties: {
                chunk_id: { type: 'string', description: '삭제할 청크 ID' },
              },
              required: ['chunk_id'],
            },
          },
          {
            name: 'stats',
            description: '저장소 통계',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
            },
          },
          {
            name: 'get_index',
            description: '메타 목차 조회',
            inputSchema: {
              type: 'object',
              properties: {
                scope: { type: 'string', description: '범위 제한 (선택)' },
              },
              required: [],
            },
          },
          {
            name: 'export',
            description: 'JSON 백업 내보내기',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
            },
          },
        ],
      });
    });

    // MCP 도구 실행
    this.app.post('/execute', async (req, res) => {
      try {
        const { tool, arguments: args } = req.body;

        let result;
        switch (tool) {
          case 'rest':
            result = await this.tools.rest.rest();
            break;
          case 'rest_end':
            result = await this.tools.rest.restEnd(args.session_id);
            break;
          case 'scribe':
            result = await this.tools.scribe.scribe(args);
            break;
          case 'erase':
            result = await this.tools.scribe.erase(args.chunk_id);
            break;
          case 'revise':
            result = await this.tools.scribe.revise(args.chunk_id, args.new_text);
            break;
          case 'memorize':
            result = await this.tools.memorize.memorize(args);
            break;
          case 'find':
            result = await this.tools.memorize.find(args);
            break;
          case 'get_topic':
            result = await this.tools.memorize.getTopic(args.topic_id);
            break;
          case 'stats':
            result = await this.tools.admin.stats();
            break;
          case 'get_index':
            result = await this.tools.admin.getIndex(args.scope);
            break;
          case 'export':
            result = await this.tools.admin.export();
            break;
          default:
            res.status(404).json({ error: `Unknown tool: ${tool}` });
            return;
        }

        res.json(result);
      } catch (error: any) {
        console.error('도구 실행 에러:', error);
        res.status(500).json({
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: error.message }, null, 2),
            },
          ],
          isError: true,
        });
      }
    });
  }

  start(port: number, host: string): void {
    this.app.listen(port, host, () => {
      console.log(`🚀 Spellbook MCP 서버 시작`);
      console.log(`   - HTTP: http://${host}:${port}`);
      console.log(`   - 도구 목록: http://${host}:${port}/tools`);
      console.log(`   - 헬스체크: http://${host}:${port}/health`);
    });
  }
}
