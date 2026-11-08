import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultLayer, defaultProject, parseProject } from './animation'
import { blockerFromDrawing, makeBlocker, MAX_BLOCKERS } from './blockers'
import { cloneProject, resizeForExport } from './project'
import { resizeScene } from './scene'
import { convertTo2D } from './mode'
import { useStudio } from '../store'

test('drawing a blocker preserves its canvas outline independently of animation paths', () => {
  const p = defaultProject(), before = structuredClone(p.layers), b = blockerFromDrawing('polygon', [{ x: 100, y: 200 }, { x: 500, y: 200 }, { x: 300, y: 400 }], p)!
  assert.equal(b.x, 300); assert.equal(b.y, 300); assert.equal(b.width, 400); assert.equal(b.height, 200)
  assert.deepEqual(b.vertices, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: .5, y: 1 }]); assert.deepEqual(p.layers, before)
  assert.equal(blockerFromDrawing('rectangle', [{ x: 10, y: 10 }, { x: 11, y: 100 }], p), null)
  assert.equal(blockerFromDrawing('polygon', [{ x: 10, y: 10 }, { x: 100, y: 100 }], p), null)
  assert.equal(blockerFromDrawing('polygon', [{ x: 10, y: 10 }, { x: 50, y: 50 }, { x: 100, y: 100 }], p), null)
})

test('project loading preserves blocker modes and rejects invalid shapes and outlines', () => {
  const p = defaultProject(), b = blockerFromDrawing('polygon', [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }], p)!
  b.mode = 'cutout'; b.rotation = 37; b.opacity = .6; b.locked = true; p.blockers = [b, makeBlocker('ellipse', p)]
  const restored = parseProject(p); assert.deepEqual(restored.blockers?.map(({ id, ...b }) => b), p.blockers.map(({ id, ...b }) => b))
  const bad = cloneProject(p); bad.blockers![0].vertices![0].x = Infinity; assert.throws(() => parseProject(bad), /valid points/)
  bad.blockers = Array.from({ length: MAX_BLOCKERS + 1 }, () => b); assert.throws(() => parseProject(bad), /up to 30/)
  bad.blockers = [{ ...b, width: -1 }]; assert.throws(() => parseProject(bad), /Invalid blocker/)
  const old = defaultProject(); assert.equal(parseProject(old).blockers, undefined)
})

test('blocker edits, duplication and deletion support isolated Undo and Redo', () => {
  const p = defaultProject(), original = structuredClone(p.layers), b = blockerFromDrawing('polygon', [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 50, y: 90 }], p)!
  useStudio.getState().load(p); useStudio.getState().addBlocker(b)
  assert.equal(useStudio.getState().selectedBlocker, b.id); assert.equal(useStudio.getState().project.blockers!.length, 1)
  useStudio.getState().begin(); useStudio.getState().changeBlocker({ x: 200 }, false); useStudio.getState().changeBlocker({ x: 300 }, false); useStudio.getState().end()
  useStudio.getState().undo(); assert.equal(useStudio.getState().project.blockers![0].x, b.x)
  useStudio.getState().redo(); assert.equal(useStudio.getState().project.blockers![0].x, 300)
  useStudio.getState().duplicate(); let state = useStudio.getState(); assert.equal(state.project.blockers!.length, 2)
  const copy = state.project.blockers![1]; assert.notEqual(copy.id, b.id); assert.notEqual(copy.vertices, state.project.blockers![0].vertices)
  state.deleteBlocker(); assert.equal(useStudio.getState().project.blockers!.length, 1)
  useStudio.getState().undo(); assert.equal(useStudio.getState().project.blockers!.length, 2)
  assert.deepEqual(useStudio.getState().project.layers, original)
  state = useStudio.getState(); state.selectBlocker(b.id); state.edit(p => { p.blockers![0].locked = true }); state.changeBlocker({ x: 999 }); state.deleteBlocker()
  assert.equal(useStudio.getState().project.blockers!.length, 2); assert.equal(useStudio.getState().project.blockers![0].x, 300)
})

