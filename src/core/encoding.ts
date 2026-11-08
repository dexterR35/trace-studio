import type { VideoCodec } from 'mediabunny'

export type ExportFormat = 'webm' | 'mp4' | 'png'
export type ExportQuality = 'standard' | 'high' | 'maximum'
export type EncodingOptions = { codec?: VideoCodec; quality?: ExportQuality }
export const codecNames: Partial<Record<VideoCodec, string>> = { vp9: 'VP9 · recommended for alpha', vp8: 'VP8 · older WebM players', av1: 'AV1 · efficient, newer devices', avc: 'H.264 · widest compatibility', hevc: 'H.265 / HEVC · smaller files' }

export function exportCodecs(format: ExportFormat, transparent: boolean): VideoCodec[] {
  if (format === 'png') return []
  if (format === 'webm') return transparent ? ['vp9'] : ['vp9', 'av1', 'vp8']
  return ['avc', 'hevc', 'av1']
}
export function videoBitrate(width: number, height: number, fps: number, quality: ExportQuality = 'high') {
  return Math.round(Math.max(2_000_000, width * height * fps * ({ standard: .1, high: .2, maximum: .4 }[quality])))
}
