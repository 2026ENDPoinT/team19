import type { Entity, Near } from './state.ts'
export type Rect = { x: number; y: number; width: number; height: number }
export function cellAnchor(target: string, cell: string) {
  const parts = cell.split(',').map(Number)
  return `${target}:cell:${parts.length === 1 ? `0,${parts[0]}` : parts.join(',')}`
}
const area = (a: Rect,b: Rect) => Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y))
export function positionNear(owner: Rect, size: {width:number;height:number}, near: Near, bounds: Rect, occupied: Rect[] = []): Rect {
  const width=Math.min(size.width,bounds.width),height=Math.min(size.height,bounds.height),gap=8
  const side=near.side
  const x=side==='left'?owner.x-width-gap:side==='right'?owner.x+owner.width+gap:owner.x+(owner.width-width)/2
  const y=side==='above'?owner.y-height-gap:side==='below'?owner.y+owner.height+gap:owner.y+(owner.height-height)/2
  const clamp=(a:number,min:number,max:number)=>Math.max(min,Math.min(max,a))
  const candidates=[0,1,-1].map(shift=>({
    x:clamp(x+(side==='above'||side==='below'?shift*(width+gap):0),bounds.x,bounds.x+bounds.width-width),
    y:clamp(y+(side==='left'||side==='right'?shift*(height+gap):0),bounds.y,bounds.y+bounds.height-height),width,height,
  }))
  const score=(box:Rect)=>occupied.reduce((sum,item)=>sum+area(box,item),area(box,owner))
  return candidates.reduce((best,box)=>score(box)<score(best)?box:best)
}
export function layoutNearLabels(elements: Entity[], anchors: Map<string,Rect>, sizes: Map<string,{width:number;height:number}>, bounds: Rect, adjust: (element: Entity, box: Rect) => Rect = (_, box) => box) {
  const result=new Map<string,Rect>(),available=new Map(anchors),occupied:Rect[]=[]
  let pending=elements.filter(element=>element.near&&!element.hidden)
  for(let pass=0;pending.length&&pass<elements.length;pass++) {
    const waiting:Entity[]=[]
    for(const element of pending) {
      const near=element.near!,owner=available.get(near.cell===undefined?near.target:cellAnchor(near.target,near.cell)),size=sizes.get(element.id)
      if(!owner||!size){waiting.push(element);continue}
      const box=adjust(element,positionNear(owner,size,near,bounds,occupied))
      result.set(element.id,box);available.set(element.id,box);occupied.push(box)
    }
    pending=waiting
  }
  return result
}
export function interpolateRect(from:Rect,to:Rect,progress:number):Rect {
  const t=Math.max(0,Math.min(1,progress)),eased=t*t*(3-2*t)
  return {x:from.x+(to.x-from.x)*eased,y:from.y+(to.y-from.y)*eased,width:to.width,height:to.height}
}
