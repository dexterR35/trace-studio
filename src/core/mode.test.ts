import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPath, defaultProject, durationOf, invalidatePath, parseProject, poseAt } from './animation'
import { defaultCamera, projectScenePoint } from './camera'
import { convertTo2D } from './mode'
import { insertMotionKey } from './motion'
import { cloneProject } from './project'
import { exportCodecs, videoBitrate } from './encoding'
import { useStudio } from '../store'

const near = (a: number, b: number, tolerance = .00001) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`)
function scene() {
  const p = defaultProject(); p.mode = '3d'
  const l = p.layers[0]; l.kind = 'cube'; l.locked = true; l.visible = false; l.delay = .5
  l.points.forEach((point, i) => { point.z = i * 70; point.rx = 12; point.ry = -23; point.rz += 720; point.outgoing.z = 30; point.incoming.z = -20 })
  insertMotionKey(l, 2, p.fps); Object.assign(l.motion![1], { x: 50, y: -20, z: 100, rx: 20, ry: 10, rz: 45, scale: 1.3 })
  return p
}

test('reset flattens hidden and locked layers, handles and independent motion without changing stored X/Y', () => {
  const p = scene(), original = cloneProject(p), out = convertTo2D(p, 'reset')
  assert.deepEqual(p, original); assert.equal(out.mode, '2d'); assert.deepEqual(out.camera, defaultCamera())
  const before = p.layers[0], after = out.layers[0]
  assert.equal(after.kind, 'shape'); assert.equal(after.locked, true); assert.equal(after.visible, false)
  after.points.forEach((point, i) => { const old = before.points[i]; assert.deepEqual([point.x, point.y, point.scale, point.rz, point.opacity], [old.x, old.y, old.scale, old.rz, old.opacity]); assert.deepEqual([point.z, point.rx, point.ry, point.incoming.z, point.outgoing.z], [0, 0, 0, 0, 0]) })
  after.motion!.forEach((key, i) => { assert.deepEqual([key.x, key.y, key.scale, key.rz, key.time], [before.motion![i].x, before.motion![i].y, before.motion![i].scale, before.motion![i].rz, before.motion![i].time]); assert.deepEqual([key.z, key.rx, key.ry], [0, 0, 0]) })
})

test('screen conversion projects points and Bezier controls through the selected lens and camera', () => {
  const p = scene(); p.camera = { ...p.camera, focalLength: 50, positionX: 250, positionY: 80, roll: 12 }
  const out = convertTo2D(p, 'project')
  out.layers[0].points.forEach((point, i) => {
    const old = p.layers[0].points[i], q = projectScenePoint(p, old); near(point.x, q.x); near(point.y, q.y)
    for (const key of ['incoming', 'outgoing'] as const) { const c = projectScenePoint(p, { x: old.x + old[key].x, y: old.y + old[key].y, z: old.z + old[key].z }); near(point.x + point[key].x, c.x); near(point.y + point[key].y, c.y) }
  })
})

test('screen conversion preserves composed asset centers at independent motion keys', () => {
  const p = scene(), out = convertTo2D(p, 'project')
  out.layers[0].motion!.forEach(key => { const time = p.layers[0].delay + key.time, old = projectScenePoint(p, poseAt(p.layers[0], time)), now = poseAt(out.layers[0], time); near(now.x, old.x); near(now.y, old.y); near(now.z, 0) })
})

test('conversion preserves authored full rotations and fixed, auto and manual arrival times', () => {
  for (const timing of ['fixed', 'auto', 'keyframes'] as const) {
    const p = scene(), layer = p.layers[0]; layer.timing = timing
    const times = buildPath(layer).nodeTimes, duration = durationOf(p), out = convertTo2D(p, 'project')
    out.layers[0].points.forEach((point, i) => { near(point.time, times[i]); assert.ok(point.rz > 360) }); near(durationOf(out), duration)
    assert.doesNotThrow(() => parseProject(out))
  }
})

test('coincident nodes receive valid increasing times when flattened', () => {
  const p = scene(), l = p.layers[0]; Object.assign(l.points[1], { x: l.points[0].x, y: l.points[0].y, z: l.points[0].z }); l.points[0].outgoing = { x: 0, y: 0, z: 0 }; l.points[1].incoming = { x: 0, y: 0, z: 0 }; invalidatePath(l)
  const out = convertTo2D(p, 'reset'); assert.doesNotThrow(() => parseProject(out)); near(buildPath(out.layers[0]).duration, buildPath(l).duration)
})

test('projection rejects points behind the camera atomically and allows reset', () => {
  const p = scene(); p.layers[0].points[2].z = p.camera.distance + 20; const old = cloneProject(p)
  assert.throws(() => convertTo2D(p, 'project'), /camera/); assert.deepEqual(p, old); assert.equal(convertTo2D(p, 'reset').layers[0].points[2].z, 0)
})

test('conversion Undo and Redo restore the corresponding mode, camera, assets and map view', () => {
  const p = scene(); p.camera.focalLength = 85; p.layout = { x: 10, y: 20, width: 1000, height: 600 }
  useStudio.getState().load(p); useStudio.getState().switchTo2D('project')
  assert.equal(useStudio.getState().view, 'camera'); assert.equal(useStudio.getState().history.length, 1)
  useStudio.getState().undo(); assert.deepEqual(useStudio.getState().project, p); assert.equal(useStudio.getState().view, 'split')
  useStudio.getState().redo(); assert.equal(useStudio.getState().project.mode, '2d'); assert.equal(useStudio.getState().view, 'camera')
})

test('clicks and no-op edits preserve Redo while a whole drag creates one Undo entry', () => {
  useStudio.getState().load(defaultProject()); const s = useStudio.getState(), original = cloneProject(s.project)
  s.edit(p => { p.layers[0].points[0].x += 10 }); s.undo(); s.begin(); s.edit(() => {}, false)
  assert.equal(useStudio.getState().history.length, 0); assert.equal(useStudio.getState().future.length, 1)
  s.redo(); s.begin(); s.edit(p => { p.layers[0].points[0].x += 5 }, false); s.edit(p => { p.layers[0].points[0].x += 5 }, false)
  assert.equal(useStudio.getState().history.length, 2); s.undo(); near(useStudio.getState().project.layers[0].points[0].x, original.layers[0].points[0].x + 10)
  s.undo(); assert.deepEqual(useStudio.getState().project, original)
})

test('editable project clones isolate geometry, camera, measurement and motion while retaining immutable asset strings', () => {
  const p = scene(); p.measurement = { unit: 'cm', ppi: 96 }; p.layout = { x: 0, y: 0, width: 1280, height: 720 }; p.layers[0].src = 'data:image/png;base64,abc'
  const old = structuredClone(p), copy = cloneProject(p)
  copy.layers[0].points[0].incoming.x = 99; copy.layers[0].motion![0].x = 500; copy.camera.distance = 2000; copy.measurement!.ppi = 300; copy.layout!.x = 100
  assert.deepEqual(p, old); assert.equal(copy.layers[0].src, p.layers[0].src)
})

test('export codec choices preserve alpha and quality controls change the target bitrate', () => {
  assert.deepEqual(exportCodecs('webm', true), ['vp9']); assert.deepEqual(exportCodecs('png', true), [])
  assert.ok(exportCodecs('mp4', false).includes('hevc')); assert.ok(exportCodecs('webm', false).includes('av1'))
  assert.ok(videoBitrate(1920, 1080, 30, 'maximum') > videoBitrate(1920, 1080, 30, 'high')); assert.ok(videoBitrate(1920, 1080, 30, 'high') > videoBitrate(1920, 1080, 30, 'standard'))
})
