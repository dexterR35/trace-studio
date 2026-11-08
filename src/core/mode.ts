import * as THREE from 'three'
import { buildPath, invalidatePath, pathPoseAt, poseAt } from './animation'
import { cameraFor, defaultCamera, projectAssetCorners, projectScenePoint } from './camera'
import { clamp, type AssetTransform, type Project, type Vec } from './types'
import { cloneProject } from './project'

export type ConversionChoice = 'project' | 'reset'

function projectedPoint(p: Project, point: Vec) {
  const camera = cameraFor(p), depth = -new THREE.Vector3(point.x - p.width / 2, p.height / 2 - point.y, point.z).applyMatrix4(camera.matrixWorldInverse).z
  const q = projectScenePoint(p, point)
  if (depth <= camera.near || !Number.isFinite(q.x) || !Number.isFinite(q.y)) throw new Error('A point, handle or motion key is behind or too close to the camera. Move it in front of the camera, or choose Reset & switch.')
  return q
}

function projectedTransform(p: Project, layer: Project['layers'][number], pose: AssetTransform) {
  const corners = projectAssetCorners(p, layer, pose)
  if (corners.some(q => !Number.isFinite(q.x) || !Number.isFinite(q.y))) throw new Error('An asset crosses the camera plane. Move it away from the camera, or choose Reset & switch.')
  let area = 0
  corners.forEach((q, i) => { const next = corners[(i + 1) % corners.length]; area += q.x * next.y - next.x * q.y })
  const angle = Math.atan2(corners[1].y - corners[0].y, corners[1].x - corners[0].x) * 180 / Math.PI
  // Keep authored full rotations when the projected direction wraps through ±180°.
  return { scale: clamp(Math.sqrt(Math.abs(area) / 2 / Math.max(1, layer.width * layer.height)), .01, 20), rz: angle + 360 * Math.round((pose.rz - angle) / 360) }
}

function keyTimes(times: number[], duration: number, fps: number) {
  if (times.every((value, i) => !i || value > times[i - 1])) return [...times]
  const step = Math.min(1 / fps, duration / Math.max(1, times.length - 1)), result = [0]
  for (let i = 1; i < times.length; i++) result.push(clamp(times[i], result[i - 1] + step, duration - (times.length - 1 - i) * step))
  return result
}

/** Convert all layers together. The source stays untouched so cancel/error cannot partially flatten a scene. */
export function convertTo2D(source: Project, choice: ConversionChoice): Project {
  if (source.mode === '2d') return cloneProject(source)
  if (source.layers.some(layer => layer.kind === 'model')) throw new Error('GLB objects require a 3D scene. Remove the 3D models before switching to 2D.')
  const directorEnabled=source.director?.enabled
  source=cloneProject(source); if(source.director)source.director.enabled=false
  const p = cloneProject(source)
  p.layers.forEach((layer, index) => {
    const original = source.layers[index], data = buildPath(original), times = keyTimes(data.nodeTimes, data.duration, p.fps)
    layer.points.forEach((point, i) => {
      if (choice === 'project') {
        const old = original.points[i], position = projectedPoint(source, old), appearance = projectedTransform(source, original, original.orient ? pathPoseAt(original, original.delay + data.nodeTimes[i]) : old)
        for (const key of ['incoming', 'outgoing'] as const) { const handle = old[key], control = projectedPoint(source, { x: old.x + handle.x, y: old.y + handle.y, z: old.z + handle.z }); point[key] = { x: control.x - position.x, y: control.y - position.y, z: 0 } }
        point.x = position.x; point.y = position.y; point.scale = appearance.scale; point.rz = appearance.rz
      }
      point.z = 0; point.rx = 0; point.ry = 0; point.incoming.z = 0; point.outgoing.z = 0; point.time = times[i]
    })
    // Preserve arrival times even though projected path length changes.
    layer.timing = 'keyframes'; layer.duration = data.duration
    if (choice === 'project') layer.orient = false
    invalidatePath(layer)
    layer.motion?.forEach((key, i) => {
      if (choice === 'project') {
        const old = original.motion![i], time = original.delay + old.time, pose = poseAt(original, time), position = projectedPoint(source, pose), path = pathPoseAt(layer, time), appearance = projectedTransform(source, original, pose)
        key.x = position.x - path.x; key.y = position.y - path.y; key.scale = clamp(appearance.scale / Math.max(.01, path.scale), .01, 20); key.rz = appearance.rz - path.rz
      }
      key.z = 0; key.rx = 0; key.ry = 0
    })
    if (layer.kind === 'cube') { layer.kind = 'shape'; layer.shape = 'rectangle' }
    invalidatePath(layer)
  })
  p.mode = '2d'; p.camera = defaultCamera(); if(p.director){p.director.enabled=directorEnabled??false;p.director.shots.forEach(s=>{s.cameraStart=defaultCamera();s.cameraEnd=defaultCamera()})}; delete p.layout
  return p
}
