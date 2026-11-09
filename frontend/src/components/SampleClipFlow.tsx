import { useEffect, useState } from 'react'
import type { LearningMode } from '../data/learningModes'
import { readOutlineSample, readSample } from '../services/sampleApi'
import type { SampleJob, SampleOutline, SampleClip } from '../services/sampleApi'

type Props = { mode: LearningMode; onBack: () => void }
const labels: Record<SampleClip['status'], string> = {
  pending: '대기', running: '생성 중', completed: '준비 완료', failed: '실패',
}

export default function SampleClipFlow({ mode, onBack }: Props) {
  const [job, setJob] = useState<SampleJob | null>(null)
  const [outline, setOutline] = useState<SampleOutline | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [simulateFailure, setSimulateFailure] = useState(false)

  useEffect(() => {
    setOutline(null)
    setError('')
    setJob(null)
    function update(name: string) {
      try { setJob(readSample<SampleJob>(name)) }
      catch (cause) { setError(cause instanceof Error ? cause.message : '샘플을 읽지 못했어요.') }
    }
    update(`outline.${mode}.pending`)
    const runningTimer = window.setTimeout(() => update(`outline.${mode}.running`), 700)
    const completeTimer = window.setTimeout(() => {
      try {
        if (simulateFailure) {
          setJob(readSample<SampleJob>('prepare.failed'))
          return
        }
        setJob(readSample<SampleJob>(`outline.${mode}.completed`))
        setOutline(readOutlineSample(mode))
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '샘플을 읽지 못했어요.')
      }
    }, 1600)
    return () => { window.clearTimeout(runningTimer); window.clearTimeout(completeTimer) }
  }, [mode, attempt, simulateFailure])

  function previewMixedStates() {
    setOutline(readSample<SampleOutline>('outline.review.mixed'))
  }

  return (
    <section className="sample-flow" aria-labelledby="sample-title">
      <button className="secondary-button" type="button" onClick={onBack}>← 모드 선택으로 돌아가기</button>
      <p className="sample-notice">개발용 샘플 · 선택한 PDF는 업로드·분석하지 않습니다. 아래 내용은 백엔드의 고정 예시입니다.</p>
      <h1 id="sample-title">{outline ? '학습 클립 목록' : '학습 클립 구성 샘플'}</h1>
      <div className="sample-controls">
        <label><input type="checkbox" checked={simulateFailure} onChange={(event) => setSimulateFailure(event.target.checked)} /> PDF 분석 실패 예시 보기</label>
        <p>대기 시간은 화면 확인용 연출이며 실제 생성 시간이 아닙니다.</p>
      </div>
      {error ? <p role="alert">{error}</p> : job?.status === 'failed' ? (
        <div className="upload-error" role="alert">
          <p>{job.error?.message ?? '테스트용 실패 상태입니다.'}</p>
          <p>PDF 분석 실패 응답을 독립적인 오류 화면 예시로 표시하고 있어요.</p>
          <button className="secondary-button" type="button" onClick={() => setAttempt((value) => value + 1)}>실패 샘플 다시 보기</button>
          <p>정상 흐름은 위 체크를 해제하면 확인할 수 있어요.</p>
        </div>
      ) : !outline ? <p role="status">{job?.status === 'running' ? '샘플 강의의 클립 구성을 확인하고 있어요…' : '샘플 작업이 대기 중이에요…'}</p> : (
        <>
          <p>샘플 모드: {outline.mode} · {outline.clips.length}개 클립</p>
          <div className="sample-controls">
            <button className="secondary-button" type="button" onClick={previewMixedStates}>복습 모드의 혼합 상태 예시 보기</button>
            <p>별도의 고정 스냅샷입니다. 실제 생성 진행이나 선택 모드의 후속 결과가 아닙니다.</p>
          </div>
          <ol className="clip-list">
            {[...outline.clips].sort((a, b) => a.order - b.order).map((clip) => (
              <li className="clip-card" key={clip.id}>
                <span className={`clip-status clip-status--${clip.status}`}>{clip.status === 'pending' && !clip.jobId ? '생성 미등록' : labels[clip.status]}</span>
                <h2>{clip.order + 1}. {clip.title}</h2>
                <p>참고 페이지: {clip.sourcePages.join(', ')}쪽</p>
                {clip.error && <p className="clip-error">{clip.error.message}</p>}
                {clip.status === 'failed' && <p>클립 재시도 연결 예정</p>}
                {clip.status === 'completed' && <p>플레이어 연결 예정</p>}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  )
}
