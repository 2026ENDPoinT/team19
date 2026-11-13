import type { Entity } from './state.ts'

export function figureDescription(elements: Entity[], reserveHidden = false) {
  const visible = elements.filter(element => !element.hidden)
  const figures = visible.filter(element => element.nodes || element.cells)
  const description = (reserveHidden ? elements : visible).find(element => element.slot === 'bottom' && element.style === 'body' && typeof element.content === 'string')
  // shortcut: v0 has no text-to-figure target; only group an unambiguous single middle figure.
  return figures.length === 1 && figures[0].slot === 'middle' && description
    ? { figureId: figures[0].id, description }
    : null
}

export function reserveTextSlots(elements: Entity[]): Entity[] {
  return ['top', 'middle', 'bottom'].flatMap(slot => {
    const candidates = elements.filter(element => element.slot === slot)
    const element = candidates.find(element => !element.hidden)
      ?? candidates.find(element => typeof element.content === 'string')
    return element ? [element] : []
  })
}
