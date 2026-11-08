import { useStudio } from '../store'
import { durationOf } from '../core/animation'
import { ConfirmDialog } from './ui/ConfirmDialog'

export function SceneChangeDialog() {
  const s = useStudio(), change = s.pendingSceneChange
  if (!change) return null
  const duration = durationOf(s.project), fps = change.kind === 'fps'
  return <ConfirmDialog title={fps ? 'Change frame rate?' : 'Resize this scene?'} confirmLabel={fps ? `Apply ${change.fps} fps` : 'Apply size'} close={s.cancelSceneChange} confirm={s.applySceneChange}
    description={fps ? `${s.project.fps} → ${change.fps} fps. This ${duration.toFixed(2)}s scene changes from ${Math.ceil(duration * s.project.fps)} to ${Math.ceil(duration * change.fps)} frames. Playback, timeline frame numbers, snapping and Match scene export update together.` : `${s.project.width} × ${s.project.height} → ${change.width} × ${change.height} px. ${change.fit ? 'Scale and center the content to fit the new frame.' : 'Keep element positions and sizes. The canvas and scene map refit to the new frame.'}`}
    note={fps ? 'Animation timing stays in seconds, so duration and paths remain the same. Undo restores the previous FPS.' : 'Camera framing can change with the new aspect ratio. Undo restores the previous scene size.'}/>
}
