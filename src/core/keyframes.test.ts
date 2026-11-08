import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPath, defaultProject, makePoint, parseProject, pathPoseAt } from './animation'
import { makeBlocker, blockerAt, blockerKeyAt } from './blockers'
import { generateIntervalKeys, intervalFrames } from './keyframes'

function project() { const p = defaultProject(); p.video = { id: 'video', name: 'clip.mp4', src: 'data:video/mp4;base64,AA==', width: 1280, height: 720, duration: 30, sourceStart: 0, fit: 'contain', muted: false, hasAudio: true, sections: [] }; return p }

test('30-second clips get keys every 2 seconds including both boundaries at any scene FPS', () => {
  for (const fps of [24, 30, 60]) {
    const keys = intervalFrames(0, 30 * fps, 2, fps, 60)
    assert.equal(keys.length, 16); assert.deepEqual(keys.map(f => f / fps), Array.from({ length: 16 }, (_, i) => 2 * i))
  }
  assert.deepEqual(intervalFrames(37, 201, 2, 30, 60), [37, 97, 157, 201])
  assert.throws(() => intervalFrames(0, 900, 1 / 30, 30, 60), /Increase the interval/)
})

test('path keys fit exact chosen frames and preserve the spatial curve and editable XYZ points', () => {
  const p = project(), l = p.layers[0]; l.points = [makePoint({ x: 10, y: 20, z: -30 }), makePoint({ x: 300, y: 200, z: 80 }, 6)]
  l.points[0].outgoing = { x: 70, y: -30, z: 40 }; l.points[1].incoming = { x: -50, y: 80, z: 0 }
  const endpoints = [structuredClone(l.points[0]), structuredClone(l.points[1])]
  generateIntervalKeys(p, { kind: 'path', id: l.id }, 37, 841, 2)
  const data = buildPath(l), times = data.nodeTimes.map(t => Math.round((l.delay + t) * p.fps))
  assert.deepEqual(times, intervalFrames(37, 841, 2, 30, 60)); assert.equal(l.delay, 37 / 30); assert.equal(l.timing, 'keyframes')
  assert.equal(l.points[0].x, endpoints[0].x); assert.equal(l.points.at(-1)!.z, endpoints[1].z)
  assert(l.points.every(n => Number.isFinite(n.x) && Number.isFinite(n.z)))
  const reopened = parseProject(JSON.parse(JSON.stringify(p))); assert.equal(reopened.layers[0].points.length, l.points.length)
  assert(Math.abs(pathPoseAt(l, 37 / 30).x - 10) < .001)
})

test('generated blocker keys preserve dense SAM outlines, hold interpolation and frame visibility', () => {
  const p = project(), b = makeBlocker('polygon', p); b.vertices = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: .5, y: 1 }]
  b.animation = [blockerKeyAt(b, 0, 30), blockerKeyAt(b, 3, 30)]; b.animation[0].easing = 'hold'; b.animation[1].x = 900; p.blockers = [b]
  generateIntervalKeys(p, { kind: 'blocker', id: b.id }, 0, 900, 2)
  assert.equal(b.animation.length, 17); assert.equal(b.animation.find(k => k.time === 2)!.easing, 'hold')
  assert.equal(blockerAt(b, 2.9).x, b.x); assert.equal(blockerAt(b, 30).visible, false)
  assert.equal(parseProject(JSON.parse(JSON.stringify(p))).blockers![0].animation!.length, 17)
})

test('invalid or overfull generation leaves the original path unchanged', () => {
  const p = project(), l = p.layers[0], original = JSON.stringify(l)
  assert.throws(() => generateIntervalKeys(p, { kind: 'path', id: l.id }, 0, 900, .5), /60 keys/)
  assert.equal(JSON.stringify(l), original)
  l.locked = true; assert.throws(() => generateIntervalKeys(p, { kind: 'path', id: l.id }, 0, 900, 2), /unlocked/)
})
