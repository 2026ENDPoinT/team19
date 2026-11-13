// API 모드 값과 현재 화면 문구. 이름 변경은 팀 합의 후 반영한다.
export const learningModes = [
  { id: 'intro', name: '처음 보기', description: '큰 흐름과 직관을 중심으로 이해해요.' },
  { id: 'review', name: '복습', description: '개념과 예시를 하나씩 다시 살펴봐요.' },
  { id: 'exam', name: '시험 대비', description: '세부 조건과 헷갈리는 부분까지 확인해요.' },
] as const

export type LearningMode = (typeof learningModes)[number]['id']
