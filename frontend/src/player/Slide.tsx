import { defaultLineColor, defaultTextColor, palette } from './colors'
import { useState } from 'react'
import type { Entity } from './state'
import { slideViewport } from './slideGeometry'

type Props = { element: Entity; imageUrl?: string }

export default function Slide({ element, imageUrl }: Props) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [failed, setFailed] = useState(false)
  if (!imageUrl) return <p className="player-unsupported">원본 {String(element.page)}쪽 이미지가 연결되지 않았어요.</p>
  if (failed) return <p role="alert" className="player-unsupported">원본 그림을 불러오지 못했어요.</p>
  let geometry
  try { if (size) geometry = slideViewport(element.focusBox ?? element.box ?? [], size.width, size.height) }
  catch (cause) { return <p role="alert" className="player-unsupported">{cause instanceof Error ? cause.message : '원본 영역 오류'}</p> }
  return (
    <div className="player-slide" style={{ height: 180 }}>
      <img hidden src={imageUrl} alt="" onLoad={(event) => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={() => setFailed(true)} />
      {!size || !geometry ? <p role="status">원본 그림 로딩 중…</p> : (
        <svg width="100%" height="100%" viewBox={`${geometry.x} ${geometry.y} ${geometry.width} ${geometry.height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`원본 ${String(element.page)}쪽의 설명 영역`}>
          <image href={imageUrl} width={size.width} height={size.height} />
          {(element.marks ?? []).map((mark, index) => {
            const rect = slideViewport(mark.box, size.width, size.height)
            const active = element.explainedMarks?.some(box => box.every((value, i) => value === mark.box[i]))
            return <g key={index}>
              <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} fill={palette.yellow} fillOpacity={active ? .12 : 0} stroke={active ? palette.yellow : defaultLineColor} strokeWidth="3" vectorEffect="non-scaling-stroke" />
              {mark.label && <text x={rect.x + 4} y={rect.y + 18} fill={active ? palette.yellow : defaultTextColor} fontSize="16" fontWeight="700" paintOrder="stroke" stroke="#020617" strokeWidth="5">{mark.label}</text>}
            </g>
          })}
        </svg>
      )}
    </div>
  )
}
