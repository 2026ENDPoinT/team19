export function clipTransitionFrames(direction: number, height: number) {
  const distance = Math.sign(direction) * Math.max(0, height)
  return {
    outgoing: [{ transform: 'translateY(0px)' }, { transform: `translateY(${-distance}px)` }],
    incoming: [{ transform: `translateY(${distance}px)` }, { transform: 'translateY(0px)' }],
  }
}

let sequence = 0
export function captureClipTransition(container: HTMLElement, player: HTMLElement, direction: number) {
  const frame = document.createElement('div')
  const clone = player.cloneNode(true) as HTMLElement
  const bounds = player.getBoundingClientRect(), parent = container.getBoundingClientRect()
  frame.className = 'clip-transition-frame'
  frame.setAttribute('aria-hidden', 'true')
  frame.inert = true
  Object.assign(frame.style, { left: `${bounds.left-parent.left}px`, top: `${bounds.top-parent.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px` })
  clone.style.margin = '0'
  const prefix = `clip-snapshot-${++sequence}-`
  const ids = new Map<string,string>()
  clone.querySelectorAll('[id]').forEach(node => { ids.set(node.id,prefix+node.id); node.id=prefix+node.id })
  clone.querySelectorAll('*').forEach(node => {
    for (const attribute of Array.from(node.attributes)) {
      let value = attribute.value
      for (const [id,next] of ids) value=value.replaceAll(`url(#${id})`,`url(#${next})`)
      if (value!==attribute.value) node.setAttribute(attribute.name,value)
    }
  })
  frame.append(clone)
  container.append(frame)
  let animations: Animation[] = []
  const cancel = () => { animations.forEach(animation=>animation.cancel()); frame.remove() }
  return {
    cancel,
    async play(incoming: HTMLElement) {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !incoming.animate) { cancel(); return }
      const target = incoming.getBoundingClientRect(), parent = container.getBoundingClientRect()
      Object.assign(frame.style,{left:`${target.left-parent.left}px`,top:`${target.top-parent.top}px`,width:`${target.width}px`,height:`${target.height}px`})
      const frames=clipTransitionFrames(direction,target.height)
      const options: KeyframeAnimationOptions={duration:340,easing:'cubic-bezier(.22,.8,.25,1)',fill:'both'}
      const previousOverflow=incoming.style.overflow
      incoming.style.overflow='hidden'
      animations=[clone.animate(frames.outgoing,options),incoming.animate(frames.incoming,options)]
      try { await Promise.all(animations.map(animation=>animation.finished)) }
      catch { /* Cancellation on navigation is expected. */ }
      finally { incoming.style.overflow=previousOverflow; cancel() }
    },
  }
}
