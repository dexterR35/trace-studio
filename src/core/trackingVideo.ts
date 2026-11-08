import { blockerAt } from './blockers'
import { createVideoReader, videoPlacement } from './video'
import { isSceneCut, matchTemplate, movedKey, seedBox, templateDetail, templatePixels, type Pixels, type TrackingPlan, type TrackingResult } from './tracking'
import type { Blocker, Project } from './types'

export function checkTrackingAbort(signal: AbortSignal) { if (signal.aborted) throw new DOMException('Tracking cancelled', 'AbortError') }

export async function trackingFrame(p: Project, time: number, signal: AbortSignal) {
  if (!p.video) throw new Error('Add a video first.')
  const reader = await createVideoReader(p.video)
  try {
    checkTrackingAbort(signal)
    const source = await reader.frame(time)
    if (!source) throw new Error('Could not decode the selected frame.')
    const canvas = document.createElement('canvas'), scale = Math.min(1, 480 / Math.max(p.width, p.height))
    canvas.width = Math.round(p.width * scale); canvas.height = Math.round(p.height * scale)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!, rect = videoPlacement(p.video, canvas.width, canvas.height)
    ctx.drawImage(source.canvas, rect.x, rect.y, rect.width, rect.height)
    checkTrackingAbort(signal)
    return { image: canvas.toDataURL('image/jpeg', .85), pixels: ctx.getImageData(0, 0, canvas.width, canvas.height) }
  } finally { reader.dispose() }
}

export function analyzeLocal(p: Project, blocker: Blocker, time: number, pixels: Pixels) {
  const box = seedBox(blocker, time), sx = pixels.width / p.width, sy = pixels.height / p.height
  const scaled = { x: box.x * sx, y: box.y * sy, width: box.width * sx, height: box.height * sy }
  if (scaled.width < 5 || scaled.height < 5 || scaled.x - scaled.width / 2 < 0 || scaled.y - scaled.height / 2 < 0 || scaled.x + scaled.width / 2 > pixels.width || scaled.y + scaled.height / 2 > pixels.height) throw new Error('Select a subject inside the video, at least 5 pixels wide and high in the preview.')
  if (templateDetail(templatePixels(pixels, scaled)) < 7) throw new Error('This selection has too little detail. Include an object edge or use SAM 3.')
}

export async function trackLocal(p: Project, blocker: Blocker, plan: TrackingPlan, signal: AbortSignal, progress: (value: number) => void): Promise<TrackingResult> {
  if (!p.video) throw new Error('Add a video first.')
  const reader = await createVideoReader(p.video)
  const canvas = document.createElement('canvas'), scale = Math.min(1, 480 / Math.max(p.width, p.height))
  canvas.width = Math.round(p.width * scale); canvas.height = Math.round(p.height * scale)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!, rect = videoPlacement(p.video, canvas.width, canvas.height)
  const sx = canvas.width / p.width, sy = canvas.height / p.height, pose = blockerAt(blocker, plan.start), frozen = { ...pose, animation: undefined }
  const seed = seedBox(frozen, 0), initial = { x: seed.x * sx, y: seed.y * sy, width: seed.width * sx, height: seed.height * sy }
  let box = initial, previous: Pixels | undefined, reference: Float32Array | undefined, template: Float32Array | undefined
  const result: TrackingResult = { keys: [], end: plan.end, reason: 'complete' }
  try {
    for (let i = 0; i < plan.times.length; i++) {
      checkTrackingAbort(signal)
      const time = plan.times[i], frame = await reader.frame(time)
      checkTrackingAbort(signal)
      if (!frame) throw new Error('A video frame could not be decoded.')
      ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(frame.canvas, rect.x, rect.y, rect.width, rect.height)
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
      if (!previous) {
        analyzeLocal(p, frozen, 0, pixels); reference = template = templatePixels(pixels, initial)
      } else {
        const match = matchTemplate(pixels, box, template!, reference!)
        const cut = isSceneCut(previous, pixels)
        if (cut || match.error > .18 || match.detail < templateDetail(reference!) * .25) {
          result.reason = cut ? 'scene-cut' : 'subject-lost'
          // Last good mask is visible only until the first untrusted sampled frame.
          result.end = time; break
        }
        box = match.box; template = templatePixels(pixels, box)
      }
      result.keys.push(movedKey(frozen, time, p.fps, seed, { x: box.x / sx, y: box.y / sy, width: box.width / sx, height: box.height / sy }))
      previous = pixels; progress((i + 1) / plan.times.length)
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    checkTrackingAbort(signal)
    if (result.keys.length < 2) throw new Error('Tracking lost the subject immediately. Select a tighter area or use SAM 3.')
    return result
  } finally { reader.dispose() }
}
