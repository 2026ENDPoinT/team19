import { defaultLineColor, defaultTextColor, palette, pointerColor } from './colors'
import type { Entity } from './state'
import { layoutGrid } from './gridLayout'
import { DIM_OPACITY, dimsParts } from './focusDim'

export default function Grid({ element }: { element: Entity }) {
  const cells = element.cells ?? []
  const pointers = element.pointers ?? []
  const layout = layoutGrid(cells, element.indexLabels === true, pointers.length)
  const fontSize = Math.min(22, layout.cellHeight * .52)
  return <svg className="player-grid-graphic" width="100%" height={layout.height * Math.min(2, 380 / layout.width)} viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label={`배열: ${cells.map((row) => row.join(', ')).join(' / ')}`}>
    {element.indexLabels === true && cells.flatMap((row, r) => row.map((_, c) => {
      const point = layout.positions.get(`${r},${c}`)!
      return <text key={`i${r},${c}`} x={point.x} y={point.y - layout.cellHeight / 2 - 4} textAnchor="middle" fill={defaultTextColor} fontSize="10">{cells.length === 1 ? c : `${r},${c}`}</text>
    }))}
    {cells.flatMap((row, r) => row.map((value, c) => ({ value, key: `${r},${c}` })))
      // 움직이는 칸은 다른 칸 위에 보이도록 마지막에 그린다.
      .sort((a, b) => Number(Boolean(element.cellOrigins?.[a.key])) - Number(Boolean(element.cellOrigins?.[b.key])))
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
      const tooLong = value.length * fontSize * .65 > layout.cellWidth - 8
      return <g key={key} className="player-shape-enter" opacity={dimsParts(element) && !element.highlightedCells?.includes(key) ? DIM_OPACITY : undefined} transform={`translate(${x},${y})`}>
        <rect x={-layout.cellWidth / 2} y={-layout.cellHeight / 2} width={layout.cellWidth} height={layout.cellHeight} rx="5" fill={selected ? palette.mint : '#111d32'} fillOpacity={selected ? .18 : 1} stroke={selected ? palette.mint : defaultLineColor} strokeWidth={selected ? 2 : 1} />
        <text x={0} y={0} dominantBaseline="central" textAnchor="middle" fill={selected ? palette.mint : defaultTextColor} fontSize={fontSize} fontWeight="600" textLength={tooLong ? layout.cellWidth - 8 : undefined} lengthAdjust="spacingAndGlyphs">{value}</text>
      </g>
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
      return <g key={pointer.id} className="player-shape-enter">
        <text x={x - 6} y={y} textAnchor="end" fill={active ? color : defaultLineColor} fontSize="18" fontWeight="700">↑</text>
        <text x={x} y={y} textAnchor="start" fill={active ? color : defaultTextColor} fontSize="18" fontWeight="700">{String(pointer.label ?? '')}</text>
      </g>
    })}
  </svg>
}
