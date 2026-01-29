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

## 빠른 시작

### 방법 1: GitHub 직접 설치 (최소 명령어) ⚡

**가장 간단한 방법** - `prepare` 스크립트가 자동으로 빌드

```bash
# 한 줄 설치 (prepare 스크립트가 자동으로 tsc 실행)
npm install -g github:username/spellbook

# 사전 준비 (Qdrant + Ollama)
docker run -d -p 6333:6333 qdrant/qdrant && ollama pull nomic-embed-text

# 환경 변수 (선택적, 기본값 사용 가능)
export QDRANT_URL=http://localhost:6333
export OLLAMA_HOST=http://localhost:11434

# 실행
spellbook
```

**동작 원리**:
1. `npm install` 실행
2. `prepare` 스크립트 자동 실행 (`npm run build`)
3. TypeScript 컴파일 → `dist/` 생성
4. CLI 명령어 등록

**장점**:
- ✅ dist를 커밋하지 않아도 됨
- ✅ 설치 시 자동 빌드
- ✅ 한 줄 명령어로 설치
- ✅ 최신 main 브랜치 자동 추적

**필요 조건**:
- Node.js 20+ (TypeScript 컴파일용)

**업데이트**:
```bash
npm update -g github:username/spellbook
# 자동으로 prepare 스크립트 재실행 → 재빌드
```

---

### 방법 2: Docker Compose (완전 자동화)

#### 1. 사전 요구사항

- Docker & Docker Compose
- Ollama (호스트에서 실행)

```bash
# Ollama 설치 후
ollama pull nomic-embed-text
```

#### 2. 환경 설정

```bash
cp .env.example .env
# 필요시 .env 수정 (기본값으로도 동작)
```

#### 3. 실행

```bash
# Docker Compose로 실행
docker-compose up -d

# 로그 확인
docker-compose logs -f spellbook
```

#### 4. 시스템 가이드 seed

```bash
# 최초 1회만
docker-compose exec spellbook pnpm run seed
```

### 방법 3: npm Registry 설치

**npm에 배포된 후** 사용 가능

```bash
# npm 레지스트리에서 설치
npm install -g spellbook

# 사전 준비
docker run -d -p 6333:6333 qdrant/qdrant && ollama pull nomic-embed-text

# 실행
spellbook
```

---

### 방법 4: npx 원라이너 (설치 없이)

```bash
# 설치 없이 즉시 실행 (npm registry)
npx spellbook

# 또는 GitHub에서
npx github:username/spellbook
```

**장점**: 글로벌 설치 없이 일회성 실행

---

### 방법 5: 로컬 개발 모드

```bash
# 저장소 클론
git clone https://github.com/username/spellbook.git
cd spellbook

# 의존성 설치
pnpm install

# Qdrant만 Docker로
docker run -d -p 6333:6333 qdrant/qdrant

# 개발 모드 (hot reload)
pnpm run dev
```

---

## 설치 방법 비교

| 방법 | 명령어 수 | 빌드 | dist 커밋 | 의존성 | 권장 용도 |
|------|-----------|------|-----------|--------|-----------|
| **GitHub 직접** | 1개 | 자동 (prepare) | ❌ | 자동 | **프로덕션** ⭐ |
| **Docker Compose** | 1개 | Docker 내부 | ❌ | 자동 | **완전 격리** |
| **npm Registry** | 1개 | 자동 (prepare) | ❌ | 자동 | **공식 배포 후** |
| **npx** | 1개 | 자동 (prepare) | ❌ | 자동 | **일회성 테스트** |
| **로컬 개발** | 3개 | 수동 | ❌ | 수동 | **기여/개발** |

### 최소 명령어 순위

1. **GitHub 직접 설치**: `npm i -g github:user/spellbook` (⭐ 가장 추천)
   - prepare 스크립트가 자동 빌드
   - dist를 커밋하지 않아도 됨

2. **Docker Compose**: `docker-compose up -d`
   - Docker가 알아서 빌드

3. **npx**: `npx github:user/spellbook`
   - 일회성 실행

4. **npm Registry**: `npm i -g spellbook` (배포 후)
   - npm publish 필요

5. **로컬 개발**: `git clone && pnpm install && pnpm dev`
   - 개발자용

---

### Claude Code 설정

`~/.claude/mcp.json`:
```json
{
  "mcpServers": {
    "spellbook": {
      "url": "http://localhost:8000"
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

## 개발

### 로컬 실행

```bash
# 의존성 설치
pnpm install

# Qdrant만 Docker로
docker-compose up -d qdrant

# 개발 모드
pnpm run dev

# 빌드
pnpm run build
```

### 타입체크

```bash
pnpm run typecheck
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
| `stats` | 통계 | - |
| `get_index` | 메타 목차 | - |
| `export` | JSON 백업 | - |

## 아키텍처

```
Claude Code
    │ HTTP
    ▼
Spellbook (HTTP/SSE MCP Server)
    │
    ├─ REST 세션 관리
    ├─ 임베딩 (Ollama + nomic-embed-text)
    └─ VectorDB (Qdrant)
```

## 상세 문서

- [CLAUDE.md](./CLAUDE.md) - 프로젝트 전체 설계 문서
- [src/data/system-guides.ts](./src/data/system-guides.ts) - 청킹 가이드

## 라이선스

MIT
