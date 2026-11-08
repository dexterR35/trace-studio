import { useEffect, useRef, useState } from 'react'
import { directorAt, framePoint } from '../core/director'
import { useStudio } from '../store'
import { blockerAt, blockerFromDrawing, blockerPath } from '../core/blockers'
import { clamp, type Blocker, type CanvasPoint } from '../core/types'

type Gesture = { kind: 'draw' | 'move' | 'resize' | 'vertex'; start: CanvasPoint; original?: Blocker; points?: CanvasPoint[]; vertex?: number }

export function BlockerOverlay({ fit }: { fit: number }) {
  const s = useStudio(), gesture = useRef<Gesture | null>(null), [draft, setDraft] = useState<Blocker | null>(null), p = s.project, selected = p.blockers?.map(b => blockerAt(b, s.time)).find(b => b.id === s.selectedBlocker), radius = 5 / Math.max(.1, fit)
  useEffect(() => { if (!s.blockerTool && gesture.current?.kind === 'draw') { gesture.current = null; setDraft(null) } }, [s.blockerTool])
  function location(e: React.PointerEvent<SVGGElement>): CanvasPoint {
    const r = e.currentTarget.ownerSVGElement!.getBoundingClientRect()
    return framePoint(p,{ x: (e.clientX - r.left) / r.width * p.width, y: (e.clientY - r.top) / r.height * p.height },s.time,true)
  }
  function begin(e: React.PointerEvent<SVGGElement>) {
    if (!s.blockerTool || e.button !== 0) return
    e.stopPropagation(); e.preventDefault(); const v = location(e); gesture.current = { kind: 'draw', start: v, points: [v] }; e.currentTarget.setPointerCapture(e.pointerId)
  }
  function startEdit(e: React.PointerEvent, b: Blocker, kind: Gesture['kind'], vertex?: number) {
    e.stopPropagation(); e.preventDefault(); s.selectBlocker(b.id, false)
    if (b.locked || e.button !== 0) return
    const group = e.currentTarget.closest('.blocker-overlay') as SVGGElement, r = group.ownerSVGElement!.getBoundingClientRect()
    s.begin(); gesture.current = { kind, start: framePoint(p,{ x: (e.clientX - r.left) / r.width * p.width, y: (e.clientY - r.top) / r.height * p.height },s.time,true), original: structuredClone(b), vertex }; group.setPointerCapture(e.pointerId)
  }
  function move(e: React.PointerEvent<SVGGElement>) {
    const d = gesture.current; if (!d) return; e.stopPropagation(); const v = location(e)
    if (d.kind === 'draw') {
      if (!s.blockerTool) return
      if (s.blockerTool === 'polygon') {
        const last = d.points!.at(-1)!; if (Math.hypot(v.x - last.x, v.y - last.y) < 2 / Math.max(.1, fit)) return
        d.points!.push(v); if (d.points!.length > 512) d.points = d.points!.filter((_, i) => i % 2 === 0)
      } else d.points = [d.start, v]
      setDraft(blockerFromDrawing(s.blockerTool, d.points!, p)); return
    }
    const b = d.original; if (!b) return
    if (d.kind === 'move') s.changeBlocker({ x: b.x + v.x - d.start.x, y: b.y + v.y - d.start.y }, false)
    else {
      const angle = -b.rotation * Math.PI / 180, dx = v.x - b.x, dy = v.y - b.y, x = dx * Math.cos(angle) - dy * Math.sin(angle), y = dx * Math.sin(angle) + dy * Math.cos(angle)
      if (d.kind === 'resize') s.changeBlocker({ width: Math.max(4, Math.abs(x) * 2), height: Math.max(4, Math.abs(y) * 2) }, false)
      else if (b.vertices && d.vertex !== undefined) { const vertices = b.vertices.map(v => ({ ...v })); vertices[d.vertex] = { x: clamp(x / b.width + .5, 0, 1), y: clamp(y / b.height + .5, 0, 1) }; s.changeBlocker({ vertices }, false) }
    }
  }
  function finish(e: React.PointerEvent<SVGGElement>, cancel = false) {
    const d = gesture.current; if (!d) return; e.stopPropagation(); gesture.current = null
    if (d.kind === 'draw' && !cancel && s.blockerTool) {
      const last = location(e), points = s.blockerTool === 'polygon' ? [...d.points!, last] : [d.start, last], blocker = blockerFromDrawing(s.blockerTool, points, p)
      if (blocker) s.addBlocker(blocker); else { s.set({ blockerTool: null }); s.notify('Draw a larger closed shape to create a blocker.') }
    }
    s.end(); setDraft(null); if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }
  const f=directorAt(p,s.time).frame
  return <g transform={`scale(${1/f.width} ${1/f.height}) translate(${-f.x*p.width} ${-f.y*p.height})`} className="blocker-overlay" onPointerDown={begin} onPointerMove={move} onPointerUp={e => finish(e)} onPointerCancel={e => finish(e, true)}>
    {(p.blockers ?? []).map(b => blockerAt(b, s.time)).filter(b => b.visible && (s.guides || b.id === s.selectedBlocker)).map(b => <g key={b.id} transform={`translate(${b.x} ${b.y}) rotate(${b.rotation})`}>
      <path d={blockerPath(b)} className={`blocker-outline ${b.id === s.selectedBlocker ? 'selected' : ''}`} vectorEffect="non-scaling-stroke" aria-label={`Select ${b.name}`} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); s.selectBlocker(b.id) } }} onPointerDown={e => startEdit(e, b, 'move')}/>
      {b.id === s.selectedBlocker && <>
        <text x={-b.width / 2} y={-b.height / 2 - radius * 2} fontSize={radius * 2} className="blocker-label">{b.name}{b.locked ? ' · locked' : ''}</text>
        {!b.locked && <>
          <rect x={b.width / 2 - radius} y={b.height / 2 - radius} width={radius * 2} height={radius * 2} className="blocker-resize" vectorEffect="non-scaling-stroke" aria-label="Resize blocker" onPointerDown={e => startEdit(e, b, 'resize')}/>
          {b.shape === 'polygon' && b.vertices?.map((v, i) => <circle key={i} cx={(v.x - .5) * b.width} cy={(v.y - .5) * b.height} r={radius * .8} className="blocker-vertex" vectorEffect="non-scaling-stroke" aria-label={`Blocker outline point ${i + 1}`} onPointerDown={e => startEdit(e, b, 'vertex', i)}/>)}
        </>}
      </>}
    </g>)}
    {s.blockerTool && <rect x={f.x*p.width} y={f.y*p.height} width={p.width*f.width} height={p.height*f.height} fill="transparent" className="blocker-draw-surface"/>}
    {draft && <path d={blockerPath(draft)} transform={`translate(${draft.x} ${draft.y})`} className="blocker-draft" vectorEffect="non-scaling-stroke"/>}
    {!s.blockerTool && selected && !selected.visible && <text x={16 / Math.max(.1, fit)} y={24 / Math.max(.1, fit)} fontSize={radius * 2.2} className="blocker-label">Blocker hidden · enable its eye icon to show it</text>}
  </g>
}
