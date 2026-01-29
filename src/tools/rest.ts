/**
 * REST 상태 관리 도구
 *
 * - rest: REST 모드 시작
 * - rest_end: REST 모드 종료
 */

import type { RestSessionManager } from '../core/rest-session.js';

export class RestTools {
  constructor(private sessionManager: RestSessionManager) {}

  /**
   * rest 도구 실행
   */
  async rest(): Promise<any> {
    const response = await this.sessionManager.startRest();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  }

  /**
   * rest_end 도구 실행
   */
  async restEnd(sessionId: string): Promise<any> {
    const response = await this.sessionManager.endRest(sessionId);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  }
}
