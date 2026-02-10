# Bun 기반 MCP 서버
FROM oven/bun:1-alpine

WORKDIR /app

# 패키지 파일 복사
COPY package.json bun.lock* ./

# 의존성 설치
RUN bun install --frozen-lockfile --production

# 소스 코드 복사
COPY src ./src
COPY tsconfig.json ./

# 엔트리포인트 스크립트 복사
COPY docker-entrypoint.sh ./

# 포트 노출
EXPOSE 17950

# 엔트리포인트로 실행
ENTRYPOINT ["./docker-entrypoint.sh"]
