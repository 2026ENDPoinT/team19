export const palette = { mint: '#4fe3c1', yellow: '#ffdf00', coral: '#fb6b6e', pink: '#f52e7f' } as const
export const playerColorVariables = {
  '--player-mint': palette.mint, '--player-yellow': palette.yellow,
  '--player-coral': palette.coral, '--player-pink': palette.pink,
}

export const defaultLineColor = '#E2E2E2'
export const defaultTextColor = '#ffffff'

export function pointerColor(label: unknown, id: string): string {
  const key = String(label ?? '').trim().normalize('NFC') || id
  if (key === 'i') return palette.yellow
  if (key === 'j') return palette.mint
  let hash = 0
  for (const char of key) hash = (hash * 31 + char.codePointAt(0)!) >>> 0
  return [palette.yellow, palette.mint, palette.coral][hash % 3]
}
