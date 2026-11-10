import { useEffect, useRef, useState } from 'react'
import { bindAudioClock } from './audioClock'

export function useAudioClock(sourceKey: string) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [time, setTime] = useState(0)

  useEffect(() => {
    setTime(0)
    const audio = audioRef.current
    if (!audio) return
    return bindAudioClock(audio, setTime)
  }, [sourceKey])

  function restart() {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = 0
    setTime(0)
  }

  return { audioRef, time, restart }
}
