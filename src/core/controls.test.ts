import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPath, cubic, defaultProject, durationOf, insertPoint, parseProject, poseAt } from './animation'
import { setCurvePreset, updateAutoHandles } from './curves'
import { sliderNumber, sliderValue } from './slider'
import { cameraFor } from './camera'
import { POSITION_LIMIT } from './types'
import { useStudio } from '../store'

const near = (a: number, b: number, tolerance = .00001) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`)

test('linear segments ignore Bezier handles in all three axes', () => {
  const l = defaultProject().layers[0], a = l.points[0], b = l.points[1]; a.z = 400; b.z = -500
  setCurvePreset(l, 0, 'linear')
  for (const t of [0, .1, .5, .9, 1]) { const p = cubic(a, b, t); for (const axis of ['x', 'y', 'z'] as const) near(p[axis], a[axis] + (b[axis] - a[axis]) * t) }
})

test('inserting a point preserves a straight segment and its surrounding cubic geometry', () => {
  const l = defaultProject().layers[0]; setCurvePreset(l, 1, 'linear'); const old = structuredClone(l), times = buildPath(l).nodeTimes, i = insertPoint(l, (times[1] + times[2]) / 2)
  assert.equal(l.points[i].curve, 'linear')
  for (const t of [.1, .5, .9]) { const a = cubic(old.points[1], old.points[2], t / 2), b = cubic(l.points[1], l.points[2], t); near(a.x, b.x); near(a.y, b.y) }
  assert.deepEqual(cubic(old.points[0], old.points[1], .4), cubic(l.points[0], l.points[1], .4))
})

test('auto smooth follows moved neighboring points while corner handles retain authored values', () => {
  const l = defaultProject().layers[0]; setCurvePreset(l, 2, 'corner'); const saved = structuredClone(l.points[2]), before = structuredClone(l.points[1].outgoing)
  l.points[2].x += 500; l.points[2].z = 300; updateAutoHandles(l)
  assert.notDeepEqual(l.points[1].outgoing, before); assert.deepEqual(l.points[2].incoming, saved.incoming); assert.deepEqual(l.points[2].outgoing, saved.outgoing)
  near(l.points[1].outgoing.z, 50)
})

test('large XYZ positions, handle modes and segments survive save/load and extend the camera far plane', () => {
  const p = defaultProject(); p.mode = '3d'; Object.assign(p.layers[0].points[1], { x: 850000, y: -650000, z: -950000 }); setCurvePreset(p.layers[0], 1, 'linear')
  const restored = parseProject(p), point = restored.layers[0].points[1]
  assert.deepEqual([point.x, point.y, point.z, point.curve], [850000, -650000, -950000, 'linear']); assert.ok(cameraFor(restored).far > 950000)
  p.layers[0].points[0].z = 5000; assert.equal(parseProject(p).layers[0].points[0].z, 5000)
})

test('scene changes remain pending until confirmation; Cancel resumes unchanged playback', () => {
  const s = useStudio.getState(); s.load(defaultProject()); const old = structuredClone(useStudio.getState().project); s.set({ playing: true }); s.requestFps(60)
  assert.deepEqual(useStudio.getState().project, old); assert.equal(useStudio.getState().playing, false); assert.equal(useStudio.getState().pendingSceneChange?.kind, 'fps')
  s.cancelSceneChange(); assert.deepEqual(useStudio.getState().project, old); assert.equal(useStudio.getState().playing, true); assert.equal(useStudio.getState().history.length, 0)
})

test('confirmed FPS changes resample the scene without retiming paths and Undo restores FPS', () => {
  const s = useStudio.getState(); s.load(defaultProject()); const old = useStudio.getState().project, pose = poseAt(old.layers[0], 2)
  s.requestFps(60); s.applySceneChange(); const now = useStudio.getState().project
  assert.equal(now.fps, 60); assert.equal(durationOf(now), durationOf(old)); assert.equal(Math.ceil(durationOf(now) * now.fps), 360); assert.deepEqual(poseAt(now.layers[0], 2), pose)
  s.undo(); assert.equal(useStudio.getState().project.fps, 30); s.redo(); assert.equal(useStudio.getState().project.fps, 60)
})

test('size confirmation is atomic, cancelable and undoable while retaining pixel positions', () => {
  const s = useStudio.getState(); s.load(defaultProject()); const old = structuredClone(useStudio.getState().project)
  s.requestSize(1080, 1920, false); assert.equal(useStudio.getState().project.width, 1280); s.cancelSceneChange(); assert.deepEqual(useStudio.getState().project, old)
  s.requestSize(1080, 1920, false); s.applySceneChange(); assert.deepEqual(useStudio.getState().project.layers, old.layers); assert.equal(useStudio.getState().project.height, 1920)
  s.undo(); assert.deepEqual(useStudio.getState().project, old)
})

test('continuous slider changes create one Undo entry and release their transaction afterward', () => {
  const s = useStudio.getState(); s.load(defaultProject()); const old = structuredClone(useStudio.getState().project)
  s.begin(true); s.changePoint({ x: 300 }); s.changePoint({ x: 400 }); s.changePoint({ x: 500 }); s.end()
  assert.equal(useStudio.getState().history.length, 1); s.undo(); assert.deepEqual(useStudio.getState().project, old)
  s.changePoint({ x: 250 }); assert.equal(useStudio.getState().history.length, 1)
})

test('logarithmic position controls cover the full range with fine precision at the base', () => {
  for (const [min, max] of [[-POSITION_LIMIT, POSITION_LIMIT], [50, POSITION_LIMIT]]) {
    for (const value of [min, 100, 1000, 250000, max]) near(sliderNumber(sliderValue(value, min, max, true), min, max, true, .001), value, .001)
  }
  near(sliderNumber(.5, -POSITION_LIMIT, POSITION_LIMIT, true, 1), 0)
  assert.ok(sliderNumber(.501, -POSITION_LIMIT, POSITION_LIMIT, true, 1) < 20)
})
