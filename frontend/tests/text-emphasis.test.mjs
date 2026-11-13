import assert from 'node:assert/strict'
import { splitEmphasis, hasEmphasis } from '../src/player/textEmphasis.ts'
assert.deepEqual(splitEmphasis('정렬된 두 구간을 **합병**'), [{ text: '정렬된 두 구간을 ', strong: false }, { text: '합병', strong: true }])
assert.deepEqual(splitEmphasis('**종료 조건**: p ≥ q'), [{ text: '종료 조건', strong: true }, { text: ': p ≥ q', strong: false }])
assert.deepEqual(splitEmphasis('2 ** 4 = 16'), [{ text: '2 ** 4 = 16', strong: false }])
assert.deepEqual(splitEmphasis('/ % // **'), [{ text: '/ % // **', strong: false }])
assert.deepEqual(splitEmphasis('**A**와 **B**'), [{ text: 'A', strong: true }, { text: '와 ', strong: false }, { text: 'B', strong: true }])
assert.deepEqual(splitEmphasis('짝 없는 **강조'), [{ text: '짝 없는 **강조', strong: false }])
assert.equal(hasEmphasis('값 $a**b**c$ 그대로'), false)
assert.equal(hasEmphasis('핵심은 **피봇**'), true)
console.log('PASS **word** emphasis: pairs, spaces, python power operator, unmatched, formulas skipped')
