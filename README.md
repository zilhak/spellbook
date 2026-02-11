# Spellbook v1.0 🔮

VectorDB 기반 AI Agent 메모리 MCP 서버

## 개요

AI 에이전트 개인화 과정에서 축적되는 정보들을 VectorDB에 저장하고 의미 기반으로 검색합니다.

**Canon (메인 저장소)**:
- **Scribe**: Canon에 정보 저장 (REST 모드에서만)
- **Memorize**: Canon 의미 기반 검색
- **Find**: Canon 키워드 기반 검색

**Lore (서브 저장소)**:
- **Chronicle**: Lore에 정보 저장 (REST 모드에서만, Lore 이름 지정)
- **Recall**: Lore 의미 기반 검색
- **Recall Find**: Lore 키워드 기반 검색

Canon과 Lore의 API는 완전히 분리되어 있습니다. Canon API로 Lore 데이터에 접근할 수 없고, 그 반대도 마찬가지입니다.

**Spellbook은 단순한 저장소입니다.** 무엇을 저장하고 언제 검색할지는 사용자가 결정합니다.

## 핵심 특징

- ✅ **Canon + Lore**: 메인 저장소와 용도별 서브 저장소 분리
- ✅ **REST 상태 관리**: 청킹 일관성 보장 (scribe/chronicle 공용)
- ✅ **이중 검색**: 의미 기반 + 키워드 기반 (Canon/Lore 각각)
- ✅ **nomic-embed-text**: 768차원, 한글/영어 우수
- ✅ **HTTP/SSE MCP**: Docker로 간편 배포
- ✅ **Bun 런타임**: 빠른 시작, TypeScript 네이티브 실행

## 빠른 시작

> 📖 **상세 설치 가이드**:
> - 👤 **사람**: [INSTALL.md](./INSTALL.md) - 대화형 설치 스크립트 사용
> - 🤖 **AI Agent**: [INSTALL_AI.md](./INSTALL_AI.md) - 환경 변수 설정 가이드

### 방법 1: Docker Compose (권장) ⭐

