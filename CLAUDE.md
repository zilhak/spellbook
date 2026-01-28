# Spellbook - VectorDB 기반 Claude 메모리 MCP 서버

## 프로젝트 개요

AI 에이전트 개인화 과정에서 축적되는 md 문서들을 보관하고 검색하는 MCP 서버.
VectorDB를 사용하여 의미 기반 검색으로 관련 정보를 빠르게 찾아낸다.

### 핵심 목표

1. **단순한 저장소**: 저장(scribe)과 검색(memorize) 기능만 제공
2. **의미 기반 검색**: 키워드가 아닌 의미로 관련 정보 검색
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

### 3. Scribe vs Memorize 흐름

```
[Scribe - 저장]
Agent가 청크 정리 → scribe(chunk) → MCP가 임베딩 → VectorDB 저장
                                               → 목차 업데이트

[Memorize - 검색]
Agent가 질문 → memorize(query) → MCP가 임베딩 → 유사도 검색 → 청크 반환
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

### Memorize (읽기/검색)

| 도구 | 설명 | 파라미터 |
|------|------|----------|
| `get_index` | 메타 목차 반환 (세션 시작 시 호출) | `scope?`: 범위 제한 |
| `memorize` | 의미 기반 검색 | `query`, `limit?`, `filter?` |
| `get_topic` | 특정 토픽의 모든 청크 조회 | `topic_id` |

### Scribe (쓰기/저장)

| 도구 | 설명 | 파라미터 |
|------|------|----------|
| `scribe` | 새 정보 저장 | `chunk`, `source?`, `category?` |
| `scribe_chunk` | 이미 청킹된 정보 직접 저장 | `chunk` (구조화된 데이터) |
| `erase` | 특정 청크/토픽 삭제 | `chunk_id` or `topic_id` |
| `revise` | 기존 청크 수정 | `chunk_id`, `content` |

### 관리 도구

| 도구 | 설명 | 파라미터 |
|------|------|----------|
| `stats` | 저장소 통계 (청크 수, 카테고리별 분포) | - |
| `rebuild_index` | 목차 재구축 | - |
| `export` | 백업 내보내기 | `format`: json/markdown |
| `import` | 백업 가져오기 | `file_path` |

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

### 확정

| 구성요소 | 선택 | 이유 |
|----------|------|------|
| **VectorDB** | Qdrant (embedded) | 메타데이터 필터링 우수, 안정성, 확장 가능 |
| **MCP 전송** | HTTP/SSE | Docker 내부에서 독립 서버로 실행 |
| **배포** | Docker | MCP 서버 + Qdrant 통합 컨테이너 |

### 언어 선택 (미확정)

| 옵션 | 장점 | 단점 |
|------|------|------|
| **Python** | LangChain 등 AI 생태계 풍부, 청킹 라이브러리 다양 | - |
| **TypeScript** | 타입 안정성, MCP SDK 성숙 | AI 라이브러리가 Python 대비 적음 (그러나 LangChain.js 등 존재) |

→ 둘 다 HTTP/SSE MCP 서버 구현 가능. AI 청킹 로직 복잡도에 따라 선택.

### 외부 의존성

| 구성요소 | 설명 |
|----------|------|
| **Ollama** | 임베딩 생성용 (호스트에서 실행, API 호출) |

---

## 구현 단계

### Phase 1: 기본 구조 (MVP)

- [ ] Docker 환경 구성 (Dockerfile, docker-compose)
- [ ] MCP 서버 스캐폴딩 (HTTP/SSE)
- [ ] Qdrant embedded 연동
- [ ] Ollama 임베딩 연동
- [ ] 기본 도구 구현: `scribe`, `memorize`

### Phase 2: 계층적 인덱스

- [ ] Topic 자동 생성/업데이트
- [ ] MetaIndex 관리
- [ ] `get_index` 구현

### Phase 3: 고급 기능

- [ ] 중복 감지 및 병합
- [ ] 시간 기반 감쇠 (오래된 정보 중요도 하락)
- [ ] 스코프 기반 필터링 (프로젝트별 기억 분리)

### Phase 4: 운영 기능

- [ ] 백업/복원
- [ ] 통계 대시보드
- [ ] 성능 최적화

---

## 디렉토리 구조 (예정)

```
spellbook/
├── src/
│   ├── main.py (또는 index.ts)    # MCP 서버 진입점
│   ├── tools/                      # MCP 도구 구현
│   │   ├── memorize.py             # 검색/읽기 도구
│   │   ├── scribe.py               # 저장/쓰기 도구
│   │   ├── index.py                # 인덱스 도구
│   │   └── admin.py                # 관리 도구
│   ├── core/
│   │   ├── embedder.py             # 임베딩 생성 (Ollama 호출)
│   │   ├── searcher.py             # 검색 로직
│   │   └── indexer.py              # 목차 관리
│   ├── db/
│   │   ├── qdrant.py               # Qdrant 연동
│   │   └── index_store.py          # 메타 목차 저장소
│   └── types/
│       └── models.py               # 타입/모델 정의
├── Dockerfile
├── docker-compose.yml
├── requirements.txt (또는 package.json)
└── CLAUDE.md                       # 이 파일
```

---

## 설정 예시

### Claude Code MCP 설정 (`~/.claude/mcp.json`)

```json
{
  "mcpServers": {
    "spellbook": {
      "url": "http://localhost:8000"
    }
  }
}
```

### Docker 실행

```bash
# 컨테이너 실행
docker run -d \
  --name spellbook \
  -p 8000:8000 \
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
- 중요한 아키텍처 결정이 내려졌을 때
- 사용자 선호도가 확인되었을 때
- 반복적으로 참조할 정보가 생겼을 때

### 저장하지 않을 것
- 일시적인 디버깅 정보
- 코드 자체 (코드는 Git에)
- 쉽게 검색 가능한 공개 정보
```

**핵심: MCP는 저장/검색만 제공하고, 정책은 사용자가 정의한다.**

---

## 참고 자료

- [MCP 공식 문서](https://modelcontextprotocol.io/)
- [Qdrant 문서](https://qdrant.tech/documentation/)
- [Ollama Embedding](https://ollama.com/blog/embedding-models)
- [LangChain.js](https://js.langchain.com/) / [LangChain Python](https://python.langchain.com/)
- [RAG Memory MCP](https://github.com/ttommyth/rag-memory-mcp) - 참고용 기존 구현
