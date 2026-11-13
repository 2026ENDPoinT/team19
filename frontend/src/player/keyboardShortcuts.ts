type ShortcutEvent = Pick<KeyboardEvent, 'key' | 'repeat' | 'altKey' | 'ctrlKey' | 'metaKey' | 'isComposing' | 'preventDefault' | 'stopPropagation'>

export function handlePlayerShortcut(event: ShortcutEvent, audio: Pick<HTMLAudioElement, 'paused' | 'currentTime'> | null, duration: number, togglePlayback: () => void, editing: boolean) {
  if (!audio || editing || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return
  if (![' ', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
  event.preventDefault()
  event.stopPropagation()
  if (event.key === ' ') {
    if (!event.repeat) togglePlayback()
  } else {
    const step = event.key === 'ArrowLeft' ? -1 : 1
    audio.currentTime = Math.min(Math.max(0, audio.currentTime + step * (audio.paused ? 1 : 2)), duration)
  }
}
