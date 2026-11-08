import * as THREE from 'three'
import { buildPath } from './animation'
import { directorAt } from './director'
import { configureCamera } from './camera'
import { POSITION_LIMIT, type Layer, type Project, type Vec } from './types'

export type MapAngle = 'perspective' | 'front' | 'side' | 'top' | 'free'
export type MapFrame = 'scene' | 'path' | 'point' | 'camera'
export const worldPoint = (p: Project, v: Vec) => new THREE.Vector3(v.x - p.width / 2, p.height / 2 - v.y, v.z)
export function mapBounds(p: Project, layer: Layer | null, kind: MapFrame, point: number | null, time=0) {
  const bounds = new THREE.Box3(new THREE.Vector3(-p.width / 2, -p.height / 2, 0), new THREE.Vector3(p.width / 2, p.height / 2, 0))
  if (kind === 'path' && layer) for (const v of buildPath(layer).samples) bounds.expandByPoint(worldPoint(p, v))
  if (kind === 'point' && layer && point !== null && layer.points[point]) { const pos = worldPoint(p, layer.points[point]), size = Math.max(p.width, p.height) * .15; return new THREE.Box3().setFromCenterAndSize(pos, new THREE.Vector3(size, size, size)) }
  if (kind === 'camera') {
    const camera = guideCamera(p,time), c = directorAt(p,time).camera, margin = Math.max(p.width, p.height) / 40
    bounds.expandByPoint(camera.position).expandByPoint(new THREE.Vector3(c.targetX, c.targetY, c.targetZ))
    for (const x of [-1, 1]) for (const y of [-1, 1]) bounds.expandByPoint(new THREE.Vector3(x, y, 1).unproject(camera))
    bounds.expandByScalar(margin)
  }
  return bounds
}

function guideCamera(p: Project,time=0) {
  const camera = configureCamera(new THREE.PerspectiveCamera(), p,time), c = directorAt(p,time).camera
  camera.far = Math.max(camera.near + 1, camera.position.distanceTo(new THREE.Vector3(c.targetX, c.targetY, c.targetZ)) * 1.05)
  camera.updateProjectionMatrix()
  return camera
}

export function sceneCameraGuides(p: Project,time=0) {
  const group = new THREE.Group(), camera = guideCamera(p,time), c = directorAt(p,time).camera, size = Math.max(p.width, p.height) / 80, color = '#b49ac4'
  group.name = 'Render camera guides'
  const frustum = new THREE.CameraHelper(camera); frustum.name = 'Camera frustum'
  const tint = new THREE.Color(color); frustum.setColors(tint, tint, tint, tint, tint); group.add(frustum)
  const body = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(size * 1.6, size, size)), new THREE.LineBasicMaterial({ color, depthTest: false }))
  body.name = 'Scene camera'; body.position.copy(camera.position); body.quaternion.copy(camera.quaternion); group.add(body)
  const target = new THREE.Mesh(new THREE.SphereGeometry(size * .4, 12, 8), new THREE.MeshBasicMaterial({ color, wireframe: true, depthTest: false }))
  target.name = 'Camera target'; target.position.set(c.targetX, c.targetY, c.targetZ); group.add(target)
  const aim = new THREE.Line(new THREE.BufferGeometry().setFromPoints([camera.position, target.position]), new THREE.LineDashedMaterial({ color, dashSize: size, gapSize: size * .6, depthTest: false }))
  aim.name = 'Camera aim'; aim.computeLineDistances(); group.add(aim)
  return group
}

