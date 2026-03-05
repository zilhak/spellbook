# Canon & Lore: 서브컬렉션 설계

## 개요

Spellbook에 **서브컬렉션** 개념을 도입했다.
메인 컬렉션은 **Canon**, 서브컬렉션은 **Lore**라 부른다.

```
Canon = 정전(正典). 핵심 지식. 기본 API가 검색하는 대상.
Lore  = 전승(傳承). 부가 지식. 전용 API로 컬렉션 이름을 지정해 검색.
```

---

## 유비쿼터스 언어

| 용어 | 의미 | 비유 |
|------|------|------|
| **Canon** | 메인 컬렉션. 항상 검색 대상이 되는 핵심 지식 저장소 | 정전 — 공인된 경전 |
| **Lore** | 서브컬렉션. 목적별로 분리된 부가 지식 저장소 | 전승 — 구전되는 이야기들 |
| **Lore Name** | 서브컬렉션의 고유 이름 (예: `"project-alpha"`, `"style-guide"`) | 전승의 이름 |

### 왜 Canon과 Lore인가?

Spellbook(마법서)이라는 프로젝트 세계관과 일관된 네이밍:
- **Spellbook** → 마법서 전체
- **Canon** → 마법서의 정통 기록
- **Lore** → 마법서에 부속된 전승 기록들
- **Scribe** → Canon에 기록하다
- **Chronicle** → Lore에 기록하다
- **Memorize** → Canon에서 기억해내다
- **Recall** → Lore에서 기억해내다
- **Scroll** → 독립 문서 보관

---

## 저장소 구조

Spellbook은 세 종류의 저장소를 제공한다.

```
Qdrant (VectorDB)
├── chunks (벡터 컬렉션) ──────── Canon: 메인 지식
├── metadata (페이로드 컬렉션) ── Canon 카테고리/토픽 + Lore 등록 정보
├── lore_{name} (벡터 컬렉션) ── 각 Lore별 지식 (N개 가능)
└── lore_{name}_metadata ─────── 각 Lore별 메타데이터

SQLite
└── data.db ────────────────── Scroll: 독립 문서 저장 (CRUD 전용)
```

### Lore 등록 정보

별도의 레지스트리 컬렉션 없이, 메인 `metadata` 컬렉션에 `type: 'lore'` 엔트리로 관리한다.

```typescript
interface LoreMetadata {
  type: 'lore';
  name: string;                        // Lore 이름
  description: string;                 // Lore 설명
  collection_name: string;             // Qdrant 벡터 컬렉션명 (lore_{name})
  metadata_collection_name: string;    // Qdrant 메타데이터 컬렉션명 (lore_{name}_metadata)
  created_at: string;
  last_updated: string;
}
```

---

## API 설계

### Canon 도구 (메인 저장소)

| 도구 | 설명 | 비고 |
|------|------|------|
| `memorize` | Canon 의미 기반 검색 (벡터 유사도) | |
| `find` | Canon 키워드 기반 검색 (Full-text) | |
| `scribe` | Canon에 청크 저장 | REST 모드 필수 |
| `erase` | Canon에서 청크 삭제 | |
| `revise` | Canon 청크 수정 | |
| `get_topic` | Canon 특정 토픽 조회 | |
| `get_index` | Canon 메타 목차 | |
| `stats` | Canon 저장소 통계 | |
| `export` | Canon JSON 백업 | |
| `import` | Canon JSON 복원 | |

### Lore 도구 (서브 저장소)

| 도구 | 설명 | 비고 |
|------|------|------|
| `recall` | Lore 의미 기반 검색 | `lore` 파라미터 필수 |
| `recall_find` | Lore 키워드 기반 검색 | `lore` 파라미터 필수 |
| `chronicle` | Lore에 청크 저장 | REST 모드 필수, Lore 미존재 시 자동 생성 |
| `erase_lore` | Lore에서 청크 삭제 | |
| `revise_lore` | Lore 청크 수정 | |

### Lore 관리 도구

| 도구 | 설명 |
|------|------|
| `list_lores` | 모든 Lore 목록 (이름, 설명, 청크 수) |
| `delete_lore` | Lore 삭제 (전체 컬렉션 삭제, 복구 불가) |
| `lore_stats` | 특정 Lore 통계 |
| `update_lore` | Lore 설명 업데이트 |

### Scroll 도구 (독립 문서 저장소)

| 도구 | 설명 | 비고 |
|------|------|------|
| `write_scroll` | 스크롤 저장 | REST 모드 불필요 |
| `read_scroll` | 스크롤 조회 | |
| `modify_scroll` | 스크롤 수정 | |
| `delete_scroll` | 스크롤 삭제 | |
| `get_scroll_index` | 스크롤 인덱스 조회 | |

### 공통 도구

| 도구 | 설명 |
|------|------|
| `rest` | REST 모드 진입, 청킹 가이드 로드 |
| `rest_end` | REST 모드 종료 |
| `filter_guide` | 필터 사용법 가이드 |

