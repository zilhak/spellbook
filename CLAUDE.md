# Spellbook - VectorDB 기반 Claude 메모리 MCP 서버

## 프로젝트 개요

AI 에이전트 개인화 과정에서 축적되는 md 문서들을 보관하고 검색하는 MCP 서버.
VectorDB를 사용하여 의미 기반 검색으로 관련 정보를 빠르게 찾아낸다.

### 핵심 목표

1. **단순한 저장소**: 저장(scribe)과 검색(memorize/recall) 기능만 제공
2. **이중 검색 지원**: 의미 기반 검색 + 키워드 기반 검색을 별도 API로 제공
3. **효율적인 컨텍스트 사용**: 필요한 정보만 로드하여 토큰 절약

### 청킹 책임

MCP를 호출하는 주체가 AI Agent(Claude)이므로, **청킹은 Agent가 담당**한다.

```
┌─────────────────────────────────────────────────────────────────┐
│ Claude (AI Agent)                                               │
│                                                                 │
│  - 저장할 내용을 의미 단위로 분할                               │
│  - 적절한 메타데이터(topic, keywords 등) 부여                   │
│  - scribe() 호출                                                │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ Spellbook (MCP)                                                 │
│                                                                 │
│  - 받은 청크를 임베딩                                           │
│  - VectorDB에 저장                                              │
│  - 검색 시 유사도 기반 반환                                     │
│                                                                 │
│  ※ 청킹 로직 없음, LLM 호출 없음                                │
└─────────────────────────────────────────────────────────────────┘
```

**MCP 서버가 단순해지는 장점:**
- 별도 LLM 호출 불필요
- 청킹 프롬프트 설계 불필요
- 임베딩 + 저장 + 검색만 담당

### 역할 범위

```
┌─────────────────────────────────────────────────────────────────┐
│ Spellbook (이 MCP)                                              │
│                                                                 │
│  - 문서 저장 (scribe)                                           │
│  - 문서 검색 (memorize)                                         │
│  - 임베딩, 인덱싱                                               │
│                                                                 │
│  ※ 청킹은 Agent가 담당                                         │
│  ※ 무엇을 저장할지, 언제 검색할지는 관여하지 않음               │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ 사용 지침은 별도
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ 별도 지침 (CLAUDE.md, 시스템 프롬프트 등)                       │
│                                                                 │
│  - 언제 scribe를 호출할지                                       │
│  - 언제 memorize를 호출할지                                     │
│  - 어떤 정보를 기억할 가치가 있는지                             │
│  - 어떤 상황에서 기억을 참조할지                                │
└─────────────────────────────────────────────────────────────────┘
```

**즉, Spellbook은 "똑똑한 파일 서랍"일 뿐이다.**

### 시스템 데이터

청크 분할 가이드, 메타데이터 작성 규칙 등도 VectorDB에 저장한다.
Agent는 scribe 전에 가이드를 memorize해서 참고한다.

```
┌─────────────────────────────────────────────────────────────────┐
│ Spellbook (VectorDB)                                            │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 시스템 데이터 (category: "system")                       │   │
│  │                                                         │   │
│  │  - 청크 분할 가이드                                      │   │
│  │  - 메타데이터 작성 규칙                                  │   │
│  │  - 사용 예시                                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 사용자 데이터 (category: "project", "preference", ...)   │   │
│  │                                                         │   │
│  │  - 프로젝트 정보                                        │   │
│  │  - 결정 사항                                            │   │
│  │  - ...                                                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Agent의 scribe 흐름:**
```
Agent가 scribe 하려 함
    │
    ▼ memorize("청크 분할 가이드", filter: {category: "system"})
    │
    ▼ 가이드 참고해서 청킹
    │
    ▼ scribe(chunk)
