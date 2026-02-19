/**
 * Scroll 서비스
 *
 * SQLite 기반 엄격한 문서 저장소 CRUD + 인덱스 관리.
 */

import type { Database } from 'bun:sqlite';
import { v4 as uuidv4 } from 'uuid';
import type {
  Scroll,
  ScrollWriteRequest,
  ScrollModifyRequest,
  ScrollReadRequest,
  ScrollIndex,
  ScrollIndexEntry,
} from '../types/models.js';

export class ScrollService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * 스크롤 생성
   */
  write(req: ScrollWriteRequest): Scroll {
    const id = uuidv4();
    const now = new Date().toISOString();

    this.db.exec('BEGIN');
    try {
      // 스크롤 저장
      this.db.prepare(`
        INSERT INTO scrolls (id, title, content, category, sub_category, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, req.title, req.content, req.category, req.sub_category ?? null, now, now);

      // 라벨 저장
      if (req.labels && req.labels.length > 0) {
        const insertLabel = this.db.prepare(
          'INSERT INTO scroll_labels (scroll_id, label) VALUES (?, ?)'
        );
        for (const label of req.labels) {
          insertLabel.run(id, label);
        }
      }

      // 인덱스 갱신
      this.rebuildIndex();

      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }

    return this.getById(id)!;
  }

  /**
   * 스크롤 조회
   *
   * id로 단건 조회하거나, category/sub_category/label로 필터 조회.
   */
  read(req: ScrollReadRequest): Scroll | Scroll[] {
    // ID 단건 조회
    if (req.id) {
      const scroll = this.getById(req.id);
      if (!scroll) {
        throw new Error(`스크롤을 찾을 수 없습니다: "${req.id}"`);
      }
      return scroll;
    }

    // 필터 조회
    let query = 'SELECT DISTINCT s.* FROM scrolls s';
    const params: any[] = [];
    const conditions: string[] = [];

    if (req.label) {
      query += ' JOIN scroll_labels sl ON s.id = sl.scroll_id';
      conditions.push('sl.label = ?');
      params.push(req.label);
    }

    if (req.category) {
      conditions.push('s.category = ?');
      params.push(req.category);
    }

    if (req.sub_category) {
      conditions.push('s.sub_category = ?');
      params.push(req.sub_category);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY s.updated_at DESC';

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(row => this.enrichWithLabels(row));
  }

  /**
   * 스크롤 수정
   */
  modify(req: ScrollModifyRequest): Scroll {
    const existing = this.getById(req.id);
    if (!existing) {
      throw new Error(`스크롤을 찾을 수 없습니다: "${req.id}"`);
    }

    this.db.exec('BEGIN');
    try {
      const updates: string[] = [];
      const params: any[] = [];

      if (req.title !== undefined) {
        updates.push('title = ?');
        params.push(req.title);
      }
      if (req.content !== undefined) {
        updates.push('content = ?');
        params.push(req.content);
      }
      if (req.category !== undefined) {
        updates.push('category = ?');
        params.push(req.category);
      }
      if (req.sub_category !== undefined) {
        updates.push('sub_category = ?');
        params.push(req.sub_category === '' ? null : req.sub_category);
      }

      if (updates.length > 0) {
        updates.push('updated_at = ?');
        params.push(new Date().toISOString());
        params.push(req.id);

        this.db.prepare(
          `UPDATE scrolls SET ${updates.join(', ')} WHERE id = ?`
        ).run(...params);
      }

      // 라벨 교체 (명시적으로 전달된 경우만)
      if (req.labels !== undefined) {
        this.db.prepare('DELETE FROM scroll_labels WHERE scroll_id = ?').run(req.id);
        if (req.labels.length > 0) {
          const insertLabel = this.db.prepare(
            'INSERT INTO scroll_labels (scroll_id, label) VALUES (?, ?)'
          );
          for (const label of req.labels) {
            insertLabel.run(req.id, label);
          }
        }
      }

      // 인덱스 갱신
      this.rebuildIndex();

      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }

    return this.getById(req.id)!;
  }

  /**
   * 스크롤 삭제
   */
  delete(id: string): void {
    const existing = this.getById(id);
    if (!existing) {
      throw new Error(`스크롤을 찾을 수 없습니다: "${id}"`);
    }

    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM scrolls WHERE id = ?').run(id);
      // scroll_labels는 ON DELETE CASCADE로 자동 삭제
      this.rebuildIndex();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  /**
   * 인덱스 조회
   */
  getIndex(): ScrollIndex {
    const rows = this.db.prepare('SELECT * FROM scroll_index ORDER BY type, parent, name').all() as ScrollIndexEntry[];

    const categories: ScrollIndexEntry[] = [];
    const subCategories: ScrollIndexEntry[] = [];
    const labels: ScrollIndexEntry[] = [];

    for (const row of rows) {
      switch (row.type) {
        case 'category':
          categories.push(row);
          break;
        case 'sub_category':
          subCategories.push(row);
          break;
        case 'label':
          labels.push(row);
          break;
      }
    }

    const totalScrolls = this.db.prepare('SELECT COUNT(*) as count FROM scrolls').get() as { count: number };

    return {
      total_scrolls: totalScrolls.count,
      categories,
      sub_categories: subCategories,
      labels,
    };
  }

  // ──────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────

  private getById(id: string): Scroll | null {
    const row = this.db.prepare('SELECT * FROM scrolls WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.enrichWithLabels(row);
  }

  private enrichWithLabels(row: any): Scroll {
    const labels = this.db
      .prepare('SELECT label FROM scroll_labels WHERE scroll_id = ?')
      .all(row.id) as { label: string }[];

    return {
      id: row.id,
      title: row.title,
      content: row.content,
      category: row.category,
      sub_category: row.sub_category ?? undefined,
      labels: labels.map(l => l.label),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  /**
   * scroll_index 테이블을 scrolls + scroll_labels 기준으로 재구축
   */
  private rebuildIndex(): void {
    this.db.prepare('DELETE FROM scroll_index').run();

    // 카테고리별 카운트
    const categories = this.db.prepare(`
      SELECT category as name, COUNT(*) as count FROM scrolls GROUP BY category
    `).all() as { name: string; count: number }[];

    const insertIndex = this.db.prepare(
      'INSERT INTO scroll_index (type, name, parent, count) VALUES (?, ?, ?, ?)'
    );

    for (const cat of categories) {
      insertIndex.run('category', cat.name, null, cat.count);
    }

    // 서브카테고리별 카운트 (parent = category)
    const subCategories = this.db.prepare(`
      SELECT sub_category as name, category as parent, COUNT(*) as count
      FROM scrolls
      WHERE sub_category IS NOT NULL
      GROUP BY category, sub_category
    `).all() as { name: string; parent: string; count: number }[];

    for (const sub of subCategories) {
      insertIndex.run('sub_category', sub.name, sub.parent, sub.count);
    }

    // 라벨별 카운트
    const labels = this.db.prepare(`
      SELECT label as name, COUNT(*) as count FROM scroll_labels GROUP BY label
    `).all() as { name: string; count: number }[];

    for (const label of labels) {
      insertIndex.run('label', label.name, null, label.count);
    }
  }
}
