/**
 * 시스템 가이드 데이터
 *
 * VectorDB에 seed되는 시스템 카테고리 청크들.
 * Agent가 scribe 전에 참고할 가이드라인.
 */

export interface SystemGuide {
  id: string;
  topic: string;
  text: string;
  category: string;
  keywords: string[];
  questions: string[];
  entities: { name: string; type: 'concept' | 'technology' }[];
  importance: 'high' | 'medium' | 'low';
}

export const SYSTEM_GUIDES: SystemGuide[] = [
  {
    id: 'system-chunking-guide',
    topic: 'chunking-guide',
    text: `# 청킹 가이드 (Chunking Guide)

청크는 의미적으로 완결된 단위여야 합니다.

## 청킹 원칙

1. **의미 완결성**: 하나의 청크는 독립적으로 이해 가능해야 함
2. **적절한 크기**: 100-500 토큰 권장 (너무 작으면 맥락 부족, 너무 크면 검색 정확도 저하)
3. **중복 최소화**: 이미 저장된 정보와 중복 피하기
4. **메타데이터 풍부성**: 검색 효율을 위해 키워드, 질문, 엔티티 포함

## 청크 분할 기준

- 주제가 바뀌면 새 청크
- 맥락이 달라지면 새 청크
- 참조 관계가 복잡하면 분리

## 좋은 청크 예시

"프로젝트 X의 인증 시스템은 JWT를 사용하며, 토큰 만료 시간은 1시간이다.
리프레시 토큰은 7일 유효하며, httpOnly 쿠키에 저장된다."

## 나쁜 청크 예시

"인증. JWT 사용함." (너무 짧음, 맥락 부족)`,
    category: 'system',
    keywords: ['청킹', 'chunking', '분할', '가이드', '원칙'],
    questions: [
      '청크를 어떻게 분할해야 하나요?',
      '적절한 청크 크기는 얼마인가요?',
      '청킹 원칙은 무엇인가요?',
    ],
    entities: [
      { name: '청킹', type: 'concept' },
      { name: 'VectorDB', type: 'technology' },
    ],
    importance: 'high',
  },
  {
    id: 'system-metadata-rules',
    topic: 'metadata-rules',
    text: `# 메타데이터 규칙 (Metadata Rules)

청크 저장 시 메타데이터를 올바르게 작성해야 검색 효율이 높아집니다.

## 필수 필드

- **topic_id**: 청크가 속한 주제 식별자
- **category**: 분류 (project, preference, knowledge, decision, system)
- **keywords**: 검색용 키워드 (3-7개 권장)
- **questions**: 이 청크가 답할 수 있는 질문들 (2-5개 권장)
- **importance**: 중요도 (high, medium, low)

## 키워드 작성 가이드

- 구체적인 기술명, 프로젝트명 포함
- 동의어/유사어 포함 (예: "인증", "authentication", "auth")
- 일반적 용어와 구체적 용어 혼합

## 질문 작성 가이드

- 사용자가 실제로 물어볼 법한 질문
- 다양한 표현 방식 포함
- "어떻게", "무엇을", "왜" 등 다양한 의문사 사용

## 엔티티 추출 가이드

- 사람: 팀원, 담당자 이름
- 프로젝트: 프로젝트명, 코드네임
- 기술: 프레임워크, 라이브러리, 서비스명
- 조직: 회사, 팀, 부서명
- 개념: 중요 개념, 패턴명`,
    category: 'system',
    keywords: ['메타데이터', 'metadata', '키워드', '질문', '엔티티'],
    questions: [
      '메타데이터를 어떻게 작성해야 하나요?',
      '키워드는 몇 개가 적당한가요?',
      '어떤 질문을 포함해야 하나요?',
    ],
    entities: [
      { name: '메타데이터', type: 'concept' },
      { name: '키워드', type: 'concept' },
    ],
    importance: 'high',
  },
  {
    id: 'system-category-guide',
    topic: 'category-guide',
    text: `# 카테고리 가이드 (Category Guide)

청크를 적절한 카테고리로 분류하면 필터링과 검색이 효율적입니다.

## 표준 카테고리

### system
시스템 가이드, 규칙, 설정 관련 정보
예: 청킹 가이드, 메타데이터 규칙

### project
프로젝트 관련 정보
예: 아키텍처 결정, 기술 스택, 요구사항

### preference
사용자 선호도, 스타일 가이드
예: 코딩 컨벤션, 커밋 메시지 스타일

### knowledge
기술 지식, 레퍼런스
예: 라이브러리 사용법, 패턴 설명

### decision
결정 사항과 그 이유
예: 기술 선택 이유, 설계 결정

## 카테고리 선택 기준

1. 정보의 성격을 파악
2. 재사용 가능성 고려
3. 검색 시나리오 상상`,
    category: 'system',
    keywords: ['카테고리', 'category', '분류', '태그'],
    questions: [
      '어떤 카테고리를 사용해야 하나요?',
      '카테고리 종류는 무엇인가요?',
      '카테고리는 어떻게 선택하나요?',
    ],
    entities: [{ name: '카테고리', type: 'concept' }],
    importance: 'medium',
  },
  {
    id: 'system-importance-guide',
    topic: 'importance-guide',
    text: `# 중요도 가이드 (Importance Guide)

중요도는 검색 결과 순위와 정보 관리에 영향을 줍니다.

## 중요도 수준

### high (높음)
- 핵심 아키텍처 결정
- 중요한 비즈니스 규칙
- 보안 관련 정보
- 자주 참조되는 정보

### medium (보통)
- 일반적인 프로젝트 정보
- 구현 세부사항
- 설정 값

### low (낮음)
- 임시 정보
- 실험적 내용
- 곧 변경될 수 있는 정보

## 중요도 선택 기준

1. 얼마나 자주 참조되나?
2. 잘못된 정보일 경우 영향은?
3. 시간이 지나도 유효한가?`,
    category: 'system',
    keywords: ['중요도', 'importance', '우선순위', 'priority'],
    questions: [
      '중요도는 어떻게 설정하나요?',
      'high 중요도는 언제 사용하나요?',
      '중요도가 검색에 영향을 주나요?',
    ],
    entities: [{ name: '중요도', type: 'concept' }],
    importance: 'medium',
  },
];
