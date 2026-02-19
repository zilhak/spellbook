/**
 * Scroll MCP 도구
 *
 * 엄격한 문서 저장소 CRUD + 인덱스 조회.
 */

import type { ScrollService } from '../core/scroll-service.js';
import type { ScrollWriteRequest, ScrollModifyRequest, ScrollReadRequest } from '../types/models.js';

export class ScrollTools {
  constructor(private scrollService: ScrollService) {}

  async writeScroll(args: ScrollWriteRequest) {
    try {
      const scroll = this.scrollService.write(args);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            status: 'success',
            message: '스크롤 저장 완료',
            scroll,
          }, null, 2),
        }],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: error.message }, null, 2) }],
        isError: true,
      };
    }
  }

  async readScroll(args: ScrollReadRequest) {
    try {
      const result = this.scrollService.read(args);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            status: 'success',
            result,
          }, null, 2),
        }],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: error.message }, null, 2) }],
        isError: true,
      };
    }
  }

  async modifyScroll(args: ScrollModifyRequest) {
    try {
      const scroll = this.scrollService.modify(args);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            status: 'success',
            message: '스크롤 수정 완료',
            scroll,
          }, null, 2),
        }],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: error.message }, null, 2) }],
        isError: true,
      };
    }
  }

  async deleteScroll(id: string) {
    try {
      this.scrollService.delete(id);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            status: 'success',
            message: `스크롤 삭제 완료: ${id}`,
          }, null, 2),
        }],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: error.message }, null, 2) }],
        isError: true,
      };
    }
  }

  async getScrollIndex() {
    try {
      const index = this.scrollService.getIndex();
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            status: 'success',
            index,
          }, null, 2),
        }],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: error.message }, null, 2) }],
        isError: true,
      };
    }
  }
}
