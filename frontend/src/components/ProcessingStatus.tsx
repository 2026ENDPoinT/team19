import { jobStageLabel } from '../services/jobStages'
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import './processing.css'
import DotField from './DotField'

// 기다리는 동안 보여 줄 일반 학습 팁(강의 내용 분석 결과가 아니다). 7초마다 바뀐다.
const STUDY_TIPS = [
  '클립을 본 뒤 핵심 개념을 한 문장으로 설명해 보세요.',
  '처음 보는 용어는 예시 하나와 함께 기억하면 오래 남아요.',
  '짧게 여러 번 보는 것이 한 번 길게 보는 것보다 기억에 좋아요.',
  '다음 개념으로 넘어가기 전에 앞 개념과 어떻게 이어지는지 떠올려 보세요.',
  '헷갈리는 부분은 원본 페이지를 함께 열어 비교해 보세요.',
  '친구에게 설명한다고 생각하면 모르는 부분이 바로 보여요.',
]

// 글자가 흐릿한 상태에서 하나씩 또렷하게 떠오른다. loop면 잠시 머문 뒤 사라지고 다시 나타난다.
function RevealText({ text, step, loop = false }: { text: string; step: number; loop?: boolean }) {
  const chars = Array.from(text)
  return <span aria-hidden="true" className={loop ? 'reveal-text reveal-text--loop' : 'reveal-text'}>{chars.map((char, index) =>
    <span key={index} style={{ animationDelay: `${index * step}s` } as CSSProperties}>{char === ' ' ? ' ' : char}</span>)}</span>
}

type Props = { stage?: string | null; message?: string; progress?: { completed: number; total: number } }
export default function ProcessingStatus({ stage, message, progress }: Props) {
  const [tip, setTip] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTip((index) => (index + 1) % STUDY_TIPS.length), 7000)
    return () => clearInterval(timer)
  }, [])
  const percent = progress && progress.total > 0 ? Math.min(100, Math.max(0, Math.floor(progress.completed / progress.total * 100))) : null
  return <section className="processing-experience" aria-label="학습 영상 준비">
    <div className="processing-layout">
      <div className="processing-copy" role="status">
        <span className="processing-eyebrow"><span /> LEARNING IN MOTION</span>
        <h2 className="processing-brand" aria-label="EIDOS"><RevealText text="EIDOS" step={0.32} loop /></h2>
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
        <DotField className="dot-field--art" spacing={18} radius={90} />
        <div className="processing-orbit processing-orbit--one" />
        <div className="processing-orbit processing-orbit--two" />
        <div className="processing-sheet"><span>PDF</span><i /><i /><i /><i /><div className="processing-scan" /></div>
        <div className="processing-clip"><div className="processing-clip-dots"><i /><i /><i /></div><div className="processing-clip-diagram"><i /><span /><i /></div><div className="processing-play">▶</div><div className="processing-clip-lines"><i /><i /></div></div>
        <span className="processing-art-label">FROM NOTES TO KNOWLEDGE</span>
      </div>
    </div>
    <aside className="processing-tip" aria-label="학습 팁"><span className="processing-tip-icon" aria-hidden="true">✦</span><div><p>잠깐의 학습 팁</p><span><span className="sr-only" aria-live="polite">{STUDY_TIPS[tip]}</span><RevealText key={tip} text={STUDY_TIPS[tip]} step={0.035} /></span></div></aside>
  </section>
}
