import assert from 'node:assert/strict'
import { calculatePlayerState } from '../src/player/state.ts'
import { pointerColor, palette, defaultLineColor, defaultTextColor } from '../src/player/colors.ts'
assert.equal(defaultLineColor,'#E2E2E2');assert.equal(defaultTextColor,'#ffffff')
assert.equal(pointerColor('i','first-i'),palette.yellow)
assert.equal(pointerColor(' i ','last-i'),palette.yellow)
assert.equal(pointerColor('j','first-j'),palette.mint)
assert.equal(pointerColor('same','one'),pointerColor('same','two'))
const scene={id:'s',clear:true,sourcePages:[],lines:['강조','다음','복원'],texts:[{id:'text',slot:'top',content:'설명'}],slides:[],diagrams:[],codes:[{id:'code',slot:'bottom',lines:['a','b']}],grids:[{id:'grid',slot:'middle',cells:[['1','2']],pointers:[{id:'p',label:'i',row:0,col:0}]}],actions:[
 {line:0,do:'highlight',target:'grid',args:['0']},{line:0,do:'move',target:'p',args:['1']},{line:0,do:'highlight',target:'text',args:[]},{line:0,do:'markLine',target:'code',args:['1']},
 {line:1,do:'setValue',target:'grid',args:['1','3']},
]}
const blueprint={version:0,title:'timed',theme:'dark',scenes:[scene]}
const captions=[0,1,2].map(index=>({sceneId:'s',lineIndex:index,text:scene.lines[index],startSec:index*2,endSec:index*2+1}))
const before=JSON.stringify(blueprint)
const at=time=>calculatePlayerState(blueprint,captions,time)
const grid=state=>state.elements.find(element=>element.id==='grid')
for(const time of [.5,2.5,4.5,.5]) {
 const state=at(time)
 assert.deepEqual(grid(state).explainedCells,time===.5?['0,0']:time===2.5?['0,1']:[])
 if(time===.5){assert.equal(grid(state).pointers[0].explaining,true);assert.equal(state.elements.find(e=>e.id==='text').explaining,true);assert.equal(state.elements.find(e=>e.id==='code').explainedLine,1)}
 else {assert.ok(!grid(state).pointers[0].explaining);assert.ok(!state.elements.find(e=>e.id==='text').explaining);assert.equal(state.elements.find(e=>e.id==='code').explainedLine,undefined)}
}
for(const time of [1,1.5,3,5]) assert.deepEqual(grid(at(time)).explainedCells,[],'caption end and gaps reset visual emphasis')
assert.deepEqual(grid(at(4.5)).highlightedCells,['0,0'],'logical highlight remains intact')
assert.deepEqual(grid(at(4.5)).cells,[['1','3']],'values persist after explanation')
const paused=at(.5);at(5);assert.deepEqual(at(.5),paused)
assert.equal(JSON.stringify(blueprint),before)
console.log('PASS stable pointer identity, white/grey defaults, scoped cell emphasis, pointer/code/text reset, gaps and seek without changing logical values')
