import type { Entity } from './state.ts'
export function validateNear(elements: Entity[]) {
  const all=elements.flatMap(element=>[element,...(element.nodes??[])])
  const checked=new Set<string>(),visiting=new Set<string>()
  function check(element:Entity) {
    if(checked.has(element.id)||!element.near)return
    if(visiting.has(element.id))throw new Error('near 연결이 순환해요.')
    visiting.add(element.id)
    const near=element.near
    if(typeof element.content!=='string'||!['body','keyword','formula'].includes(String(element.style))||!['above','below','left','right'].includes(near.side))throw new Error('near는 본문·키워드·수식과 올바른 방향만 지원해요.')
    const owner=all.find(item=>item.id===near.target)
    if(!owner||owner===element||(!owner.nodes&&!owner.cells&&!Array.isArray(owner.lines)&&typeof owner.content!=='string'&&!elements.some(item=>item.nodes?.includes(owner))))throw new Error(`near 주인을 찾을 수 없어요: ${near.target}`)
    if(near.cell!==undefined) {
      const parts=typeof near.cell==='string'&&/^\d+(,\d+)?$/.test(near.cell)?near.cell.split(',').map(Number):[]
      const row=parts.length===1?0:parts[0],col=parts.length===1?parts[0]:parts[1]
      if(![1,2].includes(parts.length)||!parts.every(value=>Number.isInteger(value)&&value>=0)||!owner.cells||owner.cells[row]?.[col]===undefined)throw new Error('near.cell은 격자의 유효한 칸이어야 해요.')
    }
    check(owner);visiting.delete(element.id);checked.add(element.id)
  }
  elements.forEach(check)
}
