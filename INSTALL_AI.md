# Spellbook 설치 가이드 (AI Agent용) 🤖

AI Agent가 자동으로 설치할 때 참조하는 문서입니다.

## 설치 절차

### 1. 저장소 클론

```bash
git clone https://github.com/yourname/spellbook.git
cd spellbook
```

### 2. 환경 설정 (.env)

**`.env` 파일을 생성하고 다음 변수들을 설정하세요:**

```bash
# .env.example을 복사
cp .env.example .env
```

**필수 설정 변수:**

```bash
# 데이터 저장 경로 (필수)
QDRANT_DATA_PATH=/path/to/data

# 서버 설정
PORT=17950
HOST=0.0.0.0

# Qdrant 설정 (Docker Compose 사용 시 변경 불필요)
QDRANT_URL=http://qdrant:6333
QDRANT_COLLECTION=chunks

# Ollama 설정
OLLAMA_HOST=http://host.docker.internal:11434
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_DIMENSIONS=768
EMBEDDING_CONTEXT_LENGTH=8192
```

**중요**: `QDRANT_DATA_PATH`는 반드시 유효한 경로여야 합니다.

### 3. 데이터 디렉토리 생성

```bash
# .env에 지정한 경로에 디렉토리 생성
mkdir -p ${QDRANT_DATA_PATH}

# 예시 (절대 경로):
mkdir -p /home/user/spellbook-data

# 예시 (상대 경로):
mkdir -p ./data/qdrant
```

### 4. Ollama 설정

```bash
# Ollama가 설치되어 있어야 함
# 임베딩 모델 다운로드
ollama pull nomic-embed-text
```

### 5. Docker Compose 실행

```bash
# Docker Compose 시작
docker-compose up -d

# 로그 확인
docker-compose logs -f spellbook
```

### 6. 시스템 가이드 초기화

```bash
# 최초 1회만 실행
docker-compose exec spellbook bun run seed
```

### 7. 상태 확인

```bash
# 서버 상태 확인
curl http://localhost:17950/health

# 데이터 디렉토리 확인
ls -la ${QDRANT_DATA_PATH}
```

### 8. Claude Code MCP 설정

**방법 1: CLI 명령어 (권장)**

```bash
claude mcp add --transport http spellbook http://localhost:17950/mcp
```

**방법 2: 수동 설정**

`~/.claude/mcp.json` 파일에 추가:

```json
{
  "mcpServers": {
    "spellbook": {
      "url": "http://localhost:17950/mcp"
    }
  }
}
```

---

## 환경 변수 설정 가이드

### QDRANT_DATA_PATH (필수)

VectorDB 데이터 저장 경로입니다.

**유효한 값:**
- 절대 경로 (Unix): `/home/user/spellbook-data`
- 절대 경로 (Windows): `E:/spellbook-data`
- 상대 경로: `./data/qdrant`

**검증 방법:**
```bash
# 경로가 존재하는지 확인
test -d "${QDRANT_DATA_PATH}" && echo "OK" || mkdir -p "${QDRANT_DATA_PATH}"
```

### OLLAMA_HOST (필수)

Ollama 서버 URL입니다.

**유효한 값:**
- `http://localhost:11434` (로컬)
- `http://host.docker.internal:11434` (Docker 내부에서 호스트 접근)
- `http://192.168.1.100:11434` (네트워크)

**검증 방법:**
```bash
# Ollama 연결 테스트
curl -s "${OLLAMA_HOST}/api/tags" && echo "OK" || echo "FAIL"
```

### PORT (선택)

MCP 서버 포트입니다.

**유효한 값:** 1-65535 범위의 정수
**기본값:** 17950

**검증 방법:**
```bash
# 포트가 사용 가능한지 확인
! nc -z localhost ${PORT} && echo "Available" || echo "In use"
```

---

## 자동화 스크립트 예시

AI Agent가 자동으로 설치하는 스크립트:

```bash
#!/bin/bash
set -e

# 1. 저장소 클론
git clone https://github.com/yourname/spellbook.git
cd spellbook

# 2. .env 파일 생성
cat > .env << EOF
QDRANT_DATA_PATH=./data/qdrant
PORT=17950
HOST=0.0.0.0
QDRANT_URL=http://qdrant:6333
QDRANT_COLLECTION=chunks
OLLAMA_HOST=http://host.docker.internal:11434
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_DIMENSIONS=768
EMBEDDING_CONTEXT_LENGTH=8192
EOF

# 3. 데이터 디렉토리 생성
mkdir -p ./data/qdrant

# 4. Ollama 모델 다운로드
ollama pull nomic-embed-text

# 5. Docker Compose 실행
docker-compose up -d

# 6. 서버 시작 대기
sleep 10

# 7. 시스템 가이드 초기화
docker-compose exec -T spellbook bun run seed

# 8. 상태 확인
curl http://localhost:17950/health

echo "✅ 설치 완료!"
```

---

## 트러블슈팅

### 문제: QDRANT_DATA_PATH 권한 오류

```bash
# 디렉토리 권한 확인
ls -la ${QDRANT_DATA_PATH}

# 권한 부여
chmod 755 ${QDRANT_DATA_PATH}
```

### 문제: Ollama 연결 실패

```bash
# Ollama 상태 확인
curl ${OLLAMA_HOST}/api/tags

# Docker Desktop의 경우 host.docker.internal 사용
OLLAMA_HOST=http://host.docker.internal:11434
```

### 문제: 포트 충돌

```bash
# 다른 포트 사용
PORT=8001
docker-compose down
docker-compose up -d
```

---

## 검증 체크리스트

AI Agent가 설치 후 확인해야 할 항목:

- [ ] `.env` 파일이 존재하고 모든 필수 변수가 설정됨
- [ ] `${QDRANT_DATA_PATH}` 디렉토리가 존재하고 쓰기 가능
- [ ] Ollama가 실행 중이고 연결 가능 (`curl ${OLLAMA_HOST}/api/tags`)
- [ ] `nomic-embed-text` 모델이 다운로드됨 (`ollama list`)
- [ ] Docker 컨테이너가 실행 중 (`docker-compose ps`)
- [ ] MCP 서버가 응답함 (`curl http://localhost:${PORT}/health`)
- [ ] 시스템 가이드가 초기화됨 (VectorDB에 3개 청크 존재)

---

## 빠른 참조

**최소 명령어 (기본값 사용):**

```bash
git clone https://github.com/yourname/spellbook.git
cd spellbook
cp .env.example .env
mkdir -p ./data/qdrant
ollama pull nomic-embed-text
docker-compose up -d
sleep 10
docker-compose exec -T spellbook bun run seed
```

**총 7개 명령어로 완료!**
