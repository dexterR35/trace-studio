import { framePoint } from './director'
import { buildPath } from './animation'
import { cameraDepth, projectScenePoint } from './camera'
import { clamp, type Layer, type Project, type Vec } from './types'

export const sceneFormats = [
  { group: 'Movies & video', name: 'HD · landscape', width: 1280, height: 720 },
  { group: 'Movies & video', name: 'Full HD · landscape', width: 1920, height: 1080 },
  { group: 'Movies & video', name: '4K · landscape', width: 3840, height: 2160 },
  { group: 'Social & reels', name: 'Reels / Stories · 9:16', width: 1080, height: 1920 },
  { group: 'Social & reels', name: 'Square · 1:1', width: 1080, height: 1080 },
  { group: 'Social & reels', name: 'Portrait feed · 4:5', width: 1080, height: 1350 },
  { group: 'Desktop & devices', name: 'Desktop · 16:10', width: 1920, height: 1200 },
  { group: 'Desktop & devices', name: 'Laptop · 16:10', width: 1440, height: 900 },
  { group: 'Desktop & devices', name: 'Phone · portrait', width: 390, height: 844 },
  { group: 'Desktop & devices', name: 'Tall phone · portrait', width: 1080, height: 2340 },
  { group: 'Desktop & devices', name: 'Small video · 16:9', width: 640, height: 360 },
]

export function resizeScene(p: Project, width: number, height: number, fitContent = false) {
  const w = Math.round(clamp(width, 128, 4096) / 2) * 2, h = Math.round(clamp(height, 128, 4096) / 2) * 2
  if (fitContent) {
    // Retain the fitted layout bounds so portrait/landscape round trips do not compound letterboxing.
    const from = p.layout ?? { x: 0, y: 0, width: p.width, height: p.height }, scale = Math.min(w / from.width, h / from.height), x = (w - from.width * scale) / 2, y = (h - from.height * scale) / 2, dx = x - from.x * scale, dy = y - from.y * scale
    p.layers.forEach(l => {
      l.width *= scale; l.height *= scale; l.baseSpeed *= scale
      l.points.forEach(n => { n.x = n.x * scale + dx; n.y = n.y * scale + dy; n.z *= scale; for (const handle of [n.incoming, n.outgoing]) { handle.x *= scale; handle.y *= scale; handle.z *= scale } })
      l.motion?.forEach(k => { k.x *= scale; k.y *= scale; k.z *= scale })
    })
    p.blockers?.forEach(b => { b.x = b.x * scale + dx; b.y = b.y * scale + dy; b.width *= scale; b.height *= scale; b.animation?.forEach(k => { k.x = k.x * scale + dx; k.y = k.y * scale + dy; k.width *= scale; k.height *= scale }) })
    for (const key of ['distance', 'focus', 'positionX', 'positionY', 'targetX', 'targetY', 'targetZ'] as const) p.camera[key] *= scale
    p.director?.shots.forEach(shot=>{for(const cam of [shot.cameraStart,shot.cameraEnd])for(const key of ['distance','focus','positionX','positionY','targetX','targetY','targetZ'] as const)cam[key]*=scale})
    p.layout = { x, y, width: from.width * scale, height: from.height * scale }
  } else delete p.layout
  p.width = w; p.height = h
}

export function measurement(p: Project) { return p.measurement ?? { unit: 'px' as const, ppi: 96 } }
export function inDisplayUnits(px: number, p: Project) { const m = measurement(p); return m.unit === 'cm' ? px * 2.54 / m.ppi : px }
export function formatDistance(px: number, p: Project, signed = false) { const value = inDisplayUnits(px, p), precision = measurement(p).unit === 'cm' ? 2 : 1, text = new Intl.NumberFormat('en', { maximumFractionDigits: precision }).format(Math.abs(value) < .00001 ? 0 : value); return `${signed && value > .00001 ? '+' : ''}${text}` }
const difference = (a: Vec, b: Vec): Vec => ({ x: b.x - a.x, y: b.y - a.y, z: b.z - a.z })
const length = (v: Vec) => Math.hypot(v.x, v.y, v.z)

export function pointReference(layer: Layer, index: number) {
  const point = layer.points[index]; if (!point) return null
  const path = buildPath(layer), next = layer.points[index + 1], previous = layer.points[index - 1]
  return { point, time: layer.delay + path.nodeTimes[index], start: index === 0, end: index === layer.points.length - 1,
    next: next ? { index: index + 1, delta: difference(point, next), distance: length(difference(point, next)), alongPath: path.nodeDistances[index + 1] - path.nodeDistances[index] } : null,
    previous: previous ? { index: index - 1, delta: difference(previous, point), distance: length(difference(previous, point)), alongPath: path.nodeDistances[index] - path.nodeDistances[index - 1] } : null }
}

// Find the closest projected segment instead of snapping to a sampled vertex.
export function nearestPathTime(layer: Layer, p: Project, x: number, y: number, currentTime=0) {
  const samples = buildPath(layer).samples; let best = Infinity, time = 0
  for (let i = 1; i < samples.length; i++) {
    if (p.mode === '3d' && (cameraDepth(p, samples[i - 1],currentTime) <= 1 || cameraDepth(p, samples[i],currentTime) <= 1)) continue
    const a = p.mode === '3d' ? projectScenePoint(p, samples[i - 1],currentTime) : framePoint(p,samples[i - 1],currentTime), b = p.mode === '3d' ? projectScenePoint(p, samples[i],currentTime) : framePoint(p,samples[i],currentTime)
    const dx = b.x - a.x, dy = b.y - a.y, t = clamp(((x - a.x) * dx + (y - a.y) * dy) / Math.max(.00001, dx * dx + dy * dy), 0, 1), distance = (x - a.x - t * dx) ** 2 + (y - a.y - t * dy) ** 2
    if (distance < best) { best = distance; time = samples[i - 1].seconds + (samples[i].seconds - samples[i - 1].seconds) * t }
  }
  return layer.delay + time
}
