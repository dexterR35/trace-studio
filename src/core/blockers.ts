import { clamp, id, POSITION_LIMIT, type Blocker, type BlockerKey, type CanvasPoint, type Project } from './types'

export const MAX_BLOCKERS = 30
export const MAX_BLOCKER_VERTICES = 128
export const blockerTransformKeys = ['x', 'y', 'width', 'height', 'rotation', 'opacity'] as const

export function blockerAt(b: Blocker, time: number): Blocker {
  const keys = b.animation
  let result = b
  if (keys?.length) {
    const right = keys.findIndex(k => k.time > time), a = keys[right < 0 ? keys.length - 1 : Math.max(0, right - 1)], next = keys[right < 0 ? keys.length - 1 : right]
    const t = a.easing === 'hold' || next.time <= a.time ? 0 : clamp((time - a.time) / (next.time - a.time), 0, 1)
    result = { ...b }
    for (const key of blockerTransformKeys) result[key] = a[key] + (next[key] - a[key]) * t
    if (a.vertices) result.vertices = a.vertices.map((v, i) => { const q = next.vertices?.length === a.vertices!.length ? next.vertices[i] : v; return { x: v.x + (q.x - v.x) * t, y: v.y + (q.y - v.y) * t } })
  }
  return { ...result, visible: b.visible && time >= (b.start ?? 0) && time < (b.end ?? Infinity) }
}

export function blockerKeyAt(b: Blocker, time: number, fps: number): BlockerKey {
  const pose = blockerAt(b, time)
  return { time: Math.round(Math.max(0, time) * fps) / fps, x: pose.x, y: pose.y, width: pose.width, height: pose.height, rotation: pose.rotation, opacity: pose.opacity, ...(pose.vertices ? { vertices: pose.vertices.map(v => ({ ...v })) } : {}), easing: 'linear' }
}

export function insertBlockerKey(b: Blocker, time: number, fps: number): BlockerKey {
  const key = blockerKeyAt(b, time, fps)
  if (!b.animation?.length) b.animation = [blockerKeyAt(b, 0, fps)]
  const existing = b.animation.find(k => Math.abs(k.time - key.time) < .5 / fps)
  if (existing) return existing
  if (b.animation.length >= 240) throw new Error('A blocker supports up to 240 keyframes.')
  b.animation.push(key); b.animation.sort((a, b) => a.time - b.time); return key
}

export function changeBlockerAt(b: Blocker, change: Partial<Blocker>, time: number, fps: number) {
  const animated = b.animation?.length && (blockerTransformKeys.some(k => k in change) || 'vertices' in change)
  if (!animated) { Object.assign(b, change); return }
  const key = insertBlockerKey(b, time, fps), global = { ...change }
  for (const property of blockerTransformKeys) if (change[property] !== undefined) { key[property] = change[property]!; delete global[property] }
  if (change.vertices) { key.vertices = change.vertices.map(v => ({ ...v })); delete global.vertices }
  Object.assign(b, global)
}

export function makeBlocker(shape: Blocker['shape'], p: Project): Blocker {
  return { id: id(), name: shape === 'ellipse' ? 'Circle blocker' : shape === 'polygon' ? 'Drawn blocker' : 'Rectangle blocker', shape, mode: p.video ? 'cutout' : 'solid', x: p.width / 2, y: p.height / 2, width: Math.min(320, p.width / 3), height: Math.min(240, p.height / 3), rotation: 0, opacity: 1, color: '#252525', visible: true, locked: false }
}

export function blockerFromDrawing(shape: Blocker['shape'], points: CanvasPoint[], p: Project): Blocker | null {
  if (points.length < 2 || points.some(v => !Number.isFinite(v.x) || !Number.isFinite(v.y))) return null
  const xs = points.map(v => v.x), ys = points.map(v => v.y), left = Math.min(...xs), top = Math.min(...ys), width = Math.max(...xs) - left, height = Math.max(...ys) - top
  if (width < 4 || height < 4 || (shape === 'polygon' && points.length < 3)) return null
  if (shape === 'polygon' && Math.abs(points.reduce((area, v, i) => { const next = points[(i + 1) % points.length]; return area + v.x * next.y - next.x * v.y }, 0)) < 16) return null
  const blocker = { ...makeBlocker(shape, p), x: left + width / 2, y: top + height / 2, width, height }
  if (shape === 'polygon') {
    const count = Math.min(points.length, MAX_BLOCKER_VERTICES)
    blocker.vertices = Array.from({ length: count }, (_, i) => { const v = points[Math.round(i / (count - 1) * (points.length - 1))]; return { x: (v.x - left) / width, y: (v.y - top) / height } })
  }
  return blocker
}

