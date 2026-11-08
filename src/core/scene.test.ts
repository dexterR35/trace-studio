import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { autoHandles, buildPath, defaultProject, makePoint, parseProject } from './animation'
import { projectScenePoint } from './camera'
import { disposeGuides, fitMapCamera, mapBounds, sceneCameraGuides, sceneFrameGuides, type MapAngle } from './map'
import { inDisplayUnits, nearestPathTime, pointReference, resizeScene } from './scene'
import { insertMotionKey } from './motion'

const near = (a: number, b: number, tolerance = .00001) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`)

test('the scene border and grid match the exact selected resolution at Z=0', () => {
  for (const [width, height] of [[1920, 1080], [1080, 1920], [1270, 854], [390, 844]]) {
    const p = defaultProject(); p.width = width; p.height = height
    const frame = sceneFrameGuides(p), boundary = frame.getObjectByName('Scene boundary') as THREE.LineLoop
    boundary.geometry.computeBoundingBox(); const bounds = boundary.geometry.boundingBox!
    near(bounds.min.x, -width / 2); near(bounds.max.x, width / 2); near(bounds.min.y, -height / 2); near(bounds.max.y, height / 2); near(bounds.max.z, 0)
    const grid = frame.getObjectByName('Scene grid') as THREE.LineSegments; grid.geometry.computeBoundingBox()
    assert.ok(bounds.containsBox(grid.geometry.boundingBox!)); disposeGuides(frame)
  }
})

test('fit scene keeps all corners visible in different map aspect ratios and views', () => {
  const p = defaultProject()
  for (const [w, h] of [[1280, 720], [1080, 1920], [3840, 2160], [390, 844]]) for (const aspect of [.6, 1, 2.2]) for (const angle of ['perspective', 'front', 'top', 'side'] as MapAngle[]) {
    p.width = w; p.height = h
    const camera = new THREE.PerspectiveCamera(43, aspect, 1, 20000), bounds = mapBounds(p, null, 'scene', null)
    fitMapCamera(camera, bounds, angle, new THREE.Vector3())
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) { const projected = new THREE.Vector3(x, y, 0).project(camera); assert.ok(Math.abs(projected.x) < .91 && Math.abs(projected.y) < .91); assert.ok(projected.z > -1 && projected.z < 1) }
  }
})

test('selected point references report signed deltas, direct 3D distance and curved distance', () => {
  const l = defaultProject().layers[0]; l.points = autoHandles([makePoint({ x: 10, y: 20, z: 30 }), makePoint({ x: 13, y: 24, z: 42 })])
  const reference = pointReference(l, 0)!; assert.deepEqual(reference.next!.delta, { x: 3, y: 4, z: 12 }); near(reference.next!.distance, 13)
  assert.ok(reference.next!.alongPath >= reference.next!.distance - .0001); assert.equal(reference.start, true); assert.equal(reference.end, false)
  const end = pointReference(l, 1)!; assert.equal(end.next, null); near(end.previous!.distance, 13); assert.equal(end.end, true)
})

test('fit camera includes its position, target and perspective for wide and long lenses', () => {
  const p = defaultProject(); p.mode = '3d'
  for (const lens of [14, 50, 85, 300]) for (const aspect of [.6, 2.2]) {
    p.camera.focalLength = lens; p.camera.positionX = 1600; p.camera.positionY = 450; p.camera.targetX = -200; p.camera.targetZ = -300
    const bounds = mapBounds(p, p.layers[0], 'camera', 0), map = new THREE.PerspectiveCamera(43, aspect, 1, 20000)
    fitMapCamera(map, bounds, 'perspective', new THREE.Vector3())
    const guides = sceneCameraGuides(p), body = guides.getObjectByName('Scene camera')!, target = guides.getObjectByName('Camera target')!
    assert.deepEqual(body.position.toArray(), [1600, 450, 1000]); assert.deepEqual(target.position.toArray(), [-200, 0, -300])
    for (const position of [body.position, target.position]) { assert.ok(bounds.containsPoint(position)); const q = position.clone().project(map); assert.ok(Math.abs(q.x) < .91 && Math.abs(q.y) < .91 && q.z > -1 && q.z < 1) }
    assert.ok(guides.getObjectByName('Camera aim')); assert.ok(guides.getObjectByName('Camera frustum')); disposeGuides(guides)
  }
})

test('centimeter measurements use the configured design PPI', () => {
  const p = defaultProject(); p.measurement = { unit: 'cm', ppi: 96 }; near(inDisplayUnits(96, p), 2.54)
  p.measurement.ppi = 300; near(inDisplayUnits(300, p), 2.54)
  p.measurement.unit = 'px'; near(inDisplayUnits(300, p), 300)
  const restored = parseProject(p); assert.deepEqual(restored.measurement, p.measurement)
})

test('portrait resizing contains assets without stretching them or retiming their independent animation', () => {
  const p = defaultProject(); p.mode = '3d'; const l = p.layers[0]; l.width = 240; l.height = 120; l.points[0].z = 300; l.timing = 'auto'; insertMotionKey(l, 2, p.fps); l.motion![1].x = 80
  const duration = buildPath(l).duration, ratio = l.width / l.height, scale = 390 / 1280
  resizeScene(p, 390, 844, true)
  near(l.width / l.height, ratio); near(l.points[0].z, 300 * scale); near(l.motion![1].x, 80 * scale); assert.equal(l.motion![1].time, 2)
  near(buildPath(structuredClone(l)).duration, duration)
  const restored = parseProject(p); near(restored.camera.distance, p.camera.distance); near(restored.layers[0].points[0].z, l.points[0].z)
})

test('keep-pixels resizing preserves the scene content and camera exactly', () => {
  const p = defaultProject(), old = structuredClone(p); resizeScene(p, 1270, 854)
  assert.equal(p.width, 1270); assert.equal(p.height, 854); assert.deepEqual(p.layers, old.layers); assert.deepEqual(p.camera, old.camera)
})

test('changing scene formats repeatedly does not shrink the layout on each resize', () => {
  let p = defaultProject(); p.mode = '3d'; const original = structuredClone(p)
  for (const [w, h] of [[1920, 1080], [1080, 1920], [390, 844], [3840, 2160], [1280, 720]]) { resizeScene(p, w, h, true); p = parseProject(p) }
  const before = original.layers[0], after = p.layers[0]
  near(after.width, before.width); near(after.height, before.height); near(p.camera.distance, original.camera.distance)
  before.points.forEach((point, i) => { near(after.points[i].x, point.x); near(after.points[i].y, point.y); near(after.points[i].z, point.z) })
})

test('dragging an asset along its path changes time rather than the path geometry or offset keys', () => {
  const p = defaultProject(), l = p.layers[0]; l.delay = 1; l.duration = 4; l.points = [makePoint({ x: 100, y: 200, z: 0 }), makePoint({ x: 500, y: 200, z: 0 })]
  const original = structuredClone(l); near(nearestPathTime(l, p, 200, 200), 2, .001); near(nearestPathTime(l, p, 500, 200), 5)
  assert.deepEqual(l, original)
  const q = structuredClone(p); q.mode = '3d'; q.camera.positionX = 200; q.camera.focalLength = 35; const screen = projectScenePoint(q, { x: 200, y: 200, z: 0 }); near(nearestPathTime(q.layers[0], q, screen.x, screen.y), 2, .003)
})
