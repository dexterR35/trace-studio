import { ALL_FORMATS, AudioSampleSink, AudioSampleSource, BlobSource, CanvasSink, Input, canEncodeAudio, type Output } from 'mediabunny'
import { clamp, id, type VideoBackground } from './types'

export const MAX_VIDEO_SECONDS = 30
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024
const videoPrefix = /^data:video\/(?:mp4|webm|quicktime);base64,/

export function parseVideo(value: VideoBackground): VideoBackground {
  if (!value || typeof value.src !== 'string' || !videoPrefix.test(value.src) || value.src.length > MAX_VIDEO_BYTES * 4 / 3 + 100 || ![value.duration, value.width, value.height, value.sourceStart].every(Number.isFinite) || value.duration <= 0 || value.duration > MAX_VIDEO_SECONDS + .001 || value.width < 1 || value.height < 1 || value.width > 16384 || value.height > 16384 || value.sourceStart < 0) throw new Error('Choose an embedded MP4, WebM or MOV video up to 30 seconds and 100 MB.')
  if (!Array.isArray(value.sections) || value.sections.length > 100 || value.sections.some(t => !Number.isFinite(t) || t <= 0 || t >= value.duration)) throw new Error('Invalid video section markers.')
  return { id: id(), name: String(value.name ?? 'Video').slice(0, 150), src: value.src, duration: value.duration, sourceStart: value.sourceStart, width: value.width, height: value.height, fit: value.fit === 'cover' ? 'cover' : 'contain', muted: value.muted === true, hasAudio: value.hasAudio === true, sections: [...new Set(value.sections)].sort((a, b) => a - b) }
}

export function videoBlob(src: string) {
  if (!videoPrefix.test(src)) throw new Error('The video must be embedded in this project.')
  const comma = src.indexOf(','), decoded = atob(src.slice(comma + 1)), bytes = new Uint8Array(decoded.length)
  for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i)
  return new Blob([bytes], { type: src.slice(5, src.indexOf(';')) })
}

export async function importVideo(file: File): Promise<VideoBackground> {
  if (file.size > MAX_VIDEO_BYTES) throw new Error('Choose a video smaller than 100 MB.')
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
  try {
    const track = await input.getPrimaryVideoTrack()
    if (!track || !(await track.canDecode())) throw new Error('This browser cannot decode that video. Try an H.264 MP4 or VP9 WebM.')
    const sourceStart = Math.max(0, await track.getFirstTimestamp()), duration = await track.computeDuration() - sourceStart
    if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_VIDEO_SECONDS + .001) throw new Error('Videos can be up to 30 seconds. Trim the video to 30 seconds before importing.')
    const audio = await input.getPrimaryAudioTrack()
    if (audio && !(await audio.canDecode())) throw new Error('The audio codec is unsupported. Try an MP4 with AAC audio or a WebM with Opus audio.')
    const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.onerror = () => reject(new Error('Could not read the video.')); reader.readAsDataURL(file) })
    const mime = /\.webm$/i.test(file.name) ? 'video/webm' : /\.mov$/i.test(file.name) ? 'video/quicktime' : 'video/mp4'
    return { id: id(), name: file.name, src: `data:${mime};base64,${data.slice(data.indexOf(',') + 1)}`, duration, sourceStart, width: await track.getDisplayWidth(), height: await track.getDisplayHeight(), fit: 'contain', muted: false, hasAudio: !!audio, sections: [] }
  } finally { input.dispose() }
}

export function videoPlacement(video: Pick<VideoBackground, 'width' | 'height' | 'fit'>, width: number, height: number) {
  const scale = video.fit === 'cover' ? Math.max(width / video.width, height / video.height) : Math.min(width / video.width, height / video.height)
  const w = video.width * scale, h = video.height * scale
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h }
}

export async function createVideoReader(video: VideoBackground) {
  const input = new Input({ source: new BlobSource(videoBlob(video.src)), formats: ALL_FORMATS })
  try {
    const track = await input.getPrimaryVideoTrack()
    if (!track || !(await track.canDecode())) throw new Error('The video cannot be decoded in this browser.')
    const sink = new CanvasSink(track, { poolSize: 2 })
    return { input, frame: (time: number) => sink.getCanvas(video.sourceStart + clamp(time, 0, Math.max(0, video.duration - .0001))), dispose: () => input.dispose() }
  } catch (error) { input.dispose(); throw error }
}

export async function prepareVideoAudio(video: VideoBackground | undefined, output: Output, format: 'mp4' | 'webm') {
  if (!video || video.muted || !video.hasAudio) return null
  const input = new Input({ source: new BlobSource(videoBlob(video.src)), formats: ALL_FORMATS })
  try {
    const track = await input.getPrimaryAudioTrack()
    if (!track) { input.dispose(); return null }
    const codec = format === 'mp4' ? 'aac' : 'opus'
    if (!(await track.canDecode()) || !(await canEncodeAudio(codec, { numberOfChannels: await track.getNumberOfChannels(), sampleRate: await track.getSampleRate() }))) throw new Error('Original audio cannot be encoded in this browser. Try another export format or turn off video audio.')
    const source = new AudioSampleSource({ codec, bitrate: 128_000 }); output.addAudioTrack(source)
    return { dispose: () => input.dispose(), write: async (check: () => void) => {
      for await (const sample of new AudioSampleSink(track).samples(video.sourceStart, video.sourceStart + video.duration)) {
        try {
          check(); const start = Math.max(0, Math.ceil((video.sourceStart - sample.timestamp) * sample.sampleRate)), end = Math.min(sample.numberOfFrames, Math.floor((video.sourceStart + video.duration - sample.timestamp) * sample.sampleRate))
          if (end <= start) continue
          const clipped = sample.trim(start, end)
          try { clipped.setTimestamp(Math.max(0, clipped.timestamp - video.sourceStart)); await source.add(clipped) } finally { clipped.close() }
        } finally { sample.close() }
      }
    } }
  } catch (error) { input.dispose(); throw error }
}
