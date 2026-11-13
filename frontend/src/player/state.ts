import { validateNear } from './nearState.ts'
import { formulaTermColors, parseFormulaTerms } from './formulaTerms.ts'
import { isLit } from './focusDim.ts'
export type Action = { line: number; do: string; target: string; args: string[] }
export type Near = { target: string; side: 'above' | 'below' | 'left' | 'right'; cell?: string }
export type Entity = {
  id: string; hidden?: boolean; slot?: string; content?: string
  cells?: string[][]; row?: number; col?: number; box?: number[]
  nodes?: Entity[]; edges?: Entity[]; pointers?: Entity[]
  formulaTermColors?: Record<string, string>; formulaWhole?: boolean;
  explainedCells?: string[]; explainedLine?: number; explainedMarks?: number[][]; explaining?: boolean; highlighted?: boolean; highlightedCells?: string[]; markedLine?: number
  moveOrigin?: { row: number; col: number; progress: number }
  cellOrigins?: Record<string, { row: number; col: number; progress: number }>
  focusBox?: number[]; marks?: { box: number[]; label: string }[]
  stamp?: 'x' | 'o'
  heldLit?: boolean; heldCells?: string[]
  dividers?: string[]
  near?: Near
  attachMotion?: { origin: Entity[]; progress: number }
  [key: string]: unknown
}
export type Scene = {
  id: string; clear: boolean; lines: string[]; sourcePages: number[]
  texts: Entity[]; slides: Entity[]; diagrams: Entity[]; grids: Entity[]; codes: Entity[]
  actions: Action[]
}
export type Blueprint = { version: number; title: string; theme: string; scenes: Scene[] }
export type Timing = { sceneId: string; lineIndex: number; text: string; startSec: number; endSec: number }
export type PlayerState = { sceneId: string | null; resetSceneId?: string | null; sourcePages: number[]; elements: Entity[]; caption: string }

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

// 음성 시간으로 확대 영역을 계산하므로 정지·탐색에도 같은 화면을 만든다.
function focusBoxAtTime(from: number[], to: number[], progress: number): number[] {
  return to.map((value, index) => from[index] + (value - from[index]) * progress)
}

