type VisibilityState = { playing: boolean; hovered: boolean; interacting: boolean }
type Scheduler = { set: (callback: () => void, delay: number) => unknown; clear: (id: unknown) => void }

export function scheduleControlsVisibility(state: VisibilityState, onVisible: (visible: boolean) => void, scheduler: Scheduler = {
  set: (callback, delay) => setTimeout(callback, delay),
  clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
}) {
  let disposed = false
  onVisible(true)
  if (!state.playing || state.hovered || state.interacting) return () => {}
  const timer = scheduler.set(() => { if (!disposed) onVisible(false) }, 1500)
  return () => { disposed = true; scheduler.clear(timer) }
}
