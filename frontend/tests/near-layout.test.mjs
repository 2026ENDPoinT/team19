import assert from 'node:assert/strict'
import { cellAnchor, positionNear, layoutNearLabels, interpolateRect } from '../src/player/nearLayout.ts'
const bounds={x:0,y:0,width:420,height:640},owner={x:160,y:200,width:100,height:60},size={width:60,height:24}
assert.equal(cellAnchor('g','4'),'g:cell:0,4');assert.equal(cellAnchor('g','1,2'),'g:cell:1,2')
for(const [side,x,y] of [['above',180,168],['below',180,268],['left',92,218],['right',268,218]])assert.deepEqual(positionNear(owner,size,{target:'g',side},bounds),{x,y,...size})
const edge=positionNear({x:400,y:620,width:20,height:20},size,{target:'g',side:'right'},bounds)
assert.ok(edge.x>=0&&edge.x+edge.width<=420&&edge.y+edge.height<=640)
const one=positionNear(owner,size,{target:'g',side:'below'},bounds)
const two=positionNear(owner,size,{target:'g',side:'below'},bounds,[one])
assert.ok(two.x+two.width<=one.x||two.x>=one.x+one.width)
const elements=[{id:'b',style:'body',content:'B',near:{target:'a',side:'below'}},{id:'a',style:'body',content:'A',near:{target:'g',side:'below',cell:'0'}}]
const anchors=new Map([['g:cell:0,0',owner]])
const sizes=new Map([['a',size],['b',size]])
const placed=layoutNearLabels(elements,anchors,sizes,bounds)
assert.equal(placed.size,2);assert.ok(placed.get('b').y>placed.get('a').y)
assert.equal(layoutNearLabels(elements,new Map(),sizes,bounds).size,0,'missing/hidden owner hides descendants')
assert.equal(layoutNearLabels([{...elements[1],hidden:true}],anchors,sizes,bounds).size,0)
const moved=layoutNearLabels(elements,anchors,sizes,bounds,(element,box)=>element.id==='a'?{...box,x:box.x+30}:box)
assert.equal(moved.get('b').x,placed.get('b').x+30,'dependent labels follow interpolated owner')
const end={x:100,y:100,width:60,height:24}
assert.deepEqual(interpolateRect({...end,x:0,y:0},end,.5),{...end,x:50,y:50})
assert.deepEqual(interpolateRect({...end,x:0,y:0},end,2),end)
console.log('PASS four sides, fixed-cell keys, clamping, label collision reduction, chains, hidden owners and deterministic interpolation')
