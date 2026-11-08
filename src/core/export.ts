import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, WebMOutputFormat, canEncodeVideo } from 'mediabunny'
import { zipSync } from 'fflate'
import { createFrameRenderer } from './renderer'
import { durationOf } from './animation'
import { downloadBlob } from './storage'
import type { Project } from './types'
import { cloneProject } from './project'
import { prepareVideoAudio } from './video'
import { exportCodecs, videoBitrate, type ExportFormat, type EncodingOptions } from './encoding'
export type { ExportFormat } from './encoding'
export async function exportScene(project: Project, format: ExportFormat, progress: (v: number) => void, signal?: AbortSignal, options: EncodingOptions & { range?: { start:number; end:number } } = {}): Promise<{ blob: Blob; name: string }> {
  const p = cloneProject(project)
  if (format === 'mp4') p.background = 'color'
  const start=options.range?.start??0,end=options.range?.end??durationOf(p)
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>durationOf(p)+1e-6)throw new Error('Invalid export time range.')
  if(options.range&&p.video)p.video.muted=true
  const renderer = await createFrameRenderer(p), frames = Math.ceil((end-start) * p.fps), name = p.name.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase() || 'trace-motion'
  const check = () => { if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError') }
  try {
    if (format === 'png') {
      const files: Record<string, Uint8Array> = {}
      for (let f = 0; f < frames; f++) { check(); await renderer.render(start + f / p.fps); const blob = await new Promise<Blob>((resolve, reject) => renderer.canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not render this frame.')), 'image/png')); files[`frames/frame-${String(f).padStart(5, '0')}.png`] = new Uint8Array(await blob.arrayBuffer()); progress((f + 1) / frames); if (f % 4 === 0) await new Promise(r => setTimeout(r, 0)) }
      return { blob: new Blob([zipSync(files, { level: 0 }) as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), name: `${name}-frames.zip` }
    }
    const transparent = format === 'webm' && p.background === 'transparent' && !p.video, codecs = exportCodecs(format, transparent), codec = options.codec ?? codecs[0]
    if (!codecs.includes(codec)) throw new Error('Choose VP9 / WebM for transparent video, or PNG frames for lossless alpha.')
    const config = { codec, bitrate: videoBitrate(p.width, p.height, p.fps, options.quality), alpha: transparent ? 'keep' as const : 'discard' as const, hardwareAcceleration: transparent ? 'prefer-software' as const : 'no-preference' as const, latencyMode: 'quality' as const, keyFrameInterval: 1 }
    if (!(await canEncodeVideo(codec, { ...config, width: p.width, height: p.height, frameRate: p.fps }))) throw new Error(`${codec.toUpperCase()} encoding is unavailable at this size in this browser. Choose another codec, use current Chrome / Edge, or export PNG frames.`)
    const target = new BufferTarget(), output = new Output({ target, format: format === 'webm' ? new WebMOutputFormat() : new Mp4OutputFormat({ fastStart: 'in-memory' }) })
    const source = new CanvasSource(renderer.canvas, config)
    output.addVideoTrack(source, { frameRate: p.fps })
    const audio = await prepareVideoAudio(p.video?{...p.video,duration:Math.min(p.video.duration,end-start)}:undefined, output, format)
    try { check(); await output.start(); for (let f = 0; f < frames; f++) { check(); await renderer.render(start + f / p.fps); await source.add(f / p.fps, 1 / p.fps); progress((f + 1) / frames); if (f % 4 === 0) await new Promise(r => setTimeout(r, 0)) }; check(); await audio?.write(check); check(); await output.finalize() } catch (e) { await output.cancel().catch(() => {}); throw e } finally { audio?.dispose() }
    return { blob: new Blob([target.buffer!], { type: format === 'webm' ? 'video/webm' : 'video/mp4' }), name: `${name}.${format}` }
  } finally { renderer.dispose() }
}
export { downloadBlob }
