import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPath, cubic, defaultLayer, defaultProject, durationOf, insertPoint, invalidatePath, parseProject, pathPoseAt, poseAt } from './animation'
import { cameraFor, defaultCamera, focusDepth, projectScenePoint, unprojectScenePoint } from './camera'
import { insertMotionKey, motionAt } from './motion'
import { resizeForExport } from './project'
import { changeTiming, retimeSegment, segmentSpeeds } from './timing'
import { useStudio } from '../store'

const close = (a: number, b: number, tolerance = .00001) => assert.ok(Math.abs(a - b) < tolerance, `${a} differs from ${b}`)

test('default camera matches the original canvas projection and old projects migrate without a view change', () => {
  const p = defaultProject(); p.mode = '3d'
  const point = { x: 260, y: 420, z: 200 }, q = projectScenePoint(p, point), factor = 1000 / 800
  close(q.x, 640 + (point.x - 640) * factor); close(q.y, 360 + (point.y - 360) * factor)
  const legacy = structuredClone(p) as any; for (const k of ['focalLength', 'positionX', 'positionY', 'targetX', 'targetY', 'targetZ', 'roll']) delete legacy.camera[k]
  assert.deepEqual(parseProject(legacy).camera, defaultCamera())
})

test('wide and long lenses change FOV and tilted camera dragging unprojects onto the same Z plane', () => {
  const p = defaultProject(), wide = structuredClone(p), long = structuredClone(p)
  wide.camera.focalLength = 18; long.camera.focalLength = 135
  assert.ok(cameraFor(wide).fov > cameraFor(long).fov)
  p.camera = { ...p.camera, focalLength: 50, positionX: 650, positionY: 300, targetX: 50, targetY: -40, targetZ: 80, roll: 14 }
  const point = { x: 650, y: 300, z: 150 }, screen = projectScenePoint(p, point), world = unprojectScenePoint(p, screen.x, screen.y, point.z)
  close(world.x, point.x); close(world.y, point.y); close(world.z, point.z)
  const camera = cameraFor(p), target = { x: p.width / 2 + p.camera.targetX, y: p.height / 2 - p.camera.targetY, z: p.camera.targetZ }
  close(focusDepth(p, target), Math.hypot(camera.position.x - p.camera.targetX, camera.position.y - p.camera.targetY, camera.position.z - p.camera.targetZ))
})

test('asset motion has independent times and combines with path motion without rewriting path points', () => {
  const l = defaultLayer(1280, 720), before = structuredClone(l.points)
  insertMotionKey(l, 0, 30); const i = insertMotionKey(l, 2, 30); Object.assign(l.motion![i], { rz: 180, scale: 2, x: 70 })
  const a = pathPoseAt(l, 1), b = poseAt(l, 1)
  close(b.rz, a.rz + 90); close(b.scale, a.scale * 1.5); close(b.x, a.x + 35)
  assert.deepEqual(l.points, before)
  l.duration = 3; invalidatePath(l)
  assert.deepEqual(l.motion!.map(k => k.time), [0, 2]); close(motionAt(l, 1).rz, 90)
  l.motion![1].time = 8; const p = defaultProject(); p.layers = [l]; assert.equal(durationOf(p), 8)
})

test('adding a path key does not bake independent asset offsets or rotation into the path', () => {
  const l = defaultLayer(1280, 720), old = structuredClone(l), pose = pathPoseAt(l, 2)
  insertMotionKey(l, 0, 30); Object.assign(l.motion![0], { x: 250, rz: 90 })
  const i = insertPoint(l, 2); close(l.points[i].x, pose.x)
  const expected = cubic(old.points[pose.segment], old.points[pose.segment + 1], pose.t * .5), actual = cubic(l.points[i - 1], l.points[i], .5)
  close(actual.x, expected.x); close(actual.y, expected.y)
})

test('manual timeline times and speed map segment rates update in both directions', () => {
  const l = defaultLayer(1280, 720); changeTiming(l, 'keyframes'); invalidatePath(l)
  const old = segmentSpeeds(l)[0], oldTime = l.points[1].time
  l.points[1].time = oldTime / 2; invalidatePath(l); close(segmentSpeeds(l)[0], old * 2)
  const geometry = structuredClone(l.points.map(p => ({ x: p.x, y: p.y, z: p.z }))), interval = l.points[2].time - l.points[1].time
  retimeSegment(l, 0, old, 30); invalidatePath(l)
  close(l.points[1].time, Math.round(oldTime * 30) / 30)
  close(l.points[2].time - l.points[1].time, interval)
  assert.deepEqual(l.points.map(p => ({ x: p.x, y: p.y, z: p.z })), geometry)
  assert.equal(l.timing, 'keyframes')
})

test('export resizing preserves the composition of fixed lenses and independent motion', () => {
  const p = defaultProject(); p.mode = '3d'; Object.assign(p.camera, { focalLength: 85, positionX: 400, positionY: 150, targetX: -50, targetZ: 80 })
  const l = p.layers[0]; insertMotionKey(l, 0, 30); Object.assign(l.motion![0], { x: 45, y: -20, z: 90 })
  const large = resizeForExport(p, p.width * 2, p.height * 2), a = projectScenePoint(p, poseAt(l, 2)), b = projectScenePoint(large, poseAt(large.layers[0], 2))
  close(b.x, a.x * 2); close(b.y, a.y * 2); assert.equal(large.camera.focalLength, 85)
})

test('3D layer selection chooses a nearby point and motion edits can be undone independently', () => {
  const p = defaultProject(); p.mode = '3d'; const s = useStudio.getState(); s.load(p); s.set({ time: 3, selectedPoint: null }); s.select(p.layers[0].id)
  assert.notEqual(useStudio.getState().selectedPoint, null)
  s.changeMotion({ rz: 80 }); assert.equal(useStudio.getState().project.layers[0].motion?.at(-1)?.rz, 80)
  s.undo(); assert.equal(useStudio.getState().project.layers[0].motion, undefined)
})

test('invalid independent motion times are rejected and hold keys keep their value', () => {
  const p = defaultProject(), l = p.layers[0]; insertMotionKey(l, 0, 30); insertMotionKey(l, 2, 30)
  l.motion![0].easing = 'hold'; l.motion![1].rz = 180; assert.equal(motionAt(l, 1).rz, 0); assert.equal(motionAt(l, 2).rz, 180)
  l.motion![1].time = 0; assert.throws(() => parseProject(p))
})
