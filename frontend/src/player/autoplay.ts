export function startAutoplay(audio: Pick<HTMLAudioElement, 'play'>, onError: () => void) {
  let active = true
  void audio.play().catch(() => { if (active) onError() })
  return () => { active = false }
}