export function fitMapCamera(camera: THREE.PerspectiveCamera, bounds: THREE.Box3, angle: MapAngle, previousTarget: THREE.Vector3) {
  const center = bounds.getCenter(new THREE.Vector3()), direction = angle === 'front' ? new THREE.Vector3(0, 0, 1) : angle === 'side' ? new THREE.Vector3(1, .08, .01) : angle === 'top' ? new THREE.Vector3(0, 1, .01) : angle === 'perspective' ? new THREE.Vector3(.55, .35, 1) : camera.position.clone().sub(previousTarget)
  direction.normalize(); camera.position.copy(center).add(direction); camera.lookAt(center)
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion), tanV = Math.tan(camera.fov * Math.PI / 360), tanH = tanV * camera.aspect
  let distance = 1
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) { const offset = new THREE.Vector3(x, y, z).sub(center), toward = offset.dot(direction); distance = Math.max(distance, toward + Math.abs(offset.dot(right)) / tanH * 1.2, toward + Math.abs(offset.dot(up)) / tanV * 1.2) }
  const radius = bounds.getSize(new THREE.Vector3()).length() / 2
  distance += radius * .08
  camera.position.copy(center).addScaledVector(direction, distance); camera.near = 1; camera.far = Math.max(20000, distance + radius * 6); camera.lookAt(center); camera.updateProjectionMatrix(); camera.updateMatrixWorld()
  return center
}

export function sceneFrameGuides(p: Project) {
  const group = new THREE.Group(); group.name = 'Scene frame'
  const w = p.width / 2, h = p.height / 2
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(p.width, p.height), new THREE.MeshBasicMaterial({ color: '#7495a0', opacity: .07, transparent: true, side: THREE.DoubleSide, depthWrite: false })); plane.position.z = -.1; plane.name = 'Base Z=0'; group.add(plane)
  const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-w, -h, 0), new THREE.Vector3(w, -h, 0), new THREE.Vector3(w, h, 0), new THREE.Vector3(-w, h, 0)]), new THREE.LineBasicMaterial({ color: '#8cabbd' })); outline.name = 'Scene boundary'; group.add(outline)
  const raw = Math.max(p.width, p.height) / 12, power = 10 ** Math.floor(Math.log10(raw)), step = ([1, 2, 5, 10].find(v => v * power >= raw) ?? 10) * power, lines: THREE.Vector3[] = []
  for (let x = -w + step; x < w - 1; x += step) lines.push(new THREE.Vector3(x, -h, 0), new THREE.Vector3(x, h, 0))
  for (let y = -h + step; y < h - 1; y += step) lines.push(new THREE.Vector3(-w, y, 0), new THREE.Vector3(w, y, 0))
  const grid = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines), new THREE.LineBasicMaterial({ color: '#37494d', transparent: true, opacity: .75 })); grid.name = 'Scene grid'; group.add(grid)
  return group
}

export function disposeGuides(group: THREE.Group) {
  group.traverse(child => { const mesh = child as THREE.Mesh; mesh.geometry?.dispose(); const materials = mesh.material; if (Array.isArray(materials)) materials.forEach(m => m.dispose()); else materials?.dispose() })
  group.clear()
}

export type DrawingPlane='xy'|'xz'|'yz'
/** A screen ray gives one exact XYZ position once a drawing plane is specified. */
export function mapDrawingPoint(camera:THREE.PerspectiveCamera,p:Pick<Project,'width'|'height'>,ndcX:number,ndcY:number,plane:DrawingPlane,offset:number):Vec|null{
 if(![ndcX,ndcY,offset].every(Number.isFinite))return null
 const normal=plane==='xy'?new THREE.Vector3(0,0,1):plane==='xz'?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0)
 const constant=plane==='xy'?-offset:plane==='xz'?offset-p.height/2:p.width/2-offset
 const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(ndcX,ndcY),camera)
 if(Math.abs(ray.ray.direction.dot(normal))<1e-7)return null
 const hit=ray.ray.intersectPlane(new THREE.Plane(normal,constant),new THREE.Vector3());if(!hit)return null
 const result={x:hit.x+p.width/2,y:p.height/2-hit.y,z:hit.z}
 return [result.x,result.y,result.z].every(n=>Number.isFinite(n)&&Math.abs(n)<=POSITION_LIMIT)?result:null
}
export function mapProjectPoint(camera:THREE.PerspectiveCamera,p:Pick<Project,'width'|'height'>,v:Vec,width:number,height:number){const q=new THREE.Vector3(v.x-p.width/2,p.height/2-v.y,v.z).project(camera);return {x:(q.x+1)*width/2,y:(1-q.y)*height/2,visible:q.z>=-1&&q.z<=1}}
