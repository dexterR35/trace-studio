import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, LockKeyhole, Shield, Trash2 } from 'lucide-react'
import { useStudio } from '../store'
import { NumberField } from './NumberField'
import { blockerAt } from '../core/blockers'
import { durationOf } from '../core/animation'
import { BlockerTracking } from './BlockerTracking'

export function BlockerList() {
  const s = useStudio(), blockers = s.project.blockers ?? []
  if (!blockers.length) return null
  return <div className="blocker-list"><div className="layers-label">FOREGROUND BLOCKERS <span>{blockers.length}</span></div>{[...blockers].reverse().map(b => <div key={b.id} className={`layer-item ${s.selectedBlocker === b.id ? 'selected' : ''}`} role="button" tabIndex={0} onClick={() => s.selectBlocker(b.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); s.selectBlocker(b.id) } }}>
    <div className="layer-thumbnail blocker-thumbnail"><Shield size={19}/></div><div className="layer-text"><strong>{b.name}</strong><span>{b.mode === 'cutout' ? 'Invisible mask' : 'Visible shape'} · {b.animation?.length ? 'animated' : 'fixed'}</span></div><button className="layer-eye" aria-label={`${b.visible ? 'Hide' : 'Show'} ${b.name}`} onClick={e => { e.stopPropagation(); s.edit(p => { const blocker = p.blockers!.find(v => v.id === b.id)!; blocker.visible = !blocker.visible }) }}>{b.visible ? <Eye size={12}/> : <EyeOff size={12}/>}</button>
  </div>)}</div>
}