**사전 요구사항**: [Docker](https://docs.docker.com/get-docker/), [Ollama](https://ollama.com)

```bash
git clone https://github.com/zilhak/spellbook.git
cd spellbook
./scripts/setup.sh   # 환경 확인 + 모델 다운로드 + 이미지 빌드
docker compose up -d
```

setup.sh가 Docker, Ollama 확인 및 임베딩 모델 다운로드, 이미지 빌드를 처리합니다.
첫 실행 시 시스템 가이드 seed가 자동으로 수행됩니다.

**설정 커스터마이징** (선택):
```bash
cp .env.example .env
nano .env
```

| 환경 변수 | 기본값 | 설명 |
|-----------|--------|------|
| `PORT` | `17950` | Spellbook 서버 포트 |
| `QDRANT_PORT` | `17951` | Qdrant 외부 포트 |
| `QDRANT_DATA_PATH` | `./data/qdrant` | 데이터 저장 경로 |
| `OLLAMA_HOST` | `http://host.docker.internal:11434` | Ollama 주소 |

---

### 방법 2: Bun 직접 실행 (개발용)

```bash
git clone https://github.com/zilhak/spellbook.git
cd spellbook
bun install

# Qdrant + Ollama 준비
docker run -d -p 17951:6333 qdrant/qdrant
ollama pull nomic-embed-text

# 개발 모드 (hot reload)
bun run dev
```

**필요 조건**: [Bun](https://bun.sh) (`curl -fsSL https://bun.sh/install | bash`)

---

### Claude Code 설정

**방법 1: CLI 명령어 (권장)**

```bash
claude mcp add --transport http spellbook http://localhost:17950/mcp
```

**방법 2: 수동 설정**

`~/.claude/mcp.json`:
```json
{
  "mcpServers": {
    "spellbook": {
      "url": "http://localhost:17950/mcp"
    }
  }
}
```

### AI Agent 시스템 프롬프트 설정 (권장)

Spellbook을 효과적으로 활용하려면, AI Agent의 시스템 프롬프트(CLAUDE.md 등)에 다음과 같은 지침을 추가하는 것을 권장합니다:

```markdown
## Spellbook 활용 규칙

- 모르는 개념, 프로젝트 컨벤션, 과거 결정 사항이 나오면 먼저 Spellbook에서 검색하라
- 세션 시작 시 get_index()로 어떤 정보가 저장되어 있는지 확인하라
- Canon 검색 (범용 지식):
  - 맥락/개념이 궁금할 때: memorize(query)
  - 정확한 용어를 알 때: find(keywords)
- Lore 검색 (프로젝트별 정보):
  - 맥락/개념이 궁금할 때: recall(lore, query)
  - 정확한 용어를 알 때: recall_find(lore, keywords)
- 중요한 결정, 새로운 패턴, 사용자 선호도가 확인되면 REST 모드로 저장하라
  - 범용 지식 → scribe (Canon)
  - 프로젝트 한정 정보 → chronicle (Lore)
```

이를 통해 Agent가 이전 세션에서 축적한 지식을 자연스럽게 활용하게 됩니다.

---

## 사용법

### Canon 워크플로우 (메인 저장소)

```typescript
// 1. REST 모드 진입
const session = await rest();

// 2. Canon에 청크 저장
await scribe({
  chunk: {
    text: "Docker Compose는...",
    metadata: {
      topic_id: "인프라",
      category: "technology",
      keywords: ["Docker", "Compose"],
      questions: ["Docker Compose 설정 방법은?"],
      entities: [{name: "Docker", type: "technology"}],
      importance: "high"
    }
  },
  session_id: session.session_id
});

// 3. REST 종료
await rest_end(session.session_id);

// Canon 검색
await memorize({query: "Docker 컨테이너 설정"});
await find({keywords: ["Docker", "Qdrant"]});
```

### Lore 워크플로우 (서브 저장소)

```typescript
// 1. REST 모드 진입
const session = await rest();

// 2. Lore에 청크 저장 (Lore가 없으면 자동 생성)
await chronicle({
  lore: "my-project",
  lore_description: "My Project 기술 결정사항",
  chunk: {
    text: "인증은 JWT 기반으로...",
    metadata: {
      topic_id: "auth",
      category: "architecture",
      keywords: ["JWT", "인증"],
      questions: ["프로젝트 인증 방식은?"],
      entities: [{name: "JWT", type: "technology"}],
      importance: "high"
    }
  },
  session_id: session.session_id
});

// 3. REST 종료
await rest_end(session.session_id);

// Lore 검색
await recall({lore: "my-project", query: "인증 방식"});
await recall_find({lore: "my-project", keywords: ["JWT"]});

// Lore 관리
await list_lores();              // 모든 Lore 목록 + 설명
await lore_stats("my-project");  // 특정 Lore 통계
```

## 데이터 관리

### 영속성 (Persistence)

**Docker Compose 사용 시**:
- 호스트 경로 직접 사용 (`.env`의 `QDRANT_DATA_PATH`)
- 컨테이너 재시작/재생성 시에도 데이터 자동 유지

```bash
# .env 파일에서 설정
QDRANT_DATA_PATH=/your/data/path

# 데이터 확인
ls -la /your/data/path
```

**✅ 안전한 종료** (데이터 유지):
```bash
docker-compose down     # 컨테이너만 삭제, 데이터 유지
docker-compose restart  # 데이터 그대로 복구
```

---

### 백업/복원 (export/import)

#### export 도구 (백업)

```bash
# MCP 세션 초기화 후 export 호출
curl -X POST http://localhost:17950/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"clientInfo":{"name":"test"},"protocolVersion":"2024-11-05"},"id":1}'

# 세션 ID로 export
curl -X POST http://localhost:17950/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: YOUR_SESSION_ID" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"export","arguments":{}},"id":2}'
```

#### import 도구 (복원)

```bash
curl -X POST http://localhost:17950/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: YOUR_SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "import",
      "arguments": {
        "data": {
          "chunks": [
            {"text": "복원할 내용", "category": "knowledge"}
          ]
        }
      }
    },
    "id": 1
  }'
```

**특징**:
- REST 세션 없이 직접 복원 가능
- 각 청크에 대해 임베딩 자동 재생성
- 성공/실패 개수 반환

---

## 개발

### 로컬 실행

```bash
# 의존성 설치
bun install

# Qdrant만 Docker로
docker-compose up -d qdrant

# 개발 모드 (hot reload)
bun run dev

# 타입체크
bun run typecheck
```

### 시스템 가이드 seed

```bash
# 최초 1회
bun run seed
```

## MCP 도구

### 공용

| 도구 | 설명 | 제약 |
|------|------|------|
| `rest` | REST 모드 시작 | - |
| `rest_end` | REST 모드 종료 | - |
| `get_index` | 메타 목차 | - |
| `stats` | Canon 통계 | - |
| `filter_guide` | 필터 사용법 가이드 | - |
| `export` | Canon JSON 백업 | - |
| `import` | Canon JSON 복원 | - |

### Canon (메인 저장소)

| 도구 | 설명 | 제약 |
|------|------|------|
| `scribe` | Canon에 청크 저장 | **REST 모드 필수** |
| `memorize` | Canon 의미 검색 | - |
| `find` | Canon 키워드 검색 | - |
| `get_topic` | 토픽 조회 | - |
| `erase` | Canon 청크 삭제 | - |
| `revise` | Canon 청크 수정 | - |

### Lore (서브 저장소)

| 도구 | 설명 | 제약 |
|------|------|------|
| `chronicle` | Lore에 청크 저장 | **REST 모드 필수** |
| `recall` | Lore 의미 검색 | - |
| `recall_find` | Lore 키워드 검색 | - |
| `erase_lore` | Lore 청크 삭제 | - |
| `revise_lore` | Lore 청크 수정 | - |
| `list_lores` | 모든 Lore 목록 | - |
| `delete_lore` | Lore 삭제 (복구 불가) | - |
| `lore_stats` | Lore 통계 | - |
| `update_lore` | Lore 설명 수정 | - |

## 아키텍처

```
Claude Code
    │ HTTP/SSE (MCP Protocol)
    ▼
Spellbook (Bun + MCP SDK)
    │
    ├─ REST 세션 관리 (scribe/chronicle 공용)
    ├─ Canon 도구 (scribe, memorize, find)
    ├─ Lore 도구 (chronicle, recall, recall_find)
    ├─ Lore 관리 (list_lores, delete_lore, lore_stats, update_lore)
    ├─ 임베딩 (Ollama + nomic-embed-text)
    └─ VectorDB (Qdrant)
         ├─ Canon: chunks + chunks_metadata
         └─ Lore: lore_{name} + lore_{name}_metadata (각각)
```

## 기술 스택

| 구성요소 | 선택 |
|----------|------|
| **런타임** | Bun |
| **언어** | TypeScript (네이티브 실행) |
| **MCP** | @modelcontextprotocol/sdk |
| **VectorDB** | Qdrant |
| **임베딩** | Ollama + nomic-embed-text |
| **HTTP** | Express |

## 상세 문서

- [CLAUDE.md](./CLAUDE.md) - 프로젝트 전체 설계 문서
- [src/data/system-guides.ts](./src/data/system-guides.ts) - 청킹 가이드

## 라이선스

MIT
