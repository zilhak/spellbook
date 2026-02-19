/**
 * SQLite 데이터베이스 연결 및 초기화
 *
 * Bun 내장 SQLite를 사용하여 Scroll 문서 저장소 관리.
 */

import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class SQLiteService {
  private db: Database;

  constructor(dbPath: string) {
    // 디렉토리가 없으면 생성
    mkdirSync(dirname(dbPath), { recursive: true });

    this.db = new Database(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scrolls (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT NOT NULL,
        sub_category TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS scroll_labels (
        scroll_id TEXT NOT NULL REFERENCES scrolls(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        PRIMARY KEY (scroll_id, label)
      );

      CREATE TABLE IF NOT EXISTS scroll_index (
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        parent TEXT,
        count INTEGER DEFAULT 0,
        PRIMARY KEY (type, name, parent)
      );
    `);

    console.log('   ✅ SQLite 테이블 초기화 완료');
  }

  getDb(): Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }
}