```

**장점:**
- 가이드도 업데이트/버전 관리 가능
- 가이드 자체도 의미 검색 가능
- 모든 메타 정보가 같은 시스템에서 관리
- 초기 설정 시 기본 가이드 seed 가능

---

## 용어 정의

| 용어 | 설명 |
|------|------|
| **Scribe** | 정보를 저장하는 행위. MCP를 통해 기억을 기록한다. |
| **Memorize** | 정보를 꺼내오는 행위. MCP를 통해 기억을 호출한다. |
| **Chunk** | 의미 단위로 분할된 정보 조각 |
| **Topic** | 관련 Chunk들의 묶음 (세부 목차) |
| **Spellbook** | 모든 기억이 저장된 저장소 (이 프로젝트) |

---

## 핵심 개념

### 1. Chunk 구조

Agent(Claude)가 scribe 호출 시 전달하는 데이터 구조:

```
Chunk:
  - text: 실제 내용
  - metadata:
      topic: 주제 분류
      keywords: 키워드 목록
      question_this_answers: 이 청크가 답할 수 있는 질문들
      entities: 관련 개체 (사람, 프로젝트, 기술 등)
      importance: 중요도
```

**Agent가 저장 시 의미 단위로 잘 정리해서 보내야 한다.**

### 2. 계층적 인덱스 (Hierarchical Index)

```
Level 0: 메타 목차 (항상 로드)
    │
    ▼ 필요 시 검색
Level 1: 세부 목차 (VectorDB)
    │
    ▼ 필요 시 검색
Level 2: 실제 청크 (VectorDB)
```

- **메타 목차**: 어떤 카테고리의 정보가 있는지 (항상 컨텍스트에 로드)
- **세부 목차**: 각 카테고리 내 토픽 목록 (필요 시 검색)
- **청크**: 실제 상세 내용 (필요 시 검색)

### 3. 이중 검색 방식

| 도구 | 방식 | 용도 | 예시 |
|------|------|------|------|
| `memorize` | 의미 기반 (벡터 유사도) | 비슷한 맥락/개념 찾기 | "Docker 컨테이너 설정 방법" |
| `find` | 키워드 기반 (Full-text) | 정확한 용어 매칭 | `["Qdrant", "embedded"]` |

**언제 무엇을 쓸까?**
- `memorize`: 질문 형태, 맥락 파악, 관련 정보 탐색
- `find`: 특정 기술명, 프로젝트명, 정확한 용어 검색

### 4. REST 워크플로우 (핵심 설계)

```
┌─────────────────────────────────────────────────────────────────┐
│ Agent 일반 작업 (검색, 분석 등)                                 │
└─────────────────────────────────────────────────────────────────┘
                        │
                        │ 기억할 정보 발견
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ rest() 호출                                                     │
├─────────────────────────────────────────────────────────────────┤
│ 반환값:                                                         │
│  - session_id: "rest-abc123"                                    │
│  - chunking_guide: {...}                                        │
│  - metadata_rules: {...}                                        │
│  - status: "REST 모드 활성화. scribe 가능."                     │
└─────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ REST 모드 (scribe 가능 상태)                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Agent가 가이드 참고하여 청킹:                                  │
│  1. 의미 단위로 분할                                            │
│  2. 메타데이터 작성 (topic, keywords, questions, entities)      │
│  3. scribe(chunk) 호출 → 저장 성공                              │
│  4. 추가 청크 있으면 반복 (같은 가이드 사용)                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                        │
                        │ 모든 청크 저장 완료
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ rest_end(session_id) 호출                                       │
├─────────────────────────────────────────────────────────────────┤
│ 반환값:                                                         │
│  - status: "REST 모드 종료. 청킹 가이드 정리 가능."             │
│  - scribed_count: 5                                             │
└─────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ Agent 일반 작업 재개                                            │
│ (청킹 가이드는 컨텍스트에서 제거 가능)                          │
└─────────────────────────────────────────────────────────────────┘
```

### 5. 각 도구별 흐름

```
[REST 모드 진입]
Agent → rest() → MCP가 시스템 가이드 검색 → 가이드 + 세션 ID 반환

[Scribe - 저장]
(REST 모드 필수)
Agent가 청크 정리 → scribe(chunk, session_id) →
    MCP가 세션 검증 → 임베딩 → VectorDB 저장 → 목차 업데이트

[REST 모드 종료]
Agent → rest_end(session_id) → MCP가 세션 종료 → 통계 반환

[Memorize - 의미 기반 검색]
Agent가 질문 → memorize(query) → MCP가 임베딩 → 벡터 유사도 검색 → 청크 반환

