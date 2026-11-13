import type { Entity } from './state.ts'

// 강조 밖 흐리게(P-AI-09 2번, D-56). 강조(highlight)가 켜진 동안 강조되지 않은 부품·노드·선·칸을 살짝 투명하게 한다.
export const DIM_OPACITY = 0.7

export function isLit(element: Entity): boolean {
  return element.highlighted === true || element.heldLit === true || Boolean(element.highlightedCells?.length) || Boolean(element.heldCells?.length) || element.formulaWhole === true
    || Object.keys(element.formulaTermColors ?? {}).length > 0
    || Boolean(element.nodes?.some(node => (node.highlighted || node.heldLit) && !node.hidden)) || Boolean(element.edges?.some(edge => (edge.highlighted || edge.heldLit) && !edge.hidden))
}

// 부품 안에서 일부만 강조됐으면 나머지 노드·선·칸을 흐린다. 부품 전체 강조면 흐리지 않는다.
export function dimsParts(element: Entity): boolean {
  return element.highlighted !== true && element.heldLit !== true && isLit(element)
}

// 제목은 흐리지 않는다.
export function dimsElement(element: Entity, anyLit: boolean): boolean {
  return anyLit && element.style !== 'title' && !isLit(element)
}

// 노드·선·칸 하나가 (유지 포함) 강조 상태인지
export const partLit = (part: { highlighted?: boolean; heldLit?: boolean }) => part.highlighted === true || part.heldLit === true
export const cellLit = (element: Entity, key: string) => Boolean(element.highlightedCells?.includes(key) || element.heldCells?.includes(key))
