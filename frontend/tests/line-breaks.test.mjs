import assert from 'node:assert/strict'
import { breakAtCommas } from '../src/player/lineBreaks.ts'
assert.equal(breakAtCommas('강의자료 표는 10단계라고 쓰지만, 29 대 30은 9번째예요.'), '강의자료 표는 10단계라고 쓰지만,\n29 대 30은 9번째예요.')
assert.equal(breakAtCommas('짧은 말, 그대로'), '짧은 말, 그대로')
assert.equal(breakAtCommas('값은 1,000이고 2,000보다 작은 수입니다'), '값은 1,000이고 2,000보다 작은 수입니다')
assert.equal(breakAtCommas('같은 방식으로 18, 20, 25가 차례로 이겨요.'), '같은 방식으로 18, 20, 25가 차례로 이겨요.')
assert.equal(breakAtCommas('비교 8회 · 18, 20, 25가 승리'), '비교 8회 · 18, 20, 25가 승리')
assert.equal(breakAtCommas('먼저 배열을 나누고, 나눈 조각을 정렬한 뒤, 다시 합쳐요.'), '먼저 배열을 나누고,\n나눈 조각을 정렬한 뒤, 다시 합쳐요.')
console.log('PASS comma line breaks')
