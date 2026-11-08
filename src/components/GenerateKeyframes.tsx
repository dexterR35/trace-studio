import { useState } from 'react'
import { DiamondPlus, X } from 'lucide-react'
import { useStudio } from '../store'
import { durationOf } from '../core/animation'
import { generateIntervalKeys, intervalFrames, type KeyTarget } from '../core/keyframes'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'

export function GenerateKeyframes() {
  const s = useStudio(), [open, setOpen] = useState(false)
  return <><button className="generate-keys-button" aria-label="Generate keyframes" title="Add keys at regular intervals · choose exact start and end frames" disabled={!s.project.layers.length && !s.project.blockers?.length} onClick={() => { s.set({ playing: false }); setOpen(true) }}><DiamondPlus size={13}/><span>Auto keys</span></button>{open && <KeyframeDialog close={() => setOpen(false)}/>}</>
}
function KeyframeDialog({ close }: { close: () => void }) {
  const s = useStudio(), p = s.project, fps = p.fps, last = Math.round(durationOf(p) * fps)
  const options = [...p.layers.map(l => ({ value: `path:${l.id}`, name: `${l.name} · motion path`, locked: l.locked })), ...(p.blockers ?? []).map(b => ({ value: `blocker:${b.id}`, name: `${b.name} · blocker`, locked: b.locked }))]
  const [target, setTarget] = useState(s.selectedBlocker ? `blocker:${s.selectedBlocker}` : s.selectedLayer ? `path:${s.selectedLayer}` : options[0]?.value ?? ''), [start, setStart] = useState(0), [end, setEnd] = useState(last), [every, setEvery] = useState(2), [error, setError] = useState('')
  const kind = target.startsWith('blocker:') ? 'blocker' : 'path'
  let frames: number[] = [], invalid = ''
  try { frames = intervalFrames(start, end, every, fps, kind === 'path' ? 60 : 240); if (end > last) invalid = 'Choose an end frame within the clip.' } catch (e) { invalid = (e as Error).message }
  const locked = options.find(o => o.value === target)?.locked ?? true
  function apply() {
    try {
      const selection: KeyTarget = { kind, id: target.slice(target.indexOf(':') + 1) }
      s.end(); s.edit(project => { generateIntervalKeys(project, selection, start, end, every) })
      s.set({ time: start / fps, playing: false, selectedPoint: null, selectedMotion: null, bottom: 'timeline', ...(kind === 'blocker' ? { selectedBlocker: selection.id } : { selectedLayer: selection.id, selectedBlocker: null }) })
      s.notify(`${frames.length} interval keys ready. Select any key to edit its position.`); close()
    } catch (e) { setError((e as Error).message) }
  }
  return <Modal titleId="auto-keys-title" className="auto-keys-dialog" close={close}>
    <div className="modal-top"><div className="modal-icon"><DiamondPlus size={20}/></div><button className="icon-button" aria-label="Close automatic keyframes" onClick={close}><X size={18}/></button></div>
    <h2 id="auto-keys-title">Keys across your video</h2><p className="modal-description">Choose the exact start and end frames, then add editable keys at regular intervals.</p>
    <label className="select-field"><span>Track</span><select aria-label="Keyframe target" value={target} onChange={e => { setTarget(e.target.value); setError('') }}>{options.map(o => <option key={o.value} value={o.value} disabled={o.locked}>{o.name}{o.locked ? ' · locked' : ''}</option>)}</select></label>
    <div className="auto-key-inputs"><label><span>Start frame</span><input aria-label="Key range start frame" type="number" min={0} max={end - 1} step={1} value={start} onChange={e => { setStart(Number(e.target.value)); setError('') }}/><small>{(start / fps).toFixed(2)}s</small></label><label><span>End frame</span><input aria-label="Key range end frame" type="number" min={start + 1} max={last} step={1} value={end} onChange={e => { setEnd(Number(e.target.value)); setError('') }}/><small>{(end / fps).toFixed(2)}s</small></label><label><span>Add a key every</span><input aria-label="Keyframe interval in seconds" type="number" min={1 / fps} step={.1} value={every} onChange={e => { setEvery(Number(e.target.value)); setError('') }}/><small>seconds · {fps} fps</small></label></div>
    <div className="blocker-actions"><button onClick={() => { setStart(0); setEnd(last); setError('') }}>Entire clip</button><button onClick={() => { const sections = [0, ...(p.video?.sections ?? []), durationOf(p)], next = sections.findIndex(t => t > s.time + .001); setStart(Math.round(sections[Math.max(0, next - 1)] * fps)); setEnd(Math.round(sections[next < 0 ? sections.length - 1 : next] * fps)); setError('') }}>Current section</button></div>
    <p className="blocker-help">{kind === 'path' ? 'Fits the path to this range and keeps its existing points. New points follow the current curve; move each point freely afterward.' : 'Adds keys from the blocker’s current animation and sets its visible range. Existing tracking keys are kept.'} The end boundary can equal the clip length; exports render every frame before it.</p>
    {!invalid && <p className="keyframe-summary">{frames.length} interval keys · {frames.slice(0, 4).map(f => `${Number((f / fps).toFixed(3))}s`).join(', ')}{frames.length > 4 ? ` … ${Number((end / fps).toFixed(3))}s` : ''}</p>}
    {(error || invalid) && <p className="auto-key-error" role="alert">{error || invalid}</p>}
    <div className="export-footer"><Button variant="quiet" onClick={close}>Cancel</Button><Button variant="primary" disabled={!!invalid || locked} onClick={apply}>Add {frames.length || ''} keyframes</Button></div>
  </Modal>
}
