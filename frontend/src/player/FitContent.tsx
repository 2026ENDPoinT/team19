import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

// 원래 크기를 측정한 뒤 배정된 영역 안에 가로세로 같은 비율로 맞춘다.
export default function FitContent({ children }: { children: ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const frame = frameRef.current, content = contentRef.current
    if (!frame || !content) return
    function fit() {
      if (!frame || !content) return
      setScale(Math.min(1, frame.clientWidth / 360, frame.clientHeight / Math.max(1, content.offsetHeight)))
    }
    const observer = new ResizeObserver(fit)
    observer.observe(frame); observer.observe(content)
    fit()
    return () => observer.disconnect()
  }, [])
  return <div ref={frameRef} className="player-fit-frame"><div ref={contentRef} className="player-fit-content" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>{children}</div></div>
}
