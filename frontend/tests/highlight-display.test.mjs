import assert from 'node:assert/strict'
import { limitHighlights } from '../src/player/highlightDisplay.ts'
const source = [
 {id:'title', explaining:true},
 {id:'grid', cells:[['1','2','3']], explaining:true, pointers:[{id:'i',explaining:true}]},
 {id:'formula', style:'formula', formulaTermColors:{a:'#ffdf00',b:'#4fe3c1',c:'#fb6b6e'}},
]
const before = structuredClone(source)
const output = limitHighlights(source)
assert.equal(output[0].explaining,true)
assert.deepEqual(output[1].explainedCells,['0,0'])
assert.equal(output[1].explaining,false)
assert.equal(output[1].pointers[0].explaining,false)
assert.deepEqual(output[2].formulaTermColors,source[2].formulaTermColors)
assert.deepEqual(source,before)
assert.deepEqual(limitHighlights(source),output)
const diagram = limitHighlights([{id:'d',explaining:true,nodes:[{id:'a'},{id:'b'},{id:'c'}],edges:[]}])[0]
assert.equal(diagram.explaining,false)
assert.deepEqual(diagram.nodes.map(n=>n.explaining),[true,true,false])
const hidden = limitHighlights([{id:'hidden',hidden:true,explaining:true},{id:'code',lines:['a'],explainedLine:1},{id:'slide',marks:[],explainedMarks:[[0,0,1,1],[0,0,2,2]]}])
assert.equal(hidden[1].explainedLine,1)
assert.equal(hidden[2].explainedMarks.length,1)
console.log('PASS display-only highlight budget, hidden elements, grouped diagrams, cells, pointers, code, marks and D-46 exception')
