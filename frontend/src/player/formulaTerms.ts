import { palette } from './colors.ts'

type Part = string | { id: string; body: Part[] }
export type FormulaTerms = { parts: Part[]; ids: string[] }
export const formulaTermColors = [palette.coral, palette.mint, palette.yellow, palette.pink] as const

export function parseFormulaTerms(source: string): FormulaTerms {
  const ids = new Set<string>()
  function group(start: number, end: number) {
    if (source[start] !== '{') throw new Error('수식 항은 \\term{항id}{LaTeX} 형식이어야 해요.')
    let depth = 1
    for (let i = start + 1; i < end; i++) {
      if (source[i] === '\\') { i++; continue }
      if (source[i] === '{') depth++
      if (source[i] === '}' && --depth === 0) return i
    }
    throw new Error('수식 항의 괄호 짝을 확인해 주세요.')
  }
  function parse(start: number, end: number, nesting: number): Part[] {
    if (nesting > 64) throw new Error('수식 항의 중첩이 너무 깊어요.')
    const parts: Part[] = []
    let text = ''
    for (let i = start; i < end;) {
      if (source.startsWith('\\term', i)) {
        if (text) { parts.push(text); text = '' }
        const idStart = i + 5, idEnd = group(idStart, end)
        const id = source.slice(idStart + 1, idEnd)
        if (!/^[a-z0-9_]+$/.test(id) || ids.has(id)) throw new Error(`수식 항 ID가 유효하지 않거나 중복됐어요: ${id}`)
        ids.add(id)
        const bodyStart = idEnd + 1, bodyEnd = group(bodyStart, end)
        parts.push({ id, body: parse(bodyStart + 1, bodyEnd, nesting + 1) })
        i = bodyEnd + 1
      } else if (source[i] === '\\') {
        text += source.slice(i, i + 2); i += 2
      } else text += source[i++]
    }
    if (text) parts.push(text)
    return parts
  }
  const parts = parse(0, source.length, 0)
  return { parts, ids: [...ids] }
}

export function renderFormulaTerms(source: string, colors: Record<string, string> = {}, whole = false): string {
  function render(parts: Part[]): string {
    return parts.map(part => {
      if (typeof part === 'string') return part
      const body = render(part.body)
      if (!Object.hasOwn(colors, part.id)) return `{${body}}`
      const color = colors[part.id]
      if (!formulaTermColors.some(allowed => allowed === color)) throw new Error('허용되지 않은 수식 항 색상이에요.')
      return `\\textcolor{${color}}{${body}}`
    }).join('')
  }
  const result = render(parseFormulaTerms(source).parts)
  return whole ? `\\textcolor{${palette.coral}}{${result}}` : result
}
