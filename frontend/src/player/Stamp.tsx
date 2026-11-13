// 부정(X)·맞음(O) 도장(D-53, P-AI-07). (0,0)을 가운데로 size 크기만큼 그린다. 아래 글자가 비치도록 채우지 않는다.
export const stampColors = { x: '#ff4d5e', o: '#22c55e' }

export function StampMark({ kind, size }: { kind: 'x' | 'o'; size: number }) {
  const r = size / 2, width = Math.max(3, size * .11)
  return <g className="player-stamp" aria-label={kind === 'x' ? '아님 표시' : '맞음 표시'} stroke={stampColors[kind]} strokeWidth={width} strokeLinecap="round" fill="none" opacity=".9">
    {kind === 'x' ? <path d={`M ${-r} ${-r} L ${r} ${r} M ${r} ${-r} L ${-r} ${r}`} /> : <circle r={r} />}
  </g>
}