[Find - 키워드 기반 검색]
Agent가 키워드 → find(keywords) → Full-text search → 청크 반환
```

### 6. REST 모드 에러 처리

```typescript
// REST 모드 외부에서 scribe 시도
scribe(chunk) → Error: "REST 모드가 아닙니다. rest()를 먼저 호출하세요."

// 잘못된 세션 ID로 scribe 시도
scribe(chunk, "invalid-id") → Error: "유효하지 않은 REST 세션입니다."

// 세션 만료 (1시간 초과)
scribe(chunk, "expired-id") → Error: "REST 세션이 만료되었습니다. rest()를 다시 호출하세요."
```

---

## 아키텍처

Docker 컨테이너 하나에 MCP 서버와 VectorDB를 통합하여 배포를 단순화한다.
MCP는 HTTP/SSE 방식으로 독립 서버로 실행된다.

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Claude Code                                │
│                                                                     │
│  세션 시작 → get_index() → 메타 목차 로드                           │
│                                                                     │
│  질문 → memorize(query) → 관련 청크 반환                            │
│                                                                     │
│  새 정보 → Agent가 청킹 → scribe(chunk) → 저장                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                │ HTTP + SSE
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Docker Container (spellbook)                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                    MCP Server (HTTP/SSE)                      │ │
│  │                                                               │ │
│  │  - 임베딩 생성 (Ollama 호출)                                  │ │
│  │  - 검색/인덱싱                                                │ │
│  │  - Qdrant 연동                                                │ │
│  │                                                               │ │
│  │  ※ 청킹은 Agent가 담당                                       │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                │                                    │
│                                ▼                                    │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                    Qdrant (embedded)                          │ │
│  │                                                               │ │
│  │  - 벡터 저장/검색                                             │ │
│  │  - 메타데이터 필터링                                          │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  Volume: /data (영속 데이터)                                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 왜 이 구조인가?

| 결정 | 이유 |
|------|------|
| **Docker 통합** | VectorDB 서버가 필요하므로, MCP 서버까지 함께 컨테이너화하여 배포 단순화 |
| **HTTP/SSE 방식** | stdio 대신 독립 서버로 실행하여 Docker 내부에서 완결 |
| **Qdrant embedded** | 별도 프로세스 없이 라이브러리로 임베딩, 풍부한 메타데이터 필터링 지원 |

---

## MCP 도구 (Tools) 정의

### REST 상태 관리

| 도구 | 설명 | 파라미터 | 반환 |
|------|------|----------|------|
| `rest` | REST 모드 진입, 청킹 가이드 로드 | - | 청킹 가이드, 메타데이터 규칙, REST 세션 ID |
| `rest_end` | REST 모드 종료, 가이드 정리 | `session_id` | 종료 확인 메시지 |

**REST 모드 특징:**
- ✅ `scribe` 호출은 REST 모드에서만 가능
- ✅ 한 세션에 여러 청크를 일관된 가이드로 저장 가능
- ✅ 컨텍스트 효율: 필요 시점에만 가이드 로드/해제
- ✅ 청킹 품질 강제: 모든 scribe가 동일한 규칙 참조

### Memorize (읽기/검색)

| 도구 | 설명 | 파라미터 |
|------|------|----------|
| `get_index` | 메타 목차 반환 (세션 시작 시 호출) | `scope?`: 범위 제한 |
| `memorize` | 의미 기반 검색 (벡터 유사도) | `query`, `limit?`, `filter?` |
| `find` | 키워드 기반 검색 (Full-text search) | `keywords`, `limit?`, `filter?` |
| `get_topic` | 특정 토픽의 모든 청크 조회 | `topic_id` |

### Scribe (쓰기/저장)

| 도구 | 설명 | 파라미터 | 제약 조건 |
|------|------|----------|----------|
| `scribe` | 새 정보 저장 | `chunk`, `source?`, `category?` | **REST 모드 필수** |
| `scribe_chunk` | 이미 청킹된 정보 직접 저장 | `chunk` (구조화된 데이터) | **REST 모드 필수** |
| `erase` | 특정 청크/토픽 삭제 | `chunk_id` or `topic_id` | - |
| `revise` | 기존 청크 수정 | `chunk_id`, `content` | - |

### 관리 도구

| 도구 | 설명 | 파라미터 |
|------|------|----------|
| `stats` | 저장소 통계 (청크 수, 카테고리별 분포) | - |
| `rebuild_index` | 목차 재구축 | - |
| `export` | 백업 내보내기 | `format`: json/markdown |
| `import` | 백업 가져오기 | `file_path` |

---

## 데이터 구조

### REST Session (REST 세션)

```typescript
interface RestSession {
  id: string;                    // "rest-{uuid}"
  created_at: string;            // ISO 8601 timestamp
  expires_at: string;            // 생성 후 1시간
  chunking_guide: ChunkingGuide; // 청킹 가이드
  metadata_rules: MetadataRules; // 메타데이터 작성 규칙
  scribed_count: number;         // 이 세션에서 저장된 청크 수
  status: 'active' | 'expired';
}

