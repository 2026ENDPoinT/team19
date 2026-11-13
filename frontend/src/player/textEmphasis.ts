// 화면 글 안의 **단어** 강조(P-AI-06 A안). 여는 ** 바로 뒤와 닫는 ** 바로 앞이 공백이 아닐 때만 강조로 본다.
// 짝이 안 맞거나 공백이 붙은 **(예: 파이썬 2 ** 4)는 글자 그대로 둔다.
const EMPHASIS = /\*\*(?=\S)(.+?)(?<=\S)\*\*/g

export function splitEmphasis(text: string): { text: string; strong: boolean }[] {
  const parts: { text: string; strong: boolean }[] = []
  let last = 0
  for (const match of text.matchAll(EMPHASIS)) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index), strong: false })
    parts.push({ text: match[1], strong: true })
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last), strong: false })
  return parts
}

// $…$ 수식 밖에 강조가 하나라도 있는지. 있으면 글 전체 강조색은 끈다(단어 강조가 묻히지 않게).
export function hasEmphasis(content: string): boolean {
  return content.split(/\$[^$]+\$/g).some((part) => splitEmphasis(part).some((piece) => piece.strong))
}
