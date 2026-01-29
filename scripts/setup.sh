#!/bin/bash
# Spellbook 대화형 설치 스크립트

set -e

echo "🔮 Spellbook 설치 마법사"
echo "=========================="
echo ""

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 유효성 검사 함수
validate_path() {
    local path="$1"

    # 빈 문자열 체크
    if [ -z "$path" ]; then
        return 1
    fi

    # 상대 경로 처리
    if [[ "$path" == ./* ]]; then
        return 0
    fi

    # 절대 경로 체크 (Unix/Linux/Mac)
    if [[ "$path" == /* ]]; then
        return 0
    fi

    # Windows 경로 체크 (C:/, D:/ 등)
    if [[ "$path" =~ ^[A-Za-z]:/ ]]; then
        return 0
    fi

    return 1
}

validate_url() {
    local url="$1"

    # URL 형식 체크
    if [[ "$url" =~ ^https?://[a-zA-Z0-9.-]+(:[0-9]+)?$ ]]; then
        return 0
    fi

    return 1
}

validate_port() {
    local port="$1"

    # 숫자 체크
    if ! [[ "$port" =~ ^[0-9]+$ ]]; then
        return 1
    fi

    # 범위 체크 (1-65535)
    if [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
        return 1
    fi

    return 0
}

# .env 파일 생성
create_env_file() {
    cat > .env << EOF
# 서버 설정
PORT=$PORT
HOST=$HOST

# Qdrant 설정
QDRANT_URL=$QDRANT_URL
QDRANT_COLLECTION=$QDRANT_COLLECTION

# 데이터 저장 경로
QDRANT_DATA_PATH=$QDRANT_DATA_PATH

# Ollama 설정
OLLAMA_HOST=$OLLAMA_HOST
EMBEDDING_MODEL=$EMBEDDING_MODEL
EMBEDDING_DIMENSIONS=$EMBEDDING_DIMENSIONS
EMBEDDING_CONTEXT_LENGTH=$EMBEDDING_CONTEXT_LENGTH
EOF
}

# 1. 데이터 저장 경로 설정
echo -e "${BLUE}📁 데이터 저장 경로 설정${NC}"
echo "VectorDB 데이터를 저장할 경로를 지정하세요."
echo ""
echo "예시:"
echo "  - 상대 경로: ./data/qdrant"
echo "  - 절대 경로 (Linux/Mac): /home/user/spellbook-data"
echo "  - 절대 경로 (Windows): E:/spellbook-data"
echo ""

while true; do
    read -p "데이터 저장 경로 [기본값: ./data/qdrant]: " QDRANT_DATA_PATH
    QDRANT_DATA_PATH=${QDRANT_DATA_PATH:-./data/qdrant}

    if validate_path "$QDRANT_DATA_PATH"; then
        echo -e "${GREEN}✓ 유효한 경로입니다: $QDRANT_DATA_PATH${NC}"

        # 디렉토리 생성 확인
        read -p "이 경로에 디렉토리를 생성하시겠습니까? (y/n) [y]: " CREATE_DIR
        CREATE_DIR=${CREATE_DIR:-y}

        if [[ "$CREATE_DIR" =~ ^[Yy]$ ]]; then
            mkdir -p "$QDRANT_DATA_PATH" 2>/dev/null || {
                echo -e "${YELLOW}⚠ 디렉토리 생성 실패 (권한 문제일 수 있습니다)${NC}"
                echo "나중에 수동으로 생성해주세요: mkdir -p $QDRANT_DATA_PATH"
            }
            if [ -d "$QDRANT_DATA_PATH" ]; then
                echo -e "${GREEN}✓ 디렉토리 생성 완료${NC}"
            fi
        fi
        break
    else
        echo -e "${RED}✗ 유효하지 않은 경로입니다. 다시 입력해주세요.${NC}"
    fi
done
echo ""

# 2. 서버 포트 설정
echo -e "${BLUE}🌐 서버 설정${NC}"
while true; do
    read -p "MCP 서버 포트 [기본값: 8000]: " PORT
    PORT=${PORT:-8000}

    if validate_port "$PORT"; then
        echo -e "${GREEN}✓ 유효한 포트입니다: $PORT${NC}"
        break
    else
        echo -e "${RED}✗ 유효하지 않은 포트입니다 (1-65535 범위).${NC}"
    fi
done

read -p "서버 호스트 [기본값: 0.0.0.0]: " HOST
HOST=${HOST:-0.0.0.0}
echo ""

# 3. Ollama 설정
echo -e "${BLUE}🧠 Ollama 설정${NC}"
while true; do
    read -p "Ollama 호스트 URL [기본값: http://localhost:11434]: " OLLAMA_HOST
    OLLAMA_HOST=${OLLAMA_HOST:-http://localhost:11434}

    if validate_url "$OLLAMA_HOST"; then
        echo -e "${GREEN}✓ 유효한 URL입니다: $OLLAMA_HOST${NC}"

        # Ollama 연결 테스트 (선택)
        if command -v curl &> /dev/null; then
            echo "Ollama 연결 테스트 중..."
            if curl -s -f "$OLLAMA_HOST/api/tags" > /dev/null 2>&1; then
                echo -e "${GREEN}✓ Ollama 연결 성공${NC}"
            else
                echo -e "${YELLOW}⚠ Ollama에 연결할 수 없습니다. 나중에 확인해주세요.${NC}"
            fi
        fi
        break
    else
        echo -e "${RED}✗ 유효하지 않은 URL입니다.${NC}"
        echo "형식: http://hostname:port 또는 https://hostname:port"
    fi
done

read -p "임베딩 모델 [기본값: nomic-embed-text]: " EMBEDDING_MODEL
EMBEDDING_MODEL=${EMBEDDING_MODEL:-nomic-embed-text}
echo ""

# 4. Qdrant 설정
echo -e "${BLUE}🗄️  Qdrant 설정${NC}"
QDRANT_URL="http://qdrant:6333"  # Docker Compose 내부 URL (고정)
echo "Qdrant URL: $QDRANT_URL (Docker 내부)"

read -p "컬렉션 이름 [기본값: chunks]: " QDRANT_COLLECTION
QDRANT_COLLECTION=${QDRANT_COLLECTION:-chunks}

EMBEDDING_DIMENSIONS=768
EMBEDDING_CONTEXT_LENGTH=8192
echo ""

# 5. 설정 요약
echo -e "${YELLOW}📋 설정 요약${NC}"
echo "================================"
echo "데이터 경로: $QDRANT_DATA_PATH"
echo "서버 포트: $PORT"
echo "서버 호스트: $HOST"
echo "Ollama: $OLLAMA_HOST"
echo "임베딩 모델: $EMBEDDING_MODEL"
echo "컬렉션: $QDRANT_COLLECTION"
echo "================================"
echo ""

read -p "이 설정으로 .env 파일을 생성하시겠습니까? (y/n) [y]: " CONFIRM
CONFIRM=${CONFIRM:-y}

if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
    create_env_file
    echo -e "${GREEN}✓ .env 파일이 생성되었습니다!${NC}"
    echo ""

    # 6. 다음 단계 안내
    echo -e "${BLUE}🚀 다음 단계${NC}"
    echo "================================"
    echo "1. Ollama 모델 다운로드:"
    echo "   ollama pull $EMBEDDING_MODEL"
    echo ""
    echo "2. Docker Compose 실행:"
    echo "   docker-compose up -d"
    echo ""
    echo "3. 시스템 가이드 초기화:"
    echo "   docker-compose exec spellbook pnpm run seed"
    echo ""
    echo "4. Claude Code MCP 설정:"
    echo "   ~/.claude/mcp.json에 다음 추가:"
    echo '   {
     "mcpServers": {
       "spellbook": {
         "url": "http://localhost:'$PORT'"
       }
     }
   }'
    echo "================================"
else
    echo -e "${YELLOW}설정이 취소되었습니다.${NC}"
    exit 0
fi

echo ""
echo -e "${GREEN}✨ 설치 마법사가 완료되었습니다!${NC}"
