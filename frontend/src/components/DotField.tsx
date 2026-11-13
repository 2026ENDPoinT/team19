import { useEffect, useRef } from 'react'

// 마우스에 반응하는 도트 판. 커서 근처의 점이 커지고 파랗게 빛났다가 천천히 돌아온다.
// 배경 장식이라 클릭을 막지 않고 화면 낭독기도 읽지 않는다. 움직임 줄이기 설정이면 점만 그린다.
type Props = { spacing?: number; radius?: number; className?: string }

export default function DotField({ spacing = 14, radius = 110, className = '' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    let width = 0, height = 0, columns = 0, rows = 0
    let heat = new Float32Array(0)
    let pointer: { x: number; y: number } | null = null
    let frame = 0

    function resize() {
      const ratio = Math.min(2, globalThis.devicePixelRatio || 1)
      width = canvas!.clientWidth; height = canvas!.clientHeight
      canvas!.width = Math.round(width * ratio); canvas!.height = Math.round(height * ratio)
      context!.setTransform(ratio, 0, 0, ratio, 0, 0)
      columns = Math.ceil(width / spacing); rows = Math.ceil(height / spacing)
      heat = new Float32Array(columns * rows)
      draw()
    }

    function draw() {
      context!.clearRect(0, 0, width, height)
      let active = false
      for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        const index = row * columns + column
        const x = column * spacing + spacing / 2, y = row * spacing + spacing / 2
        const target = pointer ? Math.max(0, 1 - Math.hypot(x - pointer.x, y - pointer.y) / radius) : 0
        // 다가갈 때는 빠르게, 멀어질 때는 천천히 식는다.
        heat[index] += (target - heat[index]) * (target > heat[index] ? 0.35 : 0.06)
        const h = heat[index]
        if (h > 0.01) active = true
        const size = Math.min(spacing * .8, 2 + h * 3.5)
        context!.fillStyle = h > 0.02 ? `rgba(37, 99, 235, ${0.25 + h * 0.75})` : 'rgba(148, 163, 184, 0.35)'
        context!.fillRect(x - size / 2, y - size / 2, size, size)
      }
      return active
    }

    function loop() {
      frame = 0
      const active = draw()
      if (!still && (active || pointer)) frame = requestAnimationFrame(loop)
    }

    function move(event: PointerEvent) {
      const rect = canvas!.getBoundingClientRect()
      const x = (event.clientX - rect.left) * width / rect.width, y = (event.clientY - rect.top) * height / rect.height
      pointer = x > -radius && y > -radius && x < width + radius && y < height + radius ? { x, y } : null
      if (!frame) frame = requestAnimationFrame(loop)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()
    const leave = () => { pointer = null; if (!frame) frame = requestAnimationFrame(loop) }
    if (!still) {
      window.addEventListener('pointermove', move, { passive: true })
      document.addEventListener('pointerleave', leave)
    }
    return () => { observer.disconnect(); window.removeEventListener('pointermove', move); document.removeEventListener('pointerleave', leave); cancelAnimationFrame(frame) }
  }, [spacing, radius])
  return <canvas ref={canvasRef} className={`dot-field ${className}`} aria-hidden="true" />
}
