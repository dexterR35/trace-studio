import { useEffect, useRef, useState } from 'react'
import { Scan, ScanSearch, Square, Play } from 'lucide-react'
import { useStudio } from '../store'
import { blockerAt, blockerPath } from '../core/blockers'
import { applyTracking, trackingPlan, type TrackingPlan } from '../core/tracking'
import { analyzeLocal, trackingFrame, trackLocal } from '../core/trackingVideo'
import { analyzeSam, cancelSam, trackSam } from '../core/sam3'
import { sameValue } from '../core/project'
import type { Blocker, Project } from '../core/types'

type Analysis = { project: Project; original: Blocker; pose: Blocker; plan: TrackingPlan; image: string; session?: string; endpoint: string; method: 'local' | 'sam3' }
const endpointKey = 'trace-sam3-endpoint'
export function BlockerTracking({ blocker }: { blocker: Blocker }) {
  const s = useStudio(), [method, setMethod] = useState<'local' | 'sam3'>('local'), [endpoint, setEndpoint] = useState(() => { try { return localStorage.getItem(endpointKey) || 'http://127.0.0.1:8000' } catch { return 'http://127.0.0.1:8000' } }), [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState<'analyzing' | 'tracking' | null>(null), [progress, setProgress] = useState(0), [analysis, setAnalysis] = useState<Analysis | null>(null), [message, setMessage] = useState('')
  const running = useRef<AbortController | null>(null), session = useRef<{ endpoint: string; id: string } | null>(null)
  const videoId = s.project.video?.id
  function disposeSession() { const active = session.current; session.current = null; if (active) void cancelSam(active.endpoint, active.id) }
  function reset() { running.current?.abort(); disposeSession(); setAnalysis(null); setMessage('') }
  useEffect(() => () => { running.current?.abort(); disposeSession() }, [])
  // Selection/shot changes invalidate the seed, rather than applying a result to another object.
  useEffect(() => { reset() }, [blocker.id, videoId, method])
  const valid = analysis && analysis.project.video === s.project.video && analysis.project.width === s.project.width && analysis.project.height === s.project.height && analysis.project.fps === s.project.fps && Math.abs(analysis.plan.start - s.time) < .5 / s.project.fps && sameValue(analysis.original, blocker)
  useEffect(() => { if (analysis && !valid) reset() }, [analysis, valid])

  async function analyze() {
    if (busy || blocker.locked) return
    reset(); setBusy('analyzing'); setProgress(0)
    const controller = new AbortController(); running.current = controller
    const project = useStudio.getState().project, original = project.blockers!.find(v => v.id === blocker.id)!
    useStudio.getState().set({ playing: false })
    try {
      const plan = trackingPlan(project, original, useStudio.getState().time), frame = await trackingFrame(project, plan.start, controller.signal)
      let pose = { ...blockerAt(original, plan.start), animation: undefined }
      let sid: string | undefined
      if (method === 'sam3') {
        const response = await analyzeSam(endpoint, project, original, plan, prompt, controller.signal, setProgress, id => { session.current = { endpoint, id } })
        pose = { ...pose, ...response.mask, shape: 'polygon', rotation: 0 }; sid = response.id
        try { localStorage.setItem(endpointKey, endpoint) } catch { /* endpoint preference is optional */ }
      } else { analyzeLocal(project, original, plan.start, frame.pixels) }
      if (controller.signal.aborted) return
      useStudio.getState().set({ time: plan.start, playing: false })
      setAnalysis({ project, original: structuredClone(original), pose, plan, image: frame.image, session: sid, endpoint, method })
      setMessage(method === 'sam3' ? 'Subject mask ready. Check the outline, then start tracking.' : 'Selection ready. Local tracking follows this drawn shape; SAM 3 can find the subject’s silhouette.')
    } catch (error) { disposeSession(); if (!controller.signal.aborted) setMessage((error as Error).message) }
    finally { if (running.current === controller) { running.current = null; setBusy(null) } }
  }
  async function track() {
    if (busy || !analysis || !valid || blocker.locked) return
    const source = analysis, controller = new AbortController(); running.current = controller
    setBusy('tracking'); setProgress(0); setMessage('')
    try {
      const result = source.session ? await trackSam(source.endpoint, source.session, source.project, source.original, source.plan, controller.signal, setProgress) : await trackLocal(source.project, source.original, source.plan, controller.signal, setProgress)
      if (controller.signal.aborted) return
      const current = useStudio.getState(), target = current.project.blockers?.find(v => v.id === source.original.id)
      if (!target || target.locked || !sameValue(target, source.original) || current.project.video !== source.project.video || current.project.width !== source.project.width || current.project.height !== source.project.height || current.project.fps !== source.project.fps) throw new Error('The video or blocker changed. Analyze it again before tracking.')
      // Clear the analysis before committing: changing the blocker invalidates its old seed.
      setAnalysis(null); disposeSession()
      current.end(); current.edit(p => applyTracking(p.blockers!.find(v => v.id === target.id)!, result, source.plan))
      const reason = result.reason === 'scene-cut' ? 'Stopped at a scene change' : result.reason === 'subject-lost' ? 'Stopped when the subject was lost' : 'Tracking complete'
      setMessage(`${reason} · ${result.keys.length} keys · mask ends at ${result.end.toFixed(2)}s.`)
      current.notify(`${reason}. Blocker animation added; Undo restores the previous mask.`)
    } catch (error) { setAnalysis(null); disposeSession(); if (!controller.signal.aborted) setMessage((error as Error).message) }
    finally { if (running.current === controller) { running.current = null; setBusy(null) } }
  }
  if (!s.project.video) return null
  return <section className="blocker-tracking" aria-label="Automatic subject tracking">
    <strong><Scan size={13}/> Automatic tracking</strong>
    <p className="blocker-help">Draw a blocker around one subject. Analyze at the playhead, check its mask, then start tracking. Stops at a separator, scene change or lost subject.</p>
    <fieldset disabled={!!busy || blocker.locked}>
      <label className="select-field"><span>Tracking method</span><select aria-label="Tracking method" value={method} onChange={e => setMethod(e.target.value as 'local' | 'sam3')}><option value="local">Local · follow drawn shape</option><option value="sam3">SAM 3 · subject silhouette</option></select></label>
      {method === 'sam3' && <><label className="select-field"><span>Subject description · optional</span><input aria-label="SAM 3 subject description" placeholder="e.g. person in a white shirt" maxLength={150} value={prompt} onChange={e => { reset(); setPrompt(e.target.value) }}/></label><details className="tracking-connection"><summary>Local FastAPI connection</summary><label className="select-field"><span>Server address</span><input aria-label="SAM 3 server address" value={endpoint} onChange={e => { reset(); setEndpoint(e.target.value) }}/></label><p className="blocker-help">The video is sent only to this address when you analyze it. Requires the separate SAM 3 service with an NVIDIA CUDA GPU. Setup: server/README.md.</p></details></>}
      <div className="blocker-actions"><button onClick={() => void analyze()}><ScanSearch size={13}/>{analysis ? 'Analyze again' : 'Analyze subject'}</button></div>
    </fieldset>
    {analysis && valid && <><svg className="tracking-preview" viewBox={`0 0 ${analysis.project.width} ${analysis.project.height}`} role="img" aria-label="Analyzed subject mask preview"><image href={analysis.image} width={analysis.project.width} height={analysis.project.height}/><path transform={`translate(${analysis.pose.x} ${analysis.pose.y}) rotate(${analysis.pose.rotation})`} d={blockerPath(analysis.pose)} fill="#8febcb45" stroke="#a9f5d7" strokeWidth={Math.max(1, analysis.project.width / 180)}/></svg><p className="blocker-help">{analysis.plan.start.toFixed(2)}–{analysis.plan.end.toFixed(2)}s · replaces this blocker’s keys in this section.</p><div className="blocker-actions"><button disabled={!!busy || blocker.locked} onClick={() => void track()}><Play size={13}/> Start tracking</button></div></>}
    {busy && <div className="tracking-progress" role="status"><span>{busy === 'analyzing' ? 'Analyzing subject' : 'Tracking subject'}… {Math.round(progress * 100)}%</span><progress max={1} value={progress}/><button onClick={() => { reset(); setMessage('Cancelled. Your blocker is unchanged.') }}><Square size={11}/> Cancel</button></div>}
    {message && <p className="blocker-help tracking-message" role="status">{message}</p>}
  </section>
}
