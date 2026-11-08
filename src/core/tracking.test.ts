import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultProject, makePoint } from './animation'
import { makeBlocker, blockerAt } from './blockers'
import { applyTracking, isSceneCut, matchTemplate, templateDetail, templatePixels, trackingPlan, type Pixels } from './tracking'
import { samMaskInScene, samSelection, samEndpoint } from './sam3'
import { useStudio } from '../store'

function frame(x: number, size = 18, bg = [20, 40, 90]): Pixels {
  const data = new Uint8ClampedArray(100 * 80 * 4)
  for (let y = 0; y < 80; y++) for (let px = 0; px < 100; px++) {
    const c = Math.abs(px - x) < size / 2 && Math.abs(y - 40) < size ? [210, 180 + (y % 5) * 10, 160] : bg
    data.set([...c, 255], (y * 100 + px) * 4)
  }
  return { width: 100, height: 80, data }
}
function project() { const p = defaultProject(); p.video = { id: 'v', name: 'test.webm', src: 'data:video/webm;base64,AA==', width: 640, height: 360, duration: 30, sourceStart: 0, fit: 'contain', muted: false, hasAudio: true, sections: [10, 20] }; return p }

test('tracking time grid respects the playhead, visibility and shot separators within 240 keys', () => {
  const p = project(), b = makeBlocker('rectangle', p)
  const plan = trackingPlan(p, b, 2.137)
  assert.equal(plan.start, 64 / 30); assert.equal(plan.end, 10); assert(plan.times.length <= 240)
  assert(plan.times.every((t, i) => t >= plan.start && t < 10 && (i === 0 || t > plan.times[i - 1])))
  p.video!.sections = []; assert(trackingPlan(p, b, 0).times.length <= 240)
  b.start = 4; b.end = 8; assert.equal(trackingPlan(p, b, 2).start, 4); assert.equal(trackingPlan(p, b, 2).end, 8)
  assert.throws(() => trackingPlan(p, b, 8), /earlier/)
})

test('appearance tracking follows translation and gradual scale, and rejects a disappeared subject', () => {
  const box = { x: 34, y: 40, width: 18, height: 36 }, first = frame(34), template = templatePixels(first, box)
  assert(templateDetail(template) > 7)
  const moved = matchTemplate(frame(42), box, template)
  assert(Math.abs(moved.box.x - 42) <= 1); assert(Math.abs(moved.box.y - 40) <= 1); assert(moved.error < .02)
  const scaled = matchTemplate(frame(34, 20), box, template)
  assert(scaled.box.width > box.width)
  const lost = matchTemplate(frame(-100), box, template)
  assert(lost.error > .18 || lost.detail < templateDetail(template) * .25)
})

test('cut detection distinguishes moving foreground from a different shot', () => {
  assert.equal(isSceneCut(frame(30), frame(40)), false)
  assert.equal(isSceneCut(frame(30), frame(40, 18, [180, 150, 0])), true)
})

test('SAM coordinates align with contain and cover video fitting and validate returned outlines', () => {
  const p = project(); p.width = p.height = 640
  const mask = { x: .5, y: .5, width: .25, height: .5, vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: .5, y: 1 }] }
  const pose = samMaskInScene(mask, p)
  assert.equal(pose.x, 320); assert.equal(pose.y, 320); assert.equal(pose.width, 160); assert.equal(pose.height, 180)
  const b = { ...makeBlocker('rectangle', p), ...pose }, plan = trackingPlan(p, b, 0)
  assert.deepEqual(samSelection(p, b, plan), [.375, .25, .25, .5])
  p.video!.fit = 'cover'; assert(samMaskInScene(mask, p).width > pose.width)
  assert.throws(() => samMaskInScene({ ...mask, vertices: [{ x: NaN, y: 0 }] }, p), /invalid outline/)
  assert.throws(() => samEndpoint('file:///tmp/model'), /HTTP/)
})

test('applying a partial track is one undoable edit, preserves the element path and hides the mask afterward', () => {
  const p = project(), b = makeBlocker('rectangle', p); p.blockers = [b]
  p.layers[0].points = [makePoint({ x: 20, y: 30, z: 0 }), makePoint({ x: 80, y: 40, z: 20 })]
  useStudio.getState().load(p); useStudio.getState().selectBlocker(b.id)
  const path = structuredClone(p.layers[0].points), plan = trackingPlan(p, b, 0)
  const key = { time: 0, x: 10, y: 20, width: 30, height: 40, rotation: 0, opacity: 1, easing: 'linear' as const }
  useStudio.getState().edit(draft => applyTracking(draft.blockers![0], { keys: [key, { ...key, time: 1, x: 50 }], end: 1.1, reason: 'subject-lost' }, plan))
  const current = useStudio.getState().project
  assert.equal(blockerAt(current.blockers![0], 1.1).visible, false)
  assert.deepEqual(current.layers[0].points, path)
  assert.equal(useStudio.getState().selectedLayer, p.layers[0].id)
  useStudio.getState().undo(); assert.equal(useStudio.getState().project.blockers![0].animation, undefined)
  useStudio.getState().redo(); assert.equal(useStudio.getState().project.blockers![0].animation!.length, 2)
})
