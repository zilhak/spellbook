#!/usr/bin/env node
/**
 * Spellbook MCP 서버 진입점
 *
 * 1. 환경 설정 로딩
 * 2. 서비스 초기화
 * 3. MCP 서버 시작
 */

import { loadConfig, validateConfig } from './config/index.js';
import { EmbeddingService } from './core/embedder.js';
import { SearchService } from './core/searcher.js';
import { RestSessionManager } from './core/rest-session.js';
import { MetadataService } from './core/metadata-service.js';
import { LoreManager } from './core/lore-manager.js';
import { QdrantService } from './db/qdrant.js';
import { SQLiteService } from './db/sqlite.js';
import { ScrollService } from './core/scroll-service.js';
import { RestTools } from './tools/rest.js';
import { ScribeTools } from './tools/scribe.js';
import { MemorizeTools } from './tools/memorize.js';
import { AdminTools } from './tools/admin.js';
import { ChronicleTools } from './tools/chronicle.js';
import { RecallTools } from './tools/recall.js';
import { ScrollTools } from './tools/scroll.js';
import { MaintenanceTools } from './tools/maintenance.js';
import { MCPServer } from './server.js';

async function main() {
  try {
    console.log('🔮 Spellbook 초기화 중...\n');

    // 1. 설정 로딩 및 검증
    const config = loadConfig();
    validateConfig(config);
    console.log('');

    // 2. Qdrant 연결
    console.log('📦 Qdrant 연결 중...');
    const qdrant = new QdrantService(config.qdrant);
    await qdrant.initializeCollection(config.embedding.dimensions);

    // 2-1. 메타데이터 컬렉션 초기화
    const metadataService = new MetadataService(qdrant, config.qdrant.metadataCollectionName);
    await metadataService.initialize();
    console.log('');

    // 3. 임베딩 서비스 초기화
    console.log('🧠 임베딩 서비스 초기화 중...');
    const embedder = new EmbeddingService(config.embedding);
    console.log(`   - 모델: ${config.embedding.model}`);
    console.log(`   - 차원: ${config.embedding.dimensions}`);
    console.log('');

    // 4. 검색 서비스 초기화
    const searcher = new SearchService(qdrant, embedder);

    // 5. REST 세션 관리자 초기화
    const sessionManager = new RestSessionManager(searcher);

    // 6. Lore 관리자 초기화
    console.log('📚 Lore 관리자 초기화 중...');
    const loreManager = new LoreManager(qdrant, config.embedding.dimensions, config.qdrant.metadataCollectionName);

    // 7. SQLite + Scroll 초기화
    console.log('📜 Scroll 저장소 초기화 중...');
    const sqliteService = new SQLiteService(config.sqlite.dbPath);
    const scrollService = new ScrollService(sqliteService.getDb());
    console.log(`   - DB: ${config.sqlite.dbPath}`);
    console.log('');

    // 8. MCP 도구들 초기화
    const restTools = new RestTools(sessionManager);
    const scribeTools = new ScribeTools(sessionManager, searcher, embedder, qdrant, metadataService);
    const memorizeTools = new MemorizeTools(searcher);
    const adminTools = new AdminTools(qdrant, searcher, embedder, metadataService);
    const chronicleTools = new ChronicleTools(sessionManager, searcher, embedder, qdrant, loreManager);
    const recallTools = new RecallTools(searcher, loreManager);
    const scrollTools = new ScrollTools(scrollService);
    const maintenanceTools = new MaintenanceTools(
      qdrant,
      embedder,
      loreManager,
      metadataService,
      config.qdrant.metadataCollectionName
    );

    // 9. MCP 서버 생성 및 시작
    const server = new MCPServer({
      rest: restTools,
      scribe: scribeTools,
      memorize: memorizeTools,
      admin: adminTools,
      chronicle: chronicleTools,
      recall: recallTools,
      loreManager: loreManager,
      scroll: scrollTools,
      maintenance: maintenanceTools,
    });

    server.start(config.port, config.host);
    console.log('');

    // 10. 시스템 가이드 확인
    const isEmpty = await qdrant.isEmpty();
    if (isEmpty) {
      console.log('⚠️  VectorDB가 비어있습니다.');
      console.log('   시스템 가이드를 seed하려면: bun run seed');
      console.log('');
    } else {
      const stats = await qdrant.getStats();
      console.log(`✅ VectorDB 준비 완료 (${stats.total_count} 청크)`);
      console.log('');
    }
  } catch (error) {
    console.error('❌ 초기화 실패:', error);
    process.exit(1);
  }
}

main();