---

## API 격리 원칙

```
Canon 전용: memorize, find, scribe, erase, revise, get_topic
Lore 전용:  recall, recall_find, chronicle, erase_lore, revise_lore
Lore 관리:  list_lores, delete_lore, lore_stats, update_lore
Scroll 전용: write_scroll, read_scroll, modify_scroll, delete_scroll, get_scroll_index
공통:       rest, rest_end, get_index, stats, filter_guide, export, import

※ Canon API로 Lore 데이터에 접근 불가. Lore API로 Canon 데이터에 접근 불가.
※ Scroll은 Canon/Lore와 완전히 독립된 SQLite 저장소.
```

---

## 데이터 흐름

### Canon 흐름

```
memorize("Docker 설정")
  → chunks 컬렉션에서 벡터 검색
  → 결과 반환

rest() → session_id
scribe(chunk, session_id)
  → chunks 컬렉션에 저장
  → metadata 업데이트
rest_end(session_id)
```

### Lore 흐름

```
rest() → session_id
chronicle(lore: "project-alpha", chunk, session_id)
  → Lore 존재 확인 (없으면 자동 생성: lore_project-alpha + lore_project-alpha_metadata)
  → metadata 컬렉션에 type:'lore' 엔트리 등록
  → lore_project-alpha 컬렉션에 저장
  → lore_project-alpha_metadata 업데이트
rest_end(session_id)

recall(lore: "project-alpha", query: "API 엔드포인트")
  → lore_project-alpha 컬렉션에서 벡터 검색
  → 결과 반환
```

### Scroll 흐름

```
write_scroll(title, content, category, labels)
  → SQLite에 저장 (REST 모드 불필요)

read_scroll(id 또는 필터)
  → SQLite에서 CRUD 조회
```

---

## 컬렉션 이름 규칙

| 용도 | Qdrant 컬렉션명 | 예시 |
|------|-----------------|------|
| Canon 벡터 | `chunks` | `chunks` |
| Canon 메타데이터 | `metadata` | `metadata` |
| Lore 벡터 | `lore_{name}` | `lore_project-alpha` |
| Lore 메타데이터 | `lore_{name}_metadata` | `lore_project-alpha_metadata` |
| Lore 등록 정보 | `metadata` 내 `type: 'lore'` 포인트 | 포인트 ID: `lore:project-alpha` |

**Lore 이름 규칙:**
- 영문, 숫자, 하이픈(`-`), 언더스코어(`_`)만 허용
- 첫 글자는 영문 또는 숫자
- 최대 64자
- 패턴: `/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/`

---

## 에러 처리

| 상황 | 에러 메시지 |
|------|-------------|
| 존재하지 않는 Lore에 검색 | `Lore를 찾을 수 없습니다: "{name}"` |
| 잘못된 이름 형식 | `유효하지 않은 Lore 이름: "{name}". 영문, 숫자, 하이픈(-), 언더스코어(_)만 사용 가능...` |
| REST 없이 scribe/chronicle | `REST 모드가 아닙니다. rest()를 먼저 호출하세요.` |
| 만료된 REST 세션 | `REST 세션이 만료되었습니다. rest()를 다시 호출하세요.` |

---

## 사용 시나리오

### 시나리오 1: 프로젝트별 지식 분리

```
# REST 모드 진입
rest() → session_id

# 프로젝트 Lore에 저장 (미존재 시 자동 생성)
chronicle(lore: "frontend-app", lore_description: "프론트엔드 앱 관련 지식", chunk, session_id)

rest_end(session_id)

# 프로젝트 지식 검색
recall(lore: "frontend-app", query: "라우팅 설정 방법")

# 범용 지식은 Canon에서
memorize("React best practices")
```

### 시나리오 2: Canon + Lore 동시 저장

한 REST 세션에서 Canon과 Lore 모두에 저장 가능하다.

```
rest() → session_id

scribe(chunk_a, session_id)                              # Canon에 저장
chronicle(lore: "my-project", chunk_b, session_id)       # Lore에 저장

rest_end(session_id)
```

### 시나리오 3: Lore 관리

```
list_lores()                                # 모든 Lore 목록 + 설명 + 청크 수
lore_stats("my-project")                    # 특정 Lore 통계
update_lore(lore: "my-project", description: "설명 변경")
delete_lore("my-project")                   # 전체 삭제 (복구 불가)
```

---

## 하위 호환성

| 항목 | 보장 여부 | 설명 |
|------|-----------|------|
| Canon API 시그니처 | 100% 유지 | 기존 memorize/find/scribe 그대로 |
| Canon 컬렉션명 | `chunks` 유지 | 리네이밍 하지 않음 |
| MCP 클라이언트 설정 | 변경 없음 | 동일 URL/포트 |
| REST 워크플로우 | 동일 | Canon/Lore 모두 동일 패턴 |
