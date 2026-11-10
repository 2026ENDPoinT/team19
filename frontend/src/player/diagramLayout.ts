export type LayoutNode = { id: string }
export type LayoutEdge = { from: string; to: string }
export type DiagramLayout = { positions: Map<string, { x: number; y: number }>; width: number; height: number }

// hidden 여부와 무관하게 전체 구조로 배치해 show/hide 중 위치를 유지한다.
export function layoutDiagram(nodes: LayoutNode[], edges: LayoutEdge[], layout: string): DiagramLayout {
  const positions = new Map<string, { x: number; y: number }>()
  const ids = new Set(nodes.map((node) => node.id))
  if (ids.size !== nodes.length) throw new Error('다이어그램 노드 ID 중복')
  for (const edge of edges) if (!ids.has(edge.from) || !ids.has(edge.to)) throw new Error('연결선 대상 노드 없음')
  if (layout === 'row') {
    nodes.forEach((node, index) => positions.set(node.id, { x: 65 + index * 145, y: 55 }))
    return { positions, width: Math.max(300, nodes.length * 145 - 15), height: 110 }
  }
  if (layout === 'column') {
    nodes.forEach((node, index) => positions.set(node.id, { x: 130, y: 34 + index * 82 }))
    return { positions, width: 260, height: Math.max(110, (nodes.length - 1) * 82 + 68) }
  }
  if (layout !== 'tree') throw new Error(`미지원 다이어그램 배치: ${layout}`)
  const children = new Map(nodes.map((node) => [node.id, [] as string[]]))
  const parents = new Set<string>()
  for (const edge of edges) {
    if (parents.has(edge.to)) throw new Error('트리 노드의 부모가 여러 개입니다.')
    parents.add(edge.to)
    children.get(edge.from)!.push(edge.to)
  }
  const visiting = new Set<string>()
  const visited = new Set<string>()
  let leaf = 0
  let maxDepth = 0
  function place(id: string, depth: number): number {
    if (visiting.has(id) || visited.has(id)) throw new Error('트리에 순환 또는 중복 연결이 있습니다.')
    visiting.add(id)
    const childXs = children.get(id)!.map((child) => place(child, depth + 1))
    const x = childXs.length ? (childXs[0] + childXs[childXs.length - 1]) / 2 : 65 + leaf++ * 125
    positions.set(id, { x, y: 35 + depth * 90 })
    maxDepth = Math.max(maxDepth, depth)
    visiting.delete(id)
    visited.add(id)
    return x
  }
  for (const node of nodes) if (!parents.has(node.id)) place(node.id, 0)
  if (visited.size !== nodes.length) throw new Error('트리에 순환 연결이 있습니다.')
  return { positions, width: Math.max(300, leaf * 125 + 5), height: Math.max(110, maxDepth * 90 + 70) }
}
