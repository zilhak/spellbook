# Memorize - VectorDB 기반 Claude 메모리 MCP 서버

## 프로젝트 개요

Claude Code에 영구적인 기억 시스템을 제공하는 MCP 서버.
VectorDB를 사용하여 의미 기반 검색으로 관련 정보를 빠르게 찾아낸다.

### 핵심 목표

1. **영속적 기억**: 세션이 끝나도 정보 유지
2. **의미 기반 검색**: 키워드가 아닌 의미로 관련 정보 검색
3. **효율적인 컨텍스트 사용**: 필요한 정보만 로드하여 토큰 절약
4. **AI 기반 청킹**: 휴리스틱이 아닌 AI가 의미 단위로 문서 분할

---

## 핵심 개념

### 1. AI 청킹 (AI Chunking)

일반 청킹(500자씩 자르기)이 아닌, AI가 의미 단위로 문서를 분할한다.

```
원본 문서
    │
    ▼ AI 처리

Chunk:
  - text: 실제 내용
  - metadata:
      topic: 주제 분류
      keywords: 키워드 목록
      question_this_answers: 이 청크가 답할 수 있는 질문들
      entities: 관련 개체 (사람, 프로젝트, 기술 등)
      importance: 중요도
```

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

### 3. 저장 vs 검색 흐름

```
[저장 시 - 비동기, 느려도 됨]
문서/대화 → AI 청킹 → 메타데이터 추출 → 임베딩 생성 → VectorDB 저장
                                                    → 목차 업데이트

[검색 시 - 빨라야 함]
질문 → 임베딩 → 유사도 검색 → 관련 청크 반환 → 컨텍스트에 주입
```

---

## 아키텍처

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Claude Code                                │
│                                                                     │
│  세션 시작 → get_memory_index() → 메타 목차 로드                    │
│                                                                     │
│  질문 → memory_search(query) → 관련 청크 반환                       │
│                                                                     │
│  새 정보 → memory_save(content) → 청킹 + 저장                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                │ MCP 프로토콜
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Memorize MCP Server                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │ Chunker     │  │ Embedder    │  │ Searcher    │                 │
│  │ (AI 청킹)   │  │ (임베딩)    │  │ (검색)      │                 │
│  └─────────────┘  └─────────────┘  └─────────────┘                 │
│         │                │                │                         │
│         └────────────────┼────────────────┘                         │
│                          ▼                                          │
│                 ┌─────────────────┐                                 │
│                 │    VectorDB     │                                 │
│                 │   (ChromaDB)    │                                 │
│                 └─────────────────┘                                 │
│                          │                                          │
│                          ▼                                          │
│                 ┌─────────────────┐                                 │
│                 │   Index Store   │                                 │
│                 │  (메타 목차)    │                                 │
│                 └─────────────────┘                                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## MCP 도구 (Tools) 정의

### 읽기 도구

| 도구 | 설명 | 파라미터 |
|------|------|----------|
| `get_memory_index` | 메타 목차 반환 (세션 시작 시 호출) | `scope?`: 범위 제한 |
| `memory_search` | 의미 기반 검색 | `query`, `limit?`, `filter?` |
| `get_topic_detail` | 특정 토픽의 모든 청크 조회 | `topic_id` |

### 쓰기 도구

| 도구 | 설명 | 파라미터 |
|------|------|----------|
| `memory_save` | 새 정보 저장 (AI 청킹 수행) | `content`, `source?`, `category?` |
| `memory_save_chunk` | 이미 청킹된 정보 직접 저장 | `chunk` (구조화된 데이터) |
| `memory_delete` | 특정 청크/토픽 삭제 | `chunk_id` or `topic_id` |
| `memory_update` | 기존 청크 수정 | `chunk_id`, `content` |

### 관리 도구

| 도구 | 설명 | 파라미터 |
|------|------|----------|
| `memory_stats` | 저장소 통계 (청크 수, 카테고리별 분포) | - |
| `memory_rebuild_index` | 목차 재구축 | - |
| `memory_export` | 백업 내보내기 | `format`: json/markdown |
| `memory_import` | 백업 가져오기 | `file_path` |

---

## 데이터 구조

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

### 필수 구성요소

| 구성요소 | 선택 | 이유 |
|----------|------|------|
| **Runtime** | Node.js (TypeScript) | MCP SDK 공식 지원 |
| **VectorDB** | ChromaDB | 로컬 실행, 설치 간편, Python/JS 지원 |
| **Embedding** | Ollama (nomic-embed-text) | 로컬 실행, 무료, 성능 양호 |
| **AI 청킹** | Claude API or Ollama | 의미 단위 분할 + 메타데이터 추출 |

