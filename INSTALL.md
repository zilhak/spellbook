# Spellbook 설치 가이드 (사람용) 👤

> **💡 빠른 설치**: 대화형 설치 스크립트를 사용하세요!

## 🚀 추천: 대화형 설치 스크립트

설치 스크립트가 자동으로:
- ✅ 데이터 경로 유효성 검증
- ✅ Ollama URL 연결 테스트
- ✅ 포트 번호 검증
- ✅ .env 파일 자동 생성
- ✅ 다음 단계 안내

### Linux/Mac

```bash
# 저장소 클론
git clone https://github.com/yourname/spellbook.git
cd spellbook

# 설치 스크립트 실행
chmod +x scripts/setup.sh
./scripts/setup.sh
```

### Windows (PowerShell)

```powershell
# 저장소 클론
git clone https://github.com/yourname/spellbook.git
cd spellbook

# 설치 스크립트 실행
.\scripts\setup.ps1
```

설치 스크립트가 대화형으로 안내합니다!

---

## 📖 수동 설치 (Docker Compose)

### 1. 저장소 클론

```bash
git clone https://github.com/yourname/spellbook.git
cd spellbook
```

### 2. 환경 설정

```bash
# .env 파일 생성
cp .env.example .env
```

### 3. 데이터 경로 설정 ⚠️ 중요!

`.env` 파일을 열어서 데이터 저장 경로를 지정하세요:

```bash
nano .env
```

**필수 설정**:
```bash
# 데이터를 저장할 경로 (절대 경로 권장)
QDRANT_DATA_PATH=/path/to/your/data

# 예시:
# Windows:
QDRANT_DATA_PATH=E:/spellbook-data

# Linux/Mac:
QDRANT_DATA_PATH=/home/user/spellbook-data

# 상대 경로 (프로젝트 폴더 기준):
QDRANT_DATA_PATH=./data/qdrant
```

### 4. 데이터 디렉토리 생성

```bash
# 지정한 경로에 디렉토리 생성
mkdir -p /path/to/your/data

# 예시 (절대 경로):
mkdir -p /home/user/spellbook-data

# 예시 (상대 경로):
mkdir -p ./data/qdrant
```

### 5. Ollama 설치 및 모델 다운로드

```bash
# Ollama 설치 (https://ollama.com/download)

# 임베딩 모델 다운로드
ollama pull nomic-embed-text
```

### 6. 실행

```bash
# Docker Compose 시작
docker-compose up -d

# 로그 확인
docker-compose logs -f
```

### 7. 시스템 가이드 초기화

```bash
# 최초 1회만 실행
docker-compose exec spellbook pnpm run seed
```

### 8. 확인

```bash
# 서버 상태 확인
curl http://localhost:8000/health

# 데이터 저장 확인
ls -la /path/to/your/data
```

## 설치 완료!

이제 Claude Code에서 MCP 설정을 추가하세요:

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

---

## 트러블슈팅

### 문제: 데이터 경로 권한 오류

```bash
# 권한 확인
ls -la /path/to/your/data

# 권한 부여 (Linux/Mac)
chmod 755 /path/to/your/data
```

### 문제: Ollama 연결 실패

```bash
# Ollama 상태 확인
curl http://localhost:11434/api/tags

# Ollama 재시작
# (OS별로 다름)
```

### 문제: 포트 충돌

`.env` 파일에서 포트 변경:
```bash
PORT=8001  # 다른 포트로 변경
```

```bash
# 재시작
docker-compose down
docker-compose up -d
```

---

## 데이터 위치 변경

나중에 데이터 경로를 변경하려면:

```bash
# 1. 서버 중지
docker-compose down

# 2. 데이터 이동
mv /old/path /new/path

# 3. .env 파일 수정
QDRANT_DATA_PATH=/new/path

# 4. 재시작
docker-compose up -d
```

---

## 언인스톨

```bash
# 1. 컨테이너 중지 및 삭제
docker-compose down

# 2. 데이터 삭제 (선택)
rm -rf /path/to/your/data

# 3. 프로젝트 폴더 삭제
cd ..
rm -rf spellbook
```
