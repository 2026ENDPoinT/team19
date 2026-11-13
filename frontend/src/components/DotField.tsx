import { useEffect, useRef } from 'react'

// 마우스에 반응하는 도트 판. 커서 근처의 점이 커지고 파랗게 빛났다가 천천히 돌아온다.
// anchors(CSS 선택자)를 주면 그 요소(버튼 등) 주변에만 점이 보이고, 멀어질수록 부드럽게 사라진다.
// 배경 장식이라 클릭을 막지 않고 화면 낭독기도 읽지 않는다. 움직임 줄이기 설정이면 점만 그린다.
type Props = { spacing?: number; radius?: number; className?: string; anchors?: string; fade?: number; maxSize?: number }

// 0~1을 처음과 끝이 완만하게 이어 준다.
const smooth = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x) }

// maxSize: 마우스가 가장 가까울 때 점 크기(px). 평소 점은 2px.
export default function DotField({ spacing = 14, radius = 110, className = '', anchors, fade = 150, maxSize = 3.85 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    let width = 0, height = 0, columns = 0, rows = 0
    let heat = new Float32Array(0)
    let near = new Float32Array(0) // 점마다 보이는 정도(버튼 근처 1 → 멀면 0)
    let pointer: { x: number; y: number } | null = null
    let frame = 0

    // 버튼 사각형까지의 거리로 점마다 보이는 정도를 미리 계산한다.
    function measure() {
      near = new Float32Array(columns * rows).fill(anchors ? 0 : 1)
      if (!anchors) return
      const box = canvas!.getBoundingClientRect()
      const rects = [...(canvas!.parentElement?.querySelectorAll(anchors) ?? [])].map((element) => element.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .map((rect) => ({ left: rect.left - box.left, right: rect.right - box.left, top: rect.top - box.top, bottom: rect.bottom - box.top }))
      for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        const x = column * spacing + spacing / 2, y = row * spacing + spacing / 2
        let distance = Infinity
        for (const rect of rects) distance = Math.min(distance, Math.hypot(Math.max(rect.left - x, 0, x - rect.right), Math.max(rect.top - y, 0, y - rect.bottom)))
        near[row * columns + column] = 1 - smooth(distance / fade)
      }
    }

    function resize() {
      // 크기는 화면 배율과 무관한 clientWidth/Height로 잰다. 페이지 전체를 덮을 만큼 커지면 선명도를 낮춰 메모리를 아낀다(약 800만 픽셀 이하).
      width = canvas!.clientWidth; height = canvas!.clientHeight
      const ratio = Math.max(0.5, Math.min(2, globalThis.devicePixelRatio || 1, Math.sqrt(8e6 / Math.max(1, width * height))))
      canvas!.width = Math.round(width * ratio); canvas!.height = Math.round(height * ratio)
      context!.setTransform(ratio, 0, 0, ratio, 0, 0)
      columns = Math.ceil(width / spacing); rows = Math.ceil(height / spacing)
      heat = new Float32Array(columns * rows)
      measure()
      draw()
    }

    function draw() {
      context!.clearRect(0, 0, width, height)
      let active = false
      for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        const index = row * columns + column
        const visible = near[index]
        if (visible < 0.02) { heat[index] = 0; continue }
        const x = column * spacing + spacing / 2, y = row * spacing + spacing / 2
        const target = pointer ? Math.max(0, 1 - Math.hypot(x - pointer.x, y - pointer.y) / radius) : 0
        // 다가갈 때는 빠르게, 멀어질 때는 천천히 식는다.
        heat[index] += (target - heat[index]) * (target > heat[index] ? 0.35 : 0.06)
        const h = heat[index]
        if (h > 0.01) active = true
        const size = Math.min(spacing * .8, 2 + h * (maxSize - 2))
        context!.fillStyle = h > 0.02 ? `rgba(37, 99, 235, ${(0.25 + h * 0.75) * visible})` : `rgba(148, 163, 184, ${0.4 * visible})`
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
    // 파일을 고르는 등 버튼 위치가 바뀌면 다시 잰다.
    const mutations = new MutationObserver(() => { measure(); if (!frame) frame = requestAnimationFrame(loop) })
    if (anchors && canvas.parentElement) mutations.observe(canvas.parentElement, { childList: true, subtree: true })
    resize()
    const leave = () => { pointer = null; if (!frame) frame = requestAnimationFrame(loop) }
    if (!still) {
      window.addEventListener('pointermove', move, { passive: true })
      document.addEventListener('pointerleave', leave)
    }
    return () => { observer.disconnect(); mutations.disconnect(); window.removeEventListener('pointermove', move); document.removeEventListener('pointerleave', leave); cancelAnimationFrame(frame) }
  }, [spacing, radius, anchors, fade, maxSize])
  return <canvas ref={canvasRef} className={`dot-field ${className}`} aria-hidden="true" />
}
