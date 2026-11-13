export type LayoutNode = { id: string; label?: unknown; shape?: unknown }
export type LayoutEdge = { from: string; to: string }
export type DiagramLayout = { positions: Map<string, { x: number; y: number }>; width: number; height: number }


export function layoutNode(node: LayoutNode, layout: string) {
  const circle = node.shape === 'circle'
  const fontSize = layout === 'column' && !circle ? 16 : 13
  const maxWidth = circle ? 78 : layout === 'column' ? 174 : 82
  const lines: string[] = []
  let line = '', width = 0, widest = 0
  for (const char of String(node.label ?? '')) {
    const advance = fontSize * (/\s/.test(char) ? .4 : /^[\x20-\x7e]$/.test(char) ? .7 : 1)
    if (char === '\n' || width + advance > maxWidth) {
      lines.push(line); widest = Math.max(widest, width); line = ''; width = 0
      if (char === '\n') continue
    }
    line += char; width += advance
  }
  lines.push(line); widest = Math.max(widest, width)
  const lineHeight = fontSize + 4
  const textHeight = lines.length * lineHeight
  const radius = Math.max(22, Math.ceil(Math.hypot(widest / 2 + 8, textHeight / 2 + 6)))
  return { lines, fontSize, lineHeight, radius,
    width: circle ? radius * 2 : layout === 'column' ? 190 : 98,
    height: circle ? radius * 2 : Math.max(layout === 'column' ? 40 : 36, textHeight + 16) }
}

// hidden 여부와 무관하게 전체 구조로 배치해 show/hide 중 위치를 유지한다.
export function layoutDiagram(nodes: LayoutNode[], edges: LayoutEdge[], layout: string): DiagramLayout {
  const positions = new Map<string, { x: number; y: number }>()
  const ids = new Set(nodes.map((node) => node.id))
  if (ids.size !== nodes.length) throw new Error('다이어그램 노드 ID 중복')
  for (const edge of edges) if (!ids.has(edge.from) || !ids.has(edge.to)) throw new Error('연결선 대상 노드 없음')
  const sizes = nodes.map((node) => layoutNode(node, layout))
  const maxWidth = Math.max(98, ...sizes.map((size) => size.width))
  const maxHeight = Math.max(44, ...sizes.map((size) => size.height))
  if (layout === 'row') {
    const step = Math.max(145, maxWidth + 47), margin = Math.max(65, maxWidth / 2 + 16)
    nodes.forEach((node, index) => positions.set(node.id, { x: margin + index * step, y: maxHeight / 2 + 33 }))
    return { positions, width: Math.max(300, (nodes.length - 1) * step + margin * 2), height: maxHeight + 66 }
  }
  if (layout === 'column') {
    const step = Math.max(82, maxHeight + 38), margin = maxHeight / 2 + 12
    const width = Math.max(260, maxWidth + 70)
    nodes.forEach((node, index) => positions.set(node.id, { x: width / 2, y: margin + index * step }))
    return { positions, width, height: Math.max(110, (nodes.length - 1) * step + margin * 2) }
  }
  if (layout === 'cycle') {
    // nodes 순서대로 12시 방향부터 시계 방향으로 원 위에 놓는다. 이웃 노드가 겹치지 않게 반지름을 정한다.
    const n = nodes.length
    const radius = n < 2 ? 0 : Math.max(70, (Math.max(maxWidth, maxHeight) + 30) / (2 * Math.sin(Math.PI / n)))
    const cx = radius + maxWidth / 2 + 16, cy = radius + maxHeight / 2 + 16
    nodes.forEach((node, index) => {
      const angle = 2 * Math.PI * index / n
      positions.set(node.id, { x: cx + radius * Math.sin(angle), y: cy - radius * Math.cos(angle) })
    })
    return { positions, width: cx * 2, height: cy * 2 }
  }
  if (layout === 'layers') {
    // 왼쪽→오른쪽으로 층을 놓는다. 층 = 앞 층에서 오는 가장 긴 경로의 길이(edges의 from = 앞 층).
    const layerOf = new Map<string, number>()
    const visiting = new Set<string>()
    const incoming = new Map(nodes.map((node) => [node.id, [] as string[]]))
    for (const edge of edges) incoming.get(edge.to)!.push(edge.from)
    function depth(id: string): number {
      if (layerOf.has(id)) return layerOf.get(id)!
      if (visiting.has(id)) throw new Error('층 다이어그램에 순환 연결이 있습니다.')
      visiting.add(id)
      const value = Math.max(0, ...incoming.get(id)!.map((from) => depth(from) + 1))
      visiting.delete(id)
      layerOf.set(id, value)
      return value
    }
    const layers: string[][] = []
    for (const node of nodes) (layers[depth(node.id)] ??= []).push(node.id)
    const xStep = Math.max(125, maxWidth + 40), yStep = maxHeight + 22
    const xMargin = maxWidth / 2 + 16, yMargin = maxHeight / 2 + 16
    const tallest = Math.max(...layers.map((layer) => layer?.length ?? 0))
    const height = (tallest - 1) * yStep + yMargin * 2
    layers.forEach((layer, column) => layer?.forEach((id, row) => positions.set(id, {
      x: xMargin + column * xStep, y: height / 2 + (row - (layer.length - 1) / 2) * yStep,
    })))
    return { positions, width: Math.max(300, (layers.length - 1) * xStep + xMargin * 2), height: Math.max(110, height) }
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
  const xStep = Math.max(125, maxWidth + 30), yStep = Math.max(90, maxHeight + 50)
  const xMargin = Math.max(65, maxWidth / 2 + 16), yMargin = Math.max(35, maxHeight / 2 + 12)
  let leaf = 0
  let maxDepth = 0
  function place(id: string, depth: number): number {
    if (visiting.has(id) || visited.has(id)) throw new Error('트리에 순환 또는 중복 연결이 있습니다.')
    visiting.add(id)
    const childXs = children.get(id)!.map((child) => place(child, depth + 1))
    const x = childXs.length ? (childXs[0] + childXs[childXs.length - 1]) / 2 : xMargin + leaf++ * xStep
    positions.set(id, { x, y: yMargin + depth * yStep })
    maxDepth = Math.max(maxDepth, depth)
    visiting.delete(id)
    visited.add(id)
    return x
  }
  for (const node of nodes) if (!parents.has(node.id)) place(node.id, 0)
  if (visited.size !== nodes.length) throw new Error('트리에 순환 연결이 있습니다.')
  return { positions, width: Math.max(300, Math.max(0, leaf - 1) * xStep + xMargin * 2), height: Math.max(110, maxDepth * yStep + yMargin * 2) }
}