function applyAction(elements: Entity[], action: Action, progress = 1) {
  const all = elements.flatMap((element) => [element, ...(element.nodes ?? []), ...(element.edges ?? []), ...(element.pointers ?? [])])
  const target = all.find((element) => element.id === action.target)
  if (!target) throw new Error(`동작 대상 없음: ${action.target}`)
  const args = action.args
  switch (action.do) {
    case 'show': target.hidden = false; break
    case 'hide': target.hidden = true; delete target.stamp; delete target.attachMotion; delete target.dividers; break
    // 부정(X)·맞음(O) 도장(D-53, P-AI-07). 대상은 텍스트·노드·선. 한 대상에 하나만 남는다.
    case 'stamp': {
      if (args[0] !== 'x' && args[0] !== 'o') throw new Error(`도장은 x 또는 o만 가능해요: ${args[0]}`)
      const stampable = typeof target.content === 'string' || elements.some((element) => element.nodes?.includes(target) || element.edges?.includes(target))
      if (!stampable) throw new Error(`도장을 찍을 수 없는 대상: ${target.id}`)
      target.stamp = args[0]
      break
    }
    case 'unstamp': delete target.stamp; break
    // 격자 구분선(P-AI-13). "row:k"는 k번째 줄 아래 가로선, "col:k"는 k번째 칸 오른쪽 세로선. 칸 위치 기준.
    case 'divide':
    case 'undivide': {
      if (!target.cells) throw new Error(`구분선은 격자에만 그을 수 있어요: ${target.id}`)
      const columns = Math.max(...target.cells.map((row) => row.length))
      for (const arg of args) {
        const match = /^(row|col):(\d+)$/.exec(arg)
        const limit = match?.[1] === 'row' ? target.cells.length - 1 : columns - 1
        if (!match || Number(match[2]) >= limit) throw new Error(`구분선 위치 오류: ${arg}`)
      }
      if (!args.length) throw new Error('구분선 위치가 없어요')
      const current = new Set(target.dividers ?? [])
      for (const arg of args) { if (action.do === 'divide') current.add(arg); else current.delete(arg) }
      target.dividers = [...current]
      break
    }
    // 부품을 다른 자리로 옮긴다(P-AI-09, D-56). 안의 노드·칸·강조·도장 상태는 그대로 따라간다.
    case 'place': {
      if (!['top', 'middle', 'bottom'].includes(args[0])) throw new Error(`옮길 수 없는 자리: ${args[0]}`)
      if (!elements.includes(target)) throw new Error(`자리를 옮길 수 없는 대상: ${target.id}`)
      target.slot = args[0]
      delete target.near; delete target.attachMotion
      break
    }
    case 'attach': {
      if (!elements.includes(target) || typeof target.content !== 'string' || !['body','keyword','formula'].includes(String(target.style)) || ![2,3].includes(args.length) || !['above','below','left','right'].includes(args[1])) throw new Error('attach 대상·방향이 올바르지 않아요.')
      const origin = target.attachMotion?.origin ?? structuredClone(elements).map(element => { delete element.attachMotion; return element })
      target.near = { target: args[0], side: args[1] as Near['side'], ...(args.length === 3 ? { cell: args[2] } : {}) }
      validateNear(elements)
      if (progress < 1) target.attachMotion = { origin, progress }
      else delete target.attachMotion
      break
    }
    case 'highlight':
    case 'unhighlight': {
      const enabled = action.do === 'highlight'
      if (target.style === 'formula' && (args.length || target.content?.includes('\\term'))) {
        const ids = parseFormulaTerms(target.content ?? '').ids
        for (const id of args) if (!ids.includes(id)) throw new Error(`수식 항을 찾을 수 없어요: ${id}`)
        const colors = target.formulaTermColors ??= Object.create(null) as Record<string, string>
        if (!args.length) {
          target.formulaTermColors = Object.create(null) as Record<string, string>
          target.formulaWhole = enabled
        } else {
          if (!enabled && target.formulaWhole) for (const id of ids) colors[id] = formulaTermColors[0]
          target.formulaWhole = false
          args.forEach((id, index) => {
            if (enabled && !Object.hasOwn(colors, id)) colors[id] = formulaTermColors[index % formulaTermColors.length]
            if (!enabled) delete colors[id]
          })
        }
        target.highlighted = enabled && !args.length
      } else if (target.cells && args.length) {
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
      const key1 = `${r1},${c1}`, key2 = `${r2},${c2}`
      if (key1 === key2) break
      const origins = target.cellOrigins ??= {}
      const origin1 = origins[key1] ?? { row: r1, col: c1, progress }
      const origin2 = origins[key2] ?? { row: r2, col: c2, progress }
      ;[cells[r1][c1], cells[r2][c2]] = [cells[r2][c2], cells[r1][c1]]
      if (progress < 1) {
        origins[key1] = { ...origin2, progress }
        origins[key2] = { ...origin1, progress }
      } else {
        delete origins[key1]
        delete origins[key2]
      }
      break
    }
    case 'setValue': {
      const [row, col] = position(args[0], target)
      target.cells![row][col] = args[1]
      // 새로 쓴 값에는 이전 교환의 이동 경로를 적용하지 않는다.
      if (target.cellOrigins) delete target.cellOrigins[`${row},${col}`]
      break
    }
    case 'move': {
      const grid = elements.find((element) => element.pointers?.some((pointer) => pointer.id === target.id))
      if (!grid) throw new Error('포인터의 격자가 없습니다.')
      const [row, col] = position(args[0], grid)
      if (row === target.row && col === target.col) break
      const origin = target.moveOrigin ?? { row: target.row ?? 0, col: target.col ?? 0, progress }
      target.row = row
      target.col = col
      if (progress < 1) target.moveOrigin = { ...origin, progress }
      else delete target.moveOrigin
      break
    }
    case 'setText': {
      target.content = args[0]
      if (target.style === 'formula') {
        const ids = parseFormulaTerms(target.content).ids
        if (target.formulaTermColors) for (const id of Object.keys(target.formulaTermColors)) if (!ids.includes(id)) delete target.formulaTermColors[id]
      }
      break
    }
    case 'markLine': target.markedLine = Number(args[0]); break
    case 'focus': {
      const destination = coordinates(args[0])
      target.focusBox = focusBoxAtTime(target.focusBox ?? target.box ?? destination, destination, progress)
      break
    }
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
// focus·swap·move의 표시는 음성 시간으로 보간한다. 논리적인 교환 결과는 즉시 계산한다.
export function calculatePlayerState(blueprint: Blueprint, captions: Timing[], seconds: number): PlayerState {
  if (!Number.isFinite(seconds)) throw new Error('유효하지 않은 재생 시간')
  const time = Math.max(0, seconds)
  const state: PlayerState = { sceneId: null, resetSceneId: null, sourcePages: [], elements: [], caption: '' }
  const timings = new Map(captions.map((caption) => [`${caption.sceneId}:${caption.lineIndex}`, caption]))
  const explanationActions: Action[] = []
  let sceneStart = 0
  for (const scene of blueprint.scenes) {
    if (time < sceneStart) break
    if (scene.clear) { state.elements = []; state.resetSceneId = scene.id }
    state.sceneId = scene.id
    state.sourcePages = [...scene.sourcePages]
    const added = structuredClone([...scene.texts, ...scene.slides, ...scene.diagrams, ...scene.grids, ...scene.codes])
    for (const element of added) if (element.style === 'formula' && element.content?.includes('\\term')) {
      parseFormulaTerms(element.content)
      element.formulaTermColors = Object.create(null) as Record<string, string>
      element.formulaWhole = element.highlighted === true
    }
    state.elements.push(...added)
    for (const action of scene.actions) {
      const caption = timings.get(`${scene.id}:${action.line}`)
      if (!caption) throw new Error(`동작의 자막 없음: ${scene.id}:${action.line}`)
      if (caption.startSec <= time) {
        // 짧은 문장도 끝나기 전에 완료해 다음 문장에는 최종 상태가 된다.
        // 칸 교환·포인터 이동은 0.4초와 문장 전체 길이의 중간만큼 써서 움직인다(문장이 끝나기 전에 도착).
        const sentence = caption.endSec - caption.startSec
        const duration = ['swap', 'move'].includes(action.do) && sentence > 0.4 ? (0.4 + sentence) / 2 : Math.min(0.4, sentence)
        const progress = Math.min(1, Math.max(0, (time - caption.startSec) / duration))
        applyAction(state.elements, action, progress)
        if (time < caption.endSec) {
          explanationActions.push(action)
        }
      }
    }
    const last = timings.get(`${scene.id}:${scene.lines.length - 1}`)
    if (!last) throw new Error(`장면의 마지막 자막 없음: ${scene.id}`)
    sceneStart = last.endSec
  }
  const all = state.elements.flatMap(element => [element, ...(element.nodes ?? []), ...(element.edges ?? []), ...(element.pointers ?? [])])
  for (const element of all) {
    if (element.style === 'formula') element.explaining = false
    else delete element.explaining
    if (element.cells) element.explainedCells = []
    if (Array.isArray(element.lines)) delete element.explainedLine
    if (element.marks) element.explainedMarks = []
  }
  for (const action of explanationActions) {
    const target = all.find(element => element.id === action.target)
    // 제목은 바뀌어도(setText) 설명 대상으로 강조하지 않는다.
    if (!target || target.hidden || target.style === 'title') continue
    if (action.do === 'hide') { target.explaining = false; continue }
    if (action.do === 'unhighlight') {
      if (target.cells && action.args.length) {
        const removed = new Set(action.args.flatMap(arg => cellKeys(arg, target)))
        target.explainedCells = target.explainedCells?.filter(key => !removed.has(key))
      } else target.explaining = false
      continue
    }
    if (!['highlight','setText','setValue','swap','move','markLine','focus','mark'].includes(action.do)) continue
    if (target.cells && ['highlight','setValue','swap'].includes(action.do) && action.args.length) {
      const args = action.do === 'setValue' ? action.args.slice(0,1) : action.args
      target.explainedCells = [...new Set([...(target.explainedCells ?? []), ...args.flatMap(arg => cellKeys(arg, target))])]
    } else target.explaining = true
    if (action.do === 'markLine') target.explainedLine = Number(action.args[0])
    if (action.do === 'mark') target.explainedMarks = [...(target.explainedMarks ?? []), coordinates(action.args[0])]
  }
  validateNear(state.elements)
  holdFocus(state, blueprint, captions, time)
  state.caption = captions.find((caption) => time >= caption.startSec && time < caption.endSec)?.text ?? ''
  return state
}

// 강조가 잠깐 꺼진 문장에서 흐림이 풀렸다가 다시 흐려지는 깜빡임을 막는다(Q-AI-37).
// 지금 문장에 강조가 하나도 없으면, 같은 장면의 직전 1~2문장 중 가장 가까운 문장의 강조 대상을 '유지'로 표시한다.
// 강조 없는 문장이 3개째 이어지거나 장면이 바뀌면 원래 밝기로 돌아간다. 문장 순서로 계산하므로 탐색·되감기에도 같다.
function holdFocus(state: PlayerState, blueprint: Blueprint, captions: Timing[], time: number) {
  const visible = state.elements.filter(element => !element.hidden)
  if (visible.some(isLit)) return
  const scene = blueprint.scenes.find(item => item.id === state.sceneId)
  const started = captions.filter(caption => caption.sceneId === state.sceneId && caption.startSec <= time)
  if (!scene || !started.length) return
  const line = Math.max(...started.map(caption => caption.lineIndex))
  const all = state.elements.flatMap(element => [element, ...(element.nodes ?? []), ...(element.edges ?? [])])
  for (const previous of [line - 1, line - 2]) {
    if (previous < 0) return
    // 그 문장이 끝났을 때 켜져 있던 강조: 대상 id → 전체(true) 또는 칸 목록
    const lit = new Map<string, true | Set<string>>()
    for (const action of scene.actions) {
      if (action.line > previous || (action.do !== 'highlight' && action.do !== 'unhighlight')) continue
      const target = all.find(element => element.id === action.target)
      if (!target) continue
      const cells = target.cells && action.args.length ? action.args.flatMap(arg => cellKeys(arg, target)) : null
      if (action.do === 'highlight') {
        const current = lit.get(target.id)
        if (!cells) lit.set(target.id, true)
        else if (current !== true) lit.set(target.id, new Set([...(current ?? []), ...cells]))
      } else if (!cells) lit.delete(target.id)
      else { const current = lit.get(target.id); if (current instanceof Set) cells.forEach(key => current.delete(key)) }
    }
    const held = [...lit].filter(([, value]) => value === true || value.size > 0)
    if (!held.length) continue
    for (const [id, value] of held) {
      const target = all.find(element => element.id === id)!
      if (value === true) target.heldLit = true
      else target.heldCells = [...value]
    }
    return
  }
}
