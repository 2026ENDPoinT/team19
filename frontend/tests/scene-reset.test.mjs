import assert from 'node:assert/strict'
import { calculatePlayerState } from '../src/player/state.ts'
const make=(id,clear,grids=[])=>({id,clear,lines:[id],sourcePages:[],texts:[],slides:[],diagrams:[],grids,codes:[],actions:[]})
const grid={id:'g',slot:'middle',cells:[['1']]}
const blueprint={version:0,title:'연속 장면',theme:'dark',scenes:[make('s1',true,[grid]),make('s2',false),make('s3',true,[{...grid,id:'new'}])]}
const captions=[{sceneId:'s1',lineIndex:0,text:'s1',startSec:0,endSec:1},{sceneId:'s2',lineIndex:0,text:'s2',startSec:1.6,endSec:3},{sceneId:'s3',lineIndex:0,text:'s3',startSec:3.6,endSec:5}]
const at=time=>calculatePlayerState(blueprint,captions,time)
for(const time of [.9,1,1.3,1.6,2.9]){
 assert.equal(at(time).resetSceneId,'s1','continuation and silent gap keep the render key')
 assert.deepEqual(at(time).elements.map(e=>e.id),['g'])
}
for(const time of [3,3.3,3.6,4.9]){
 assert.equal(at(time).resetSceneId,'s3','clear changes render key')
 assert.deepEqual(at(time).elements.map(e=>e.id),['new'])
}
const before=at(1.3);at(4.9);assert.deepEqual(at(1.3),before,'backward seek restores the same key and elements')
assert.equal(calculatePlayerState({...blueprint,scenes:[make('s1',false,[grid])]},captions.slice(0,1),.5).resetSceneId,null)
console.log('PASS clear-only render key, 0.6s gaps, inherited elements and backward seek')
