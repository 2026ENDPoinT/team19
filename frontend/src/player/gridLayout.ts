export const gridTextWidth = (text: string) => Array.from(text).reduce((sum, char) => sum + (/\s/.test(char) ? 5 : /^[\x20-\x7e]$/.test(char) ? 10 : 16), 0)
export function gridTextLines(text: string, width: number): string[] {
  return text.split('\n').flatMap(paragraph => {
    const lines: string[] = []
    let line = ''
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word
      if (gridTextWidth(next) <= width) { line = next; continue }
      if (line) lines.push(line)
      line = ''
      for (const char of word) {
        if (line && gridTextWidth(line + char) > width) { lines.push(line); line = '' }
        line += char
      }
    }
    return [...lines, line]
  })
}export type CellPoint = { x: number; y: number }
export function layoutGrid(cells: string[][], indexLabels: boolean, pointerCount: number) {
  const columns = Math.max(1, ...cells.map((row) => row.length))
  const table = cells.some((row) => row.some((value) => value.length > 3))
  const gap = columns > 8 ? 4 : 6
  const cellWidth = Math.min(table ? 164 : 42, (344 - gap * (columns - 1)) / columns)
  const cellHeight = table ? Math.max(44, ...cells.flatMap(row => row.map(value => gridTextLines(value, cellWidth - 16).length * 20 + 16))) : cellWidth
  const indexHeight = indexLabels ? 14 : 0
  const pointerHeight = pointerCount * 24
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
  return { width, height, cellWidth, cellHeight, positions, table }
}