interface ChunkingGuide {
  principles: string[];          // 청킹 원칙
  ideal_chunk_size: {            // 이상적인 청크 크기
    min_tokens: number;          // 예: 100
    max_tokens: number;          // 예: 512
  };
  examples: ChunkExample[];      // 좋은 청킹 예시
}

interface MetadataRules {
  required_fields: string[];     // 필수 필드 (topic, keywords)
  keyword_count: {               // 키워드 개수 제한
    min: number;
    max: number;
  };
  question_guidelines: string[]; // 질문 작성 가이드
  entity_extraction: string[];   // 엔티티 추출 팁
}
```

### Chunk (청크)

```typescript
interface Chunk {
  id: string;                    // UUID
  text: string;                  // 실제 내용
  embedding: number[];           // 벡터 임베딩
  metadata: {
    topic_id: string;            // 소속 토픽
    category: string;            // 카테고리 (project, preference, knowledge 등)
    keywords: string[];          // 키워드
    questions: string[];         // 이 청크가 답할 수 있는 질문들
    entities: Entity[];          // 관련 개체
    importance: 'high' | 'medium' | 'low';
    source?: string;             // 출처 (파일 경로, URL 등)
    rest_session_id?: string;    // 저장 시 사용된 REST 세션 ID
    created_at: string;
    updated_at: string;
  };
}

