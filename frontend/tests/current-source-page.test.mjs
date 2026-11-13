import assert from 'node:assert/strict'
import { currentSourcePage } from '../src/player/currentSourcePage.ts'
const state={sceneId:'s',sourcePages:[1,2,3],elements:[],caption:''}
const slide=(page,other={})=>({id:`p${page}`,page,box:[0,0,100,100],...other})
assert.equal(currentSourcePage(null),null)
assert.equal(currentSourcePage({...state,sourcePages:[]}),null)
assert.deepEqual(currentSourcePage(state),{page:1,representative:true})
assert.deepEqual(currentSourcePage({...state,elements:[slide(2)]}),{page:2,representative:false})
assert.deepEqual(currentSourcePage({...state,elements:[slide(2),slide(3,{explaining:true})]}),{page:3,representative:false})
assert.deepEqual(currentSourcePage({...state,elements:[slide(2,{hidden:true}),slide(3)]}),{page:3,representative:false})
assert.deepEqual(currentSourcePage({...state,elements:[slide(99,{explaining:true})]}),{page:1,representative:true})
assert.deepEqual(currentSourcePage({...state,sourcePages:[2]}),{page:2,representative:false})
assert.deepEqual(currentSourcePage({...state,elements:[slide(2,{explaining:true}),slide(3,{explaining:true})]}),{page:1,representative:true})
console.log('PASS single current source, active slide priority, hidden/invalid exclusion and explicit representative fallback')
