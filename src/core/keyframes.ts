import { buildPath, durationOf, insertPoint, invalidatePath } from './animation'
import { blockerKeyAt } from './blockers'
import { cloneLayer } from './project'
import { clamp, type Project } from './types'

export type KeyTarget = { kind: 'path' | 'blocker'; id: string }
export function intervalFrames(start: number, end: number, every: number, fps: number, maximum: number) {
  if (![start, end, every, fps].every(Number.isFinite) || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || every <= 0 || fps <= 0) throw new Error('Choose valid start/end frames and a positive interval.')
  const step = Math.max(1, Math.round(every * fps)), count = Math.ceil((end - start) / step) + 1
  if (count > maximum) throw new Error(`This track supports up to ${maximum} keys. Increase the interval.`)
  const frames = Array.from({ length: count - 1 }, (_, i) => start + i * step)
  frames.push(end)
  return frames
}

export function generateIntervalKeys(p: Project, target: KeyTarget, start: number, end: number, every: number) {
  if (end > Math.round(durationOf(p) * p.fps)) throw new Error('The end frame must be inside the clip or at its end boundary.')
  const frames = intervalFrames(start, end, every, p.fps, target.kind === 'path' ? 60 : 240)
  if (target.kind === 'blocker') {
    const b = p.blockers?.find(b => b.id === target.id)
    if (!b || b.locked) throw new Error('Select an unlocked blocker.')
    const sampled = frames.map(frame => { const key = blockerKeyAt(b, frame / p.fps, p.fps); key.easing = b.animation?.filter(k => k.time <= key.time).at(-1)?.easing ?? 'linear'; return key })
    const animation = [...(b.animation ?? []).filter(k => !sampled.some(s => Math.abs(s.time - k.time) < .5 / p.fps)), ...sampled].sort((a, b) => a.time - b.time)
    if (animation.length > 240) throw new Error('This blocker already has too many keys. Increase the interval or use a new blocker.')
    b.animation = animation; b.start = start / p.fps; b.end = end / p.fps
    return frames.length
  }
  const original = p.layers.find(l => l.id === target.id)
  if (!original || original.locked) throw new Error('Select an unlocked element.')
  if (end - start < original.points.length - 1) throw new Error('This range needs at least one frame between existing path points.')
  const layer = cloneLayer(original), path = buildPath(original), span = (end - start) / p.fps
  layer.delay = start / p.fps; layer.duration = span; layer.timing = 'keyframes'
  layer.points.forEach((point, i) => {
    const frame = i === 0 ? 0 : i === layer.points.length - 1 ? end - start : clamp(Math.round(path.nodeTimes[i] / path.duration * (end - start)), Math.round(layer.points[i - 1].time * p.fps) + 1, end - start - (layer.points.length - 1 - i))
    point.time = frame / p.fps
  })
  invalidatePath(layer)
  for (const frame of frames) {
    const time = (frame - start) / p.fps
    if (buildPath(layer).nodeTimes.some(t => Math.abs(t - time) < .5 / p.fps)) continue
    if (layer.points.length >= 60) throw new Error('Existing path points plus generated keys exceed 60. Increase the interval.')
    const index = insertPoint(layer, frame / p.fps, .5 / p.fps)
    layer.points[index].time = time
    invalidatePath(layer)
  }
  Object.assign(original, layer)
  invalidatePath(original)
  return frames.length
}
