import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { layoutGrid } from '../src/player/gridLayout.ts'
function check(cells, indices, pointers) {
  const layout = layoutGrid(cells, indices, pointers)
  assert.ok(layout.width <= 360.000001)
  for (const point of layout.positions.values()) {
    assert.ok(point.x - layout.cellWidth / 2 >= 0)
    assert.ok(point.x + layout.cellWidth / 2 <= layout.width + 1e-9)
    assert.ok(point.y - layout.cellHeight / 2 >= 0)
    assert.ok(point.y + layout.cellHeight / 2 + pointers * 16 <= layout.height)
  }
  return layout
}
for (const file of ['../../samples/clip-01/result.json','../../samples/clip-01/alt-terra/result.json','../../samples/parts-test/result.json']) {
  const result = JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8').replace(/^\uFEFF/, ''))
  for (const scene of result.blueprint.scenes) for (const grid of scene.grids) {
    const before = JSON.stringify(grid)
    const expected = check(grid.cells, grid.indexLabels, grid.pointers.length)
    assert.deepEqual(check(grid.cells, grid.indexLabels, grid.pointers.length), expected)
    assert.equal(JSON.stringify(grid), before)
  }
}
const largest = check([Array.from({length: 12}, (_,i) => String(i))], true, 2)
assert.ok(largest.cellWidth > 20)
assert.equal(largest.cellWidth, largest.cellHeight)
check(Array.from({length: 6}, () => Array(6).fill('99')), true, 2)
check(Array.from({length: 5}, () => Array(4).fill('abcdefghij')), true, 0)
const uneven = check([['1','2','3'],['4']], false, 0)
assert.equal(uneven.positions.get('1,0').x, uneven.width / 2)
console.log('PASS grids fit 360px, square numeric cells, pointer/index bounds, 12 cells, 6x6, table, uneven rows, deterministic layout and source immutability')

const {gridTextLines,gridTextWidth}=await import('../src/player/gridLayout.ts')
const table=check([['조건','확인할 것'],['탐욕적 선택','선택의 안전성'],['최적 부분 구조','부분제로 구성']],false,0)
assert.equal(table.table,true)
assert.ok(table.cellWidth>=150)
assert.ok(16*380/table.width<22,'text tables avoid numeric array font enlargement')
for(const text of ['탐욕적 선택','최적 부분 구조','아주긴한글설명문장이들어간경우','a long English explanation']){
 const lines=gridTextLines(text,table.cellWidth-16)
 assert.ok(lines.every(line=>gridTextWidth(line)<=table.cellWidth-16))
}
assert.deepEqual(gridTextLines('최적 부분 구조',100),['최적 부분','구조'])
console.log('PASS readable Korean table font, word wrapping and bounded cell text')
