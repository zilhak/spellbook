/**
 * 환경변수 로딩 및 설정 관리
 */

import type { ServerConfig } from '../types/models.js';

// 환경변수 검증 및 기본값 설정
function getEnvOrDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`필수 환경변수가 설정되지 않았습니다: ${key}`);
  }
  return value;
}

// 서버 설정 생성
export function loadConfig(): ServerConfig {
  return {
    port: parseInt(getEnvOrDefault('PORT', '17950'), 10),
    host: getEnvOrDefault('HOST', '0.0.0.0'),

    embedding: {
      model: getEnvOrDefault('EMBEDDING_MODEL', 'nomic-embed-text'),
      ollamaHost: getEnvOrDefault('OLLAMA_HOST', 'http://localhost:11434'),
      dimensions: parseInt(getEnvOrDefault('EMBEDDING_DIMENSIONS', '768'), 10),
      contextLength: parseInt(getEnvOrDefault('EMBEDDING_CONTEXT_LENGTH', '8192'), 10),
    },

    qdrant: {
      url: getEnvOrDefault('QDRANT_URL', 'http://localhost:17951'),
      collectionName: getEnvOrDefault('QDRANT_COLLECTION', 'chunks'),
    },
  };
}

// 설정 검증
export function validateConfig(config: ServerConfig): void {
  // 포트 범위 검증
  if (config.port < 1 || config.port > 65535) {
    throw new Error(`유효하지 않은 포트 번호: ${config.port}`);
  }

  // 임베딩 차원 검증
  if (config.embedding.dimensions <= 0) {
    throw new Error(`유효하지 않은 임베딩 차원: ${config.embedding.dimensions}`);
  }

  // URL 검증
  try {
    new URL(config.embedding.ollamaHost);
  } catch {
    throw new Error(`유효하지 않은 Ollama URL: ${config.embedding.ollamaHost}`);
  }

  try {
    new URL(config.qdrant.url);
  } catch {
    throw new Error(`유효하지 않은 Qdrant URL: ${config.qdrant.url}`);
  }

  console.log('✅ 설정 검증 완료');
  console.log(`   - 서버: ${config.host}:${config.port}`);
  console.log(`   - Qdrant: ${config.qdrant.url}`);
  console.log(`   - Ollama: ${config.embedding.ollamaHost}`);
  console.log(`   - 임베딩 모델: ${config.embedding.model} (${config.embedding.dimensions}차원)`);
}
