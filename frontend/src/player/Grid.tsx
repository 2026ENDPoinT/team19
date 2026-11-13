import { defaultLineColor, defaultTextColor, palette, pointerColor } from './colors'
import type { Entity } from './state'
import { cellAnchor } from './nearLayout'
import { layoutGrid, gridTextLines } from './gridLayout'
import { DIM_OPACITY, cellLit, dimsParts } from './focusDim'

export default function Grid({ element }: { element: Entity }) {
  const cells = element.cells ?? []
  const pointers = element.pointers ?? []
  const layout = layoutGrid(cells, element.indexLabels === true, pointers.length)
  const fontSize = layout.table ? 16 : Math.min(22, layout.cellHeight * .52)
  return <svg className="player-grid-graphic player-shape-enter" width="100%" height={layout.height * Math.min(2, 380 / layout.width)} viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label={`배열: ${cells.map((row) => row.join(', ')).join(' / ')}`}>
    {cells.flatMap((row,r)=>row.map((_,c)=>{
      const point=layout.positions.get(`${r},${c}`)!
      return <rect key={`anchor-${r},${c}`} data-near-cell={cellAnchor(element.id,`${r},${c}`)} x={point.x-layout.cellWidth/2} y={point.y-layout.cellHeight/2} width={layout.cellWidth} height={layout.cellHeight} fill="none" pointerEvents="none" />
    }))}
    {element.indexLabels === true && cells.flatMap((row, r) => row.map((_, c) => {
      const point = layout.positions.get(`${r},${c}`)!
      return <text key={`i${r},${c}`} x={point.x} y={point.y - layout.cellHeight / 2 - 4} textAnchor="middle" fill={defaultTextColor} fontSize="10">{cells.length === 1 ? c : `${r},${c}`}</text>
    }))}
    {cells.flatMap((row, r) => row.map((value, c) => ({ value, key: `${r},${c}` })))
      // 순서를 바꾸지 않는다: swap이 끝날 때 칸이 빠졌다 다시 들어가며 깜빡이던 문제(Q-AI-42). 엇갈리는 칸은 위·아래로 휘어 겹치지 않는다.
      .map(({ value, key }) => {
      const to = layout.positions.get(key)!
      const motion = element.cellOrigins?.[key]
      const from = motion && layout.positions.get(`${motion.row},${motion.col}`)
      // 처음과 끝을 천천히(ease-in-out) 움직여 더 부드럽게 보이게 한다.
      const eased = motion ? motion.progress * motion.progress * (3 - 2 * motion.progress) : 1
      const t = 1 - eased
      // 칸(블럭)째 이동한다. 서로 엇갈릴 때 겹치지 않게 오른쪽으로 가는 칸은 위로, 왼쪽으로 가는 칸은 아래로 살짝 휜다.
      const arc = from && motion ? Math.sin(Math.PI * eased) * layout.cellHeight * .7 * (to.x >= from.x ? -1 : 1) : 0
      const x = from ? to.x + (from.x - to.x) * t : to.x
      const y = (from ? to.y + (from.y - to.y) * t : to.y) + arc
      const selected = element.explaining || element.explainedCells?.includes(key)
      const lines = layout.table ? gridTextLines(value, layout.cellWidth - 16) : [value]
      const tooLong = !layout.table && value.length * fontSize * .65 > layout.cellWidth - 8
      return <g key={key} opacity={dimsParts(element) && !cellLit(element, key) ? DIM_OPACITY : undefined} transform={`translate(${x},${y})`}>
        <rect x={-layout.cellWidth / 2} y={-layout.cellHeight / 2} width={layout.cellWidth} height={layout.cellHeight} rx="5" fill={selected ? palette.mint : '#111d32'} fillOpacity={selected ? .18 : 1} stroke={selected ? palette.mint : defaultLineColor} strokeWidth={selected ? 2 : 1} />
        <text x={0} y={0} dominantBaseline="central" textAnchor="middle" fill={selected ? palette.mint : defaultTextColor} fontSize={fontSize} fontWeight="600" textLength={tooLong ? layout.cellWidth - 8 : undefined} lengthAdjust="spacingAndGlyphs">{lines.map((line, index) => <tspan key={index} x={0} y={(index - (lines.length - 1) / 2) * 20}>{line}</tspan>)}</text>
      </g>
    })}
    {/* 구분선(P-AI-13): 줄 사이 가로선, 칸 사이 세로선. 분홍 점선(노랑은 강조 선·포인터 i와 겹쳐 4색 중 분홍). */}
    {(element.dividers ?? []).map((divider) => {
      const [kind, value] = divider.split(':'), k = Number(value)
      const half = layout.cellHeight / 2
      if (kind === 'row') {
        const a = layout.positions.get(`${k},0`), b = layout.positions.get(`${k + 1},0`)
        if (!a || !b) return null
        const y = (a.y + b.y) / 2
        return <line key={divider} x1={6} x2={layout.width - 6} y1={y} y2={y} stroke={palette.pink} strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" />
      }
      const row = cells.findIndex((cellsRow) => cellsRow.length > k + 1)
      const a = layout.positions.get(`${row},${k}`), b = layout.positions.get(`${row},${k + 1}`)
      if (row < 0 || !a || !b) return null
      const first = layout.positions.get('0,0')!, last = layout.positions.get(`${cells.length - 1},0`)!
      return <line key={divider} x1={(a.x + b.x) / 2} x2={(a.x + b.x) / 2} y1={first.y - half - 6} y2={last.y + half + 6} stroke={palette.pink} strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" />
    })}
    {pointers.map((pointer, index) => {
      if (pointer.hidden) return null
      const to = layout.positions.get(`${pointer.row},${pointer.col}`)
      if (!to) return null
      const motion = pointer.moveOrigin
      const from = motion && layout.positions.get(`${motion.row},${motion.col}`)
      const x = from && motion ? to.x + (from.x - to.x) * (1 - motion.progress) : to.x
      const y = (from && motion ? to.y + (from.y - to.y) * (1 - motion.progress) : to.y) + layout.cellHeight / 2 + 20 + index * 24
      const color = pointerColor(pointer.label, pointer.id)
      const active = pointer.explaining || element.explaining
      return <g key={pointer.id}>
        <text x={x - 6} y={y} textAnchor="end" fill={active ? color : defaultLineColor} fontSize="18" fontWeight="700">↑</text>
        <text x={x} y={y} textAnchor="start" fill={active ? color : defaultTextColor} fontSize="18" fontWeight="700">{String(pointer.label ?? '')}</text>
      </g>
    })}
  </svg>
}
