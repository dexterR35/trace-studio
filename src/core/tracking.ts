import { blockerAt, blockerKeyAt } from './blockers'
import { clamp, type Blocker, type BlockerKey, type Project } from './types'

export type Pixels = { width: number; height: number; data: Uint8ClampedArray }
export type TrackingBox = { x: number; y: number; width: number; height: number }
export type TrackingPlan = { start: number; end: number; times: number[] }
export type TrackingResult = { keys: BlockerKey[]; end: number; reason: 'complete' | 'scene-cut' | 'subject-lost'; shape?: Blocker['shape']; vertices?: Blocker['vertices'] }

// Track only the current shot, starting at the playhead. Both providers share this time grid.
export function trackingPlan(p: Project, b: Blocker, time: number): TrackingPlan {
  if (!p.video) throw new Error('Add a video before tracking a subject.')
  const start = Math.round(Math.max(time, b.start ?? 0) * p.fps) / p.fps
  const end = Math.min(p.video.duration, b.end ?? Infinity, p.video.sections.find(t => t > start + .5 / p.fps) ?? Infinity)
  if (end - start < 2 / p.fps) throw new Error('Move the playhead earlier in this video section.')
  const count = Math.min(239, Math.max(1, Math.ceil((end - start) * Math.min(12, p.fps))))
  const lastFrame = Math.max(start, Math.ceil(end * p.fps - 1e-6) / p.fps - 1 / p.fps)
  const times = [...new Set(Array.from({ length: count + 1 }, (_, i) => Math.round((start + (lastFrame - start) * i / count) * p.fps) / p.fps))]
  return { start, end, times }
}

function rgb(frame: Pixels, x: number, y: number, c: number) {
  const ix = clamp(Math.round(x), 0, frame.width - 1), iy = clamp(Math.round(y), 0, frame.height - 1)
  return frame.data[(iy * frame.width + ix) * 4 + c]
}
const GRID = 22
export function templatePixels(frame: Pixels, box: TrackingBox) {
  const data = new Float32Array(GRID * GRID * 3)
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) for (let c = 0; c < 3; c++) {
    // A narrow border gives even a plain, solid object a trackable edge.
    data[(y * GRID + x) * 3 + c] = rgb(frame, box.x + (x / (GRID - 1) - .5) * box.width * 1.25, box.y + (y / (GRID - 1) - .5) * box.height * 1.25, c)
  }
  return data
}
export function templateDetail(data: Float32Array) {
  let sum = 0
  for (let c = 0; c < 3; c++) {
    let mean = 0
    for (let i = c; i < data.length; i += 3) mean += data[i] / (data.length / 3)
    for (let i = c; i < data.length; i += 3) sum += (data[i] - mean) ** 2 / data.length
  }
  return Math.sqrt(sum)
}

export function matchTemplate(frame: Pixels, previous: TrackingBox, template: Float32Array, reference = template) {
  const radius = clamp(Math.max(previous.width, previous.height) * .4, 12, 36)
  let best = { ...previous }, error = Infinity, bestScore = Infinity
  function score(x: number, y: number, scale: number) {
    const box = { x, y, width: previous.width * scale, height: previous.height * scale }
    if (x < 0 || y < 0 || x >= frame.width || y >= frame.height || box.width < 4 || box.height < 4) return
    let sum = 0
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) for (let c = 0; c < 3; c++) {
      const k = (j * GRID + i) * 3 + c, v = rgb(frame, x + (i / (GRID - 1) - .5) * box.width * 1.25, y + (j / (GRID - 1) - .5) * box.height * 1.25, c)
      sum += .8 * Math.abs(v - template[k]) + .2 * Math.abs(v - reference[k])
    }
    const difference = sum / (template.length * 255)
    const ranked = difference + .001 * Math.abs(scale - 1) + .00004 * Math.hypot(x - previous.x, y - previous.y)
    if (ranked < bestScore) { bestScore = ranked; error = difference; best = box }
  }
  score(previous.x, previous.y, 1)
  for (const scale of [1, .94, 1.06]) for (let dy = -radius; dy <= radius; dy += 3) for (let dx = -radius; dx <= radius; dx += 3) score(previous.x + dx, previous.y + dy, scale)
  const coarse = { ...best }, ratio = coarse.width / previous.width
  for (const scale of [ratio, ratio * .98, ratio * 1.02]) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) score(coarse.x + dx, coarse.y + dy, scale)
  return { box: best, error, detail: templateDetail(templatePixels(frame, best)) }
}

// A cut changes most of the image. A moving foreground object alone should not trigger it.
export function isSceneCut(a: Pixels, b: Pixels) {
  let changed = 0, total = 0, difference = 0
  for (let y = 0; y < 18; y++) for (let x = 0; x < 24; x++) {
    let d = 0
    for (let c = 0; c < 3; c++) d += Math.abs(rgb(a, x / 23 * (a.width - 1), y / 17 * (a.height - 1), c) - rgb(b, x / 23 * (b.width - 1), y / 17 * (b.height - 1), c)) / 3
    difference += d; total++; if (d > 45) changed++
  }
  return changed / total > .7 && difference / total > 55
}

export function applyTracking(b: Blocker, result: TrackingResult, plan: TrackingPlan) {
  if (!result.keys.length || result.keys.length > 240 || result.end <= plan.start) throw new Error('The subject could not be tracked. Try a tighter selection.')
  // One completed result replaces a blocker in one undoable edit. No half-written tracks.
  const pose = result.keys[0]
  Object.assign(b, { x: pose.x, y: pose.y, width: pose.width, height: pose.height, rotation: pose.rotation, opacity: pose.opacity, start: plan.start, end: result.end, animation: result.keys })
  if (result.shape) b.shape = result.shape
  if (result.vertices) b.vertices = result.vertices
}

export function seedBox(b: Blocker, time: number): TrackingBox {
  const pose = blockerAt(b, time), angle = pose.rotation * Math.PI / 180
  return { x: pose.x, y: pose.y, width: Math.abs(Math.cos(angle)) * pose.width + Math.abs(Math.sin(angle)) * pose.height, height: Math.abs(Math.sin(angle)) * pose.width + Math.abs(Math.cos(angle)) * pose.height }
}
export function movedKey(b: Blocker, time: number, fps: number, initial: TrackingBox, current: TrackingBox): BlockerKey {
  const key = blockerKeyAt(b, time, fps), pose = blockerAt(b, 0), sx = current.width / initial.width, sy = current.height / initial.height
  return { ...key, x: current.x, y: current.y, width: pose.width * sx, height: pose.height * sy, rotation: pose.rotation, opacity: pose.opacity, vertices: pose.vertices?.map(v => ({ ...v })), easing: 'linear' }
}
