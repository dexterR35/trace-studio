import type { Layer, Point, Vec } from './types'
import { invalidatePath } from './animation'

export type CurvePreset = 'smooth' | 'bezier' | 'corner' | 'linear'
export function curvePreset(point: Point): CurvePreset {
  return point.curve === 'linear' ? 'linear' : point.handleMode === 'auto' ? 'smooth' : point.handleMode === 'free' ? 'corner' : 'bezier'
}
function tangent(points: Point[], index: number): Vec {
  const a = points[Math.max(0, index - 1)], b = points[Math.min(points.length - 1, index + 1)]
  return { x: (b.x - a.x) / 6, y: (b.y - a.y) / 6, z: (b.z - a.z) / 6 }
}
export function updateAutoHandles(layer: Layer) {
  layer.points.forEach((point, i) => { if (point.handleMode !== 'auto') return; const v = tangent(layer.points, i); point.outgoing = v; point.incoming = { x: -v.x, y: -v.y, z: -v.z } })
  invalidatePath(layer)
}
export function setCurvePreset(layer: Layer, index: number, preset: CurvePreset) {
  const point = layer.points[index]; if (!point) return
  point.curve = preset === 'linear' ? 'linear' : 'bezier'
  point.handleMode = preset === 'smooth' ? 'auto' : preset === 'bezier' ? 'aligned' : 'free'
  if (preset === 'smooth') updateAutoHandles(layer)
  if (preset === 'bezier') {
    const v = Math.hypot(point.outgoing.x, point.outgoing.y, point.outgoing.z) > .001 ? point.outgoing : tangent(layer.points, index)
    point.outgoing = { ...v }; point.incoming = { x: -v.x, y: -v.y, z: -v.z }
  }
  invalidatePath(layer)
}
