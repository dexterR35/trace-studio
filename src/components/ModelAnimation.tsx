import { Box, ChevronDown } from 'lucide-react'
import { useStudio } from '../store'
import { modelClip, modelTimeAt } from '../core/model-animation'
import type { Layer, ModelAnimation as Settings } from '../core/types'
import { NumberField } from './NumberField'

export function ModelAnimation({ layer }: { layer: Layer }) {
  const s = useStudio(), model = layer.model, clip = modelClip(layer)
  if (!model) return null
  function change(values: Partial<Settings>) {
    if (layer.locked) return
    s.edit(p => { const selected = p.layers.find(l => l.id === layer.id); if (selected?.model) Object.assign(selected.model, values) })
    s.set({ playing: false })
  }
  return <section className="inspector-section model-animation-settings" id="model-animation"><div className="section-title"><span><ChevronDown size={12}/> Model animation</span><Box size={12}/></div><div className="section-content"><p className="settings-note model-file-name" title={model.fileName}>{model.fileName} · GLB</p>{model.clips.length ? <><label className="select-field"><span>Blender animation</span><select aria-label="Model animation clip" value={model.clip ?? 'none'} onChange={e => change({ clip: e.target.value === 'none' ? null : Number(e.target.value), offset: 0 })}><option value="none">Rest pose · no animation</option>{model.clips.map((c, i) => <option key={i} value={i}>{c.name || `Animation ${i + 1}`} · {c.duration.toFixed(2)}s</option>)}</select></label>{clip && <><div className="model-clip-status">Clip {(modelTimeAt(layer, s.time) ?? 0).toFixed(2)} / {clip.duration.toFixed(2)}s<span>{s.time < layer.delay + model.start ? 'Waiting' : model.loop ? 'Loop' : 'Once · hold last pose'}</span></div><NumberField label="Model animation speed" value={model.speed} min={.1} max={4} step={.05} suffix="×" onChange={speed => change({ speed })}/><div className="field-grid"><NumberField label="Model animation start" value={model.start} min={0} max={600} step={1 / s.project.fps} suffix="s" onChange={start => change({ start })}/><NumberField label="Model clip offset" value={model.offset} min={0} max={clip.duration} step={1 / s.project.fps} suffix="s" onChange={offset => change({ offset })}/></div><div className="switch-row"><span>Loop model animation</span><button role="switch" aria-label="Loop model animation" aria-checked={model.loop} className={`switch ${model.loop ? 'on' : ''}`} onClick={() => change({ loop: !model.loop })}/></div></>}<p className="settings-note">The Blender clip plays inside the object. Its path and Asset motion stay independent. Start is relative to the element's start time.</p></> : <p className="settings-note">Static model. Animate its path, rotation and scale with the controls below. Export an animation from Blender to add internal movement.</p>}</div></section>
}
