import { jobStageLabel } from '../services/jobStages'
import type { CSSProperties } from 'react'
import './processing.css'

type Props = { stage?: string | null; message?: string; progress?: { completed: number; total: number } }
export default function ProcessingStatus({ stage, message, progress }: Props) {
  const percent = progress && progress.total > 0 ? Math.min(100, Math.max(0, Math.floor(progress.completed / progress.total * 100))) : null
  return <section className="processing-experience" aria-label="학습 영상 준비">
    <div className="processing-layout">
      <div className="processing-copy" role="status">
        <span className="processing-eyebrow"><span /> LEARNING IN MOTION</span>
        <h2>페이지 속 개념이<br />움직이는 장면으로.</h2>
        <p className="processing-intro">강의자료를 바탕으로 나만의 학습 클립을 준비하고 있어요.</p>
        <div className="processing-current">
          <div role="progressbar" aria-label="클립 생성 완료율" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined} className="processing-spinner">
            <span className="processing-spinner-ring" aria-hidden="true" />
            {percent !== null && <span aria-hidden="true" className="processing-percent">{percent}%</span>}
          </div>
          <div><p className="processing-stage-label">현재 처리 단계</p>
            <p className="processing-stage">{message ?? jobStageLabel(stage)}</p>
            {percent !== null && <p className="processing-completed">전체 {progress!.total}개 중 {progress!.completed}개 클립 완성</p>}
          </div>
        </div>
      </div>
      <div className="processing-artwork" aria-hidden="true">
        <div className="processing-dot-field">{Array.from({ length: 96 }, (_, index) => <i key={index} style={{ '--dot-delay': `${-index * .073}s` } as CSSProperties} />)}</div>
        <div className="processing-orbit processing-orbit--one" />
        <div className="processing-orbit processing-orbit--two" />
        <div className="processing-sheet"><span>PDF</span><i /><i /><i /><i /><div className="processing-scan" /></div>
        <div className="processing-clip"><div className="processing-clip-dots"><i /><i /><i /></div><div className="processing-clip-diagram"><i /><span /><i /></div><div className="processing-play">▶</div><div className="processing-clip-lines"><i /><i /></div></div>
        <span className="processing-art-label">FROM NOTES TO KNOWLEDGE</span>
      </div>
    </div>
    <aside className="processing-tip" aria-label="학습 팁"><span className="processing-tip-icon" aria-hidden="true">✦</span><div><p>잠깐의 학습 팁</p><span>클립을 본 뒤 핵심 개념을 한 문장으로 설명해 보세요.</span></div></aside>
  </section>
}
