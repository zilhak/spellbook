/**
 * 필터 변환 유틸리티
 *
 * 단순 필터 형식 → Qdrant 필터 형식 자동 변환
 * 가이드 문서 제공
 */

/**
 * Qdrant 필터 형식
 */
export interface QdrantFilter {
  must?: QdrantCondition[];
  should?: QdrantCondition[];
  must_not?: QdrantCondition[];
}

export interface QdrantCondition {
  key: string;
  match?: { value?: any; any?: any[] };
  range?: { gt?: number; gte?: number; lt?: number; lte?: number };
}

/**
 * 단순 필터 형식인지 확인
 * - Qdrant 형식: { must: [...] } 또는 { should: [...] }
 * - 단순 형식: { category: "system", importance: "high" }
 */
function isSimpleFilter(filter: Record<string, any>): boolean {
  const qdrantKeys = ['must', 'should', 'must_not'];
  return !Object.keys(filter).some(key => qdrantKeys.includes(key));
}

/**
 * 단순 필터 → Qdrant 필터 변환
 *
 * 변환 규칙:
 * - 문자열 값: { key: "field", match: { value: "값" } }
 * - 배열 값: { key: "field", match: { any: ["값1", "값2"] } }
 * - 숫자 값: { key: "field", match: { value: 숫자 } }
 *
 * 예시:
 * - { category: "system" }
 *   → { must: [{ key: "category", match: { value: "system" } }] }
 *
 * - { category: "system", importance: "high" }
 *   → { must: [
 *        { key: "category", match: { value: "system" } },
 *        { key: "importance", match: { value: "high" } }
 *      ] }
 *
 * - { keywords: ["Docker", "MCP"] }
 *   → { must: [{ key: "keywords", match: { any: ["Docker", "MCP"] } }] }
 */
export function convertToQdrantFilter(
  filter: Record<string, any>
): QdrantFilter | undefined {
  if (!filter || Object.keys(filter).length === 0) {
    return undefined;
  }

  // 이미 Qdrant 형식이면 그대로 반환
  if (!isSimpleFilter(filter)) {
    return filter as QdrantFilter;
  }

  // 단순 형식 → Qdrant 형식 변환
  const conditions: QdrantCondition[] = [];

  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      // 배열: any 매칭
      conditions.push({
        key,
        match: { any: value },
      });
    } else if (typeof value === 'object' && value !== null) {
      // 중첩 객체: range 등 지원
      if ('gt' in value || 'gte' in value || 'lt' in value || 'lte' in value) {
        conditions.push({
          key,
          range: value,
        });
      } else {
        // 기타 객체는 값으로 취급
        conditions.push({
          key,
          match: { value },
        });
      }
    } else {
      // 문자열, 숫자, 불린: 정확한 매칭
      conditions.push({
        key,
        match: { value },
      });
    }
  }

  return conditions.length > 0 ? { must: conditions } : undefined;
}

/**
 * 필터 가이드 문서 반환
 */
export function getFilterGuide(): string {
  return `
# Spellbook 필터 가이드

## 단순 필터 형식 (권장)

일반적인 key-value 형태로 필터를 지정하면 자동으로 Qdrant 형식으로 변환됩니다.

### 기본 사용법

| 필터 형식 | 의미 |
|-----------|------|
| \`{ "category": "system" }\` | category가 "system"인 것 |
| \`{ "importance": "high" }\` | importance가 "high"인 것 |
| \`{ "category": "system", "importance": "high" }\` | 둘 다 만족 (AND) |

### 배열 값 (OR 매칭)

| 필터 형식 | 의미 |
|-----------|------|
| \`{ "keywords": ["Docker", "MCP"] }\` | keywords에 "Docker" 또는 "MCP" 포함 |
| \`{ "category": ["system", "project"] }\` | category가 "system" 또는 "project" |

### 필터 가능한 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| \`category\` | string | 카테고리 (system, project, preference 등) |
| \`topic_id\` | string | 토픽 ID |
| \`importance\` | string | 중요도 (high, medium, low) |
| \`keywords\` | string[] | 키워드 배열 |
| \`entities.type\` | string | 엔티티 타입 (person, project, technology 등) |

## 고급: Qdrant 네이티브 형식

복잡한 쿼리가 필요하면 Qdrant 형식을 직접 사용할 수 있습니다.

\`\`\`json
{
  "must": [
    { "key": "category", "match": { "value": "system" } }
  ],
  "should": [
    { "key": "importance", "match": { "value": "high" } },
    { "key": "importance", "match": { "value": "medium" } }
  ]
}
\`\`\`

- \`must\`: 모든 조건 만족 (AND)
- \`should\`: 하나 이상 만족 (OR)
- \`must_not\`: 조건 제외 (NOT)

## 예시

### Canon 검색 (메인 저장소)

#### memorize (의미 기반 검색)
\`\`\`
memorize(query: "Docker 설정", filter: { "category": "system" })
\`\`\`

#### find (키워드 기반 검색)
\`\`\`
find(keywords: ["Docker"], filter: { "importance": "high" })
\`\`\`

### Lore 검색 (서브 저장소)

#### recall (의미 기반 검색)
\`\`\`
recall(lore: "my-project", query: "인증 방식", filter: { "category": "architecture" })
\`\`\`

#### recall_find (키워드 기반 검색)
\`\`\`
recall_find(lore: "my-project", keywords: ["JWT"], filter: { "importance": "high" })
\`\`\`

※ Canon API(memorize, find)로는 Lore 데이터에 접근할 수 없고, Lore API(recall, recall_find)로는 Canon 데이터에 접근할 수 없습니다.
`.trim();
}

/**
 * 필터 에러 메시지 생성 (가이드 참조 포함)
 */
export function createFilterErrorMessage(error: string): string {
  return `${error}

---
필터 형식이 올바른지 확인하세요.
'filter_guide' 도구를 호출하면 필터 사용법을 확인할 수 있습니다.`;
}