interface Entity {
  name: string;
  type: 'person' | 'project' | 'technology' | 'organization' | 'concept';
}
```

### Topic (토픽 - 세부 목차)

```typescript
interface Topic {
  id: string;
  title: string;
  summary: string;               // 한 줄 요약
  category: string;
  chunk_count: number;
  keywords: string[];
  last_updated: string;
}
```

### MetaIndex (메타 목차)

```typescript
interface MetaIndex {
  categories: {
    id: string;
    name: string;
    topic_count: number;
    description: string;
  }[];
  total_topics: number;
  total_chunks: number;
  last_updated: string;
}
```

---

## 기술 스택

### 확정

| 구성요소 | 선택 | 이유 |
|----------|------|------|
| **VectorDB** | Qdrant (embedded) | 메타데이터 필터링 우수, 안정성, 확장 가능 |
| **MCP 전송** | HTTP/SSE | Docker 내부에서 독립 서버로 실행 |
| **배포** | Docker | MCP 서버 + Qdrant 통합 컨테이너 |

### 런타임 선택

| 구성요소 | 선택 | 이유 |
|----------|------|------|
| **런타임** | Bun (TypeScript) | 빠른 시작, TypeScript 네이티브 실행, 빌드 불필요 |
| **MCP SDK** | @modelcontextprotocol/sdk | 공식 TypeScript SDK, HTTP/SSE 지원 |
| **임베딩** | Ollama API 호출 | REST API로 간단히 통합 가능 |

### 임베딩 모델

| 구성요소 | 선택 | 설정값 |
|----------|------|--------|
| **모델** | nomic-embed-text | Ollama에서 `ollama pull nomic-embed-text` |
| **차원** | 768 | 성능과 속도의 균형 |
| **컨텍스트 길이** | 8192 tokens | 긴 청크 지원 |
| **다국어 지원** | 한글/영어 우수 | 다국어 학습 모델 |

**선정 이유:**
- ✅ 로컬 실행 최적화 (Ollama 공식 지원)
- ✅ 한글 성능 우수 (다국어 균형 학습)
- ✅ 768차원으로 빠른 검색 (1024 대비 15% 빠름)
- ✅ 8192 토큰 문맥 길이 (긴 청크 대응)
- ✅ Apache 2.0 라이센스

**예상 성능:**
- 임베딩 생성: ~50ms/chunk (256 tokens, M2 MacBook 기준)
- 검색 속도: ~20ms (10,000 청크 기준)
- 메모리 사용: ~30MB (10,000 청크 × 768차원)

### 외부 의존성

| 구성요소 | 설명 |
|----------|------|
| **Ollama** | 임베딩 생성용 (호스트에서 실행, API 호출) |
| **nomic-embed-text** | 임베딩 모델 (`ollama pull nomic-embed-text`) |

---

## 구현 단계

### Phase 1: 기본 구조 (MVP)

- [ ] Docker 환경 구성 (Dockerfile, docker-compose)
- [ ] MCP 서버 스캐폴딩 (HTTP/SSE)
- [ ] Qdrant 연동 (Docker Compose로 별도 컨테이너)
- [ ] Ollama 임베딩 연동 (nomic-embed-text)
- [ ] **REST 세션 관리 시스템**:
  - [ ] `rest()` 도구: 세션 생성, 가이드 로드
  - [ ] `rest_end()` 도구: 세션 종료, 통계 반환
  - [ ] 세션 검증 로직: 타임아웃, 유효성 체크
- [ ] 기본 도구 구현:
  - [ ] `scribe` (REST 세션 필수)
  - [ ] `memorize` (의미 기반 검색)
  - [ ] `find` (키워드 기반 검색)
- [ ] 기본 백업: `export` (JSON), `import` (JSON)
- [ ] 기본 중복 감지 (유사도 >0.95 경고)
- [ ] 벡터 정규화 (코사인 유사도 최적화)

### Phase 2: 계층적 인덱스

- [ ] Topic 자동 생성/업데이트
- [ ] MetaIndex 관리
- [ ] `get_index` 구현
- [ ] 청크 검증: `scribe_validate` 도구
- [ ] 시스템 가이드 seed 데이터 (청킹 가이드, 메타데이터 규칙)

### Phase 3: 고급 기능

- [ ] 고급 중복 감지 및 병합 (메타데이터 매칭 포함)
- [ ] 시간 기반 감쇠 (오래된 정보 중요도 하락)
- [ ] 스코프 기반 필터링 (프로젝트별 기억 분리)
- [ ] 하이브리드 검색 (키워드 + 벡터 가중 조합)

### Phase 4: 운영 기능

- [ ] 자동 스냅샷 (daily backup)
- [ ] 통계 대시보드
- [ ] 성능 최적화 (임베딩 캐시, 배치 처리)
- [ ] 모델 마이그레이션 도구 (임베딩 모델 전환)

---

## 디렉토리 구조

```
spellbook/
├── src/
│   ├── index.ts                    # MCP 서버 진입점
│   ├── server.ts                   # HTTP/SSE 서버 구성
│   ├── tools/                      # MCP 도구 구현
│   │   ├── memorize.ts             # 검색/읽기 도구
│   │   ├── scribe.ts               # 저장/쓰기 도구
│   │   ├── index.ts                # 인덱스 도구
│   │   └── admin.ts                # 관리 도구
│   ├── core/
│   │   ├── embedder.ts             # 임베딩 생성 (Ollama 호출)
│   │   ├── searcher.ts             # 검색 로직
│   │   └── indexer.ts              # 목차 관리
│   ├── db/
│   │   ├── qdrant.ts               # Qdrant 연동
│   │   └── index-store.ts          # 메타 목차 저장소
│   └── types/
│       └── models.ts               # 타입/인터페이스 정의
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── CLAUDE.md                       # 이 파일
```

---

## 설정 예시

### Claude Code MCP 설정 (`~/.claude/mcp.json`)

```json
{
  "mcpServers": {
    "spellbook": {
      "url": "http://localhost:17950"
    }
  }
}
```

### Docker 실행

```bash
# 컨테이너 실행
docker run -d \
  --name spellbook \
  -p 17950:17950 \
  -v ~/.claude/spellbook-data:/data \
  -e OLLAMA_HOST=http://host.docker.internal:11434 \
  spellbook:latest

