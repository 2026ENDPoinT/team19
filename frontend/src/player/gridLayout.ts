export type CellPoint = { x: number; y: number }
export function layoutGrid(cells: string[][], indexLabels: boolean, pointerCount: number) {
  const columns = Math.max(1, ...cells.map((row) => row.length))
  const table = cells.some((row) => row.some((value) => value.length > 3))
  const gap = columns > 8 ? 4 : 6
  const cellWidth = Math.min(table ? 84 : 42, (344 - gap * (columns - 1)) / columns)
  const cellHeight = table ? 36 : cellWidth
  const indexHeight = indexLabels ? 14 : 0
  const pointerHeight = pointerCount * 16
  const rowHeight = indexHeight + cellHeight + pointerHeight + 12
  const width = columns * cellWidth + (columns - 1) * gap + 16
  const height = Math.max(1, cells.length) * rowHeight + 4
  const positions = new Map<string, CellPoint>()
  cells.forEach((row, rowIndex) => {
    const rowWidth = row.length * cellWidth + Math.max(0, row.length - 1) * gap
    row.forEach((_, col) => positions.set(`${rowIndex},${col}`, {
      x: (width - rowWidth) / 2 + col * (cellWidth + gap) + cellWidth / 2,
      y: 4 + rowIndex * rowHeight + indexHeight + cellHeight / 2,
    }))
  })
  return { width, height, cellWidth, cellHeight, positions }
}
