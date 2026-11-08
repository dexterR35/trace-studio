import { clamp, id, type AssetTransform, type Layer, type MotionKey } from './types'

export function identityTransform(): AssetTransform { return { x: 0, y: 0, z: 0, scale: 1, rx: 0, ry: 0, rz: 0, opacity: 1 } }
export function motionAt(layer: Layer, globalTime: number): AssetTransform {
  const keys = layer.motion; if (!keys?.length) return identityTransform()
  const time = Math.max(0, globalTime - layer.delay)
  if (time <= keys[0].time) return keys[0]
  const next = keys.findIndex(k => k.time > time)
  if (next < 0) return keys.at(-1)!
  const a = keys[next - 1], b = keys[next], t = clamp((time - a.time) / Math.max(.00001, b.time - a.time), 0, 1), f = a.easing === 'hold' ? 0 : a.easing === 'linear' ? t : t * t * (3 - 2 * t)
  const result = identityTransform()
  for (const key of ['x', 'y', 'z', 'scale', 'rx', 'ry', 'rz', 'opacity'] as const) result[key] = a[key] + (b[key] - a[key]) * f
  return result
}

export function insertMotionKey(layer: Layer, time: number, fps: number): number {
  const local = Math.max(0, Math.round((time - layer.delay) * fps) / fps)
  const pose = motionAt(layer, local + layer.delay)
  const keys = layer.motion ??= []
  const existing = keys.findIndex(k => Math.abs(k.time - local) < .5 / fps)
  if (existing >= 0) return existing
  if (keys.length >= 120) return keys.length - 1
  if (!keys.length && local > 0) keys.push({ ...identityTransform(), id: id(), time: 0, easing: 'smooth' })
  const key: MotionKey = { ...pose, id: id(), time: local, easing: 'smooth' }
  keys.push(key); keys.sort((a, b) => a.time - b.time)
  return keys.findIndex(k => k.id === key.id)
}