export function blockerPath(b: Blocker): string {
  const w = b.width, h = b.height
  if (b.shape === 'ellipse') return `M${-w / 2},0A${w / 2},${h / 2} 0 1 0 ${w / 2},0A${w / 2},${h / 2} 0 1 0 ${-w / 2},0Z`
  if (b.shape === 'polygon') return (b.vertices ?? []).map((v, i) => `${i ? 'L' : 'M'}${(v.x - .5) * w},${(v.y - .5) * h}`).join(' ') + 'Z'
  return `M${-w / 2},${-h / 2}h${w}v${h}h${-w}Z`
}

export function drawBlockers(ctx: CanvasRenderingContext2D, p: Project, time = 0) {
  for (const original of p.blockers ?? []) {
    const b = blockerAt(original, time)
    if (!b.visible || b.opacity <= 0) continue
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rotation * Math.PI / 180); ctx.globalAlpha = b.opacity
    ctx.globalCompositeOperation = b.mode === 'cutout' && p.background === 'transparent' ? 'destination-out' : 'source-over'
    ctx.fillStyle = b.mode === 'cutout' ? p.backgroundColor : b.color
    ctx.fill(new Path2D(blockerPath(b))); ctx.restore()
  }
}

export function parseBlockers(value: unknown): Blocker[] {
  if (!Array.isArray(value) || value.length > MAX_BLOCKERS) throw new Error(`A scene supports up to ${MAX_BLOCKERS} blockers.`)
  return value.map((b: Blocker) => {
    if (!b || !['rectangle', 'ellipse', 'polygon'].includes(b.shape) || !['solid', 'cutout'].includes(b.mode) || ![b.x, b.y, b.width, b.height, b.rotation, b.opacity].every(Number.isFinite) || b.width <= 0 || b.height <= 0) throw new Error('Invalid blocker shape or position.')
    let vertices: CanvasPoint[] | undefined
    if (b.shape === 'polygon') {
      if (!Array.isArray(b.vertices) || b.vertices.length < 3 || b.vertices.length > MAX_BLOCKER_VERTICES || b.vertices.some(v => !v || !Number.isFinite(v.x) || !Number.isFinite(v.y))) throw new Error('A drawn blocker needs 3–128 valid points.')
      vertices = b.vertices.map(v => ({ x: clamp(v.x, 0, 1), y: clamp(v.y, 0, 1) }))
    }
    if (b.animation !== undefined && (!Array.isArray(b.animation) || b.animation.length > 240 || b.animation.some((k, i, list) => !k || ![k.time, ...blockerTransformKeys.map(p => k[p])].every(Number.isFinite) || k.time < 0 || k.time > 600 || k.width <= 0 || k.height <= 0 || (i > 0 && k.time <= list[i - 1].time)))) throw new Error('Invalid blocker animation keyframes.')
    const animation = b.animation?.map(k => { if (k.vertices && (b.shape !== 'polygon' || k.vertices.length !== vertices?.length || k.vertices.some(v => !Number.isFinite(v.x) || !Number.isFinite(v.y)))) throw new Error('Invalid animated blocker outline.'); return { ...k, x: clamp(k.x, -POSITION_LIMIT, POSITION_LIMIT), y: clamp(k.y, -POSITION_LIMIT, POSITION_LIMIT), width: clamp(k.width, 1, 16384), height: clamp(k.height, 1, 16384), opacity: clamp(k.opacity, 0, 1), easing: k.easing === 'hold' ? 'hold' as const : 'linear' as const, ...(k.vertices ? { vertices: k.vertices.map(v => ({ x: clamp(v.x, 0, 1), y: clamp(v.y, 0, 1) })) } : {}) } })
    if ((b.start !== undefined && (!Number.isFinite(b.start) || b.start < 0)) || (b.end !== undefined && (!Number.isFinite(b.end) || b.end < (b.start ?? 0)))) throw new Error('Invalid blocker visibility range.')
    return { id: id(), name: String(b.name ?? 'Blocker').slice(0, 100), shape: b.shape, mode: b.mode, x: clamp(b.x, -POSITION_LIMIT, POSITION_LIMIT), y: clamp(b.y, -POSITION_LIMIT, POSITION_LIMIT), width: clamp(b.width, 1, 16384), height: clamp(b.height, 1, 16384), rotation: clamp(b.rotation, -3600, 3600), opacity: clamp(b.opacity, 0, 1), color: /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '#252525', visible: b.visible !== false, locked: b.locked === true, ...(vertices ? { vertices } : {}), ...(b.start !== undefined ? { start: clamp(b.start, 0, 600) } : {}), ...(b.end !== undefined ? { end: clamp(b.end, 0, 600) } : {}), ...(animation ? { animation } : {}) }
  })
}
