import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { scheduleControlsVisibility } from './controlVisibility'

type Props = {
  audioRef: RefObject<HTMLAudioElement | null>
  time: number
  duration: number
  isPlaying: boolean
  isFullscreen: boolean
  onTogglePlayback: () => void
  onRestart: () => void
  onFullscreen: () => void
}

function clock(seconds: number) {
  const value = Math.max(0, Math.floor(seconds))
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`
}

function Icon({ name }: { name: 'play' | 'pause' | 'sound' | 'mute' | 'fullscreen' | 'exit-fullscreen' | 'more' }) {
  const paths = {
    play: 'M8 5v14l11-7z', pause: 'M7 5v14M17 5v14',
    sound: 'M11 4 5 9H2v6h3l6 5zM15 8c3 2 3 6 0 8M18 5c5 4 5 10 0 14',
    mute: 'M11 4 5 9H2v6h3l6 5zM16 9l6 6M22 9l-6 6',
    fullscreen: 'M9 3H3v6M15 3h6v6M3 15v6h6M15 21h6v-6',
    'exit-fullscreen': 'M3 8h5V3M16 3v5h5M21 16h-5v5M8 21v-5H3',
    more: 'M12 5v.01M12 12v.01M12 19v.01',
  }
  return <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill={name === 'play' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={name === 'more' ? 4 : 2} strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>
}

export default function PlayerControls({ audioRef, time, duration, isPlaying, isFullscreen, onTogglePlayback, onRestart, onFullscreen }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pointerInside, setPointerInside] = useState(false)
  const [keyboardFocus, setKeyboardFocus] = useState(false)
  const [visible, setVisible] = useState(true)
  const [keyNudge, setKeyNudge] = useState(0)
  useEffect(() => {
    const surface = rootRef.current?.parentElement
    if (!surface) return
    const enter = () => setPointerInside(true)
    const leave = () => setPointerInside(false)
    // 방향키 탐색 때도 조작부를 다시 보여 주고 1.5초 타이머를 새로 시작한다.
    const key = (event: KeyboardEvent) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') setKeyNudge((n) => n + 1) }
    setPointerInside(surface.matches(':hover'))
    surface.addEventListener('pointerenter', enter)
    surface.addEventListener('pointerleave', leave)
    surface.addEventListener('keydown', key)
    return () => { surface.removeEventListener('pointerenter', enter); surface.removeEventListener('pointerleave', leave); surface.removeEventListener('keydown', key) }
  }, [])
  useEffect(() => scheduleControlsVisibility({
    playing: isPlaying, hovered: pointerInside, interacting: menuOpen || keyboardFocus,
  }, setVisible), [isPlaying, pointerInside, menuOpen, keyboardFocus, keyNudge])
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState(1)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    function sync() {
      if (!audio) return
      setVolume(audio.volume); setMuted(audio.muted); setRate(audio.playbackRate); setReady(audio.readyState >= 1)
    }
    const events = ['volumechange', 'ratechange', 'loadedmetadata', 'emptied']
    events.forEach((event) => audio.addEventListener(event, sync))
    sync()
    return () => events.forEach((event) => audio.removeEventListener(event, sync))
  }, [audioRef])
  useEffect(() => {
    if (!menuOpen) return
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [menuOpen])
  function changeRate(value: number) {
    const audio = audioRef.current
    if (audio) { audio.playbackRate = value; setRate(value) }
  }
  return (
    <div ref={rootRef} className={`player-controls${visible ? '' : ' player-controls--hidden'}`} aria-hidden={!visible} inert={!visible}
      onFocusCapture={(event) => setKeyboardFocus(event.target.matches(':focus-visible'))}
      onBlurCapture={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setKeyboardFocus(false) }}
      onKeyDown={(event) => {
      if (event.key === 'Escape' && menuOpen) { event.preventDefault(); event.stopPropagation(); setMenuOpen(false); moreRef.current?.focus() }
    }}>
      <div className="player-topbar">
        <div className="player-control-group">
          <button type="button" className="player-icon-button" aria-label={isPlaying ? '일시정지' : '재생'} onClick={onTogglePlayback}><Icon name={isPlaying ? 'pause' : 'play'} /></button>
          <div className="player-volume-group">
            <button type="button" className="player-icon-button" aria-label={muted || volume === 0 ? '소리 켜기' : '음소거'} onClick={() => { if (audioRef.current) { audioRef.current.muted = !(audioRef.current.muted || audioRef.current.volume === 0); if (audioRef.current.volume === 0) audioRef.current.volume = 1 } }}><Icon name={muted || volume === 0 ? 'mute' : 'sound'} /></button>
            <input type="range" className="player-volume-slider" aria-label="음량" min="0" max="1" step="0.05" value={muted ? 0 : volume} onChange={(event) => { if (audioRef.current) { audioRef.current.volume = Number(event.target.value); audioRef.current.muted = false } }} />
          </div>
        </div>
        <div className="player-control-group">
          <button ref={moreRef} type="button" className="player-icon-button" aria-label="더보기" aria-expanded={menuOpen} aria-controls="player-more-options" onClick={() => setMenuOpen((open) => !open)}><Icon name="more" /></button>
          <button type="button" className="player-icon-button" aria-label={isFullscreen ? '전체화면 종료' : '전체화면'} onClick={onFullscreen}><Icon name={isFullscreen ? 'exit-fullscreen' : 'fullscreen'} /></button>
        </div>
      </div>
      {menuOpen && <div id="player-more-options" className="player-more-options">
        <fieldset><legend>재생 속도</legend><div className="player-speed-options">
          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((value) => <label key={value}><input type="radio" name="playback-rate" value={value} checked={rate === value} onChange={() => changeRate(value)} />{value}×</label>)}
        </div></fieldset>
        <button type="button" className="player-download-pending" disabled>영상 다운로드 · 준비 중</button>
        <p>MP4 내보내기는 팀 검토 중이에요.</p>
      </div>}
      <div className="player-bottom-bar">
        <div className="player-time-row"><span>{clock(time)} / {clock(duration)}</span><button type="button" onClick={onRestart}>처음부터</button></div>
        <input type="range" aria-label="재생 위치" aria-valuetext={`${clock(time)} / ${clock(duration)}`} min="0" max={duration} step="0.05" value={Math.min(time, duration)} disabled={!ready} onChange={(event) => { if (audioRef.current) audioRef.current.currentTime = Number(event.target.value) }} />
      </div>
    </div>
  )
}
