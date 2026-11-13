import assert from 'node:assert/strict'
import {nearSpace} from '../src/player/nearLayout.ts'
const owner={id:'g',cells:[['1']],slot:'middle'}
const above={id:'a',content:'위 설명',style:'body',near:{target:'g',side:'above'}}
const below={id:'b',content:'아래 설명',style:'body',near:{target:'g',side:'below',cell:'0'}}
assert.deepEqual(nearSpace([owner,above,below],{a:{height:30},b:{height:50}}),{g:{above:38,below:58}})
assert.deepEqual(nearSpace([owner,{...above,hidden:true}],{}),{})
assert.deepEqual(nearSpace([{...owner,hidden:true},above],{}),{})
assert.deepEqual(nearSpace([{id:'d',nodes:[{id:'node'}]},{...above,near:{target:'node',side:'above'}}],{a:{height:20}}),{d:{above:28,below:0}})
const before=nearSpace([owner,above],{a:{height:30}})
nearSpace([owner,below],{})
assert.deepEqual(nearSpace([owner,above],{a:{height:30}}),before)
console.log('PASS measured above/below reservation, hidden owners, diagram nodes and deterministic seeks')
