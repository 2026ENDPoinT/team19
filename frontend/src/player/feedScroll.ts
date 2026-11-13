export function wheelPixels(delta: number, mode: number, height: number) {
  return delta * (mode === 1 ? 16 : mode === 2 ? height : 1)
}

export function wheelIntent(delta: number, previous: number, elapsed: number) {
  const total = elapsed < 180 && Math.sign(previous) === Math.sign(delta) ? previous + delta : delta
  return { total, release: Math.abs(delta) >= 120 || Math.abs(total) >= 180 }
}

export function playerSnapOffset(top: number, height: number, viewport: number) {
  return top - Math.max(12, (viewport - height) / 2)
}

export function attachFeedScroll(getPlayer: () => HTMLElement | null) {
  let total = 0, last = 0, releasedUntil = 0
  let snapTarget: number | null = null
  let settleTimer: ReturnType<typeof setTimeout> | undefined
  let animation: number | null = null
  const cancelAnimation = () => {
    if (animation !== null) window.cancelAnimationFrame(animation)
    animation = null
  }
  const animateTo = (target: number) => {
    cancelAnimation()
    const from = window.scrollY, started = performance.now()
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      window.scrollTo({top:target,behavior:'instant'}); return
    }
    const tick = (now: number) => {
      if (document.fullscreenElement || !getPlayer()) { cancelAnimation(); return }
      const t = Math.min(1, Math.max(0, (now - started) / 850))
      const eased = t*t*t*(10+t*(-15+6*t))
      window.scrollTo({top:from+(target-from)*eased,behavior:'instant'})
      animation = t < 1 ? window.requestAnimationFrame(tick) : null
    }
    animation = window.requestAnimationFrame(tick)
  }
  const settle = () => {
    if (animation !== null) return
    clearTimeout(settleTimer)
    settleTimer = setTimeout(() => {
      const player = getPlayer()
      if (!player || document.fullscreenElement || performance.now() < releasedUntil) return
      const rect = player.getBoundingClientRect()
      const offset = playerSnapOffset(rect.top, rect.height, window.innerHeight)
      if (Math.abs(offset) < 2 || Math.abs(offset) > Math.min(220, window.innerHeight * .25)) return
      snapTarget = window.scrollY + offset
      animateTo(snapTarget)
    }, 160)
  }
  const wheel = (event: WheelEvent) => {
    const player = getPlayer()
    if (!player || document.fullscreenElement || event.ctrlKey || !event.cancelable) return
    if (event.target instanceof Element && event.target.closest('.player-more-options, .source-page-panel, input, textarea, select, [contenteditable="true"]')) return
    const now = performance.now()
    if (now < releasedUntil) { releasedUntil = now + 900; return }
    const delta = wheelPixels(event.deltaY, event.deltaMode, window.innerHeight)
    if (!delta || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
    const rect = player.getBoundingClientRect()
    const top = playerSnapOffset(rect.top, rect.height, window.innerHeight)
    const near = Math.abs(top) <= 140
    const crossing = top * delta > 0 && Math.abs(top) <= Math.abs(delta)
    if (!near && !crossing) { total = 0; snapTarget = null; return }
    clearTimeout(settleTimer)
    const intent = wheelIntent(delta, total, now - last)
    total = intent.total; last = now
    if (intent.release) {
      cancelAnimation(); releasedUntil = now + 900; total = 0; snapTarget = null
      window.scrollTo({ top: window.scrollY, behavior: 'instant' })
      return
    }
    event.preventDefault()
    const target = window.scrollY + top
    if (snapTarget === null || Math.abs(target - snapTarget) > 2) {
      snapTarget = target
      animateTo(target)
    }
  }
  const key = (event: KeyboardEvent) => {
    if (['Escape', 'PageUp', 'PageDown', 'Home', 'End', 'Tab'].includes(event.key)) {
      cancelAnimation(); releasedUntil = performance.now() + 900; total = 0; snapTarget = null
      window.scrollTo({ top: window.scrollY, behavior: 'instant' })
    }
  }
  window.addEventListener('scroll', settle, { passive: true })
  document.addEventListener('wheel', wheel, { passive: false })
  document.addEventListener('keydown', key)
  return () => { cancelAnimation(); clearTimeout(settleTimer); window.removeEventListener('scroll', settle); document.removeEventListener('wheel', wheel); document.removeEventListener('keydown', key) }
}
