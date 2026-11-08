import { videoBlob, videoPlacement } from './video'
import { seedBox, type TrackingPlan, type TrackingResult } from './tracking'
import type { Blocker, BlockerKey, CanvasPoint, Project } from './types'
import { checkTrackingAbort } from './trackingVideo'

export type SamMask = { x: number; y: number; width: number; height: number; vertices: CanvasPoint[] }
type SamStatus = { id: string; status: string; progress: number; seed?: SamMask; result?: { keys: (SamMask & { time: number })[]; end: number; reason: TrackingResult['reason'] }; error?: string }

export function samEndpoint(value: string) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Enter an HTTP or HTTPS SAM 3 service address.')
  return url.href.replace(/\/$/, '')
}

async function request(endpoint: string, path: string, signal: AbortSignal, init?: RequestInit) {
  try {
    const response = await fetch(samEndpoint(endpoint) + path, { ...init, signal: AbortSignal.any([signal, AbortSignal.timeout(path === '/sessions' ? 120_000 : 20_000)]) })
    const value = await response.json()
    if (!response.ok) throw new Error(typeof value.detail === 'string' ? value.detail : `SAM 3 service returned ${response.status}.`)
    return value
  } catch (error) {
    checkTrackingAbort(signal)
    if (error instanceof TypeError) throw new Error('Cannot reach the SAM 3 service. Start FastAPI, check the address and allow this editor origin in TRACE_ORIGINS.')
    throw error
  }
}

export function samSelection(p: Project, b: Blocker, plan: TrackingPlan) {
  if (!p.video) throw new Error('Add a video first.')
  const rect = videoPlacement(p.video, p.width, p.height), box = seedBox(b, plan.start)
  const left = Math.max(0, (box.x - box.width / 2 - rect.x) / rect.width), top = Math.max(0, (box.y - box.height / 2 - rect.y) / rect.height)
  const right = Math.min(1, (box.x + box.width / 2 - rect.x) / rect.width), bottom = Math.min(1, (box.y + box.height / 2 - rect.y) / rect.height)
  if (right - left < .005 || bottom - top < .005) throw new Error('Draw a selection around a subject inside the video.')
  return [left, top, right - left, bottom - top]
}

export function samMaskInScene(mask: SamMask, p: Project) {
  if (!p.video || !mask || ![mask.x, mask.y, mask.width, mask.height].every(Number.isFinite) || mask.width <= 0 || mask.height <= 0 || mask.width > 1 || mask.height > 1 || mask.x < 0 || mask.x > 1 || mask.y < 0 || mask.y > 1 || !Array.isArray(mask.vertices) || mask.vertices.length < 3 || mask.vertices.length > 128 || mask.vertices.some(v => !v || !Number.isFinite(v.x) || !Number.isFinite(v.y) || v.x < 0 || v.x > 1 || v.y < 0 || v.y > 1)) throw new Error('SAM 3 returned an invalid outline.')
  const rect = videoPlacement(p.video, p.width, p.height)
  return { x: rect.x + mask.x * rect.width, y: rect.y + mask.y * rect.height, width: Math.max(1, mask.width * rect.width), height: Math.max(1, mask.height * rect.height), vertices: mask.vertices.map(v => ({ ...v })) }
}

async function waitFor(endpoint: string, id: string, target: 'ready' | 'complete', signal: AbortSignal, progress: (value: number) => void): Promise<SamStatus> {
  while (true) {
    checkTrackingAbort(signal)
    const status = await request(endpoint, `/sessions/${encodeURIComponent(id)}`, signal) as SamStatus
    if (status.status === 'failed') throw new Error(status.error || 'SAM 3 could not analyze this subject.')
    if (status.status === 'cancelled' || status.status === 'cancelling') throw new DOMException('Tracking cancelled', 'AbortError')
    progress(Number.isFinite(status.progress) ? status.progress : 0)
    if (status.status === target) return status
    await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(new DOMException('Tracking cancelled', 'AbortError')) }
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, 700)
      signal.addEventListener('abort', abort, { once: true })
    })
  }
}

export async function cancelSam(endpoint: string, id: string) {
  await fetch(samEndpoint(endpoint) + `/sessions/${encodeURIComponent(id)}`, { method: 'DELETE', signal: AbortSignal.timeout(5000) }).catch(() => {})
}

export async function analyzeSam(endpoint: string, p: Project, b: Blocker, plan: TrackingPlan, prompt: string, signal: AbortSignal, progress: (v: number) => void, sessionCreated: (id: string) => void) {
  const health = await request(endpoint, '/health', signal)
  if (health.service !== 'trace-sam3' || health.version !== 1) throw new Error('This address is not a compatible Trace SAM 3 service.')
  if (!health.ready) throw new Error(health.message || 'The SAM 3 model is not configured.')
  const form = new FormData()
  form.append('video', videoBlob(p.video!.src), p.video!.name)
  form.append('options', JSON.stringify({ box: samSelection(p, b, plan), times: plan.times, end: plan.end, source_start: p.video!.sourceStart, prompt }))
  const session = await request(endpoint, '/sessions', signal, { method: 'POST', body: form })
  if (typeof session.id !== 'string' || !/^[a-f0-9]{32}$/.test(session.id)) throw new Error('Invalid SAM 3 analysis session.')
  sessionCreated(session.id)
  const status = await waitFor(endpoint, session.id, 'ready', signal, progress)
  if (!status.seed) throw new Error('SAM 3 returned no subject mask.')
  return { id: session.id, mask: samMaskInScene(status.seed, p) }
}

export async function trackSam(endpoint: string, id: string, p: Project, b: Blocker, plan: TrackingPlan, signal: AbortSignal, progress: (v: number) => void): Promise<TrackingResult> {
  await request(endpoint, `/sessions/${id}/track`, signal, { method: 'POST' })
  const status = await waitFor(endpoint, id, 'complete', signal, progress), result = status.result
  if (!result || !Array.isArray(result.keys) || !result.keys.length || result.keys.length > 240 || !Number.isFinite(result.end) || result.end <= plan.start || result.end > plan.end + .001 || !['complete', 'subject-lost', 'scene-cut'].includes(result.reason)) throw new Error('SAM 3 returned an invalid track.')
  const keys: BlockerKey[] = result.keys.map((k, i) => {
    if (!Number.isFinite(k.time) || k.time < plan.start || k.time >= result.end || (i > 0 && k.time <= result.keys[i - 1].time)) throw new Error('SAM 3 returned invalid mask timing.')
    return { ...samMaskInScene(k, p), time: k.time, rotation: 0, opacity: b.opacity, easing: 'hold' }
  })
  if (keys[0].time !== plan.start || keys.some(k => k.vertices!.length !== keys[0].vertices!.length)) throw new Error('SAM 3 returned inconsistent mask outlines.')
  return { keys, end: result.end, reason: result.reason, shape: 'polygon', vertices: keys[0].vertices }
}
