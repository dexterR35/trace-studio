export type XY = { x: number; y: number }
export type Bounds = XY & { width: number; height: number; area: number }
export type Measure = { id: string; name: string; points: XY[]; kind: 'distance' | 'angle' }
export type Part = { id: string; name: string; color: string; mask: Uint8ClampedArray; enabled: boolean; origin: string }
export type Appearance = { colors: { hex: string; fraction: number }[]; material: string; finish: string; gradient: { from: string; to: string; direction: string }; notes: string; origin: string }
export type Subject = { id: string; name: string; mask: Uint8ClampedArray; origin: string; parts: Part[]; measures: Measure[]; outline: XY[][]; landmarks: { name: string; point: XY; confidence?: number }[]; appearance?: Appearance; approved: boolean; draft?:boolean }
export type PickProject = { version: 1; id: string; name: string; image: { name: string; src: string; width: number; height: number }; subjects: Subject[]; calibration: { pixels: number; centimeters: number } | null; constraints: Record<string, 'keep' | 'change'>; changes: string; perspective?: {corners:XY[];width:number;height:number;matrix:number[]}; depth?: { model: string; relative: boolean; preview: string; points: number[][]; origin: string } }
export type Tool = 'select' | 'box' | 'lasso' | 'brush' | 'erase' | 'measure' | 'angle' | 'point' | 'vector' | 'hand' | 'sample' | 'perspective'
export type Page = 'select' | 'analyze' | 'export' | 'assets' | 'models' | 'help' | 'projects'
export const uid = () => crypto.randomUUID()
export function emptyProject(): PickProject { return { version: 1, id: uid(), name: 'Untitled reference', image: { name: '', src: '', width: 0, height: 0 }, subjects: [], calibration: null, constraints: { Silhouette: 'keep', Pose: 'keep', Proportions: 'keep', Colors: 'keep', Material: 'keep', Background: 'change' }, changes: '' } }