test('blockers retain canvas alignment through export resizing and 3D to 2D conversion', () => {
  const p = defaultProject(); p.mode = '3d'; p.blockers = [makeBlocker('ellipse', p)]; const b = p.blockers[0]
  const large = resizeForExport(p, p.width * 2, p.height * 2); assert.equal(large.blockers![0].x, b.x * 2); assert.equal(large.blockers![0].width, b.width * 2)
  assert.deepEqual(convertTo2D(p, 'reset').blockers, p.blockers)
  const copy = cloneProject(p); copy.blockers![0].x = 123; assert.notEqual(copy.blockers![0].x, b.x)
  const original = structuredClone(p.blockers); resizeScene(p, 390, 844, true); resizeScene(p, 1280, 720, true)
  for (const key of ['x', 'y', 'width', 'height'] as const) assert.ok(Math.abs(p.blockers![0][key] - original[0][key]) < .00001)
})

for (const mode of ['2d', '3d'] as const) test(`${mode}: blocker selection keeps the active motion path through editing, Undo and Redo`, () => {
  const p = defaultProject(); p.mode = mode
  const moving = defaultLayer(p.width, p.height, 'shape'); moving.name = 'Second element'; p.layers.push(moving)
  useStudio.getState().load(p); useStudio.getState().select(moving.id)
  const original = structuredClone(useStudio.getState().project.layers), rectangle = makeBlocker('rectangle', p), circle = makeBlocker('ellipse', p)
  useStudio.getState().addBlocker(rectangle)
  assert.equal(useStudio.getState().selectedLayer, moving.id)
  assert.equal(useStudio.getState().selectedBlocker, rectangle.id)
  assert.equal(useStudio.getState().selectedPoint, null)
  useStudio.getState().addBlocker(circle)
  useStudio.getState().set({ propertiesOpen: false })
  useStudio.getState().selectBlocker(rectangle.id, false)
  assert.equal(useStudio.getState().selectedLayer, moving.id)
  assert.equal(useStudio.getState().propertiesOpen, false)
  useStudio.getState().changeBlocker({ x: 400, mode: 'cutout' })
  useStudio.getState().undo(); assert.equal(useStudio.getState().selectedLayer, moving.id)
  useStudio.getState().redo(); assert.equal(useStudio.getState().selectedLayer, moving.id)
  assert.equal(useStudio.getState().selectedBlocker, rectangle.id)
  useStudio.getState().addPoint(); useStudio.getState().changePoint({ x: 999 }); useStudio.getState().addMotion(); useStudio.getState().changeMotion({ x: 999 })
  assert.deepEqual(useStudio.getState().project.layers, original)
  useStudio.getState().selectPoint(2)
  assert.equal(useStudio.getState().selectedBlocker, null)
  assert.equal(useStudio.getState().selectedLayer, moving.id)
  assert.equal(useStudio.getState().selectedPoint, 2)
  useStudio.getState().selectBlocker(circle.id)
  useStudio.getState().deleteBlocker()
  assert.equal(useStudio.getState().selectedLayer, moving.id)
  assert.deepEqual(useStudio.getState().project.layers, original)
})

test('selecting a blocker recovers path context and supports scenes without animated elements', () => {
  const p = defaultProject(), b = makeBlocker('rectangle', p); p.blockers = [b]
  useStudio.getState().load(p); useStudio.getState().set({ selectedLayer: null })
  useStudio.getState().selectBlocker(b.id)
  assert.equal(useStudio.getState().selectedLayer, p.layers[0].id)
  const empty = defaultProject(); empty.layers = []; empty.blockers = [b]
  useStudio.getState().load(empty); useStudio.getState().selectBlocker(b.id)
  assert.equal(useStudio.getState().selectedLayer, null)
  assert.equal(useStudio.getState().selectedBlocker, b.id)
})
