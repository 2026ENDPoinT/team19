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

// 만드는 중인 클립에도 서버가 알려 준 실제 단계만큼 부분 점수를 준다(D-21: 확인 가능한 단계만 쓴다).
const clipStageWeights: Record<string, number> = { queued: 0, starting: 0.1, blueprint: 0.4, audio: 0.8 }
type ClipLike = { status: string; stage?: string | null }
export function clipsDone(clips: ClipLike[]): number {
  return clips.reduce((sum, clip) => sum + (clip.status === 'completed' || clip.status === 'failed' ? 1
    : clip.status === 'running' && clip.stage && Object.hasOwn(clipStageWeights, clip.stage) ? clipStageWeights[clip.stage] : 0), 0)
}
