import assert from 'node:assert/strict'
import { isLit, dimsParts, dimsElement } from '../src/player/focusDim.ts'
const diagram = { id: 'd', nodes: [{ id: 'a', highlighted: true }, { id: 'b' }], edges: [] }
assert.equal(isLit(diagram), true); assert.equal(dimsParts(diagram), true)
assert.equal(dimsParts({ ...diagram, highlighted: true }), false)
assert.equal(isLit({ id: 'g', cells: [['1']], highlightedCells: [] }), false)
assert.equal(isLit({ id: 'g', cells: [['1']], highlightedCells: ['0,0'] }), true)
assert.equal(isLit({ id: 'f', style: 'formula', formulaTermColors: { x: '#fff' } }), true)
assert.equal(isLit({ id: 'd2', nodes: [{ id: 'a', highlighted: true, hidden: true }] }), false)
assert.equal(dimsElement({ id: 't', style: 'title' }, true), false)
assert.equal(dimsElement({ id: 'b', style: 'body' }, true), true)
assert.equal(dimsElement({ id: 'b', style: 'body' }, false), false)
assert.equal(dimsElement({ id: 'b', style: 'body', highlighted: true }, true), false)
console.log('PASS focus dim: lit parts, whole highlight, cells, formula terms, hidden, title and no-highlight cases')