# 또는 docker-compose
docker-compose up -d
```

### 사용 지침 예시

Spellbook을 활용하려면 별도의 지침(CLAUDE.md, 시스템 프롬프트 등)에서 사용 규칙을 정의해야 한다.

**예시: 프로젝트별 CLAUDE.md에 추가**

```markdown
## Spellbook 사용 규칙

### 언제 memorize (검색)
- 세션 시작 시 get_index()로 목차 확인
- 사용자가 과거 결정 사항을 물을 때
- 프로젝트 컨벤션이나 설정을 확인할 때

### 언제 scribe (저장)
**중요: scribe는 REST 모드에서만 가능**

1. **REST 모드 진입**
   ```
   rest() 호출 → 청킹 가이드 로드 → 세션 ID 획득
   ```

2. **청킹 및 저장**
   - 중요한 아키텍처 결정이 내려졌을 때
   - 사용자 선호도가 확인되었을 때
   - 반복적으로 참조할 정보가 생겼을 때

   가이드 참고하여:
   - 의미 단위로 분할 (100-512 토큰)
   - 메타데이터 작성 (topic, keywords, questions, entities)
   - scribe(chunk, session_id) 호출

3. **REST 모드 종료**
   ```
   rest_end(session_id) 호출 → 통계 확인 → 가이드 정리
   ```

### REST 워크플로우 예시
```typescript
// 1. REST 모드 진입
const session = await rest();
// → session_id, chunking_guide, metadata_rules 반환

// 2. 가이드 참고하여 청킹
const chunk1 = {
  text: "Docker Compose는...",
  metadata: {
    topic: "인프라",
    keywords: ["Docker", "Compose", "컨테이너"],
    questions: ["Docker Compose 설정 방법은?"],
    entities: [{ name: "Docker", type: "technology" }],
    importance: "high"
  }
};

await scribe(chunk1, session.session_id);

// 3. 추가 청크 저장 (같은 가이드 사용)
const chunk2 = { ... };
await scribe(chunk2, session.session_id);

// 4. REST 모드 종료
await rest_end(session.session_id);
// → "REST 모드 종료. 청킹 가이드 정리 가능. scribed_count: 2"
```

### 저장하지 않을 것
- 일시적인 디버깅 정보
- 코드 자체 (코드는 Git에)
- 쉽게 검색 가능한 공개 정보
```

**핵심: MCP는 저장/검색만 제공하고, 정책은 사용자가 정의한다.**

---

## 기술 스택 상세

### 핵심 패키지

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@qdrant/js-client-rest": "^1.11.0",
    "express": "^4.18.2",
    "uuid": "^9.0.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/node": "^20.0.0",
    "@types/express": "^4.17.0"
  }
}
```

**Bun 사용 시 장점:**
- `bun run src/index.ts` - TypeScript 직접 실행 (빌드 불필요)
- `bun install` - 빠른 패키지 설치 (~1초)
- tsx 의존성 불필요

### Qdrant 클라이언트

```typescript
import { QdrantClient } from '@qdrant/js-client-rest';

const client = new QdrantClient({
  url: 'http://localhost:17951', // Docker 내부 또는 embedded
});
```

**참고**: Qdrant는 JavaScript 클라이언트 라이브러리를 제공하지만, embedded 모드는 Rust/Python만 지원합니다. Bun/Node.js에서는 별도 Qdrant 서버 프로세스가 필요합니다.

**해결책**: Docker Compose로 Qdrant 컨테이너 별도 실행 (권장)

### 임베딩 서비스 구현

```typescript
// src/core/embedder.ts
import axios from 'axios';

interface EmbeddingConfig {
  model: string;
  ollamaHost: string;
  dimensions: number;
  contextLength: number;
}

export class EmbeddingService {
  private config: EmbeddingConfig;
  private cache: Map<string, number[]>;

  constructor(config: EmbeddingConfig) {
    this.config = config;
    this.cache = new Map();
  }

  async embed(text: string): Promise<number[]> {
    // 캐시 확인
    const cached = this.cache.get(text);
    if (cached) return cached;

    // Ollama API 호출
    const response = await axios.post(`${this.config.ollamaHost}/api/embeddings`, {
      model: this.config.model,
      prompt: text
    });

    const embedding = response.data.embedding;

    // 벡터 정규화 (코사인 유사도 최적화)
    const normalized = this.normalize(embedding);

    // 캐시 저장
    this.cache.set(text, normalized);

    return normalized;
  }

  async batchEmbed(texts: string[]): Promise<number[][]> {
    // 배치 처리로 API 호출 최소화
    const embeddings = await Promise.all(
      texts.map(text => this.embed(text))
    );
    return embeddings;
  }

  private normalize(vector: number[]): number[] {
    const magnitude = Math.sqrt(
      vector.reduce((sum, val) => sum + val * val, 0)
    );
    return vector.map(v => v / magnitude);
  }

  clearCache() {
    this.cache.clear();
  }
}

// 설정 예시
const embedder = new EmbeddingService({
  model: 'nomic-embed-text',
  ollamaHost: process.env.OLLAMA_HOST || 'http://host.docker.internal:11434',
  dimensions: 768,
  contextLength: 8192
});
```

