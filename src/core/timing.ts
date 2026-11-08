import { buildPath } from './animation'
import { clamp, type Layer } from './types'

export function segmentSpeeds(layer: Layer): number[] {
  const path = buildPath(layer)
  return path.nodeTimes.slice(1).map((time, i) => (path.nodeDistances[i + 1] - path.nodeDistances[i]) / Math.max(.00001, time - path.nodeTimes[i]) / layer.baseSpeed)
}

export function retimeSegment(layer: Layer, index: number, speed: number, fps: number) {
  const data = buildPath(layer), length = data.nodeDistances[index + 1] - data.nodeDistances[index]
  if (length < .001) return
  const before = layer.points[index].time, oldDuration = layer.points[index + 1].time - before
  const duration = clamp(Math.round(length / (layer.baseSpeed * Math.max(.01, speed)) * fps) / fps, 1 / fps, 600 - layer.points.at(-1)!.time + oldDuration)
  const shift = duration - oldDuration
  layer.points.forEach((p, i) => { if (i > index) p.time += shift })
  layer.duration = layer.points.at(-1)!.time
}

export function changeTiming(layer: Layer, timing: Layer['timing']) {
  const data = buildPath(layer)
  if (timing === 'keyframes') layer.points.forEach((p, i) => { p.time = data.nodeTimes[i] })
  if (timing === 'fixed') layer.duration = data.duration
  layer.timing = timing
}
