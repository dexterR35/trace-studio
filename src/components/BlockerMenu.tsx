import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Circle, PenTool, ShieldPlus, Square } from 'lucide-react'
import { useStudio } from '../store'
import { MAX_BLOCKERS } from '../core/blockers'
import type { Blocker } from '../core/types'

export function BlockerMenu() {
  const s = useStudio(), [open, setOpen] = useState(false), host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => { if (!host.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key) }
  }, [open])
  function choose(shape: Blocker['shape']) {
    setOpen(false)
    if ((s.project.blockers?.length ?? 0) >= MAX_BLOCKERS) { s.notify(`A scene supports up to ${MAX_BLOCKERS} blockers.`); return }
    s.set({ blockerTool: shape, tool: 'select', assetTool: 'path', playing: false, ...(s.view === 'map' ? { view: 'split' as const } : {}) })
    s.notify(shape === 'polygon' ? 'Draw a closed outline on the camera canvas. Release to finish.' : 'Drag on the camera canvas to draw your blocker.')
  }
  return <div className="blocker-menu" ref={host}>
    <button className={`tool blocker-menu-button ${s.blockerTool ? 'active' : ''}`} aria-label="Add a blocker" aria-expanded={open} onClick={() => setOpen(!open)} title="Add a foreground blocker or transparent mask"><ShieldPlus size={15}/><span>Blocker</span><ChevronDown size={11}/></button>
    {open && <div className="dropdown blocker-dropdown">
      <button onClick={() => choose('rectangle')}><Square size={14}/> Rectangle blocker</button>
      <button onClick={() => choose('ellipse')}><Circle size={14}/> Circle / ellipse blocker</button>
      <button onClick={() => choose('polygon')}><PenTool size={14}/> Draw a custom blocker</button>
      <p>Keep a shape in front of moving elements, or use it as an invisible mask.</p>
    </div>}
  </div>
}
