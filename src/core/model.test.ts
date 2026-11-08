import { test } from 'node:test'
import assert from 'node:assert/strict'
import type * as THREE from 'three'
import { defaultLayer, defaultProject, durationOf, parseProject } from './animation'
import { GLB_DATA_PREFIX, validateGlb } from './glb'
import { createModelInstance, describeModel, loadModel, pruneModels } from './models'
import { modelAnimationEnd, modelTimeAt } from './model-animation'
import { cloneLayer } from './project'
import { convertTo2D } from './mode'
import { modelGlb } from './test-support/model-glb'
import { useStudio } from '../store'

const src = GLB_DATA_PREFIX + Buffer.from(modelGlb()).toString('base64')
async function layer() { const l = defaultLayer(640, 360, 'model'); l.src = src; l.model = describeModel(await loadModel(src), 'Blender.glb'); return l }
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < .00001, `${a} != ${b}`)

test('GLB validation rejects corrupt containers, external resources and unsupported compression', () => {
  assert.equal(validateGlb(modelGlb()).animations.length, 2)
  assert.throws(() => validateGlb(new ArrayBuffer(32)), /glTF/)
  assert.throws(() => validateGlb(modelGlb({ images: [{ uri: 'https://example.com/texture.png' }] })), /self-contained/)
  assert.throws(() => validateGlb(modelGlb({ extensionsUsed: ['KHR_draco_mesh_compression'] })), /compression disabled/)
  const truncated = modelGlb().slice(0, -4); assert.throws(() => validateGlb(truncated), /glTF/)
})

test('model clip timing is independent of path timing, with start, offset, speed, loop and hold', async () => {
  const l = await layer(); l.delay = 2; Object.assign(l.model!, { start: 1, offset: .2, speed: 2 })
  near(modelTimeAt(l, 0)!, .2); near(modelTimeAt(l, 3.2)!, .6); near(modelTimeAt(l, 3.5)!, .2); near(modelAnimationEnd(l), 1.4)
  l.model!.loop = false; near(modelTimeAt(l, 10)!, 1); near(modelAnimationEnd(l), 1.4)
  l.model!.clip = null; assert.equal(modelTimeAt(l, 10), null); assert.equal(modelAnimationEnd(l), 0)
})

test('static GLB objects load in rest pose and preserve authored material opacity', async () => {
  const staticSrc = GLB_DATA_PREFIX + Buffer.from(modelGlb({ animations: [] })).toString('base64'), asset = await loadModel(staticSrc), l = defaultLayer(640, 360, 'model')
  l.src = staticSrc; l.model = describeModel(asset, 'Static.glb'); assert.equal(l.model.clip, null); assert.deepEqual(l.model.clips, [])
  const instance = createModelInstance(staticSrc)
  try { instance.update(l, 3, .5); const mesh = instance.content.getObjectByName('Triangle') as THREE.Mesh; near((mesh.material as THREE.Material).opacity, .5); assert.equal(modelTimeAt(l, 3), null) } finally { instance.dispose() }
})

test('skinned and morph clips seek deterministically in either direction and restore rest pose', async () => {
  const l = await layer(), instance = createModelInstance(src), bone = instance.content.getObjectByName('Bone')!, mesh = instance.content.getObjectByName('Triangle') as THREE.SkinnedMesh
  try {
    for (const t of [.8, .2, .8, .1]) { instance.update(l, t, 1); near(bone.position.y, t) }
    l.model!.loop = false; instance.update(l, 2, 1); near(bone.position.y, 1); instance.update(l, .3, 1); near(bone.position.y, .3)
    l.model!.clip = 1; instance.update(l, .7, 1); near(bone.position.y, 0); near(mesh.morphTargetInfluences![0], .7)
    l.model!.clip = null; instance.update(l, 1, 1); near(mesh.morphTargetInfluences![0], 0)
  } finally { instance.dispose() }
})

test('duplicate models have independent bones, morph weights, opacity and settings', async () => {
  const l = await layer(), copy = cloneLayer(l), first = createModelInstance(src), second = createModelInstance(src)
  try {
    copy.model!.clip = 1; copy.model!.clips[0].name = 'Changed'; assert.equal(l.model!.clips[0].name, 'Lift')
    first.update(l, .8, .3); second.update(copy, .2, 1)
    const a = first.content.getObjectByName('Triangle') as THREE.SkinnedMesh, b = second.content.getObjectByName('Triangle') as THREE.SkinnedMesh
    assert.notEqual(a.skeleton, b.skeleton); assert.notEqual(a.material, b.material); near(a.skeleton.bones[0].position.y, .8); near(b.skeleton.bones[0].position.y, 0); near(b.morphTargetInfluences![0], .2)
    near((a.material as THREE.Material).opacity, .3); near((b.material as THREE.Material).opacity, 1)
    pruneModels(new Set()); second.update(copy, .7, 1); near(b.morphTargetInfluences![0], .7)
  } finally { first.dispose(); second.dispose() }
})

test('embedded models and clip settings survive project loading and extend once-only scene duration', async () => {
  const p = defaultProject(), l = await layer(); p.mode = '3d'; p.layers = [l]; l.model!.loop = false; l.model!.start = 9; l.model!.speed = .5
  near(durationOf(p), 11); const restored = parseProject(p); assert.equal(restored.layers[0].src, src); assert.deepEqual(restored.layers[0].model, l.model)
  const malformed = structuredClone(p); malformed.layers[0].model!.clip = 99; assert.throws(() => parseProject(malformed), /selection/)
  const flat = structuredClone(p); flat.mode = '2d'; assert.throws(() => parseProject(flat), /3D scene/)
  assert.throws(() => convertTo2D(p, 'reset'), /3D models/); assert.equal(p.mode, '3d')
})

test('importing a model switches to 3D atomically and Undo restores the preceding 2D scene', async () => {
  const l = await layer(), s = useStudio; s.getState().load(defaultProject()); s.getState().addLayer('model', l)
  assert.equal(s.getState().project.mode, '3d'); assert.equal(s.getState().view, 'split'); assert.equal(s.getState().project.layers.length, 2)
  s.getState().undo(); assert.equal(s.getState().project.mode, '2d'); assert.equal(s.getState().project.layers.length, 1)
})
