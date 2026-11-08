import * as THREE from 'three'
import { directorAt, framePoint } from './director'
import type { AssetTransform, CameraSettings, Layer, Project, Vec } from './types'

export function defaultCamera(): CameraSettings {
  return { distance: 1000, zoom: 1, dof: false, autofocus: true, focus: 1000, blur: 12, focalLength: null, positionX: 0, positionY: 0, targetX: 0, targetY: 0, targetZ: 0, roll: 0 }
}

export function configureBaseCamera(camera: THREE.PerspectiveCamera, project: Project) {
  camera.clearViewOffset()
  const c = project.camera, aspect = project.width / project.height
  // Lens presets use a 36 mm horizontal sensor; Auto preserves the original canvas-fit camera.
  camera.fov = THREE.MathUtils.radToDeg(c.focalLength ? 2 * Math.atan(36 / (2 * c.focalLength * aspect)) : 2 * Math.atan(project.height / (2 * Math.max(1,Math.abs(c.distance)))))
  let extent = 0
  for (const layer of project.layers) {
    const offset = Math.max(0, ...(layer.motion ?? []).map(k => Math.hypot(k.x, k.y, k.z))), radius = Math.hypot(layer.width, layer.height) * 20
    for (const v of layer.points) extent = Math.max(extent, Math.hypot(v.x - project.width / 2 - c.positionX, project.height / 2 - v.y - c.positionY, v.z - c.distance) + offset + radius)
  }
  camera.aspect = aspect; camera.near = 1; camera.far = Math.max(15000, extent * 1.2, Math.hypot(c.positionX - c.targetX, c.positionY - c.targetY, c.distance - c.targetZ) * 10); camera.zoom = c.zoom
  camera.position.set(c.positionX, c.positionY, c.distance)
  camera.lookAt(c.targetX, c.targetY, c.targetZ)
  camera.rotateZ(THREE.MathUtils.degToRad(c.roll))
  camera.updateProjectionMatrix(); camera.updateMatrixWorld()
  return camera
}

export function configureCamera(camera:THREE.PerspectiveCamera,project:Project,time=0,framing=true){const view=directorAt(project,time);configureBaseCamera(camera,{...project,camera:view.camera});if(framing&&view.shot){const f=view.frame;camera.setViewOffset(project.width,project.height,f.x*project.width,f.y*project.height,f.width*project.width,f.height*project.height);camera.updateProjectionMatrix()}return camera}
const cache=new WeakMap<Project,{time:number;camera:THREE.PerspectiveCamera}>()
export function cameraFor(project:Project,time=0){let entry=cache.get(project);if(!entry||entry.time!==time){entry={time,camera:configureCamera(new THREE.PerspectiveCamera(),project,time)};cache.set(project,entry)}return entry.camera}

export function projectScenePoint(p: Project, v: Vec,time=0) {
  const q = new THREE.Vector3(v.x - p.width / 2, p.height / 2 - v.y, v.z).project(cameraFor(p,time))
  return { x: (q.x + 1) * p.width / 2, y: (1 - q.y) * p.height / 2 }
}

export function unprojectScenePoint(p: Project, x: number, y: number, z: number,time=0): Vec {
  const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(x / p.width * 2 - 1, 1 - y / p.height * 2), cameraFor(p,time))
  const result = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -z), new THREE.Vector3())
  return result ? { x: result.x + p.width / 2, y: p.height / 2 - result.y, z } : { x: p.width / 2, y: p.height / 2, z }
}

export function focusDepth(p: Project, v: Vec,time=0) {
  return Math.max(1, cameraDepth(p, v,time))
}

export function cameraDepth(p: Project, v: Vec,time=0) {
  return -new THREE.Vector3(v.x - p.width / 2, p.height / 2 - v.y, v.z).applyMatrix4(cameraFor(p,time).matrixWorldInverse).z
}

export function projectAssetCorners(p: Project, layer: Layer, pose: AssetTransform,time=0) {
  if (p.mode === '2d') { const angle = pose.rz * Math.PI / 180; return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => { const a = x * layer.width * pose.scale / 2, b = y * layer.height * pose.scale / 2; return framePoint(p,{ x: pose.x + a * Math.cos(angle) - b * Math.sin(angle), y: pose.y + a * Math.sin(angle) + b * Math.cos(angle) },time) }) }
  const rotation = new THREE.Euler(-pose.rx * Math.PI / 180, -pose.ry * Math.PI / 180, -pose.rz * Math.PI / 180)
  const origin = new THREE.Vector3(pose.x - p.width / 2, p.height / 2 - pose.y, pose.z)
  return [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([x, y]) => { const q = new THREE.Vector3(x * layer.width * pose.scale / 2, y * layer.height * pose.scale / 2, 0).applyEuler(rotation).add(origin).project(cameraFor(p,time)); return { x: (q.x + 1) * p.width / 2, y: (1 - q.y) * p.height / 2 } })
}
