import rawFixtures from '../../../sandbox/be/fe-fixtures/cases.json?raw'
import type { LearningMode } from '../data/learningModes'

type ApiError = { code: string; message: string; retryable: boolean }
export type SampleClip = {
  id: string; title: string; order: number; sourcePages: number[]
  status: 'pending' | 'running' | 'completed' | 'failed'
  jobId: string | null; error: ApiError | null
}
export type SampleOutline = { id: string; mode: string; status: string; clips: SampleClip[] }
export type SampleJob = { id: string; status: string; stage: string; error: ApiError | null }
type Fixture = { name: string; response: { status: number; body: unknown } }
const fixtures = JSON.parse(rawFixtures) as { cases: Fixture[] }

// 개발용 공급 함수: 실제 HTTP 요청은 보내지 않는다.
export function readSample<T>(name: string): T {
  const sample = fixtures.cases.find((item) => item.name === name)
  if (!sample) throw new Error(`샘플을 찾을 수 없습니다: ${name}`)
  if (sample.response.status >= 400) throw new Error('샘플 응답 오류')
  return structuredClone(sample.response.body) as T
}

export function readOutlineSample(mode: LearningMode): SampleOutline {
  return readSample<SampleOutline>(mode === 'review' ? 'outline.review.A.registered' : `outline.${mode}.ready`)
}
