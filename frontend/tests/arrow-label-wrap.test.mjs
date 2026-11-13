import assert from 'node:assert/strict'
import { wrapArrowLabel, layoutDiagramEdges } from '../src/player/diagramEdges.ts'
assert.deepEqual(wrapArrowLabel('목표에 따른 비교'),['목표에 따른','비교'])
assert.deepEqual(wrapArrowLabel('상태 변경'),['상태 변경'])
assert.deepEqual(wrapArrowLabel('첫째 줄\n둘째 줄'),['첫째 줄','둘째 줄'])
assert.deepEqual(wrapArrowLabel('가나다라마바사아자차'),['가나다라마바사아','자차'])
assert.deepEqual(wrapArrowLabel(''),[])
for(const layout of ['column','cycle','layers','row','tree']) {
 const g=layoutDiagramEdges([{id:'a'},{id:'b'}],[{id:'e',from:'a',to:'b',label:'목표에 따른 비교'}],layout)
 assert.deepEqual(g.routes.get('e').lines,['목표에 따른','비교'])
}
console.log('PASS arrow labels wrap at words, preserve newlines and split oversized words in every layout')