### 대안

| 구성요소 | 대안 | 트레이드오프 |
|----------|------|--------------|
| **VectorDB** | Qdrant, Milvus, Pinecone | Qdrant: 더 빠름 / Pinecone: 클라우드 |
| **Embedding** | OpenAI Ada, Cohere | 더 정확하지만 API 비용 발생 |
| **AI 청킹** | GPT-4, Claude | 더 정확하지만 비용 높음 |

---

## 구현 단계

### Phase 1: 기본 구조 (MVP)

- [ ] MCP 서버 스캐폴딩 (TypeScript)
- [ ] ChromaDB 연동
- [ ] Ollama 임베딩 연동
- [ ] 기본 도구 구현: `memory_save`, `memory_search`
- [ ] 단순 청킹 (단락 기준)

### Phase 2: AI 청킹

- [ ] AI 청킹 프롬프트 설계
- [ ] 메타데이터 자동 추출 (topic, keywords, questions)
- [ ] 청킹 품질 검증 로직

### Phase 3: 계층적 인덱스

- [ ] Topic 자동 생성/업데이트
- [ ] MetaIndex 관리
- [ ] `get_memory_index` 구현
- [ ] 세션 시작 시 자동 로드 (시스템 프롬프트 연동)

### Phase 4: 고급 기능

- [ ] 중복 감지 및 병합
- [ ] 관계 추출 (Entity 간 관계)
- [ ] 시간 기반 감쇠 (오래된 정보 중요도 하락)
- [ ] 스코프 기반 필터링 (프로젝트별 기억 분리)

### Phase 5: 운영 기능

- [ ] 백업/복원
- [ ] 통계 대시보드
- [ ] 성능 최적화

---

## 디렉토리 구조 (예정)

```
memorize/
├── src/
│   ├── index.ts              # MCP 서버 진입점
│   ├── tools/                # MCP 도구 구현
│   │   ├── search.ts
│   │   ├── save.ts
│   │   ├── index.ts
│   │   └── admin.ts
│   ├── core/
│   │   ├── chunker.ts        # AI 청킹 로직
│   │   ├── embedder.ts       # 임베딩 생성
│   │   ├── searcher.ts       # 검색 로직
│   │   └── indexer.ts        # 목차 관리
│   ├── db/
│   │   ├── chroma.ts         # ChromaDB 연동
│   │   └── index-store.ts    # 메타 목차 저장소
│   └── types/
│       └── index.ts          # 타입 정의
├── data/                     # 로컬 데이터 저장
│   ├── chroma/               # ChromaDB 데이터
│   └── index.json            # 메타 목차
├── prompts/                  # AI 청킹용 프롬프트
│   └── chunking.md
├── package.json
├── tsconfig.json
└── CLAUDE.md                 # 이 파일
```

---

## 설정 예시

### Claude Code MCP 설정 (`~/.claude/mcp.json`)

```json
{
  "mcpServers": {
    "memorize": {
      "command": "node",
      "args": ["/Users/ljh/workspace/etc/memorize/dist/index.js"],
      "env": {
        "OLLAMA_HOST": "http://localhost:11434",
        "DATA_PATH": "/Users/ljh/.claude/memorize-data"
      }
    }
  }
}
```

### 시스템 프롬프트 가이드

세션 시작 시 Claude가 기억 시스템을 활용하도록 안내:

```
당신은 Memorize 메모리 시스템에 접근할 수 있습니다.

세션 시작 시:
1. get_memory_index()를 호출하여 어떤 기억이 있는지 확인하세요.

질문에 답할 때:
1. 관련 기억이 있을 수 있다면 memory_search(query)로 검색하세요.
2. 검색 결과를 참고하여 답변하세요.

새로운 정보를 학습했을 때:
1. 중요한 정보는 memory_save(content)로 저장하세요.
2. 사용자 선호도, 프로젝트 정보, 결정 사항 등을 기억하세요.
```

---

## 참고 자료

- [MCP 공식 문서](https://modelcontextprotocol.io/)
- [ChromaDB 문서](https://docs.trychroma.com/)
- [Ollama Embedding](https://ollama.com/blog/embedding-models)
- [RAG Memory MCP](https://github.com/ttommyth/rag-memory-mcp) - 참고용 기존 구현
