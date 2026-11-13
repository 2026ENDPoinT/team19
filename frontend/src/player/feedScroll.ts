export function wheelPixels(delta: number, mode: number, height: number) {
  return delta * (mode === 1 ? 16 : mode === 2 ? height : 1)
}

export function wheelIntent(delta: number, previous: number, elapsed: number) {
  const total = elapsed < 180 && Math.sign(previous) === Math.sign(delta) ? previous + delta : delta
  return { total, release: Math.abs(delta) >= 120 || Math.abs(total) >= 180 }
}

export function attachFeedScroll(getPlayer: () => HTMLElement | null) {
  let total = 0, last = 0, releasedUntil = 0
  let snapTarget: number | null = null
  const wheel = (event: WheelEvent) => {
    const player = getPlayer()
    if (!player || document.fullscreenElement || event.ctrlKey || !event.cancelable) return
    if (event.target instanceof Element && event.target.closest('.player-more-options, .source-page-panel, input, textarea, select, [contenteditable="true"]')) return
    const now = performance.now()
    if (now < releasedUntil) return
    const delta = wheelPixels(event.deltaY, event.deltaMode, window.innerHeight)
    if (!delta || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
    const top = player.getBoundingClientRect().top - 12
    const near = Math.abs(top) <= 140
    const crossing = top * delta > 0 && Math.abs(top) <= Math.abs(delta)
    if (!near && !crossing) { total = 0; snapTarget = null; return }
    const intent = wheelIntent(delta, total, now - last)
    total = intent.total; last = now
    if (intent.release) {
      releasedUntil = now + 900; total = 0; snapTarget = null
      window.scrollTo({ top: window.scrollY, behavior: 'instant' })
      return
    }
    event.preventDefault()
    const target = window.scrollY + top
    if (snapTarget === null || Math.abs(target - snapTarget) > 2) {
      snapTarget = target
      window.scrollTo({ top: target, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
    }
  }
  const key = (event: KeyboardEvent) => {
    if (['Escape', 'PageUp', 'PageDown', 'Home', 'End', 'Tab'].includes(event.key)) {
      releasedUntil = performance.now() + 900; total = 0; snapTarget = null
      window.scrollTo({ top: window.scrollY, behavior: 'instant' })
    }
  }
  document.addEventListener('wheel', wheel, { passive: false })
  document.addEventListener('keydown', key)
  return () => { document.removeEventListener('wheel', wheel); document.removeEventListener('keydown', key) }
}
