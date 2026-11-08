import { Film, Scissors, Shield, Volume2, VolumeX } from 'lucide-react'
import { useStudio } from '../store'
import { durationOf } from '../core/animation'

export function CompositionTrackLabels() {
  const s = useStudio(), v = s.project.video
  return <>
    {v && <div className="composition-track-label video-track-label"><Film size={13}/><span title={v.name}>Video · {v.duration.toFixed(1)}s</span><button aria-label={v.muted ? 'Unmute original video' : 'Mute original video'} onClick={() => s.edit(p => { p.video!.muted = !p.video!.muted })}>{v.muted || !v.hasAudio ? <VolumeX size={12}/> : <Volume2 size={12}/>}</button></div>}
    {s.project.blockers?.map(b => <button key={b.id} className={`composition-track-label blocker-track-label ${s.selectedBlocker === b.id ? 'active' : ''}`} onClick={() => s.selectBlocker(b.id)}><Shield size={12}/><span>{b.name}</span></button>)}
  </>
}

export function CompositionTracks({ range, onScrub }: { range: number; onScrub: (e: React.PointerEvent) => void }) {
  const s = useStudio(), p = s.project, v = p.video, end = durationOf(p)
  function jump(time: number) { s.set({ time, playing: false, selectedPoint: null, selectedMotion: null }) }
  return <>
    {v && <div className="composition-track video-track" aria-label="Background video track" onPointerDown={onScrub}>
      <div className="video-track-bar" style={{ width: `${v.duration / range * 100}%` }}><Film size={11}/><span>{v.name}</span></div>
      {v.sections.map((t, i) => <button key={t} className="video-separator" style={{ left: `${t / range * 100}%` }} aria-label={`Video section ${i + 2} at ${t.toFixed(2)} seconds`} title={`Section ${i + 2} · ${t.toFixed(2)}s`} onPointerDown={e => { e.stopPropagation(); jump(t) }}><Scissors size={12}/></button>)}
    </div>}
    {p.blockers?.map(b => <div key={b.id} className="composition-track blocker-track" aria-label={`Blocker track of ${b.name}`} onPointerDown={e => { s.selectBlocker(b.id, false); onScrub(e) }}>
      <div className={`blocker-track-bar ${s.selectedBlocker === b.id ? 'active' : ''}`} style={{ left: `${(b.start ?? 0) / range * 100}%`, width: `${Math.max(0, Math.min(end, b.end ?? end) - (b.start ?? 0)) / range * 100}%` }}>{b.mode === 'cutout' ? 'Reveal video / background' : 'Visible blocker'}</div>
      {b.animation?.map((key, i) => <button key={i} className="timeline-diamond blocker-diamond" style={{ left: `${key.time / range * 100}%` }} aria-label={`Blocker keyframe ${i + 1} of ${b.name}`} title={`${key.time.toFixed(2)}s`} onPointerDown={e => { e.stopPropagation(); s.selectBlocker(b.id); jump(key.time) }}/>) }
    </div>)}
  </>
}
