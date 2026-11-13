import Grid from './Grid'
import { playerColorVariables } from './colors'
import { emphasizeFormula } from './formulaEmphasis'
import { renderFormulaTerms } from './formulaTerms'
import FitContent from './FitContent'
import { layoutGrid } from './gridLayout'
import { layoutDiagram } from './diagramLayout'
import Slide from './Slide'
import Diagram from './Diagram'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import type { ReactNode } from 'react'
import type { Entity, PlayerState } from './state'
import './player.css'

function Formula({ source }: { source: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (ref.current) katex.render(source, ref.current, { throwOnError: false, trust: false, maxExpand: 1000 })
  }, [source])
  return <span ref={ref} />
}

function RichText({ content, formula, caption, active, termColors, whole }: { content: string; formula: boolean; caption: string; active: boolean; termColors?: Record<string, string>; whole?: boolean }) {
  const annotated = formula && content.includes('\\term')
  const render = (source: string) => annotated ? renderFormulaTerms(source, termColors, whole) : emphasizeFormula(source, caption, active)
  if (formula && !content.includes('$')) return <Formula source={render(content)} />
  return <>{content.split(/(\$[^$]+\$)/g).map((part, index) => part.startsWith('$') && part.endsWith('$')
    ? <Formula key={index} source={render(part.slice(1, -1))} />
    : <span key={index}>{part}</span>)}</>
}

function ElementView({ element, pageUrl, caption }: { element: Entity; caption: string; pageUrl: (page: number) => string | undefined }) {
  if (typeof element.page === 'number' && element.box) return <Slide key={element.id} element={element} imageUrl={pageUrl(element.page)} />
  if (element.nodes) return <Diagram element={element} />
  if (element.cells) return <Grid element={element} />
  if (Array.isArray(element.lines)) {
    return <pre className="player-code"><code>{element.lines.map((line, index) => (
      <span key={index} className={element.explainedLine === index + 1 ? 'player-code-line player-highlight' : 'player-code-line'}>
        <span className="player-line-number">{index + 1}</span>{String(line)}
      </span>
    ))}</code></pre>
  }
  if (typeof element.content === 'string') {
    const style = ['title', 'body', 'keyword', 'formula'].includes(String(element.style)) ? String(element.style) : 'body'
    return <div className={`player-text player-text--${style}${style === 'formula' && element.content.includes('\\term') ? ' player-text--terms' : element.explaining ? ' player-text--explaining' : ''}`}><RichText content={element.content} formula={style === 'formula'} caption={caption} active={element.explaining === true} termColors={element.formulaTermColors} whole={element.formulaWhole} /></div>
  }
  return <p className="player-unsupported">{element.nodes ? '다이어그램' : '원본 그림'} 부품 연결 예정 · {element.id}</p>
}

function preferredHeight(element: Entity): number {
  if (element.cells) return layoutGrid(element.cells, element.indexLabels === true, element.pointers?.length ?? 0).height + 8
  if (element.nodes) {
    try {
      const diagram = layoutDiagram(element.nodes, (element.edges ?? []).map((edge) => ({ from: String(edge.from), to: String(edge.to) })), String(element.layout))
      return Math.max(70, diagram.height * Math.min(1, 360 / diagram.width)) + 8
    } catch { return 90 }
  }
  if (Array.isArray(element.lines)) return Math.min(260, element.lines.length * 24 + 16)
  if (typeof element.page === 'number') return 190
  const text = String(element.content ?? '')
  return Math.min(140, Math.max(48, Math.ceil(text.length / 20) * 30 + 12))
}

export default function PlayerStage({ state, pageUrl, isPlaying, onTogglePlayback, controls }: {
  state: PlayerState
  pageUrl: (page: number) => string | undefined
  isPlaying: boolean
  onTogglePlayback: () => void
  controls: ReactNode
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    function fit() {
      if (!frame) return
      // 조작부는 영상 안에 겹쳐 놓고 전체 영상만 화면 높이에 맞춘다.
      const availableHeight = window.innerHeight - 24
      setScale(Math.max(0.1, Math.min(1, (frame.parentElement?.clientWidth ?? 420) / 420, availableHeight / (420 * 16 / 9))))
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(frame.parentElement!)
    const main = frame.closest('main')
    if (main) observer.observe(main)
    window.addEventListener('resize', fit)
    document.addEventListener('fullscreenchange', fit)
    return () => { observer.disconnect(); window.removeEventListener('resize', fit); document.removeEventListener('fullscreenchange', fit) }
  }, [])
  const visible = state.elements.filter((element) => !element.hidden)
  const slots = ['top', 'middle', 'bottom']
  const invalid = visible.some((element) => !slots.includes(element.slot ?? '')) || slots.some((slot) => visible.filter((element) => element.slot === slot).length > 1)
  if (invalid) return <p role="alert">현재 지원 범위와 맞지 않는 장면 배치입니다.</p>
  return (
    <div ref={frameRef} className="player-viewport" style={{ ...playerColorVariables, width: 420 * scale, height: 420 * 16 / 9 * scale }}>
    <div className="player-stage" aria-label={isPlaying ? '영상 일시정지' : '영상 재생'} style={{ transform: `translateX(-50%) scale(${scale})` }}
      role="button" tabIndex={0} aria-pressed={isPlaying} onClick={onTogglePlayback}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          onTogglePlayback()
        }
      }}>
      <div className="player-slots">
        {slots.map((slot) => {
          const element = visible.find((item) => item.slot === slot)
          if (!element) return null
          return <div className={`player-slot${element.explaining && element.style !== 'formula' ? ' player-highlight' : ''}`} key={slot} style={{ flexBasis: preferredHeight(element) }}>
            <FitContent key={element.id}><ElementView element={element} pageUrl={pageUrl} caption={state.caption} /></FitContent>
          </div>
        })}
      </div>
      <p className="player-caption" aria-label="현재 자막">{state.caption || '\u00a0'}</p>
    </div>
    {controls}
    </div>
  )
}
