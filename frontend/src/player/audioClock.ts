type AudioSource = Pick<HTMLAudioElement, 'currentTime' | 'paused' | 'ended' | 'seeking' | 'pause' | 'addEventListener' | 'removeEventListener'>
type Frames = { request: (callback: FrameRequestCallback) => number; cancel: (id: number) => void }

export function bindAudioClock(audio: AudioSource, onTime: (seconds: number) => void, frames: Frames = { request: requestAnimationFrame, cancel: cancelAnimationFrame }) {
  let frame: number | null = null
  let disposed = false
  const events = ['play', 'playing', 'pause', 'seeking', 'seeked', 'timeupdate', 'ended', 'loadedmetadata', 'emptied', 'waiting']
  function sync() {
    if (!disposed) onTime(Number.isFinite(audio.currentTime) ? Math.max(0, audio.currentTime) : 0)
  }
  function tick() {
    frame = null
    if (disposed) return
    sync()
    if (!audio.paused && !audio.ended && !audio.seeking) frame = frames.request(tick)
  }
  function refresh() {
    if (disposed) return
    if (frame !== null) frames.cancel(frame)
    frame = null
    sync()
    if (!audio.paused && !audio.ended && !audio.seeking) frame = frames.request(tick)
  }
  events.forEach((event) => audio.addEventListener(event, refresh))
  refresh()
  return () => {
    disposed = true
    if (frame !== null) frames.cancel(frame)
    events.forEach((event) => audio.removeEventListener(event, refresh))
    audio.pause()
  }
}
