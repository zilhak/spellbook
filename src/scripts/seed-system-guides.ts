/**
 * 시스템 가이드 seed 스크립트
 *
 * VectorDB에 청킹 가이드, 메타데이터 규칙 등을 초기 저장.
 */

import { loadConfig, validateConfig } from '../config/index.js';
import { EmbeddingService } from '../core/embedder.js';
import { QdrantService } from '../db/qdrant.js';
import { SYSTEM_GUIDES } from '../data/system-guides.js';

async function seed() {
  try {
    console.log('🌱 시스템 가이드 seed 시작...\n');

    // 설정 로딩
    const config = loadConfig();
    validateConfig(config);
    console.log('');

    // Qdrant 연결
    console.log('📦 Qdrant 연결 중...');
    const qdrant = new QdrantService(config.qdrant);
    await qdrant.initializeCollection(config.embedding.dimensions);
    console.log('');

    // 임베딩 서비스 초기화
    console.log('🧠 임베딩 서비스 초기화 중...');
    const embedder = new EmbeddingService(config.embedding);
    console.log('');

    // 시스템 가이드 저장
    console.log(`📚 시스템 가이드 ${SYSTEM_GUIDES.length}개 저장 중...`);

    for (const guide of SYSTEM_GUIDES) {
      console.log(`   - ${guide.topic}...`);

      // 임베딩 생성
      const embedding = await embedder.embed(guide.text);

      // VectorDB 저장
      await qdrant.upsertChunk(guide.id, embedding, {
        text: guide.text,
        topic_id: guide.topic,
        category: guide.category,
        keywords: guide.keywords,
        questions: guide.questions,
        entities: guide.entities,
        importance: guide.importance,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      console.log(`     ✅ 완료`);
    }

    console.log('');
    console.log('✅ 시스템 가이드 seed 완료!');

    // 통계
    const stats = await qdrant.getStats();
    console.log(`   총 ${stats.total_count} 청크 저장됨`);

    process.exit(0);
  } catch (error) {
    console.error('❌ seed 실패:', error);
    process.exit(1);
  }
}

seed();
