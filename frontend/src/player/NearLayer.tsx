import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import type { Entity } from './state'
import { interpolateRect, layoutNearLabels } from './nearLayout'
import type { Rect } from './nearLayout'
import { dimsElement, DIM_OPACITY, isLit } from './focusDim'
import './near.css'

type Placement = Rect & { scale: number }
type Props = { elements: Entity[]; stageRef: RefObject<HTMLDivElement | null>; renderElement: (element: Entity) => ReactNode; renderSnapshot: (elements: Entity[]) => ReactNode }
function collectAnchors(root: HTMLElement, stage: HTMLElement) {
  const rect=stage.getBoundingClientRect(),scale=rect.width/420||1,result=new Map<string,Rect>()
  root.querySelectorAll('[data-near-anchor], [data-near-cell]').forEach(node=>{
    if(node.closest('.player-near-layer') || (node.closest('.player-stage-measure') && node.closest('.player-stage-measure')!==root))return
    const hidden=node.closest('[aria-hidden="true"]')
    if(hidden&&hidden!==root)return
    const id=node.getAttribute('data-near-anchor')??node.getAttribute('data-near-cell')!
    const box=node.getBoundingClientRect()
    if(box.width&&box.height)result.set(id,{x:(box.left-rect.left)/scale,y:(box.top-rect.top)/scale,width:box.width/scale,height:box.height/scale})
  })
  return result
}
export default function NearLayer({elements,stageRef,renderElement,renderSnapshot}:Props) {
  const labels=useRef(new Map<string,HTMLDivElement>()),snapshots=useRef(new Map<string,HTMLDivElement>())
  const [placements,setPlacements]=useState<Record<string,Placement>>({})
  const attached=elements.filter(element=>element.near&&!element.hidden)
  const anyLit=elements.some(element=>!element.hidden&&isLit(element))
  const measure=()=>{
    const stage=stageRef.current
    if(!stage)return
    const anchors=collectAnchors(stage,stage),stageRect=stage.getBoundingClientRect(),stageScale=stageRect.width/420||1
    const caption=stage.querySelector(':scope > .player-caption')?.getBoundingClientRect()
    const bounds:Rect={x:12,y:54,width:396,height:Math.max(100,(caption?(caption.top-stageRect.top)/stageScale:630)-62)}
    const sizes=new Map<string,{width:number;height:number}>(),scales=new Map<string,number>()
    for(const element of attached){
      const label=labels.current.get(element.id)
      if(!label)continue
      const width=Math.max(label.offsetWidth,label.scrollWidth),height=label.offsetHeight
      const scale=Math.min(1,260/Math.max(1,width),bounds.height/Math.max(1,height))
      sizes.set(element.id,{width:width*scale,height:height*scale});scales.set(element.id,scale)
    }
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const boxes=layoutNearLabels(elements,anchors,sizes,bounds,(element,to)=>{
      const snapshot=snapshots.current.get(element.id),motion=element.attachMotion
      if(!snapshot||!motion||reduced)return to
      const before=collectAnchors(snapshot,stage)
      const from=before.get(element.id)??layoutNearLabels(motion.origin,before,sizes,bounds).get(element.id)
      if(!from)return to
      return interpolateRect({x:from.x+(from.width-to.width)/2,y:from.y+(from.height-to.height)/2,width:to.width,height:to.height},to,motion.progress)
    })
    const next:Record<string,Placement>={}
    for(const [id,box] of boxes)next[id]={...box,scale:scales.get(id)??1}
    setPlacements(previous=>JSON.stringify(previous)===JSON.stringify(next)?previous:next)
  }
  const measureRef=useRef(measure);measureRef.current=measure
  useLayoutEffect(()=>{measureRef.current()})
  const structure=elements.map(element=>`${element.id}:${Boolean(element.near)}:${Boolean(element.attachMotion)}:${Boolean(element.hidden)}:${element.nodes?.map(node=>`${node.id}:${Boolean(node.hidden)}`).join(',')}`).join('|')
  useLayoutEffect(()=>{
    const stage=stageRef.current
    if(!stage)return
    const observer=new ResizeObserver(()=>measureRef.current())
    stage.querySelectorAll('.player-fit-frame, [data-near-anchor], .player-near-label').forEach(node=>observer.observe(node))
    return()=>observer.disconnect()
  },[structure,stageRef])
  return <>
    {attached.filter(element=>element.attachMotion).map(element=><div key={`measure-${element.id}`} ref={node=>{if(node)snapshots.current.set(element.id,node);else snapshots.current.delete(element.id)}} className="player-stage-measure" data-near-measure="true" data-playing="false" aria-hidden="true" inert>{renderSnapshot(element.attachMotion!.origin)}</div>)}
    <div className="player-near-layer">{attached.map(element=>{
      const box=placements[element.id]
      return <div key={element.id} ref={node=>{if(node)labels.current.set(element.id,node);else labels.current.delete(element.id)}} className="player-near-label" aria-hidden={!box||undefined} style={{left:box?.x??0,top:box?.y??0,transform:`scale(${box?.scale??1})`,visibility:box?'visible':'hidden',opacity:dimsElement(element,anyLit)?DIM_OPACITY:undefined}}>{renderElement(element)}</div>
    })}</div>
  </>
}
