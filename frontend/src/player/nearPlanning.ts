import type { Action, Entity } from './state.ts'

// Reserve every attachment used in this scene before any show/attach action runs.
export function planNearSpace(elements: Entity[], actions: Action[]): Entity[] {
  const owners = elements.map(element=>({...element,hidden:false,reservationOwner:true}))
  const labels = new Map<string,Entity>()
  function add(element: Entity, near=element.near) {
    if (!near || !['above','below'].includes(near.side)) return
    const id=`reserve:${element.id}:${near.target}:${near.side}:${near.cell??''}`
    labels.set(id,{...element,id,hidden:false,near:{...near},reservationOwner:false})
  }
  for (const element of elements) add(element)
  for (const action of actions) {
    const element=elements.find(item=>item.id===action.target)
    if (action.do==='attach' && element) add(element,{target:action.args[0],side:action.args[1] as 'above'|'below',...(action.args[2]===undefined?{}:{cell:action.args[2]})})
  }
  for (const element of elements) {
    const contents=[String(element.content??''),...actions.filter(action=>action.target===element.id&&action.do==='setText').map(action=>action.args[0])]
    const longest=contents.reduce((a,b)=>a.length>=b.length?a:b)
    for(const [id,label] of labels)if(id.startsWith(`reserve:${element.id}:`))label.content=longest
  }
  return [...owners,...labels.values()]
}
