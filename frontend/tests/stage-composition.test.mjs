import assert from 'node:assert/strict'
import {stageComposition} from '../src/player/stageComposition.ts'
const title={id:'t',slot:'top',style:'title',content:'제목'}
const grid={id:'g',slot:'middle',cells:[['1','2']]}
const status={id:'k',slot:'bottom',style:'keyword',content:'칸 2개'}
const layout=stageComposition([title,grid,status])
assert.equal(layout.title,title);assert.equal(layout.status,status);assert.ok(!layout.reserved.includes(status));assert.equal(layout.invalid,false)
const noTitle=stageComposition([{...title,hidden:true},grid,status])
assert.equal(noTitle.title,undefined);assert.ok(!noTitle.reserved.some(e=>e.style==='title'))
const laterBody={id:'b',slot:'bottom',style:'body',content:'다음 설명',hidden:true}
assert.ok(stageComposition([grid,laterBody]).reserved.includes(laterBody),'keep reserved body size')
const aux={id:'aux',slot:'top',cells:[['A']]}
assert.equal(stageComposition([title,aux,grid]).topAux,aux)
assert.equal(stageComposition([title,aux,grid]).invalid,false)
assert.equal(stageComposition([title,{...aux,id:'extra'},aux,grid]).invalid,true)
assert.equal(stageComposition([{...status,slot:'middle'}]).status,undefined,'a keyword-only scene stays the protagonist')
console.log('PASS compact title/status placement, no hidden-title space, reserved body, auxiliary compatibility and invalid slot guard')

const hiddenStatus={...status,hidden:true}
assert.equal(stageComposition([grid,hiddenStatus]).status,hiddenStatus)
assert.ok(!stageComposition([grid,hiddenStatus]).reserved.includes(hiddenStatus),'reserve the same status strip before show')
