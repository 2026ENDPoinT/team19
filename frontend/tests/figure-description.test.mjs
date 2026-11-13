import assert from 'node:assert/strict'
import { figureDescription, reserveTextSlots } from '../src/player/figureDescription.ts'
const grid={id:'grid',slot:'middle',cells:[['1']]}
const text={id:'text',slot:'bottom',style:'body',content:'배열 설명'}
const elements=[grid,text]
assert.deepEqual(figureDescription(elements),{figureId:'grid',description:text})
assert.equal(figureDescription([grid,{...text,hidden:true}]),null)
assert.equal(figureDescription([grid,text,{id:'another',slot:'top',nodes:[]}]),null)
assert.equal(figureDescription([grid,{...text,style:'formula'}]),null)
assert.equal(figureDescription([{...grid,slot:'top'},text]),null)
assert.equal(text.slot,'bottom')
console.log('PASS figure description grouping, ambiguous figures, hidden text, formulas and unchanged source')

const hidden = {...text, hidden:true, style:'keyword'}
assert.equal(reserveTextSlots([grid,hidden]).length,2)
assert.deepEqual(reserveTextSlots([grid,hidden]).map(e=>e.id),reserveTextSlots([grid,{...hidden,hidden:false}]).map(e=>e.id))
assert.equal(reserveTextSlots([grid,{...grid,id:'hidden-grid',slot:'top',hidden:true}]).length,1)
assert.equal(figureDescription([grid,{...text,hidden:true}],true).description.id,text.id)
assert.equal(figureDescription([grid,{...text,hidden:true}]),null)
console.log('PASS hidden text reserves its slot before show, without reserving hidden diagrams')
