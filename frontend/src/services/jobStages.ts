const stageLabels: Record<string, string> = {
  queued: '작업 순서를 기다리는 중', starting: '작업을 시작하는 중',
  extracting: 'PDF 내용을 읽는 중', describing: '페이지 정보를 정리하는 중',
  planning: '학습 클립을 구성하는 중', blueprint: '시각화를 구성하는 중',
  audio: '음성과 자막을 준비하는 중', finished: '작업 완료',
  failed: '작업 실패', interrupted: '서버 재시작으로 작업이 중단됐어요',
}
export function jobStageLabel(stage: string | null | undefined): string {
  return stage && Object.hasOwn(stageLabels, stage) ? stageLabels[stage] : '서버에서 처리 상태를 확인하는 중'
}
