import { layoutDiagram, layoutNode } from './diagramLayout.ts'
import type { LayoutNode, LayoutEdge } from './diagramLayout.ts'

type Point = { x: number; y: number }
type Edge = LayoutEdge & { id: string; label?: unknown }
type Route = { points: Point[]; label: Point; anchor: 'start' | 'end' | 'middle'; lines: string[] }

export function wrapArrowLabel(text: string): string[] {
  if (!text.trim()) return []
  return text.split('\n').flatMap(paragraph => {
    const lines: string[] = []
    let line = ''
    for (const word of paragraph.trim().split(/\s+/)) {
      const next = line ? `${line} ${word}` : word
      if (Array.from(next).length <= 8) { line = next; continue }
      if (line) lines.push(line)
      const chars = Array.from(word)
      while (chars.length > 8) lines.push(chars.splice(0, 8).join(''))
      line = chars.join('')
    }
    if (line) lines.push(line)
    return lines
  })
}
export function layoutDiagramEdges(nodes: LayoutNode[], edges: Edge[], layout: string) {
  const geometry = layoutDiagram(nodes, edges, layout)
  const routes = new Map<string, Route>()
  if (layout !== 'column') {
    const center = { x: geometry.width / 2, y: geometry.height / 2 }
    for (const edge of edges) {
      const from = geometry.positions.get(edge.from)!, to = geometry.positions.get(edge.to)!
      const dx = to.x-from.x, dy = to.y-from.y, length = Math.hypot(dx,dy)
      if (!length) continue
      const ux = dx/length, uy = dy/length
      // Canonical normal keeps opposite directions in the same bundle of lanes.
      const direction = edge.from < edge.to ? 1 : -1
      const nx = -uy*direction, ny = ux*direction
      const siblings = edges.filter(other => (other.from===edge.from && other.to===edge.to) || (other.from===edge.to && other.to===edge.from))
      const sizes = [edge.from,edge.to].map(id => layoutNode(nodes.find(node=>node.id===id)!,layout))
      const room = Math.min(...sizes.map(size=>Math.min(size.width,size.height)/2))-6
      const spacing = siblings.length>1 ? Math.min(28,room*2/(siblings.length-1)) : 0
      const offset = (siblings.indexOf(edge)-(siblings.length-1)/2)*spacing
      const ox = nx*offset, oy = ny*offset
      function port(id: string, x: number, y: number) {
        const node = nodes.find(node=>node.id===id)!, size = layoutNode(node,layout)
        const distance = node.shape==='circle'
          ? Math.sqrt(Math.max(0,size.radius**2-offset**2))
          : Math.min(x ? (size.width/2-Math.sign(x)*ox)/Math.abs(x) : Infinity, y ? (size.height/2-Math.sign(y)*oy)/Math.abs(y) : Infinity)
        return distance+1
      }
      const a=port(edge.from,ux,uy), b=port(edge.to,-ux,-uy)+5
      const points=[{x:from.x+ox+ux*a,y:from.y+oy+uy*a},{x:to.x+ox-ux*b,y:to.y+oy-uy*b}]
      const midpoint={x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2}
      const outward = Math.sign(offset) || Math.sign((midpoint.x-center.x)*nx+(midpoint.y-center.y)*ny) || 1
      const label={x:midpoint.x+nx*outward*14,y:midpoint.y+ny*outward*14}
      const lines = wrapArrowLabel(String(edge.label ?? ''))
      routes.set(edge.id,{points,label,anchor:'middle',lines})
    }
  } else {
  const index = new Map(nodes.map((node, i) => [node.id, i]))
  const sizes = new Map(nodes.map(node => [node.id, layoutNode(node, layout)]))
  const left = Math.min(...nodes.map(node => geometry.positions.get(node.id)!.x - sizes.get(node.id)!.width / 2))
  const right = Math.max(...nodes.map(node => geometry.positions.get(node.id)!.x + sizes.get(node.id)!.width / 2))
  const lanes = { left: 0, right: 0 }
  for (const edge of edges) {
    const from = geometry.positions.get(edge.from)!, to = geometry.positions.get(edge.to)!
    const a = sizes.get(edge.from)!, b = sizes.get(edge.to)!
    const forward = index.get(edge.to)! >= index.get(edge.from)!
    const side = forward ? 1 : -1
    const reciprocal = edges.some(other => other.from === edge.to && other.to === edge.from)
    const duplicates = edges.filter(other => other.from === edge.from && other.to === edge.to).length > 1
    const bypass = Math.abs(index.get(edge.to)! - index.get(edge.from)!) > 1 || duplicates || edge.from === edge.to
    let points: Point[], label: Point
    if (bypass) {
      const lane = side > 0 ? right + 28 + lanes.right++ * 24 : left - 28 - lanes.left++ * 24
      const fromY = edge.from === edge.to ? from.y - a.height / 4 : from.y
      const toY = edge.from === edge.to ? to.y + b.height / 4 : to.y
      const fromHalf = nodes[index.get(edge.from)!].shape === 'circle' ? Math.sqrt(Math.max(0, a.radius ** 2 - (fromY - from.y) ** 2)) : a.width / 2
      const toHalf = nodes[index.get(edge.to)!].shape === 'circle' ? Math.sqrt(Math.max(0, b.radius ** 2 - (toY - to.y) ** 2)) : b.width / 2
      points = [{x:from.x + side * (fromHalf + 1), y:fromY}, {x:lane,y:fromY}, {x:lane,y:toY}, {x:to.x + side * (toHalf + 6),y:toY}]
      label = {x:lane + side * 8, y:(fromY + toY) / 2}
    } else {
      const offset = reciprocal ? side * Math.min(24, a.width / 4, b.width / 4) : 0
      const aHalf = nodes[index.get(edge.from)!].shape === 'circle' ? Math.sqrt(a.radius ** 2 - offset ** 2) : a.height / 2
      const bHalf = nodes[index.get(edge.to)!].shape === 'circle' ? Math.sqrt(b.radius ** 2 - offset ** 2) : b.height / 2
      points = [{x:from.x + offset,y:from.y + side * (aHalf + 1)}, {x:to.x + offset,y:to.y - side * (bHalf + 6)}]
      label = {x:from.x + offset + side * 8,y:(points[0].y + points[1].y) / 2}
    }
    const lines = wrapArrowLabel(String(edge.label ?? ''))
    routes.set(edge.id,{points,label,anchor:side > 0 ? 'start' : 'end',lines})
  }
  }
  let minX=0,minY=0,maxX=geometry.width,maxY=geometry.height
  for (const route of routes.values()) {
    for (const point of route.points) { minX=Math.min(minX,point.x-8);maxX=Math.max(maxX,point.x+8);minY=Math.min(minY,point.y-8);maxY=Math.max(maxY,point.y+8) }
    if (!route.lines.length && layout !== 'column') continue
    const width=Math.max(0,...route.lines.map(line=>Array.from(line).length*11))+8
    minX=Math.min(minX,route.label.x-(route.anchor==='end'?width:route.anchor==='middle'?width/2:0))
    maxX=Math.max(maxX,route.label.x+(route.anchor==='start'?width:route.anchor==='middle'?width/2:0))
    minY=Math.min(minY,route.label.y-route.lines.length*7-8)
    maxY=Math.max(maxY,route.label.y+route.lines.length*7+8)
  }
  for (const point of geometry.positions.values()) {point.x-=minX;point.y-=minY}
  for (const route of routes.values()) {
    for (const point of route.points) {point.x-=minX;point.y-=minY}
    route.label.x-=minX;route.label.y-=minY
  }
  return { positions:geometry.positions,routes,width:maxX-minX,height:maxY-minY }
}

// 꺾인 선은 전체 길이의 절반 지점, 직선은 가운데에 찍는다.
export function midpoint(points: { x: number; y: number }[]) {
  const lengths = points.slice(1).map((point, i) => Math.hypot(point.x - points[i].x, point.y - points[i].y))
  let half = lengths.reduce((sum, length) => sum + length, 0) / 2
  for (let i = 0; i < lengths.length; i++) {
    if (half <= lengths[i] && lengths[i] > 0) {
      const t = half / lengths[i]
      return { x: points[i].x + (points[i + 1].x - points[i].x) * t, y: points[i].y + (points[i + 1].y - points[i].y) * t }
    }
    half -= lengths[i]
  }
  return points[0]
}
