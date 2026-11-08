import { clamp, POSITION_LIMIT, id, zero, type Layer, type PathData, type Point, type Pose, type Project, type Sample, type Vec } from './types'
import { defaultCamera } from './camera'
import { modelAnimationEnd } from './model-animation'
import { glbFromDataUri } from './glb'
import { motionAt } from './motion'
import { parseBlockers } from './blockers'
import { parseCast,parseDirector } from './parse-director'
import { parseVideo } from './video'
export const mix = (a: number, b: number, t: number) => a + (b - a) * t
export const mixVec = (a: Vec, b: Vec, t: number): Vec => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), z: mix(a.z, b.z, t) })
const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const smooth = (t: number) => t * t * (3 - 2 * t)
export function makePoint(v: Vec, time = 0): Point { return { ...v, id: id(), incoming: zero(), outgoing: zero(), scale: 1, rx: 0, ry: 0, rz: 0, opacity: 1, speed: 1, time } }
export function autoHandles(points: Point[]): Point[] {
  return points.map((p, i) => {
    const before = points[Math.max(0, i - 1)], after = points[Math.min(points.length - 1, i + 1)]
    const tangent = { x: (after.x - before.x) / 6, y: (after.y - before.y) / 6, z: (after.z - before.z) / 6 }
    return { ...p, curve: 'bezier', handleMode: 'auto', incoming: { x: -tangent.x, y: -tangent.y, z: -tangent.z }, outgoing: tangent }
  })
}
export function cubic(a: Point, b: Point, t: number): Vec {
  if (a.curve === 'linear') return mixVec(a, b, t)
  const p1 = add(a, a.outgoing), p2 = add(b, b.incoming), u = 1 - t
  return { x: u ** 3 * a.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t ** 3 * b.x, y: u ** 3 * a.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t ** 3 * b.y, z: u ** 3 * a.z + 3 * u * u * t * p1.z + 3 * u * t * t * p2.z + t ** 3 * b.z }
}
const pathCache = new WeakMap<Layer, PathData>()
export function invalidatePath(layer: Layer) { pathCache.delete(layer) }
export function buildPath(layer: Layer): PathData {
  const cached = pathCache.get(layer); if (cached) return cached
  const samples: Sample[] = [], nodeTimes = [0], nodeDistances = [0]
  let length = 0, seconds = 0
  for (let segment = 0; segment < layer.points.length - 1; segment++) {
    const a = layer.points[segment], b = layer.points[segment + 1]
    for (let j = segment ? 1 : 0; j <= 100; j++) {
      const t = j / 100, pos = cubic(a, b, t), previous = samples.at(-1), dl = previous ? distance(previous, pos) : 0
      length += dl
      const speed = layer.baseSpeed * mix(a.speed, b.speed, smooth(Math.max(0, t - .005)))
      if (layer.timing === 'keyframes') seconds = mix(a.time, b.time, t)
      else seconds += dl / Math.max(1, speed)
      samples.push({ ...pos, segment, t, distance: length, seconds })
    }
    nodeTimes.push(seconds); nodeDistances.push(length)
  }
  if (!samples.length) samples.push({ ...layer.points[0], segment: 0, t: 0, distance: 0, seconds: 0 })
  if (layer.timing === 'fixed') {
    const ratio = layer.duration / Math.max(seconds, .00001)
    for (const p of samples) p.seconds *= ratio
    for (let i = 0; i < nodeTimes.length; i++) nodeTimes[i] *= ratio
    if (length < .001) { for (let i = 0; i < samples.length; i++) samples[i].seconds = i / Math.max(1, samples.length - 1) * layer.duration; for (let i = 0; i < nodeTimes.length; i++) nodeTimes[i] = i / (nodeTimes.length - 1) * layer.duration }
    samples.at(-1)!.seconds = layer.duration; nodeTimes[nodeTimes.length - 1] = layer.duration
  }
  const result = { samples, nodeTimes, nodeDistances, length, duration: Math.max(.05, samples.at(-1)!.seconds) }
  pathCache.set(layer, result); return result
}
export function pathPoseAt(layer: Layer, globalTime: number): Pose {
  const data = buildPath(layer), seconds = clamp(globalTime - layer.delay, 0, data.duration), samples = data.samples
  let lo = 0, hi = samples.length - 1
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (samples[mid].seconds > seconds) hi = mid; else lo = mid }
  const a = samples[lo], b = samples[hi], f = b.seconds > a.seconds ? clamp((seconds - a.seconds) / (b.seconds - a.seconds), 0, 1) : 0
  let segment = b.segment, t = a.segment === b.segment ? mix(a.t, b.t, f) : b.t * f
  if (seconds >= data.duration - .000001) { segment = layer.points.length - 2; t = 1 }
  if (seconds <= 0) { segment = 0; t = 0 }
  const p = layer.points[segment], q = layer.points[segment + 1] || p, e = smooth(t), pos = cubic(p, q, t)
  const rz = layer.orient ? Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI + mix(p.rz, q.rz, e) : mix(p.rz, q.rz, e)
  return { ...pos, scale: mix(p.scale, q.scale, e), rx: mix(p.rx, q.rx, e), ry: mix(p.ry, q.ry, e), rz, opacity: mix(p.opacity, q.opacity, e), segment, t, progress: data.length ? mix(a.distance, b.distance, f) / data.length : seconds / data.duration }
}
export function poseAt(layer: Layer, globalTime: number): Pose {
  const path = pathPoseAt(layer, globalTime), motion = motionAt(layer, globalTime)
  return { ...path, x: path.x + motion.x, y: path.y + motion.y, z: path.z + motion.z, scale: path.scale * motion.scale, rx: path.rx + motion.rx, ry: path.ry + motion.ry, rz: path.rz + motion.rz, opacity: path.opacity * motion.opacity }
}
export function insertPoint(layer: Layer, globalTime: number, tolerance = .03): number {
  const pose = pathPoseAt(layer, globalTime), data = buildPath(layer), local = clamp(globalTime - layer.delay, 0, data.duration)
  const existing = data.nodeTimes.findIndex(time => Math.abs(time - local) < tolerance)
  if (existing >= 0) return existing
  const i = pose.segment, a = layer.points[i], b = layer.points[i + 1], t = pose.t
  const p0: Vec = a, p1 = a.curve === 'linear' ? mixVec(a, b, 1 / 3) : add(a, a.outgoing), p2 = a.curve === 'linear' ? mixVec(a, b, 2 / 3) : add(b, b.incoming), p3: Vec = b
  const p01 = mixVec(p0, p1, t), p12 = mixVec(p1, p2, t), p23 = mixVec(p2, p3, t), p012 = mixVec(p01, p12, t), p123 = mixVec(p12, p23, t)
  const p: Point = { ...makePoint(pose, local), curve: a.curve ?? 'bezier', handleMode: 'aligned', scale: pose.scale, rx: pose.rx, ry: pose.ry, rz: pose.rz, opacity: pose.opacity, speed: mix(a.speed, b.speed, t), incoming: sub(p012, pose), outgoing: sub(p123, pose) }
  if (a.handleMode === 'auto') a.handleMode = 'aligned'; if (b.handleMode === 'auto') b.handleMode = 'aligned'
  a.outgoing = sub(p01, p0); b.incoming = sub(p23, p3); layer.points.splice(i + 1, 0, p); invalidatePath(layer)
  return i + 1
}
export function durationOf(project: Project) { return project.director?.enabled ? project.director.duration : project.video ? project.video.duration : project.layers.length ? Math.max(1 / project.fps, ...project.layers.map(l => l.delay + Math.max(buildPath(l).duration, l.motion?.at(-1)?.time ?? 0, modelAnimationEnd(l)))) : 6 }
export function defaultLayer(width: number, height: number, kind: Layer['kind'] = 'image'): Layer {
  const positions = [[.12, .69], [.31, .25], [.51, .59], [.75, .24], [.89, .64]]
  return { id: id(), name: kind === 'image' ? 'Little star' : kind === 'text' ? 'Your words' : kind === 'cube' ? 'Cube' : 'Shape', kind, src: kind === 'image' ? '/sample-mark.svg' : undefined, text: 'Make a move.', shape: 'rectangle', color: '#ee4623', width: kind === 'text' ? 440 : 172, height: kind === 'text' ? 100 : 172, visible: true, locked: false, points: autoHandles(positions.map(([x, y], i) => ({ ...makePoint({ x: x * width, y: y * height, z: 0 }, i * 1.5), scale: [ .65, 1, 1.2, .85, .7 ][i], rz: [ -12, 20, -15, 15, 0 ][i] }))), delay: 0, duration: 6, timing: 'fixed', baseSpeed: 200, orient: false }
}
export function defaultProject(): Project { return { version: 1, name: 'My first motion', mode: '2d', width: 1280, height: 720, fps: 30, background: 'transparent', backgroundColor: '#0f0f0f', camera: defaultCamera(), layers: [defaultLayer(1280, 720)] } }
export function parseProject(value: unknown): Project {
  if (!value || typeof value !== 'object') throw new Error('This is not a Trace project.')
  const p = value as Project
  if (p.version !== 1 || !Array.isArray(p.layers) || p.layers.length > 60 || ![p.width, p.height, p.fps].every(Number.isFinite)) throw new Error('Invalid project settings.')
  const result = structuredClone(p), defaults = defaultProject()
  result.name = typeof p.name === 'string' ? p.name.slice(0, 100) : 'Untitled motion'; result.mode = p.mode === '3d' ? '3d' : '2d'
  result.width = Math.round(clamp(p.width, 128, 4096) / 2) * 2; result.height = Math.round(clamp(p.height, 128, 4096) / 2) * 2; result.fps = clamp(Math.round(p.fps), 12, 60)
  result.background = p.background === 'color' ? 'color' : 'transparent'; result.backgroundColor = /^#[0-9a-f]{6}$/i.test(p.backgroundColor) ? p.backgroundColor : '#17191b'
  result.camera = { ...defaults.camera, ...p.camera }; for (const key of ['distance', 'zoom', 'focus', 'blur'] as const) if (!Number.isFinite(result.camera[key])) result.camera[key] = defaults.camera[key]
  result.camera.distance = clamp(result.camera.distance, 50, POSITION_LIMIT); result.camera.zoom = clamp(result.camera.zoom, .2, 4); result.camera.blur = clamp(result.camera.blur, 0, 30); result.camera.focus = clamp(result.camera.focus, 1, POSITION_LIMIT*4)
  result.measurement = { unit: p.measurement?.unit === 'cm' ? 'cm' : 'px', ppi: Number.isFinite(p.measurement?.ppi) ? clamp(p.measurement!.ppi, 1, 2400) : 96 }
  if (p.layout && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(p.layout![k as keyof typeof p.layout])) && p.layout.width > 0 && p.layout.height > 0) result.layout = { x: clamp(p.layout.x, -100000, 100000), y: clamp(p.layout.y, -100000, 100000), width: clamp(p.layout.width, 1, 100000), height: clamp(p.layout.height, 1, 100000) }; else delete result.layout
  result.camera.focalLength = typeof result.camera.focalLength === 'number' && Number.isFinite(result.camera.focalLength) ? clamp(result.camera.focalLength, 8, 300) : null
  for (const key of ['positionX', 'positionY', 'targetX', 'targetY', 'targetZ'] as const) result.camera[key] = Number.isFinite(result.camera[key]) ? clamp(result.camera[key], -POSITION_LIMIT, POSITION_LIMIT) : 0
  result.camera.roll = Number.isFinite(result.camera.roll) ? clamp(result.camera.roll, -180, 180) : 0
  const layerIds=new Set<string>()
  result.layers = p.layers.map((layer) => {
    if (!Array.isArray(layer.points) || layer.points.length < 2 || layer.points.length > 60) throw new Error('Every path needs 2–60 points.')
    const l = { ...defaultLayer(result.width, result.height, layer.kind), ...layer, id: typeof layer.id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(layer.id)&&!layerIds.has(layer.id)?layer.id:id() };layerIds.add(l.id)
    if (!['image', 'shape', 'text', 'cube', 'model'].includes(l.kind)) throw new Error('Unknown element type.')
    l.name = String(l.name).slice(0, 100); l.text = String(l.text).slice(0, 1000); l.width = clamp(Number(l.width) || 172, 1, 4096); l.height = clamp(Number(l.height) || 172, 1, 4096)
    l.delay = clamp(Number(l.delay) || 0, 0, 600); l.duration = clamp(Number(l.duration) || 6, .05, 600); l.baseSpeed = clamp(Number(l.baseSpeed) || 200, 1, 5000)
    l.timing = ['fixed', 'auto', 'keyframes'].includes(l.timing) ? l.timing : 'fixed'
    if (l.kind === 'image' && !(l.src?.startsWith('data:image/') || l.src === '/sample-mark.svg')) throw new Error('Images must be embedded in the project.')
    if (l.kind === 'model') {
      if (result.mode !== '3d') throw new Error('GLB objects require a 3D scene.')
      if (!l.src) throw new Error('The GLB model is missing.')
      glbFromDataUri(l.src)
      const m = l.model
      if (!m || !Array.isArray(m.clips) || m.clips.length > 100 || m.clips.some(c => !c || typeof c.name !== 'string' || !Number.isFinite(c.duration) || c.duration < 0 || c.duration > 3600)) throw new Error('Invalid model animation clips.')
      if (m.clip !== null && (!Number.isInteger(m.clip) || m.clip < 0 || m.clip >= m.clips.length)) throw new Error('Invalid model animation selection.')
      if (![m.speed, m.start, m.offset].every(Number.isFinite)) throw new Error('Invalid model animation timing.')
      l.model = { fileName: String(m.fileName ?? 'Model.glb').slice(0, 150), clips: m.clips.map(c => ({ name: c.name.slice(0, 100), duration: c.duration })), clip: m.clip, speed: clamp(m.speed, .1, 4), start: clamp(m.start, 0, 600), offset: clamp(m.offset, 0, m.clip === null ? 3600 : m.clips[m.clip].duration), loop: m.loop !== false }
      l.height = l.width
    } else delete l.model
    l.points = layer.points.map((point, i) => { const base = makePoint(zero(), i * l.duration / (layer.points.length - 1)), n = { ...base, ...point, id: id() }; for (const k of ['x', 'y', 'z', 'scale', 'rx', 'ry', 'rz', 'opacity', 'speed', 'time'] as const) if (!Number.isFinite(n[k])) throw new Error('A keyframe has an invalid value.'); for (const k of ['incoming', 'outgoing'] as const) if (!n[k] || !Object.values(n[k]).every(Number.isFinite)) throw new Error('Invalid Bézier handle.'); for (const axis of ['x', 'y', 'z'] as const) n[axis] = clamp(n[axis], -POSITION_LIMIT, POSITION_LIMIT); n.curve = point.curve === 'linear' ? 'linear' : 'bezier'; n.handleMode = ['auto', 'aligned', 'free'].includes(point.handleMode ?? '') ? point.handleMode : 'aligned'; n.scale = clamp(n.scale, .01, 20); n.opacity = clamp(n.opacity, 0, 1); n.speed = clamp(n.speed, .1, 4); n.time = clamp(n.time, 0, 600); return n })
    if (l.timing === 'keyframes' && l.points.some((n, i) => i > 0 && n.time <= l.points[i - 1].time)) throw new Error('Keyframe times must increase.')
    if (layer.motion !== undefined) {
      if (!Array.isArray(layer.motion) || layer.motion.length > 120) throw new Error('An asset motion track supports up to 120 keys.')
      l.motion = layer.motion.map(key => { if (!key || !['time', 'x', 'y', 'z', 'scale', 'rx', 'ry', 'rz', 'opacity'].every(k => Number.isFinite(key[k as keyof typeof key]))) throw new Error('Invalid asset motion keyframe.'); return { ...key, x: clamp(key.x, -POSITION_LIMIT, POSITION_LIMIT), y: clamp(key.y, -POSITION_LIMIT, POSITION_LIMIT), z: clamp(key.z, -POSITION_LIMIT, POSITION_LIMIT), id: id(), time: clamp(key.time, 0, 600), scale: clamp(key.scale, .01, 20), opacity: clamp(key.opacity, 0, 1), easing: ['smooth', 'linear', 'hold'].includes(key.easing) ? key.easing : 'smooth' } })
      if (l.motion.some((key, i, keys) => i > 0 && key.time <= keys[i - 1].time)) throw new Error('Asset motion keyframe times must increase.')
    }
    if(layer.direction)l.direction=parseCast(layer.direction);else delete l.direction
    return l
  }); if (p.blockers !== undefined) result.blockers = parseBlockers(p.blockers); if (p.video !== undefined) result.video = parseVideo(p.video); if(p.director!==undefined)result.director=parseDirector(p.director,result.camera,layerIds); return result
}