### REST 세션 관리 구현

```typescript
// src/core/rest-session.ts
import { v4 as uuidv4 } from 'uuid';
import { SearchService } from './searcher';

export class RestSessionManager {
  private sessions: Map<string, RestSession>;
  private readonly SESSION_TIMEOUT = 3600000; // 1시간

  constructor(private searcher: SearchService) {
    this.sessions = new Map();
  }

  // REST 모드 진입
  async startRest(): Promise<RestSession> {
    // 시스템 가이드 검색
    const guides = await this.searcher.semanticSearch(
      'chunking guide metadata rules',
      5,
      { category: 'system' }
    );

    const session: RestSession = {
      id: `rest-${uuidv4()}`,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + this.SESSION_TIMEOUT).toISOString(),
      chunking_guide: this.extractChunkingGuide(guides),
      metadata_rules: this.extractMetadataRules(guides),
      scribed_count: 0,
      status: 'active'
    };

    this.sessions.set(session.id, session);
    return session;
  }

  // REST 모드 종료
  async endRest(sessionId: string): Promise<{ status: string; scribed_count: number }> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`세션을 찾을 수 없습니다: ${sessionId}`);
    }

    const count = session.scribed_count;
    this.sessions.delete(sessionId);

    return {
      status: 'REST 모드 종료. 청킹 가이드 정리 가능.',
      scribed_count: count
    };
  }

  // 세션 검증
  validateSession(sessionId: string): RestSession {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error('REST 모드가 아닙니다. rest()를 먼저 호출하세요.');
    }

    if (new Date() > new Date(session.expires_at)) {
      this.sessions.delete(sessionId);
      throw new Error('REST 세션이 만료되었습니다. rest()를 다시 호출하세요.');
    }

    return session;
  }

  // scribe 카운트 증가
  incrementScribeCount(sessionId: string) {
    const session = this.validateSession(sessionId);
    session.scribed_count++;
  }

  private extractChunkingGuide(guides: any[]): ChunkingGuide {
    // 시스템 가이드에서 청킹 규칙 추출
    return {
      principles: [
        '의미적으로 독립된 단위로 분할',
        '문맥 이해 가능한 최소 단위 유지',
        '질문에 답할 수 있는 완결성'
      ],
      ideal_chunk_size: {
        min_tokens: 100,
        max_tokens: 512
      },
      examples: []
    };
  }

  private extractMetadataRules(guides: any[]): MetadataRules {
    return {
      required_fields: ['topic', 'keywords', 'questions'],
      keyword_count: { min: 3, max: 10 },
      question_guidelines: [
        '이 청크가 답할 수 있는 질문 작성',
        '구체적이고 검색 가능한 질문'
      ],
      entity_extraction: [
        '기술명, 프로젝트명, 인물명 추출',
        '타입 명시 필수'
      ]
    };
  }
}
```

### 검색 구현 예시

