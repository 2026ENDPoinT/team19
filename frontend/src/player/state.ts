export type Action = { line: number; do: string; target: string; args: string[] }
export type Entity = {
  id: string; hidden?: boolean; slot?: string; content?: string
  cells?: string[][]; row?: number; col?: number; box?: number[]
  nodes?: Entity[]; edges?: Entity[]; pointers?: Entity[]
  highlighted?: boolean; highlightedCells?: string[]; markedLine?: number
  focusBox?: number[]; marks?: { box: number[]; label: string }[]
  [key: string]: unknown
}
export type Scene = {
  id: string; clear: boolean; lines: string[]; sourcePages: number[]
  texts: Entity[]; slides: Entity[]; diagrams: Entity[]; grids: Entity[]; codes: Entity[]
  actions: Action[]
}
export type Blueprint = { version: number; title: string; theme: string; scenes: Scene[] }
export type Timing = { sceneId: string; lineIndex: number; text: string; startSec: number; endSec: number }
export type PlayerState = { sceneId: string | null; sourcePages: number[]; elements: Entity[]; caption: string }

function position(value: string, grid: Entity): [number, number] {
  const parts = value.split(',').map(Number)
  const row = parts.length === 1 ? 0 : parts[0]
  const col = parts.length === 1 ? parts[0] : parts[1]
  if (parts.length > 2 || !Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || grid.cells?.[row]?.[col] === undefined) {
    throw new Error(`격자 위치 오류: ${value}`)
  }
  return [row, col]
}

function cellKeys(value: string, grid: Entity): string[] {
  const range = /^(?:(\d+),)?(\d+)-(\d+)$/.exec(value)
  if (range) {
    const row = Number(range[1] ?? 0)
    const start = Number(range[2])
    const end = Number(range[3])
    if (end < start || !grid.cells?.[row] || end >= grid.cells[row].length) throw new Error('격자 범위 오류')
    return Array.from({ length: end - start + 1 }, (_, index) => position(`${row},${start + index}`, grid).join(','))
  }
  return [position(value, grid).join(',')]
}
function coordinates(value: string): number[] {
  const box = value.split(',').map(Number)
  if (box.length !== 4 || box.some((v) => !Number.isFinite(v)) || box[0] < 0 || box[1] < 0 || box[2] <= 0 || box[3] <= 0 || box[0] + box[2] > 1.000001 || box[1] + box[3] > 1.000001) throw new Error('슬라이드 좌표 오류')
  return box
}

function applyAction(elements: Entity[], action: Action) {
  const all = elements.flatMap((element) => [element, ...(element.nodes ?? []), ...(element.edges ?? []), ...(element.pointers ?? [])])
  const target = all.find((element) => element.id === action.target)
  if (!target) throw new Error(`동작 대상 없음: ${action.target}`)
  const args = action.args
  switch (action.do) {
    case 'show': target.hidden = false; break
    case 'hide': target.hidden = true; break
    case 'highlight':
    case 'unhighlight': {
      const enabled = action.do === 'highlight'
      if (target.cells && args.length) {
        const keys = args.flatMap((arg) => cellKeys(arg, target))
        const current = new Set(target.highlightedCells ?? [])
        for (const key of keys) { if (enabled) current.add(key); else current.delete(key) }
        target.highlightedCells = [...current]
      } else target.highlighted = enabled
      break
    }
    case 'swap': {
      const [r1, c1] = position(args[0], target)
      const [r2, c2] = position(args[1], target)
      const cells = target.cells!
      ;[cells[r1][c1], cells[r2][c2]] = [cells[r2][c2], cells[r1][c1]]
      break
    }
    case 'setValue': {
      const [row, col] = position(args[0], target)
      target.cells![row][col] = args[1]
      break
    }
    case 'move': {
      const grid = elements.find((element) => element.pointers?.some((pointer) => pointer.id === target.id))
      if (!grid) throw new Error('포인터의 격자가 없습니다.')
      ;[target.row, target.col] = position(args[0], grid)
      break
    }
    case 'setText': target.content = args[0]; break
    case 'markLine': target.markedLine = Number(args[0]); break
    case 'focus': target.focusBox = coordinates(args[0]); break
    case 'mark': target.marks = [...(target.marks ?? []), { box: coordinates(args[0]), label: args[1] ?? '' }]; break
    case 'unmark': {
      if (!args.length) target.marks = []
      else {
        const box = coordinates(args[0])
        target.marks = (target.marks ?? []).filter((mark) => !mark.box.every((v, i) => v === box[i]))
      }
      break
    }
    default: throw new Error(`지원하지 않는 동작: ${action.do}`)
  }
}

// 매 호출을 초기 상태부터 계산하므로 seek/반복 때 이전 결과가 누적되지 않는다.
// 현재 블록에서는 동작을 즉시 순서대로 적용한다. 보간 애니메이션은 렌더러 단계다.
export function calculatePlayerState(blueprint: Blueprint, captions: Timing[], seconds: number): PlayerState {
  if (!Number.isFinite(seconds)) throw new Error('유효하지 않은 재생 시간')
  const time = Math.max(0, seconds)
  const state: PlayerState = { sceneId: null, sourcePages: [], elements: [], caption: '' }
  const timings = new Map(captions.map((caption) => [`${caption.sceneId}:${caption.lineIndex}`, caption]))
  let sceneStart = 0
  for (const scene of blueprint.scenes) {
    if (time < sceneStart) break
    if (scene.clear) state.elements = []
    state.sceneId = scene.id
    state.sourcePages = [...scene.sourcePages]
    state.elements.push(...structuredClone([...scene.texts, ...scene.slides, ...scene.diagrams, ...scene.grids, ...scene.codes]))
    for (const action of scene.actions) {
      const caption = timings.get(`${scene.id}:${action.line}`)
      if (!caption) throw new Error(`동작의 자막 없음: ${scene.id}:${action.line}`)
      if (caption.startSec <= time) applyAction(state.elements, action)
    }
    const last = timings.get(`${scene.id}:${scene.lines.length - 1}`)
    if (!last) throw new Error(`장면의 마지막 자막 없음: ${scene.id}`)
    sceneStart = last.endSec
  }
  state.caption = captions.find((caption) => time >= caption.startSec && time < caption.endSec)?.text ?? ''
  return state
}
