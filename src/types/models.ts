/**
 * 핵심 데이터 모델 타입 정의
 */

// ============================================================================
// Entity 타입
// ============================================================================

export interface Entity {
  name: string;
  type: 'person' | 'project' | 'technology' | 'organization' | 'concept';
}

// ============================================================================
// Chunk (청크) - VectorDB에 저장되는 기본 단위
// ============================================================================

export interface ChunkMetadata {
  topic_id: string;
  topic_name?: string;
  category: string;
  sub_category?: string;
  keywords: string[];
  questions: string[];
  entities: Entity[];
  importance: 'high' | 'medium' | 'low';
  source?: string;
  rest_session_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Chunk {
  id: string;
  text: string;
  embedding?: number[];  // 임베딩은 저장 시 생성
  metadata: ChunkMetadata;
}

// ============================================================================
// REST Session (REST 세션 관리)
// ============================================================================

export interface ChunkingGuide {
  principles: string[];
  ideal_chunk_size: {
    min_tokens: number;
    max_tokens: number;
  };
  examples: string[];
}

export interface MetadataRules {
  required_fields: string[];
  keyword_count: {
    min: number;
    max: number;
  };
  question_guidelines: string[];
  entity_extraction: string[];
}

export interface RestSession {
  id: string;
  created_at: string;
  expires_at: string;
  chunking_guide: ChunkingGuide;
  metadata_rules: MetadataRules;
  scribed_count: number;
  status: 'active' | 'expired';
}

// ============================================================================
// Topic (세부 목차)
// ============================================================================

export interface Topic {
  id: string;
  title: string;
  summary: string;
  category: string;
  chunk_count: number;
  keywords: string[];
  last_updated: string;
}

// ============================================================================
// MetaIndex (메타 목차)
// ============================================================================

export interface CategoryInfo {
  id: string;
  name: string;
  sub_categories: string[];
  topic_count: number;
  chunk_count: number;
  description: string;
}

// ============================================================================
// Metadata 컬렉션 문서 타입
// ============================================================================

export interface CategoryMetadata {
  type: 'category';
  name: string;
  sub_categories: string[];
  topic_count: number;
  chunk_count: number;
  last_updated: string;
}

export interface TopicMetadata {
  type: 'topic';
  topic_id: string;
  topic_name: string;
  category: string;
  sub_category?: string;
  chunk_count: number;
  keywords: string[];
  last_updated: string;
}

export interface MetaIndex {
  categories: CategoryInfo[];
  total_topics: number;
  total_chunks: number;
  last_updated: string;
}

// ============================================================================
// MCP Tool 요청/응답 타입
// ============================================================================

export interface RestStartResponse {
  session_id: string;
  chunking_guide: ChunkingGuide;
  metadata_rules: MetadataRules;
  status: string;
}

export interface RestEndResponse {
  status: string;
  scribed_count: number;
}

export interface ScribeRequest {
  chunk: Chunk;
  session_id: string;
  source?: string;
  category?: string;
}

export interface ScribeResponse {
  status: 'success' | 'warning' | 'error';
  message: string;
  chunk_id?: string;
  duplicates?: any[];
}

export interface MemorizeRequest {
  query: string;
  limit?: number;
  filter?: Record<string, any>;
}

export interface FindRequest {
  keywords: string[];
  limit?: number;
  filter?: Record<string, any>;
}

export interface SearchResult {
  id: string;
  score: number;
  chunk: Chunk;
}

// ============================================================================
// 설정 타입
// ============================================================================

export interface EmbeddingConfig {
  model: string;
  ollamaHost: string;
  dimensions: number;
  contextLength: number;
}

export interface QdrantConfig {
  url: string;
  collectionName: string;
  metadataCollectionName: string;
}

export interface ServerConfig {
  port: number;
  host: string;
  embedding: EmbeddingConfig;
  qdrant: QdrantConfig;
}
