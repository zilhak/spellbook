# Spellbook 🔮

VectorDB 기반 AI Agent 메모리 MCP 서버

## 개요

AI 에이전트 개인화 과정에서 축적되는 정보들을 VectorDB에 저장하고 의미 기반으로 검색합니다.

- **Scribe**: 정보 저장 (REST 모드에서만)
- **Memorize**: 의미 기반 검색
- **Find**: 키워드 기반 검색

**Spellbook은 단순한 저장소입니다.** 무엇을 저장하고 언제 검색할지는 사용자가 결정합니다.

## 핵심 특징

- ✅ **REST 상태 관리**: 청킹 일관성 보장
- ✅ **이중 검색**: 의미 기반 + 키워드 기반
- ✅ **nomic-embed-text**: 768차원, 한글/영어 우수
- ✅ **HTTP/SSE MCP**: Docker로 간편 배포
- ✅ **Bun 런타임**: 빠른 시작, TypeScript 네이티브 실행

## 빠른 시작

> 📖 **설치 가이드**:
> - 👤 **사람**: [INSTALL.md](./INSTALL.md) - 대화형 설치 스크립트 사용
> - 🤖 **AI Agent**: [INSTALL_AI.md](./INSTALL_AI.md) - 환경 변수 설정 가이드

### 방법 1: Bun 직접 설치 (최소 명령어) ⚡

**가장 간단한 방법** - TypeScript 직접 실행, 빌드 불필요

```bash
# 저장소 클론
git clone https://github.com/username/spellbook.git
cd spellbook

# 의존성 설치
bun install

# 사전 준비 (Qdrant + Ollama)
docker run -d -p 17951:6333 qdrant/qdrant && ollama pull nomic-embed-text

# 환경 변수 (선택적, 기본값 사용 가능)
export QDRANT_URL=http://localhost:17951
export OLLAMA_HOST=http://localhost:11434

# 실행
bun run start
```

**Bun의 장점**:
- ✅ TypeScript 직접 실행 (빌드 불필요)
- ✅ 매우 빠른 설치 (npm 대비 10배+)
- ✅ 빠른 시작 시간

**필요 조건**:
- [Bun](https://bun.sh) 설치: `curl -fsSL https://bun.sh/install | bash`

---

### 방법 2: Docker Compose (완전 자동화)

#### 1. 사전 요구사항

- Docker & Docker Compose
- Ollama (호스트에서 실행)

```bash
# Ollama 설치 후
ollama pull nomic-embed-text
```

#### 2. 환경 설정 (.env)

```bash
# .env.example을 복사
cp .env.example .env

# .env 파일 수정
nano .env
```

**.env 필수 설정**:
```bash
# 데이터 저장 경로 지정 (필수!)
QDRANT_DATA_PATH=/path/to/your/data

# 예시:
# Windows: QDRANT_DATA_PATH=E:/spellbook-data
# Linux/Mac: QDRANT_DATA_PATH=/home/user/spellbook-data
# 상대 경로: QDRANT_DATA_PATH=./data/qdrant (기본값)
```

**선택적 설정**:
```bash
PORT=17950
QDRANT_COLLECTION=chunks
OLLAMA_HOST=http://host.docker.internal:11434
EMBEDDING_MODEL=nomic-embed-text
```

#### 3. 데이터 디렉토리 생성

```bash
# 지정한 경로에 디렉토리 생성
mkdir -p /path/to/your/data

# 또는 기본 경로 사용
mkdir -p ./data/qdrant
```

#### 4. 실행

```bash
# Docker Compose로 실행
docker-compose up -d

# 로그 확인
docker-compose logs -f spellbook
```

#### 5. 시스템 가이드 seed

```bash
# 최초 1회만
docker-compose exec spellbook bun run seed
```

---

### 방법 3: 개발 모드

```bash
# 저장소 클론
git clone https://github.com/username/spellbook.git
cd spellbook

# 의존성 설치
bun install

# Qdrant만 Docker로
docker run -d -p 17951:6333 qdrant/qdrant

# 개발 모드 (hot reload)
bun run dev
```

---

## 설치 방법 비교

| 방법 | 명령어 수 | 빌드 | 런타임 | 권장 용도 |
|------|-----------|------|--------|-----------|
| **Bun 직접** | 3개 | ❌ 불필요 | Bun | **프로덕션** ⭐ |
| **Docker Compose** | 1개 | Docker 내부 | Bun | **완전 격리** |
| **개발 모드** | 3개 | ❌ 불필요 | Bun | **기여/개발** |

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

## 사용법

### REST 워크플로우

```typescript
// 1. REST 모드 진입
const session = await rest();
// → {session_id, chunking_guide, metadata_rules}

// 2. 청크 저장
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
```

### 검색

```typescript
// 의미 기반 검색
await memorize({query: "Docker 컨테이너 설정"});

// 키워드 검색
await find({keywords: ["Docker", "Qdrant"]});
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

| 도구 | 설명 | 제약 |
|------|------|------|
| `rest` | REST 모드 시작 | - |
| `rest_end` | REST 모드 종료 | - |
| `scribe` | 청크 저장 | **REST 모드 필수** |
| `memorize` | 의미 검색 | - |
| `find` | 키워드 검색 | - |
| `get_topic` | 토픽 조회 | - |
| `erase` | 청크 삭제 | - |
| `revise` | 청크 수정 | - |
| `stats` | 통계 | - |
| `get_index` | 메타 목차 | - |
| `export` | JSON 백업 | - |
| `import` | JSON 복원 | - |

## 아키텍처

```
Claude Code
    │ HTTP/SSE (MCP Protocol)
    ▼
Spellbook (Bun + MCP SDK)
    │
    ├─ REST 세션 관리
    ├─ 임베딩 (Ollama + nomic-embed-text)
    └─ VectorDB (Qdrant)
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
