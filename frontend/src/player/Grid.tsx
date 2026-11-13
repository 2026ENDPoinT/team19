import type { Entity } from './state'
import { layoutGrid } from './gridLayout'

export default function Grid({ element }: { element: Entity }) {
  const cells = element.cells ?? []
  const pointers = element.pointers ?? []
  const layout = layoutGrid(cells, element.indexLabels === true, pointers.length)
  const fontSize = Math.min(18, layout.cellHeight * .46)
  return <svg className="player-grid-graphic" width="100%" height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label={`배열: ${cells.map((row) => row.join(', ')).join(' / ')}`}>
    {cells.flatMap((row, r) => row.map((_, c) => {
      const key = `${r},${c}`, point = layout.positions.get(key)!
      const selected = element.highlightedCells?.includes(key)
      return <g key={key}>
        <rect x={point.x - layout.cellWidth / 2} y={point.y - layout.cellHeight / 2} width={layout.cellWidth} height={layout.cellHeight} rx="5" fill={selected ? '#1e40af' : '#111d32'} stroke={'var(--player-green)'} strokeWidth={selected ? 2 : 1} />
        {element.indexLabels === true && <text x={point.x} y={point.y - layout.cellHeight / 2 - 4} textAnchor="middle" fill="#94a3b8" fontSize="10">{cells.length === 1 ? c : `${r},${c}`}</text>}
      </g>
    }))}
    {cells.flatMap((row, r) => row.map((value, c) => {
      const key = `${r},${c}`, to = layout.positions.get(key)!
      const motion = element.cellOrigins?.[key]
      const from = motion && layout.positions.get(`${motion.row},${motion.col}`)
      const x = from && motion ? to.x + (from.x - to.x) * (1 - motion.progress) : to.x
      const y = from && motion ? to.y + (from.y - to.y) * (1 - motion.progress) : to.y
      const tooLong = value.length * fontSize * .65 > layout.cellWidth - 8
      return <text key={key} x={x} y={y} dominantBaseline="central" textAnchor="middle" fill="#f8fafc" fontSize={fontSize} fontWeight="600" textLength={tooLong ? layout.cellWidth - 8 : undefined} lengthAdjust="spacingAndGlyphs">{value}</text>
    }))}
    {pointers.map((pointer, index) => {
      if (pointer.hidden) return null
      const to = layout.positions.get(`${pointer.row},${pointer.col}`)
      if (!to) return null
      const motion = pointer.moveOrigin
      const from = motion && layout.positions.get(`${motion.row},${motion.col}`)
      const x = from && motion ? to.x + (from.x - to.x) * (1 - motion.progress) : to.x
      const y = (from && motion ? to.y + (from.y - to.y) * (1 - motion.progress) : to.y) + layout.cellHeight / 2 + 13 + index * 16
      return <text key={pointer.id} x={x} y={y} textAnchor="middle" fill={pointer.highlighted ? 'var(--player-yellow)' : ['var(--player-yellow)', 'var(--player-blue)', 'var(--player-pink)', 'var(--player-green)'][index % 4]} fontSize="12" fontWeight="700">↑ {String(pointer.label ?? '')}</text>
    })}
  </svg>
}
