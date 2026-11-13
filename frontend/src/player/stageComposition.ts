import type { Entity } from './state.ts'
import { reserveTextSlots } from './figureDescription.ts'

export function stageComposition(elements: Entity[]) {
  const visible = elements.filter(element => !element.hidden)
  const title = visible.find(element => element.slot === 'top' && element.style === 'title')
  const topVisible = visible.filter(element => element.slot === 'top')
  const topAux = topVisible.length === 2 && title ? topVisible.find(element => element !== title) : undefined
  const protagonist = visible.find(element => element.slot === 'middle' && (element.cells || element.nodes || Array.isArray(element.lines)))
  const status = protagonist ? (visible.find(element => element.style === 'keyword' && element.slot === 'bottom')
    ?? elements.find(element => element.style === 'keyword' && element.slot === 'bottom')) : undefined
  const reserved = reserveTextSlots(elements.filter(element => element !== topAux && element !== status && !(element.hidden && element.style === 'title')))
  const slots = ['top', 'middle', 'bottom']
  const invalid = visible.some(element => !slots.includes(element.slot ?? '')) || slots.some(slot => visible.filter(element => element.slot === slot && element !== topAux).length > 1)
  return { title, topAux, status, reserved, invalid }
}
