import Slide from './Slide'
import Diagram from './Diagram'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import type { Entity, PlayerState } from './state'
import './player.css'

function Formula({ source }: { source: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (ref.current) katex.render(source, ref.current, { throwOnError: false, trust: false, maxExpand: 1000 })
  }, [source])
  return <span ref={ref} />
}

function RichText({ content, formula }: { content: string; formula: boolean }) {
  if (formula && !content.includes('$')) return <Formula source={content} />
  return <>{content.split(/(\$[^$]+\$)/g).map((part, index) => part.startsWith('$') && part.endsWith('$')
    ? <Formula key={index} source={part.slice(1, -1)} />
    : <span key={index}>{part}</span>)}</>
}

function Grid({ element }: { element: Entity }) {
  const gridRef = useRef<HTMLDivElement>(null)
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({})
  // 칸 폭은 글자 길이와 화면 크기에 따라 달라지므로 실제 배치에서 읽는다.
  const layoutKey = JSON.stringify([element.cells, element.indexLabels,
    element.pointers?.map(({ id, label, row, col, hidden }) => ({ id, label, row, col, hidden }))])
  useLayoutEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    function measure() {
      const next: Record<string, { x: number; y: number }> = {}
      grid!.querySelectorAll<HTMLElement>('[data-cell]').forEach((cell) => {
        const rect = cell.getBoundingClientRect()
        const value = cell.querySelector<HTMLElement>('.player-cell-value')!
        next[cell.dataset.cell!] = {
          x: rect.left + cell.clientLeft + value.offsetLeft + value.offsetWidth / 2,
          y: rect.top + cell.clientTop + value.offsetTop + value.offsetHeight / 2,
        }
      })
      setPositions((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(grid)
    return () => observer.disconnect()
  }, [layoutKey])
  return (
    <div className="player-grid-scroll">
      <div ref={gridRef} className="player-grid" role="table" aria-label="숫자 격자">
        {element.cells?.map((row, rowIndex) => (
          <div className="player-grid-row" role="row" key={rowIndex}>
            {row.map((value, colIndex) => {
              const cellKey = `${rowIndex},${colIndex}`
              const origin = element.cellOrigins?.[cellKey]
              const from = origin && positions[`${origin.row},${origin.col}`]
              const to = positions[cellKey]
              const transform = from && to && origin
                ? `translate(${(from.x - to.x) * (1 - origin.progress)}px, ${(from.y - to.y) * (1 - origin.progress)}px)`
                : undefined
              const selected = element.highlightedCells?.includes(cellKey)
              const pointers = element.pointers?.filter((pointer) => !pointer.hidden && pointer.row === rowIndex && pointer.col === colIndex) ?? []
              return (
                <div className={`player-cell${selected ? ' player-highlight' : ''}`} role="cell" key={colIndex} data-cell={cellKey}>
                  {element.indexLabels === true && <small className="player-cell-index">{rowIndex === 0 && element.cells?.length === 1 ? colIndex : `${rowIndex},${colIndex}`}</small>}
                  <span className="player-cell-value" style={{ transform }}>{value}</span>
                  <div className="player-pointer-lanes" style={{ height: (element.pointers?.length ?? 0) * 20 }}>
                    {pointers.map((pointer) => {
                      const origin = pointer.moveOrigin
                      const from = origin && positions[`${origin.row},${origin.col}`]
                      const to = positions[cellKey]
                      const dx = from && to && origin ? (from.x - to.x) * (1 - origin.progress) : 0
                      const dy = from && to && origin ? (from.y - to.y) * (1 - origin.progress) : 0
                      return <small
                        className={pointer.highlighted ? 'player-pointer player-highlight' : 'player-pointer'}
                        key={pointer.id}
                        style={{ top: (element.pointers?.findIndex((item) => item.id === pointer.id) ?? 0) * 20, transform: `translate(calc(-50% + ${dx}px), ${dy}px)` }}
                      >↑ {String(pointer.label ?? '')}</small>
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function ElementView({ element, pageUrl }: { element: Entity; pageUrl: (page: number) => string | undefined }) {
  if (typeof element.page === 'number' && element.box) return <Slide key={element.id} element={element} imageUrl={pageUrl(element.page)} />
  if (element.nodes) return <Diagram element={element} />
  if (element.cells) return <Grid element={element} />
  if (Array.isArray(element.lines)) {
    return <pre className="player-code"><code>{element.lines.map((line, index) => (
      <span key={index} className={element.markedLine === index + 1 ? 'player-code-line player-highlight' : 'player-code-line'}>
        <span className="player-line-number">{index + 1}</span>{String(line)}
      </span>
    ))}</code></pre>
  }
  if (typeof element.content === 'string') {
    const style = ['title', 'body', 'keyword', 'formula'].includes(String(element.style)) ? String(element.style) : 'body'
    return <div className={`player-text player-text--${style}`}><RichText content={element.content} formula={style === 'formula'} /></div>
  }
  return <p className="player-unsupported">{element.nodes ? '다이어그램' : '원본 그림'} 부품 연결 예정 · {element.id}</p>
}

export default function PlayerStage({ state, pageUrl }: { state: PlayerState; pageUrl: (page: number) => string | undefined }) {
  const visible = state.elements.filter((element) => !element.hidden)
  const slots = ['top', 'middle', 'bottom']
  const invalid = visible.some((element) => !slots.includes(element.slot ?? '')) || slots.some((slot) => visible.filter((element) => element.slot === slot).length > 1)
  if (invalid) return <p role="alert">현재 지원 범위와 맞지 않는 장면 배치입니다.</p>
  return (
    <div className="player-stage" aria-label="학습 시각화">
      <div className="player-slots">
        {slots.map((slot) => {
          const element = visible.find((item) => item.slot === slot)
          return <div className={`player-slot${element?.highlighted ? ' player-highlight' : ''}`} key={slot}>
            {element && <ElementView key={element.id} element={element} pageUrl={pageUrl} />}
          </div>
        })}
      </div>
      <p className="player-caption" aria-label="현재 자막">{state.caption || '\u00a0'}</p>
    </div>
  )
}
