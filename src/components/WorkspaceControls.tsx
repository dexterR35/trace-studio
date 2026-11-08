import { PanelLeft, PanelRight, PanelBottom, Maximize, Minimize } from 'lucide-react'
import { useStudio } from '../store'

export function toggleProperties() {
  const s = useStudio.getState()
  s.set(globalThis.innerWidth <= 1000 ? { propertiesOpen: !s.propertiesOpen, propertiesCollapsed: false } : { propertiesCollapsed: !s.propertiesCollapsed })
}
export function openPropertiesSection(section: 'scene' | 'camera') {
  const s = useStudio.getState()
  s.set({ sceneExpanded: false, propertiesOpen: true, propertiesCollapsed: false, ...(section === 'scene' ? { sceneSettingsOpen: true } : { cameraSettingsOpen: true }) })
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
}
export function WorkspaceControls() {
  const s = useStudio()
  async function expand() {
    const expanded = !s.sceneExpanded; s.set({ sceneExpanded: expanded })
    try { if (expanded) await document.documentElement.requestFullscreen(); else if (document.fullscreenElement) await document.exitFullscreen() } catch { /* The expanded editor also works where browser fullscreen is unavailable. */ }
  }
  return <div className="workspace-layout-bar"><button aria-label="Toggle layers panel" aria-pressed={!s.layersCollapsed} onClick={() => s.set({ layersCollapsed: !s.layersCollapsed })}><PanelLeft size={13}/><span>Layers</span></button><button aria-label="Toggle properties panel" aria-pressed={!s.propertiesCollapsed && (globalThis.innerWidth > 1000 || s.propertiesOpen)} onClick={toggleProperties}><PanelRight size={13}/><span>Properties</span></button><button aria-label="Toggle timeline panel" aria-pressed={!s.timelineCollapsed} onClick={() => s.set({ timelineCollapsed: !s.timelineCollapsed })}><PanelBottom size={13}/><span>Timeline</span></button><button className="expand-scene" aria-label={s.sceneExpanded ? 'Exit full scene' : 'Full scene'} aria-pressed={s.sceneExpanded} onClick={expand}>{s.sceneExpanded ? <Minimize size={13}/> : <Maximize size={13}/>}<span>{s.sceneExpanded ? 'Exit full scene' : 'Full scene'}</span></button></div>
}
