import assert from 'node:assert/strict'
import { slideViewport } from '../src/player/slideGeometry.ts'
assert.deepEqual(slideViewport([.05,.3,.9,.35],1000,800),{x:50,y:240,width:900,height:280})
assert.deepEqual(slideViewport([.05,.3,.45,.35],1000,800),{x:50,y:240,width:450,height:280})
assert.deepEqual(slideViewport([.1,.35,.3,.2],1000,800),{x:100,y:280,width:300,height:160})
for(const box of [[0,0,0,1],[-1,0,1,1],[0,0,2,1],[NaN,0,1,1]])assert.throws(()=>slideViewport(box,1000,800))
console.log('PASS original-page crop/focus/mark coordinates and invalid regions')
