# Bun 기반 MCP 서버
FROM oven/bun:1-alpine

WORKDIR /app

# 패키지 파일 복사
COPY package.json bun.lockb* ./

# 의존성 설치
RUN bun install --frozen-lockfile --production

# 소스 코드 복사
COPY src ./src
COPY tsconfig.json ./

# 포트 노출
EXPOSE 8000

# 서버 실행 (TypeScript 직접 실행)
CMD ["bun", "run", "src/index.ts"]
