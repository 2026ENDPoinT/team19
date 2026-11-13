// 긴 문장은 쉼표 뒤에서 줄을 바꾼다. 숫자 나열("18, 20, 25")이나 짧은 조각 옆에서는 바꾸지 않는다.
export function breakAtCommas(text: string, minLength = 16, minPiece = 8): string {
  if (text.length <= minLength) return text
  const pieces = text.split(/(?<=[,，])[ \t]+(?=\S)/)
  let result = pieces[0]
  for (let i = 1; i < pieces.length; i++) {
    const numberList = /\d[,，]$/.test(result) && /^\d/.test(pieces[i])
    const lastLine = result.slice(result.lastIndexOf('\n') + 1)
    const short = lastLine.length < minPiece || pieces[i].length < minPiece
    result += numberList || short ? ' ' + pieces[i] : '\n' + pieces[i]
  }
  return result
}