export function BlockerProperties() {
  const s = useStudio(), blockers = s.project.blockers ?? [], original = blockers.find(b => b.id === s.selectedBlocker), b = original && blockerAt(original, s.time)
  if (!b) return null
  const index = blockers.findIndex(v => v.id === b.id), duration = durationOf(s.project), keyHere = b.animation?.find(k => Math.abs(k.time - s.time) < .5 / s.project.fps)
  function reorder(direction: -1 | 1) {
    if (!b || b.locked) return
    s.edit(p => { const list = p.blockers!, from = list.findIndex(v => v.id === b.id), to = from + direction; if (to >= 0 && to < list.length) [list[from], list[to]] = [list[to], list[from]] })
  }
  return <div className="blocker-properties">
    <div className="blocker-properties-heading"><Shield size={16}/><strong>Foreground blocker</strong><button className={`icon-button ${b.locked ? 'active' : ''}`} aria-label={b.locked ? 'Unlock blocker' : 'Lock blocker'} aria-pressed={b.locked} title={b.locked ? 'Unlock blocker' : 'Lock blocker'} onClick={() => s.edit(p => { p.blockers!.find(v => v.id === b.id)!.locked = !b.locked })}><LockKeyhole size={14}/></button></div>
    <p className="blocker-help">In front of added elements in 2D and 3D. Invisible masks reveal the original video when one is present.</p>
    <fieldset disabled={b.locked}>
      <label className="select-field"><span>Name</span><input aria-label="Blocker name" value={b.name} onChange={e => s.changeBlocker({ name: e.target.value.slice(0, 100) })}/></label>
      <label className="select-field"><span>Appearance</span><select aria-label="Blocker appearance" value={b.mode} onChange={e => s.changeBlocker({ mode: e.target.value as 'solid' | 'cutout' })}><option value="solid">Visible shape</option><option value="cutout">Invisible mask</option></select></label>
      <p className="blocker-help">{b.mode === 'cutout' ? 'Hides added elements and reveals the original video or canvas background. Without a video, WebM and PNG preserve transparency.' : 'The animation passes behind this colored shape.'}</p>
      {b.mode === 'solid' && <label className="color-field"><input type="color" aria-label="Blocker color" value={b.color} onChange={e => s.changeBlocker({ color: e.target.value })}/><span>{b.color.toUpperCase()}</span></label>}
      <BlockerTracking key={b.id} blocker={original!}/>
      <section className="blocker-animation-controls">
        <strong>Follow the video</strong>
        <p className="blocker-help">Enable animation, move the playhead, then move or resize the blocker. A keyframe is added automatically at that time.</p>
        <div className="blocker-actions"><button aria-label="Add blocker animation keyframe" onClick={s.addBlockerKey}>{b.animation?.length ? 'Add keyframe here' : 'Animate blocker'}</button><button disabled={!keyHere} onClick={s.removeBlockerKey}>Remove key</button></div>
        {!!b.animation?.length && <><div className="blocker-key-list">{b.animation.map((k, i) => <button key={i} aria-label={`Go to blocker keyframe ${i + 1}`} aria-pressed={Math.abs(k.time - s.time) < .5 / s.project.fps} onClick={() => s.set({ time: k.time, playing: false })}>{k.time.toFixed(2)}s</button>)}</div><label className="select-field"><span>Interpolation after this key</span><select aria-label="Blocker keyframe interpolation" disabled={!keyHere} value={keyHere?.easing ?? 'linear'} onChange={e => s.edit(p => { const key = p.blockers!.find(v => v.id === b.id)!.animation!.find(k => Math.abs(k.time - s.time) < .5 / p.fps); if (key) key.easing = e.target.value as 'linear' | 'hold' })}><option value="linear">Follow movement</option><option value="hold">Hold until next key · shot cut</option></select></label></>}
      </section>
      <div className="field-grid">
        <NumberField label="Blocker position X" value={b.x} suffix="px" onChange={x => s.changeBlocker({ x })}/>
        <NumberField label="Blocker position Y" value={b.y} suffix="px" onChange={y => s.changeBlocker({ y })}/>
        <NumberField label="Blocker width" value={b.width} min={1} max={16384} suffix="px" onChange={width => s.changeBlocker({ width })}/>
        <NumberField label="Blocker height" value={b.height} min={1} max={16384} suffix="px" onChange={height => s.changeBlocker({ height })}/>
        <NumberField label="Blocker rotation" value={b.rotation} min={-3600} max={3600} suffix="°" onChange={rotation => s.changeBlocker({ rotation })}/>
        <NumberField label={b.mode === 'cutout' ? 'Mask strength' : 'Blocker opacity'} value={b.opacity * 100} min={0} max={100} suffix="%" onChange={opacity => s.changeBlocker({ opacity: opacity / 100 })}/>
      </div>
      <div className="field-grid"><NumberField label="Blocker visible from" value={b.start ?? 0} suffix="s" min={0} max={Math.max(0, (b.end ?? duration) - 1 / s.project.fps)} step={1 / s.project.fps} onChange={start => s.changeBlocker({ start })}/><NumberField label="Blocker visible until" value={b.end ?? duration} suffix="s" min={(b.start ?? 0) + 1 / s.project.fps} max={duration} step={1 / s.project.fps} onChange={end => s.changeBlocker({ end })}/></div>
      {s.project.video && <button className="text-action" onClick={() => { const times = [0, ...s.project.video!.sections, duration], after = times.findIndex(t => t > s.time), from = after < 0 ? times.length - 2 : Math.max(0, after - 1), start = times[Math.min(from, times.length - 2)], end = times[Math.min(from + 1, times.length - 1)]; s.changeBlocker({ start, end }) }}>Use current video section</button>}
      {b.shape === 'polygon'  && <p className="blocker-help">Drag the outline's small points to reshape your blocker.</p>}
      <div className="blocker-actions"><button disabled={index === blockers.length - 1} onClick={() => reorder(1)}><ArrowUp size={13}/> Forward</button><button disabled={index === 0} onClick={() => reorder(-1)}><ArrowDown size={13}/> Backward</button></div>
      <div className="blocker-actions"><button onClick={s.duplicate}><Copy size={13}/> Duplicate</button><button onClick={s.deleteBlocker}><Trash2 size={13}/> Delete</button></div>
    </fieldset>
  </div>
}
