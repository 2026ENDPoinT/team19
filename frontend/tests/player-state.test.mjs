import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { calculatePlayerState } from '../src/player/state.ts'

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8').replace(/^\uFEFF/, ''))
for (const file of ['../../samples/parts-test/result.json', '../../samples/clip-01/result.json', '../../samples/clip-01/alt-terra/result.json']) {
  const result = read(file)
  const before = JSON.stringify(result)
  const points = new Set([0, result.durationSec, ...result.captions.flatMap((line) => [line.startSec, line.endSec, Math.max(0, line.startSec - 0.001)])])
  for (const time of points) {
    const expected = calculatePlayerState(result.blueprint, result.captions, time)
    calculatePlayerState(result.blueprint, result.captions, result.durationSec)
    assert.deepEqual(calculatePlayerState(result.blueprint, result.captions, time), expected)
    const visible = expected.elements.filter((element) => !element.hidden)
    assert.equal(new Set(visible.map((element) => element.slot)).size, visible.length, `slot collision ${file} ${time}`)
  }
  for (let index = 1; index < result.blueprint.scenes.length; index++) {
    const previous = result.blueprint.scenes[index - 1]
    const boundary = result.captions.find((line) => line.sceneId === previous.id && line.lineIndex === previous.lines.length - 1).endSec
    assert.equal(calculatePlayerState(result.blueprint, result.captions, boundary).sceneId, result.blueprint.scenes[index].id)
  }
  assert.equal(JSON.stringify(result), before, 'source mutated')
  console.log(`PASS ${file}: seek/repeat/scene boundaries/slots/source immutability (${points.size} times)`)
}

const scene = { id: 's', clear: true, lines: ['compare', 'swap'], sourcePages: [1], texts: [], slides: [], diagrams: [], codes: [], grids: [{ id: 'g', slot: 'middle', cells: [['5','3']], pointers: [] }], actions: [{ line: 0, do: 'highlight', target: 'g', args: ['0'] }, { line: 1, do: 'swap', target: 'g', args: ['0','1'] }] }
const blueprint = { version: 0, title: 'test', theme: 'dark', scenes: [scene] }
const captions = [ {sceneId:'s',lineIndex:0,text:'compare',startSec:0,endSec:1}, {sceneId:'s',lineIndex:1,text:'swap',startSec:1.3,endSec:2} ]
const swapped = calculatePlayerState(blueprint,captions,1.3).elements[0]
assert.deepEqual(swapped.cells,[['3','5']])
assert.deepEqual(swapped.highlightedCells,['0,0'])
assert.deepEqual(calculatePlayerState(blueprint,captions,0).elements[0].cells,[['5','3']])
assert.equal(calculatePlayerState(blueprint,captions,1.1).caption,'')
assert.throws(() => calculatePlayerState(blueprint,captions,NaN))
console.log('PASS swap keeps cell highlight; reverse seek; caption gap; invalid time')
