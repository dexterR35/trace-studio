import { clamp, type Layer } from './types'

export function modelClip(layer: Layer) {
  const model = layer.kind === 'model' ? layer.model : undefined
  return model && model.clip !== null ? model.clips[model.clip] ?? null : null
}

/** Evaluate from scene time, so scrubbing, backwards seeks and export agree. */
export function modelTimeAt(layer: Layer, sceneTime: number, duration = modelClip(layer)?.duration ?? 0) {
  const model = layer.model
  if (!model || model.clip === null) return null
  if (duration <= 0) return 0
  const time = Math.max(0, sceneTime - layer.delay - model.start) * model.speed + clamp(model.offset, 0, duration)
  return model.loop ? time % duration : clamp(time, 0, duration)
}

export function modelAnimationEnd(layer: Layer) {
  const clip = modelClip(layer), model = layer.model
  // Include at least the first pass, even if its start is beyond the drawn path.
  return clip && model ? model.start + Math.max(0, clip.duration - model.offset) / model.speed : 0
}
