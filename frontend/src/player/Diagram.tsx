import { defaultLineColor, defaultTextColor, palette } from './colors'
import { useId } from 'react'
import type { Entity } from './state'
import { layoutNode } from './diagramLayout'
import { layoutDiagramEdges, midpoint } from './diagramEdges'
import { StampMark } from './Stamp'
import { DIM_OPACITY, dimsParts } from './focusDim'

type Edge = Entity & { from: string; to: string }

export default function Diagram({ element }: { element: Entity }) {
  const arrowId = useId().replace(/:/g, '')
  const nodes = element.nodes ?? []
  const edges = (element.edges ?? []) as Edge[]
  const vertical = element.layout === 'column'
  let geometry
  try { geometry = layoutDiagramEdges(nodes, edges, String(element.layout)) }
  catch (cause) { return <p role="alert" className="player-unsupported">{cause instanceof Error ? cause.message : '다이어그램 배치 오류'}</p> }
  // 선 위 도장은 노드보다 위에 보이도록 마지막에 그린다.
  const dimParts = dimsParts(element)
  const edgeStamps: { id: string; kind: 'x' | 'o'; at: { x: number; y: number } }[] = []
  return (
    <div className="player-diagram-frame" style={{ width: 380, marginLeft: -10, height: geometry.height * 380 / geometry.width }}>
      <svg className="player-diagram" width="100%" height="100%" viewBox={`0 0 ${geometry.width} ${geometry.height}`} role="img" aria-label={element.layout === 'tree' ? '재귀 트리' : element.layout === 'cycle' ? '순환 다이어그램' : element.layout === 'layers' ? '층 다이어그램' : vertical ? '세로 단계 다이어그램' : '가로 다이어그램'}>
        <defs><marker id={arrowId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker></defs>
        {edges.map((edge) => {
          const fromNode = nodes.find((node) => node.id === edge.from)
          const toNode = nodes.find((node) => node.id === edge.to)
          if (edge.hidden || fromNode?.hidden || toNode?.hidden) return null
          const from = geometry.positions.get(edge.from)!
          const to = geometry.positions.get(edge.to)!
          const dx = to.x - from.x, dy = to.y - from.y
          const distance = Math.hypot(dx, dy)
          if (!distance && !geometry.routes.has(edge.id)) return null
          function boundary(node: Entity | undefined) {
            const size = layoutNode(node!, String(element.layout))
            return node?.shape === 'circle' ? size.radius + 1 : Math.min(dx ? (size.width / 2 + 1) * distance / Math.abs(dx) : Infinity, dy ? (size.height / 2 + 1) * distance / Math.abs(dy) : Infinity)
          }
          const a = boundary(fromNode), b = boundary(toNode) + 5
          const route = geometry.routes.get(edge.id)
          const points = route?.points ?? [{x:from.x + dx / distance * a,y:from.y + dy / distance * a},{x:to.x - dx / distance * b,y:to.y - dy / distance * b}]
          const path = points.map((point,index)=>`${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
          if (edge.stamp) edgeStamps.push({ id: edge.id, kind: edge.stamp, at: midpoint(points) })
          const label = route?.label ?? {x:(from.x + to.x)/2,y:(from.y + to.y)/2-8}
          const labelLines = route?.lines ?? (edge.label ? [String(edge.label)] : [])
          return <g key={edge.id} className="player-shape-enter" opacity={dimParts && !edge.highlighted ? DIM_OPACITY : undefined}>
            <path d={path} fill="none" stroke={edge.explaining || element.explaining ? palette.yellow : defaultLineColor} strokeWidth={edge.explaining || element.explaining ? 3 : 2} markerEnd={`url(#${arrowId})`} />
            {labelLines.length > 0 && <text x={label.x} y={label.y} textAnchor={route?.anchor ?? 'middle'} fill={edge.explaining || element.explaining ? palette.yellow : defaultTextColor} fontSize="11" paintOrder="stroke" stroke="#020617" strokeWidth="4">{labelLines.map((line,index)=><tspan key={index} x={label.x} y={label.y+(index-(labelLines.length-1)/2)*14}>{line}</tspan>)}</text>}
          </g>
        })}
        {nodes.filter((node) => !node.hidden).map((node) => {
          const point = geometry.positions.get(node.id)!
          const size = layoutNode(node, String(element.layout))
          const active = node.explaining || element.explaining
          const fill = active ? palette.mint : '#1e293b'
          const stroke = active ? palette.mint : defaultLineColor
          return <g key={node.id} className="player-shape-enter" opacity={dimParts && !node.highlighted ? DIM_OPACITY : undefined} transform={`translate(${point.x},${point.y})`}>
            {node.shape === 'text' ? null : node.shape === 'circle' ? <circle r={size.radius} fill={fill} fillOpacity={active ? .18 : 1} stroke={stroke} strokeWidth={active ? 3 : 2} /> : <rect x={-size.width / 2} y={-size.height / 2} width={size.width} height={size.height} rx="7" fill={fill} fillOpacity={active ? .18 : 1} stroke={stroke} strokeWidth={active ? 3 : 2} />}
            <text textAnchor="middle" dominantBaseline="middle" fill={active ? palette.mint : defaultTextColor} fontSize={size.fontSize}>{size.lines.map((line, index) => <tspan key={index} x={0} y={(index - (size.lines.length - 1) / 2) * size.lineHeight}>{line}</tspan>)}</text>
            {node.stamp && <StampMark kind={node.stamp} size={Math.min(size.width, size.height) * .94} />}
          </g>
        })}
        {edgeStamps.map((stamp) => <g key={`stamp-${stamp.id}`} transform={`translate(${stamp.at.x},${stamp.at.y})`}><StampMark kind={stamp.kind} size={27} /></g>)}
      </svg>
    </div>
  )
}