```typescript
// src/core/searcher.ts
import { QdrantClient } from '@qdrant/js-client-rest';
import { EmbeddingService } from './embedder';

export class SearchService {
  constructor(
    private qdrant: QdrantClient,
    private embedder: EmbeddingService
  ) {}

  // 의미 기반 검색 (memorize)
  async semanticSearch(query: string, limit = 5, filter?: object) {
    const queryEmbedding = await this.embedder.embed(query);

    return await this.qdrant.search('chunks', {
      vector: queryEmbedding,
      limit,
      filter,
      score_threshold: 0.7  // 유사도 임계값
    });
  }

  // 키워드 기반 검색 (find)
  async keywordSearch(keywords: string[], limit = 5, filter?: object) {
    // 키워드 필터링
    const keywordFilter = {
      must: keywords.map(kw => ({
        key: 'keywords',
        match: { value: kw }
      }))
    };

    // 하이브리드: 키워드로 임베딩도 생성
    const queryEmbedding = await this.embedder.embed(keywords.join(' '));

    return await this.qdrant.search('chunks', {
      vector: queryEmbedding,
      limit,
      filter: { ...filter, ...keywordFilter }
    });
  }

  // 중복 감지
  async detectDuplicates(text: string, threshold = 0.95) {
    const embedding = await this.embedder.embed(text);

    const results = await this.qdrant.search('chunks', {
      vector: embedding,
      limit: 5,
      score_threshold: threshold
    });

    return results.length > 0 ? results : null;
  }
}
```

### Scribe 도구 구현 (REST 검증 포함)

```typescript
// src/tools/scribe.ts
import { RestSessionManager } from '../core/rest-session';
import { SearchService } from '../core/searcher';
import { EmbeddingService } from '../core/embedder';
import { QdrantClient } from '@qdrant/js-client-rest';

export class ScribeTool {
  constructor(
    private sessionManager: RestSessionManager,
    private searcher: SearchService,
    private embedder: EmbeddingService,
    private qdrant: QdrantClient
  ) {}

  async scribe(chunk: Chunk, sessionId: string) {
    // 1. REST 세션 검증 (필수)
    const session = this.sessionManager.validateSession(sessionId);

    // 2. 중복 감지
    const duplicates = await this.searcher.detectDuplicates(chunk.text);
    if (duplicates) {
      return {
        status: 'warning',
        message: '유사한 청크가 이미 존재합니다.',
        duplicates
      };
    }

    // 3. 임베딩 생성
    const embedding = await this.embedder.embed(chunk.text);

    // 4. VectorDB 저장
    await this.qdrant.upsert('chunks', {
      points: [{
        id: chunk.id,
        vector: embedding,
        payload: {
          ...chunk.metadata,
          text: chunk.text,
          rest_session_id: sessionId
        }
      }]
    });

    // 5. 세션 카운트 증가
    this.sessionManager.incrementScribeCount(sessionId);

    return {
      status: 'success',
      message: '청크 저장 완료',
      chunk_id: chunk.id
    };
  }
}
```

### Docker Compose 설정

```yaml
# docker-compose.yml
version: '3.8'

services:
  spellbook:
    build: .
    ports:
      - "17950:17950"
    environment:
      - OLLAMA_HOST=http://host.docker.internal:11434
      - QDRANT_URL=http://qdrant:6333
      - EMBEDDING_MODEL=nomic-embed-text
      - EMBEDDING_DIMENSIONS=768
    volumes:
      - ./data:/data
    depends_on:
      - qdrant

  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "17951:6333"
    volumes:
      - qdrant_storage:/qdrant/storage

volumes:
  qdrant_storage:
```

### 환경 변수 설정

```bash
# .env
OLLAMA_HOST=http://host.docker.internal:11434
QDRANT_URL=http://qdrant:6333
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_DIMENSIONS=768
EMBEDDING_CONTEXT_LENGTH=8192
```

---

## 참고 자료

### MCP & 프레임워크
- [MCP 공식 문서](https://modelcontextprotocol.io/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [RAG Memory MCP](https://github.com/ttommyth/rag-memory-mcp) - 참고용 기존 구현

### VectorDB
- [Qdrant 문서](https://qdrant.tech/documentation/)
- [Qdrant JavaScript Client](https://github.com/qdrant/qdrant-js)
- [Qdrant Docker 설정](https://qdrant.tech/documentation/guides/installation/#docker)

### 임베딩 모델
- [Ollama API 문서](https://github.com/ollama/ollama/blob/main/docs/api.md)
- [nomic-embed-text 모델](https://ollama.com/library/nomic-embed-text)
- [Nomic AI 공식](https://www.nomic.ai/blog/posts/nomic-embed-text-v1)
- [임베딩 모델 벤치마크 (MTEB)](https://huggingface.co/spaces/mteb/leaderboard)
