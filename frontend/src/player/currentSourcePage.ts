import type { PlayerState } from './state.ts'

export function currentSourcePage(state: PlayerState | null) {
  if (!state) return null
  const pages = [...new Set(state.sourcePages)]
  if (!pages.length) return null
  const slides = state.elements.filter(element => !element.hidden && typeof element.page === 'number' && element.box && pages.includes(element.page))
  const active = [...new Set(slides.filter(element => element.explaining).map(element => element.page as number))]
  if (active.length === 1) return { page: active[0], representative: false }
  const visible = [...new Set(slides.map(element => element.page as number))]
  if (visible.length === 1) return { page: visible[0], representative: false }
  return { page: pages[0], representative: pages.length > 1 }
}
