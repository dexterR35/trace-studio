import { useEffect, useRef, useState } from 'react'
import { Film, Scissors, Volume2, VolumeX, X } from 'lucide-react'
import { useStudio } from '../store'
import { importVideo } from '../core/video'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'

export async function addVideoFile(file: File) {
  const s = useStudio.getState(); s.set({ playing: false }); s.notify('Reading video…')
  const video = await importVideo(file)
  useStudio.getState().edit(p => { p.video = video })
  useStudio.getState().set({ time: 0, playing: false, bottom: 'timeline' })
  useStudio.getState().notify(`${video.name} added · ${video.duration.toFixed(2)} seconds`)
}

export function VideoControl() {
  const s = useStudio(), input = useRef<HTMLInputElement>(null), [busy, setBusy] = useState(false), [open, setOpen] = useState(false), v = s.project.video
  async function choose(file?: File) {
    if (!file || busy) return
    setBusy(true)
    try { await addVideoFile(file) } catch (error) { useStudio.getState().notify((error as Error).message) } finally { setBusy(false) }
  }
  return <>
    <button className="button video-control" disabled={busy} aria-label={v ? 'Video settings' : 'Import background video'} onClick={() => v ? setOpen(true) : input.current?.click()} title={v ? `${v.name} · video settings` : 'Import a background video · up to 30 seconds'}><Film size={14}/><span>{busy ? 'Reading…' : v ? 'Video' : 'Add video'}</span></button>
    <input ref={input} type="file" accept=".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime" hidden aria-label="Import background video file" onChange={e => { void choose(e.target.files?.[0]); e.target.value = '' }}/>
    {open && v && <Modal className="video-settings" titleId="video-settings-title" close={() => setOpen(false)}>
      <div className="modal-top"><div className="modal-icon"><Film size={20}/></div><button className="icon-button" aria-label="Close video settings" onClick={() => setOpen(false)}><X size={18}/></button></div>
      <h2 id="video-settings-title">Video background</h2><p className="modal-description">{v.name} · {v.width} × {v.height} · {v.duration.toFixed(2)}s</p>
      <p className="blocker-help">The video sets the scene length. Animate elements over it and use invisible blockers to reveal objects from the original footage.</p>
      <label className="select-field"><span>Fit in scene</span><select aria-label="Video fitting" value={v.fit} onChange={e => s.edit(p => { p.video!.fit = e.target.value as 'contain' | 'cover' })}><option value="contain">Show entire video</option><option value="cover">Fill scene · crop edges</option></select></label>
      <div className="switch-row"><span>Original audio{!v.hasAudio ? ' · no audio track' : ''}</span><button role="switch" aria-label="Original video audio" aria-checked={!v.muted && v.hasAudio} disabled={!v.hasAudio} className={`switch ${!v.muted && v.hasAudio ? 'on' : ''}`} onClick={() => s.edit(p => { p.video!.muted = !p.video!.muted })}/></div>
      <div className="video-section-controls"><strong>Video sections</strong><button onClick={() => { const t = Math.round(s.time * s.project.fps) / s.project.fps; if (t <= 0 || t >= v.duration || v.sections.length >= 100) { s.notify('Move the playhead inside the video to add a separator.'); return }; s.edit(p => { p.video!.sections = [...new Set([...p.video!.sections, t])].sort((a, b) => a - b) }) }}><Scissors size={13}/> Add separator at playhead</button></div>
      <p className="blocker-help">Separators mark shots without cutting the source. A blocker can be limited to the current section.</p>
      <div className="video-section-list">{v.sections.map(t => <div key={t}><button onClick={() => { s.set({ time: t, playing: false }); setOpen(false) }}>{t.toFixed(2)}s</button><button aria-label={`Remove video separator at ${t.toFixed(2)} seconds`} onClick={() => s.edit(p => { p.video!.sections = p.video!.sections.filter(x => x !== t) })}><X size={12}/></button></div>)}</div>
      <div className="export-footer"><Button variant="quiet" onClick={() => { s.edit(p => { delete p.video }); s.set({ time: 0, playing: false }); setOpen(false) }}>Remove video</Button><Button variant="quiet" onClick={() => input.current?.click()}>Replace video</Button><Button variant="primary" onClick={() => setOpen(false)}>Done</Button></div>
    </Modal>}
  </>
}

export function VideoAudioPreview() {
  const s = useStudio(), audio = useRef<HTMLAudioElement | null>(null), v = s.project.video
  useEffect(() => {
    if (!v?.hasAudio) return
    const element = new Audio(v.src); element.preload = 'auto'; audio.current = element
    return () => { element.pause(); element.removeAttribute('src'); element.load(); audio.current = null }
  }, [v?.id])
  useEffect(() => {
    const element = audio.current; if (!element || !v) return
    element.muted = v.muted
    const time = v.sourceStart + Math.min(s.time, v.duration)
    if (Number.isFinite(element.duration) && Math.abs(element.currentTime - time) > .15) element.currentTime = time
    if (s.playing && !v.muted) { if (element.paused) void element.play().catch(() => {}) } else element.pause()
  }, [v, s.time, s.playing])
  return null
}
