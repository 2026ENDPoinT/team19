// API 모드 값은 그대로 두고 화면 이름·설명만 바꾼다(D-57, P-AI-10).
export const learningModes = [
  { id: 'intro', name: '입문', description: '처음 보는 사람도 한눈에, 짧고 쉽게' },
  { id: 'review', name: '기본', description: '핵심 개념과 대표 예시' },
  { id: 'exam', name: '심화', description: '강의 내용을 빠짐없이' },
] as const

export type LearningMode = (typeof learningModes)[number]['id']
