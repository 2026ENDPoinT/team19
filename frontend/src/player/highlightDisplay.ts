import type { Entity } from './state.ts'

// Limit presentation only; persistent actions and D-46 term state stay intact.
export function limitHighlights(elements: Entity[]): Entity[] {
  const result = structuredClone(elements)
  let remaining = 2
  const take = () => remaining > 0 ? (remaining--, true) : false
  function visit(element: Entity, inherited = false) {
    if (element.hidden) return
    const active = inherited || element.explaining === true
    if (element.nodes) {
      element.explaining = false
      for (const node of element.nodes) visit(node, active)
      const visible = new Set(element.nodes.filter(node => !node.hidden).map(node => node.id))
      for (const edge of element.edges ?? []) {
        if (visible.has(String(edge.from)) && visible.has(String(edge.to))) visit(edge, active)
        else edge.explaining = false
      }
    } else if (element.cells) {
      element.explaining = false
      const selected = new Set(element.explainedCells ?? [])
      element.explainedCells = element.cells.flatMap((row, r) => row.flatMap((_, c) => {
        const key = `${r},${c}`
        return (active || selected.has(key)) && take() ? [key] : []
      }))
    } else if (Array.isArray(element.lines)) {
      element.explaining = false
      if (element.explainedLine !== undefined && !take()) delete element.explainedLine
    } else if (element.marks) {
      element.explaining = false
      element.explainedMarks = (element.explainedMarks ?? []).filter(() => take())
    } else {
      const termsActive = Object.keys(element.formulaTermColors ?? {}).length > 0 || element.formulaWhole
      element.explaining = active && !termsActive && take()
    }
    for (const pointer of element.pointers ?? []) visit(pointer, active)
  }
  for (const element of result) visit(element)
  return result
}
