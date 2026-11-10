import { useId } from 'react'
import type { Entity } from './state'
import { layoutDiagram } from './diagramLayout'

type Edge = Entity & { from: string; to: string }

export default function Diagram({ element }: { element: Entity }) {
  const arrowId = useId().replace(/:/g, '')
  const nodes = element.nodes ?? []
  const edges = (element.edges ?? []) as Edge[]
  let geometry
  try { geometry = layoutDiagram(nodes, edges, String(element.layout)) }
  catch (cause) { return <p role="alert" className="player-unsupported">{cause instanceof Error ? cause.message : '다이어그램 배치 오류'}</p> }
  return (
    <div className="player-diagram-scroll">
      <svg className="player-diagram" width={geometry.width} height={geometry.height} viewBox={`0 0 ${geometry.width} ${geometry.height}`} role="img" aria-label={element.layout === 'tree' ? '재귀 트리' : '가로 다이어그램'}>
        <defs><marker id={arrowId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker></defs>
        {edges.map((edge) => {
          const fromNode = nodes.find((node) => node.id === edge.from)
          const toNode = nodes.find((node) => node.id === edge.to)
          if (edge.hidden || fromNode?.hidden || toNode?.hidden) return null
          const from = geometry.positions.get(edge.from)!
          const to = geometry.positions.get(edge.to)!
          const dx = to.x - from.x, dy = to.y - from.y
          const distance = Math.hypot(dx, dy)
          if (!distance) return null
          function boundary(node: Entity | undefined) {
            return node?.shape === 'circle' ? 23 : Math.min(dx ? 50 * distance / Math.abs(dx) : Infinity, dy ? 19 * distance / Math.abs(dy) : Infinity)
          }
          const a = boundary(fromNode), b = boundary(toNode) + 5
          return <g key={edge.id}>
            <line x1={from.x + dx / distance * a} y1={from.y + dy / distance * a} x2={to.x - dx / distance * b} y2={to.y - dy / distance * b} stroke={edge.highlighted ? '#fbbf24' : '#94a3b8'} strokeWidth={edge.highlighted ? 3 : 2} markerEnd={`url(#${arrowId})`} />
            {typeof edge.label === 'string' && edge.label.length > 0 && <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 8} textAnchor="middle" fill="#cbd5e1" fontSize="11" paintOrder="stroke" stroke="#020617" strokeWidth="4">{String(edge.label)}</text>}
          </g>
        })}
        {nodes.filter((node) => !node.hidden).map((node) => {
          const point = geometry.positions.get(node.id)!
          const fill = node.highlighted ? '#1e40af' : '#1e293b'
          const stroke = node.highlighted ? '#fbbf24' : '#94a3b8'
          return <g key={node.id} transform={`translate(${point.x},${point.y})`}>
            {node.shape === 'circle' ? <circle r="22" fill={fill} stroke={stroke} strokeWidth="2" /> : <rect x="-49" y="-18" width="98" height="36" rx="7" fill={fill} stroke={stroke} strokeWidth="2" />}
            <text textAnchor="middle" dominantBaseline="middle" fill="#f8fafc" fontSize="13">{String(node.label ?? '')}</text>
          </g>
        })}
      </svg>
    </div>
  )
}
