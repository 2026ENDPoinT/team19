export function slideViewport(box: number[], width: number, height: number) {
  if (box.length !== 4 || box.some((v) => !Number.isFinite(v)) || width <= 0 || height <= 0 || box[0] < 0 || box[1] < 0 || box[2] <= 0 || box[3] <= 0 || box[0] + box[2] > 1.000001 || box[1] + box[3] > 1.000001) throw new Error('잘못된 원본 그림 영역입니다.')
  return { x: box[0] * width, y: box[1] * height, width: box[2] * width, height: box[3] * height }
}
