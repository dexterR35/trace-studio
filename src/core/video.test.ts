import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultProject, durationOf, parseProject } from './animation'
import { blockerAt, insertBlockerKey, makeBlocker, parseBlockers } from './blockers'
import { cloneProject, resizeForExport } from './project'
import { parseVideo, videoPlacement } from './video'
import { useStudio } from '../store'
import type { VideoBackground } from './types'

const video = (): VideoBackground => ({ id: 'video-test', name: 'Footage.webm', src: 'data:video/webm;base64,AAAA', duration: 8, sourceStart: 0, width: 1920, height: 1080, fit: 'contain', muted: false, hasAudio: true, sections: [2, 5] })

test('the background video sets the complete scene length and persists audio and section markers', () => {
  const p = defaultProject(); p.video = video(); p.layers[0].duration = 40
  assert.equal(durationOf(p), 8)
  const restored = parseProject(p); assert.equal(durationOf(restored), 8); assert.equal(restored.video!.src, p.video.src); assert.equal(restored.video!.muted, false); assert.deepEqual(restored.video!.sections, [2, 5])
  const copy = cloneProject(p); copy.video!.sections.push(6); assert.deepEqual(p.video.sections, [2, 5])
  const exported = resizeForExport(p, 640, 360); assert.equal(exported.video!.width, 1920); assert.equal(exported.video!.height, 1080)
})

test('video validation rejects long clips, remote sources, invalid dimensions and section times', () => {
  for (const change of [{ duration: 30.1 }, { duration: 0 }, { src: 'https://example.com/private.mp4' }, { width: Infinity }, { sections: [8] }, { sourceStart: -1 }]) assert.throws(() => parseVideo({ ...video(), ...change }))
  assert.equal(parseVideo({ ...video(), duration: 30 }).duration, 30)
  assert.deepEqual(videoPlacement(video(), 100, 100), { x: 0, y: 21.875, width: 100, height: 56.25 })
  const cover = videoPlacement({ ...video(), fit: 'cover' }, 100, 100); assert.equal(cover.height, 100); assert.ok(cover.x < 0)
})

test('blocker keyframes interpolate movement, size and outline, with hold keys for shot changes', () => {
  const p = defaultProject(), b = makeBlocker('polygon', p); b.x = 10; b.width = 100; b.vertices = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: .5, y: 1 }]
  insertBlockerKey(b, 0, 30); const last = insertBlockerKey(b, 2, 30); last.x = 110; last.width = 300; last.vertices![2].x = 1
  assert.equal(blockerAt(b, 1).x, 60); assert.equal(blockerAt(b, 1).width, 200); assert.equal(blockerAt(b, 1).vertices![2].x, .75)
  b.animation![0].easing = 'hold'; assert.equal(blockerAt(b, 1.99).x, 10); assert.equal(blockerAt(b, 2).x, 110)
  b.start = 1; b.end = 2; assert.equal(blockerAt(b, .99).visible, false); assert.equal(blockerAt(b, 1).visible, true); assert.equal(blockerAt(b, 2).visible, false)
  assert.throws(() => parseBlockers([{ ...b, animation: [{ ...last, time: NaN }] }]))
})

test('moving an animated blocker records the current frame without changing earlier keys or the element path', () => {
  const p = defaultProject(); p.video = video(); const b = makeBlocker('rectangle', p); p.blockers = [b]
  assert.equal(b.mode, 'cutout')
  useStudio.getState().load(p); useStudio.getState().selectBlocker(b.id); useStudio.getState().addBlockerKey()
  const firstX = b.x, path = structuredClone(useStudio.getState().project.layers)
  useStudio.getState().set({ time: 2 }); useStudio.getState().changeBlocker({ x: firstX + 100, width: 500 })
  const animated = useStudio.getState().project.blockers![0]
  assert.equal(animated.animation!.length, 2); assert.equal(blockerAt(animated, 0).x, firstX); assert.equal(blockerAt(animated, 2).x, firstX + 100)
  assert.deepEqual(useStudio.getState().project.layers, path)
  const copy = cloneProject(useStudio.getState().project); copy.blockers![0].animation![0].x = -99; assert.equal(animated.animation![0].x, firstX)
  const doubled = resizeForExport(useStudio.getState().project, 2560, 1440); assert.equal(doubled.blockers![0].animation![1].width, 1000)
  const restored = parseProject(useStudio.getState().project); assert.equal(restored.blockers![0].animation![1].x, firstX + 100)
  useStudio.getState().undo(); assert.equal(useStudio.getState().project.blockers![0].animation!.length, 1)
})
