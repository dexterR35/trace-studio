import type { Layer, Project } from './types'

export function cloneLayer(layer: Layer): Layer {
  return { ...layer, ...(layer.direction?{direction:{...layer.direction,...(layer.direction.reference?{reference:{...layer.direction.reference}}:{})}}:{}), points: layer.points.map(point => ({ ...point, incoming: { ...point.incoming }, outgoing: { ...point.outgoing } })), ...(layer.motion ? { motion: layer.motion.map(key => ({ ...key })) } : {}), ...(layer.model ? { model: { ...layer.model, clips: layer.model.clips.map(clip => ({ ...clip })) } } : {}) }
}

// Asset URLs are immutable strings. Copy editable data without re-cloning large image payloads on every drag.
export function cloneProject(project: Project): Project {
  return { ...project, ...(project.director?{director:{...project.director,shots:project.director.shots.map(s=>({...s,...(s.easingRange?{easingRange:{...s.easingRange}}:{}),region:{...s.region},frameStart:{...s.frameStart},frameEnd:{...s.frameEnd},cameraStart:{...s.cameraStart},cameraEnd:{...s.cameraEnd}}))}}:{}), camera: { ...project.camera }, layers: project.layers.map(cloneLayer), ...(project.video ? { video: { ...project.video, sections: [...project.video.sections] } } : {}), ...(project.blockers ? { blockers: project.blockers.map(b => ({ ...b, ...(b.animation ? { animation: b.animation.map(k => ({ ...k, ...(k.vertices ? { vertices: k.vertices.map(v => ({ ...v })) } : {}) })) } : {}), ...(b.vertices ? { vertices: b.vertices.map(v => ({ ...v })) } : {}) })) } : {}), ...(project.measurement ? { measurement: { ...project.measurement } } : {}), ...(project.layout ? { layout: { ...project.layout } } : {}) }
}

export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const keys = Object.keys(a), other = Object.keys(b)
  return keys.length === other.length && keys.every(key => Object.prototype.hasOwnProperty.call(b, key) && sameValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
}

export function resizeForExport(project: Project, width: number, height: number): Project {
  const p = cloneProject(project), sx = width / p.width, sy = height / p.height
  p.width = width; p.height = height
  p.blockers?.forEach(b => { b.x *= sx; b.y *= sy; b.width *= sx; b.height *= sy; b.animation?.forEach(k => { k.x *= sx; k.y *= sy; k.width *= sx; k.height *= sy }) })
  if (p.layout) { p.layout.x *= sx; p.layout.y *= sy; p.layout.width *= sx; p.layout.height *= sy }
  p.layers.forEach(l => {
    l.width *= sx; l.height *= sy; l.baseSpeed *= sx
    l.points.forEach(n => { n.x *= sx; n.y *= sy; n.incoming.x *= sx; n.outgoing.x *= sx; n.incoming.y *= sy; n.outgoing.y *= sy; if (p.mode === '3d') { n.z *= sx; n.incoming.z *= sx; n.outgoing.z *= sx } })
    l.motion?.forEach(k => { k.x *= sx; k.y *= sy; if (p.mode === '3d') k.z *= sx })
  })
  p.director?.shots.forEach(s=>{for(const c of [s.cameraStart,s.cameraEnd]){for(const key of ['distance','focus','positionX','positionY','targetX','targetY','targetZ'] as const)c[key]*=sx;c.blur*=sx}})
  if (p.mode === '3d') {
    for (const key of ['distance', 'focus', 'blur', 'positionX', 'positionY', 'targetX', 'targetY', 'targetZ'] as const) p.camera[key] *= sx
  }
  return p
}
