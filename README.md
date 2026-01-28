# Spellbook

AI 에이전트 개인화 과정에서 축적되는 md 문서들을 보관하고 검색하는 MCP 서버.

## 개요

점점 늘어나는 CLAUDE.md, 설정 문서, 결정 기록들을 VectorDB에 저장하고 의미 기반으로 검색한다.

- **Scribe**: 정보를 저장
- **Memorize**: 정보를 검색

**Spellbook은 저장/검색만 제공한다.** 무엇을 저장하고 언제 검색할지는 별도 지침으로 정의해야 한다.

## 기술 스택

- MCP (HTTP/SSE)
- Qdrant (embedded)
- Docker

## 사용법

```bash
docker run -d \
  --name spellbook \
  -p 8000:8000 \
  -v ~/.claude/spellbook-data:/data \
  spellbook:latest
```

```json
// ~/.claude/mcp.json
{
  "mcpServers": {
    "spellbook": {
      "url": "http://localhost:8000"
    }
  }
}
```

## 상세 문서

[CLAUDE.md](./CLAUDE.md) 참조
