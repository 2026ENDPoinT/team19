import { neon } from './colors.ts'

export function emphasizeFormula(source: string, caption: string, active: boolean): string {
  if (!active) return source
  const terms = [...new Set([...caption.matchAll(/\$([^$]+)\$/g)].map(match => match[1].trim()))]
    .filter(term => term && !term.includes('{') && !term.includes('}'))
    .sort((a,b) => b.length - a.length)
  if (!terms.length) return `\\textcolor{${neon.pink}}{${source}}`
  let result = '', matched = false
  for (let i=0; i<source.length;) {
    const term = terms.find(term => source.startsWith(term,i)
      && !(/[a-zA-Z0-9]/.test(term[0]) && /[a-zA-Z0-9\\]/.test(source[i-1] ?? ''))
      && !(/[a-zA-Z0-9]$/.test(term) && /[a-zA-Z0-9]/.test(source[i+term.length] ?? '')))
    if (term) { result += `\\textcolor{${neon.pink}}{${term}}`; i += term.length; matched = true }
    else result += source[i++]
  }
  return matched ? result : source
}
