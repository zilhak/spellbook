#!/bin/bash
# Spellbook 설치 스크립트
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "🔮 Spellbook Setup"
echo "==================="
echo ""

# 1. Docker 확인
if ! command -v docker &> /dev/null; then
  echo -e "${RED}✗ Docker가 설치되어 있지 않습니다.${NC}"
  echo "  https://docs.docker.com/get-docker/"
  exit 1
fi
echo -e "${GREEN}✓${NC} Docker"

if ! docker compose version &> /dev/null; then
  echo -e "${RED}✗ Docker Compose가 설치되어 있지 않습니다.${NC}"
  exit 1
fi
echo -e "${GREEN}✓${NC} Docker Compose"

# 2. Ollama 확인 + 모델 다운로드
if ! command -v ollama &> /dev/null; then
  echo -e "${RED}✗ Ollama가 설치되어 있지 않습니다.${NC}"
  echo "  https://ollama.com"
  exit 1
fi
echo -e "${GREEN}✓${NC} Ollama"

echo ""
echo "임베딩 모델 다운로드 중..."
ollama pull nomic-embed-text
echo -e "${GREEN}✓${NC} nomic-embed-text 모델 준비 완료"

# 3. Docker 이미지 빌드
echo ""
echo "Docker 이미지 빌드 중..."
docker compose build
echo -e "${GREEN}✓${NC} 이미지 빌드 완료"

# 4. 완료
echo ""
echo "==================="
echo -e "${GREEN}✓ 설치 완료!${NC}"
echo ""
echo "실행:"
echo "  docker compose up -d"
echo ""
echo "Claude Code 연결:"
echo "  claude mcp add --transport http spellbook http://localhost:17950/mcp"
