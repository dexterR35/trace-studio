export type Vec = { x: number; y: number; z: number }
export type CanvasPoint = { x: number; y: number }
export type BlockerKey = { time: number; x: number; y: number; width: number; height: number; rotation: number; opacity: number; vertices?: CanvasPoint[]; easing: 'linear' | 'hold' }
export type Blocker = { id: string; name: string; shape: 'rectangle' | 'ellipse' | 'polygon'; mode: 'solid' | 'cutout'; x: number; y: number; width: number; height: number; rotation: number; opacity: number; color: string; visible: boolean; locked: boolean; vertices?: CanvasPoint[]; start?: number; end?: number; animation?: BlockerKey[] }
export type VideoBackground = { id: string; name: string; src: string; duration: number; sourceStart: number; width: number; height: number; fit: 'contain' | 'cover'; muted: boolean; hasAudio: boolean; sections: number[] }
export type Point = Vec & { id: string; incoming: Vec; outgoing: Vec; scale: number; rx: number; ry: number; rz: number; opacity: number; speed: number; time: number; curve?: 'bezier' | 'linear'; handleMode?: 'auto' | 'aligned' | 'free' }
export type AssetTransform = Vec & { scale: number; rx: number; ry: number; rz: number; opacity: number }
export type MotionKey = AssetTransform & { id: string; time: number; easing: 'smooth' | 'linear' | 'hold' }
export type ModelAnimation = { fileName: string; clips: { name: string; duration: number }[]; clip: number | null; speed: number; start: number; offset: number; loop: boolean }
export type Layer = { direction?:CastDirection; id: string; name: string; kind: 'image' | 'shape' | 'text' | 'cube' | 'model'; src?: string; model?: ModelAnimation; text: string; shape: 'rectangle' | 'ellipse'; color: string; width: number; height: number; visible: boolean; locked: boolean; points: Point[]; delay: number; duration: number; timing: 'fixed' | 'auto' | 'keyframes'; baseSpeed: number; orient: boolean; motion?: MotionKey[] }
export type CameraSettings = { distance: number; zoom: number; dof: boolean; autofocus: boolean; focus: number; blur: number; focalLength: number | null; positionX: number; positionY: number; targetX: number; targetY: number; targetZ: number; roll: number }
export type FrameBox = { x:number; y:number; width:number; height:number }
export type CastDirection = { role:'character'|'prop'|'environment'|'effect'; description:string; identity:string; performance:string; includeReference:boolean; reference?:{src:string;name:string} }
export type FilmShot = { easingRange?:{start:number;end:number}; id:string; name:string; start:number; end:number; description:string; dialogue:string; sound:string; framing:'wide'|'medium'|'close-up'|'detail'|'custom'; targetId:string|null; region:FrameBox; follow:boolean; focusId:string|null; frameStart:FrameBox; frameEnd:FrameBox; zoomStart:number; zoomEnd:number; cameraStart:CameraSettings; cameraEnd:CameraSettings; easing:'linear'|'smooth'|'hold' }
export type Director = { enabled:boolean; duration:number; model:'seedance-2.0'|'seedance-2.5'; style:string; notes:string; audio:string; shots:FilmShot[] }
export type Project = { director?:Director; version: 1; name: string; mode: '2d' | '3d'; width: number; height: number; fps: number; background: 'transparent' | 'color'; backgroundColor: string; camera: CameraSettings; layers: Layer[]; blockers?: Blocker[]; video?: VideoBackground; measurement?: { unit: 'px' | 'cm'; ppi: number }; layout?: { x: number; y: number; width: number; height: number } }
export type Pose = Vec & { scale: number; rx: number; ry: number; rz: number; opacity: number; segment: number; t: number; progress: number }
export type Sample = Vec & { segment: number; t: number; distance: number; seconds: number }
export type PathData = { samples: Sample[]; nodeTimes: number[]; nodeDistances: number[]; length: number; duration: number }
export const id = () => crypto.randomUUID()
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
export const zero = (): Vec => ({ x: 0, y: 0, z: 0 })
export const POSITION_LIMIT = 1_000_000
