import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useStudio } from '../store'
import { POSITION_LIMIT } from '../core/types'
import { formatDistance, measurement, pointReference } from '../core/scene'

export function PointReference() {
  const s = useStudio(), layer = s.project.layers.find(l => l.id === s.selectedLayer)
  const ref = layer && s.selectedPoint !== null ? pointReference(layer, s.selectedPoint) : null
  if (!s.pointInfo || !ref || !layer) return null
  const p = s.project, unit = measurement(p).unit, number = (value: number, signed = false) => formatDistance(value, p, signed), next = ref.next
  return <aside className="point-reference" aria-label="Selected point reference">
    <div className="point-reference-row">
      <strong className="point-reference-name">P{s.selectedPoint! + 1} <small>{ref.start ? 'START' : ref.end ? 'END' : 'POINT'}</small></strong>
      <div className="point-reference-coordinates">{(['x', 'y', 'z'] as const).map(axis => <span key={axis}><i className={`axis-${axis}`}>{axis.toUpperCase()}</i><b title={`${ref.point[axis]} px`} data-coordinate={axis}>{number(ref.point[axis])}</b></span>)}</div>
      <select aria-label="Point distance units" value={unit} onChange={e => s.edit(p => { p.measurement = { ...measurement(p), unit: e.target.value as 'px' | 'cm' } })}><option value="px">px</option><option value="cm">cm</option></select>
      <nav className="point-reference-nav" aria-label="Path point navigation"><button aria-label="Previous path point" title="Previous point" disabled={!ref.previous} onClick={() => s.selectPoint(s.selectedPoint! - 1)}><ChevronLeft size={13}/></button><button aria-label="Next path point" title="Next point" disabled={!next} onClick={() => s.selectPoint(s.selectedPoint! + 1)}><ChevronRight size={13}/></button></nav>
      <button aria-label="Hide point reference" title="Hide point reference" onClick={() => s.set({ pointInfo: false })}><X size={12}/></button>
    </div>
    <div className="point-reference-row point-reference-distances" tabIndex={0} aria-label="Point distances, scroll horizontally for more">
      <span className="point-reference-base" title="Signed depth from the scene plane"><span>Base Z=0</span><b data-reference="depth">{number(ref.point.z, true)} {unit}</b><small>{Math.abs(ref.point.z) < .01 ? 'on plane' : ref.point.z > 0 ? 'in front' : 'behind'}</small></span>
      <span>{next ? `To P${next.index + 1}` : 'Path complete'} <b data-reference="next-distance">{next ? `${number(next.distance)} ${unit}` : 'END'}</b></span>
      {next && <span className="point-reference-delta">{(['x', 'y', 'z'] as const).map(axis => <span key={axis}>Δ{axis.toUpperCase()} <b data-delta={axis}>{number(next.delta[axis], true)}</b></span>)}</span>}
      <span title="Point arrival time">{ref.time.toFixed(2)}s</span>
      {next && <span>Along curve <b>{number(next.alongPath)} {unit}</b></span>}
      {ref.previous && <span>From P{ref.previous.index + 1} <b>{number(ref.previous.distance)} {unit}</b></span>}
      <span title={`X/Y from scene top-left. ${unit === 'cm' ? `${measurement(p).ppi} PPI design scale` : 'Scene pixels'}`}>Limits ±{POSITION_LIMIT.toLocaleString()} px</span>
    </div>
  </aside>
}
