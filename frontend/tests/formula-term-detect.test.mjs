import assert from 'node:assert/strict'
import { formulaTermColors, hasFormulaTerms, renderFormulaTerms } from '../src/player/formulaTerms.ts'
// 화면이 항 강조 수식으로 알아봐야 하는 경우와 아닌 경우
assert.equal(hasFormulaTerms(String.raw`V(s)=\term{r}{R}+\gamma V(s')`), true)
assert.equal(hasFormulaTerms(String.raw`V(s)=R+\gamma V(s')`), false)
assert.equal(hasFormulaTerms('\terms of use'), false) // 백슬래시가 빠져 탭 문자(\t)가 된 문자열은 항이 아니다
// 항 강조가 켜지면 그 항에 색이 들어간다
const color = formulaTermColors[0]
const out = renderFormulaTerms(String.raw`\term{r}{R}+1`, { r: color })
assert.ok(out.includes(String.raw`\textcolor{${color}}`), out)
console.log('PASS formula term detection and colored rendering')
