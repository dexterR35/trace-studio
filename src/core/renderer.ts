import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { buildPath, poseAt } from './animation'
import { configureCamera, focusDepth } from './camera'
import { directorAt } from './director'
import { disposeGuides, fitMapCamera, mapBounds, sceneCameraGuides, sceneFrameGuides, worldPoint, type MapAngle, type MapFrame } from './map'
import { POSITION_LIMIT, clamp, type Layer, type Pose, type Project, type Vec } from './types'
import { createModelInstance, loadModel, pruneModels } from './models'
import { blockerAt, drawBlockers } from './blockers'
import { createVideoReader, videoPlacement } from './video'

const imageCache = new Map<string, Promise<HTMLImageElement>>()
export function loadImage(src: string) { let promise = imageCache.get(src); if (!promise) { promise = new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('Could not load the image. Try a PNG, JPEG, SVG or WebP file.')); img.src = src }); imageCache.set(src, promise) }; return promise }
const images = new Map<string, HTMLImageElement>()
export async function prepareAssets(project: Project) {
  await Promise.all(project.layers.map(async layer => { if (!layer.src) return; if (layer.kind === 'image') images.set(layer.src, await loadImage(layer.src)); if (layer.kind === 'model') await loadModel(layer.src) }))
  pruneModels(new Set(project.layers.filter(layer => layer.kind === 'model' && layer.src).map(layer => layer.src!)))
}

export function draw2D(canvas: HTMLCanvasElement, project: Project, time: number, width = project.width, height = project.height) {
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
  const ctx = canvas.getContext('2d', { alpha: true })!; ctx.clearRect(0, 0, width, height); ctx.save(); ctx.scale(width / project.width, height / project.height)
  if (project.background === 'color') { ctx.fillStyle = project.backgroundColor; ctx.fillRect(0, 0, project.width, project.height) }
  for (const l of project.layers) {
    if (!l.visible || time < l.delay) continue
    const p = poseAt(l, time); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rz * Math.PI / 180); ctx.scale(p.scale, p.scale); ctx.globalAlpha = p.opacity
    if (l.kind === 'image') { const image = l.src && images.get(l.src); if (image) ctx.drawImage(image, -l.width / 2, -l.height / 2, l.width, l.height) }
    else if (l.kind === 'text') { ctx.fillStyle = l.color; ctx.font = `600 ${Math.max(12, l.height * .7)}px Inter, Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(l.text, 0, 0, l.width) }
    else { ctx.fillStyle = l.color; ctx.beginPath(); if (l.shape === 'ellipse') ctx.ellipse(0, 0, l.width / 2, l.height / 2, 0, 0, Math.PI * 2); else ctx.roundRect(-l.width / 2, -l.height / 2, l.width, l.height, Math.min(24, l.width / 8)); ctx.fill() }
    ctx.restore()
  }
  drawBlockers(ctx, project, time); ctx.restore()
}

type Item = { mesh: THREE.Object3D; material?: THREE.Material; signature: string; src?: string; model?: ReturnType<typeof createModelInstance> }
export type MapPoint = { index: number; x: number; y: number; visible: boolean }
const vertexShader = `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`
const fragmentShader = `
uniform sampler2D image;uniform sampler2D depth;uniform vec2 resolution;uniform float nearPlane;uniform float farPlane;uniform float focus;uniform float blur;varying vec2 vUv;
float linearDepth(float z){return (2.0*nearPlane*farPlane)/(farPlane+nearPlane-(z*2.0-1.0)*(farPlane-nearPlane));}
float radiusAt(vec2 uv){
 // Color is bilinear; use the nearest foreground depth in its same four-texel footprint.
 // Otherwise a partly transparent edge can inherit the empty background's far depth.
 vec2 texel=(floor(uv*resolution-.5)+.5)/resolution;vec2 stepUV=1./resolution;
 float z=min(min(texture2D(depth,texel).x,texture2D(depth,texel+vec2(stepUV.x,0.)).x),min(texture2D(depth,texel+vec2(0.,stepUV.y)).x,texture2D(depth,texel+stepUV).x));
 float d=linearDepth(z);return clamp(abs(d-focus)/max(d,1.)*blur,0.,blur);}
void main(){float r=radiusAt(vUv);vec4 center=texture2D(image,vUv);vec4 result=center;float total=1.;
 // Keep focused edges sharp. A filled disk avoids the old sparse, moving blur ring.
 if(r>.5){for(int i=0;i<48;i++){float fraction=(float(i)+.5)/48.;float angle=float(i)*2.39996323;vec2 offset=vec2(cos(angle),sin(angle))*sqrt(fraction)*r;vec2 uv=clamp(vUv+offset/resolution,vec2(0.),vec2(1.));float weight=exp(-2.*fraction);vec4 sampleColor=texture2D(image,uv);float sourceRadius=sampleColor.a>.00001?radiusAt(uv):r;
 // In-focus foreground must not bleed into an out-of-focus transparent background.
 float coverage=smoothstep(length(offset)-.5,length(offset)+.5,sourceRadius);result+=sampleColor*weight*coverage;total+=weight;}}
 gl_FragColor=result/total;
 // The target stores premultiplied linear RGBA. Convert straight color, then restore it.
 if(gl_FragColor.a>0.00001)gl_FragColor.rgb/=gl_FragColor.a;
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 gl_FragColor.rgb*=gl_FragColor.a;
}`

export class SceneRenderer {
  canvas: HTMLCanvasElement; renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(); items = new Map<string, Item>(); project: Project | null = null
  target: THREE.WebGLRenderTarget; postScene = new THREE.Scene(); postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); postMaterial: THREE.ShaderMaterial
  mapCamera = new THREE.PerspectiveCamera(43, 1, 1, 20000); orbit: OrbitControls | null = null; transform: TransformControls | null = null; helpers = new THREE.Group(); mapMode: boolean; frameTime = 0; changePoint?: (p: Vec) => void; mapUpdated?: (points: MapPoint[]) => void; activeProxy = new THREE.Object3D(); private helperSignature = ''; private mapLayer: Layer | null = null
  cameraGuides = false; mapAngle: MapAngle = 'perspective'; private mapNeedsFit = true; private fitting = false; private mapPoint: number | null = null; private mapFormat = ''
  private renderSize = new THREE.Vector2()
  private environment: THREE.WebGLRenderTarget | null = null
  private blockerScene = new THREE.Scene()
  private blockerCamera = new THREE.OrthographicCamera(0, 1, 0, 1, -1, 1)
  private blockerItems = new Map<string, { mesh: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>; signature: string }>()
  constructor(canvas: HTMLCanvasElement, map = false) {
    this.canvas = canvas; this.mapMode = map
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true }); this.renderer.setPixelRatio(1); this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.target = new THREE.WebGLRenderTarget(1, 1, { depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType), format: THREE.RGBAFormat, samples: Math.min(4, this.renderer.capabilities.maxSamples) }); this.target.texture.colorSpace = THREE.LinearSRGBColorSpace
    this.postMaterial = new THREE.ShaderMaterial({ uniforms: { image: { value: this.target.texture }, depth: { value: this.target.depthTexture }, resolution: { value: new THREE.Vector2(1, 1) }, nearPlane: { value: 1 }, farPlane: { value: 10000 }, focus: { value: 1000 }, blur: { value: 12 } }, vertexShader, fragmentShader, depthTest: false, depthWrite: false, transparent: false })
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMaterial))
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#a8a49e', 2.2)); const light = new THREE.DirectionalLight('#ffffff', 2); light.position.set(-600, 800, 1200); this.scene.add(light)
    if (map) {
      this.mapCamera.position.set(1400, 1000, 1700); this.orbit = new OrbitControls(this.mapCamera, canvas); this.orbit.target.set(0, 0, 0); this.orbit.enableDamping = false; this.orbit.minDistance = 50; this.orbit.maxDistance = 6000; this.orbit.update(); this.orbit.addEventListener('change', () => { if (this.fitting) return; this.mapAngle = 'free'; this.render(this.frameTime) })
      this.scene.add(this.helpers); this.scene.add(this.activeProxy); this.transform = new TransformControls(this.mapCamera, canvas); this.transform.setMode('translate'); this.transform.setSize(.95); this.scene.add(this.transform.getHelper()); this.transform.addEventListener('dragging-changed', e => { if (this.orbit) this.orbit.enabled = !e.value }); this.transform.addEventListener('change', () => { canvas.style.cursor = this.transform?.dragging ? 'grabbing' : this.transform?.axis ? 'grab' : ''; this.render(this.frameTime) }); this.transform.addEventListener('objectChange', () => { if (this.project) { this.activeProxy.position.z = clamp(this.activeProxy.position.z, -POSITION_LIMIT, POSITION_LIMIT); this.changePoint?.({ x: this.activeProxy.position.x + this.project.width / 2, y: this.project.height / 2 - this.activeProxy.position.y, z: this.activeProxy.position.z }) } })
    }
  }
  configure(project: Project) { this.project = project; configureCamera(this.camera, project,this.frameTime,this.mapMode); const format = `${project.width}x${project.height}`; if (format !== this.mapFormat) { this.mapFormat = format; this.mapNeedsFit = true } }
  frameMap(kind: MapFrame = 'scene', angle = this.mapAngle, redraw = true) {
    if (!this.project || !this.orbit) return
    this.fitting = true; this.mapNeedsFit = false; this.mapAngle = angle
    const bounds = mapBounds(this.project, this.mapLayer, kind, this.mapPoint,this.frameTime), target = fitMapCamera(this.mapCamera, bounds, angle, this.orbit.target)
    this.orbit.target.copy(target); this.orbit.minDistance = Math.max(20, Math.min(this.project.width, this.project.height) * .05); this.orbit.maxDistance = Math.max(6000, bounds.getSize(new THREE.Vector3()).length() * 12, this.project.width * 12, this.project.height * 12); this.orbit.update(); this.fitting = false
    if (redraw) this.render(this.frameTime)
  }
  private textureFor(layer: Layer): THREE.Texture | null {
    if (layer.kind === 'image') { const img = layer.src && images.get(layer.src); if (!img) return null; const t = new THREE.Texture(img); t.needsUpdate = true; t.colorSpace = THREE.SRGBColorSpace; return t }
    if (layer.kind === 'cube') return null
    const canvas = document.createElement('canvas'); canvas.width = Math.round(layer.width * 2); canvas.height = Math.round(layer.height * 2); const ctx = canvas.getContext('2d')!; ctx.scale(2, 2); ctx.fillStyle = layer.color
    if (layer.kind === 'text') { ctx.font = `600 ${layer.height * .7}px Inter, Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(layer.text, layer.width / 2, layer.height / 2, layer.width) }
    else { ctx.beginPath(); if (layer.shape === 'ellipse') ctx.ellipse(layer.width / 2, layer.height / 2, layer.width / 2, layer.height / 2, 0, 0, Math.PI * 2); else ctx.roundRect(0, 0, layer.width, layer.height, Math.min(24, layer.width / 8)); ctx.fill() }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture
  }
  sync(project: Project) {
    this.configure(project)
    if (project.layers.some(layer => layer.kind === 'model') && !this.environment) {
      const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(this.renderer)
      this.environment = pmrem.fromScene(room, .04); this.scene.environment = this.environment.texture; this.scene.environmentIntensity = .8; room.dispose(); pmrem.dispose()
    }
    if (!project.layers.some(layer => layer.kind === 'model') && this.environment) { this.scene.environment = null; this.environment.dispose(); this.environment = null }
    for (const [id, item] of this.items) if (!project.layers.some(l => l.id === id)) { this.disposeItem(item); this.items.delete(id) }
    project.layers.forEach((layer, i) => {
      const signature = layer.kind === 'model' ? 'model' : `${layer.kind}:${layer.color}:${layer.width}:${layer.height}:${layer.text}:${layer.shape}`, existing = this.items.get(layer.id)
      if (existing?.signature === signature && existing.src === layer.src) return
      if (layer.kind === 'model') {
        const model = createModelInstance(layer.src!); model.root.traverse(object => { if ((object as THREE.Mesh).isMesh) object.renderOrder = i })
        if (existing) this.disposeItem(existing)
        this.items.set(layer.id, { mesh: model.root, model, signature, src: layer.src }); this.scene.add(model.root); return
      }
      if (existing) this.disposeItem(existing)
      const geometry = layer.kind === 'cube' ? new THREE.BoxGeometry(layer.width, layer.height, Math.min(layer.width, layer.height)) : new THREE.PlaneGeometry(layer.width, layer.height)
      const material = layer.kind === 'cube' ? new THREE.MeshStandardMaterial({ color: layer.color, transparent: true, roughness: .4 }) : new THREE.MeshBasicMaterial({ map: this.textureFor(layer), transparent: true, side: THREE.DoubleSide, alphaTest: .001, depthWrite: true })
      const mesh = new THREE.Mesh(geometry, material); mesh.renderOrder = i; this.items.set(layer.id, { mesh, material, signature, src: layer.src }); this.scene.add(mesh)
    })
  }
  private disposeItem(item: Item) { this.scene.remove(item.mesh); if (item.model) { item.model.dispose(); return }; (item.mesh as THREE.Mesh).geometry.dispose(); const material = item.material as THREE.MeshBasicMaterial; material.map?.dispose(); material.dispose() }
  private syncBlockers(p: Project, time: number) {
    this.blockerCamera.right = p.width; this.blockerCamera.bottom = p.height; this.blockerCamera.updateProjectionMatrix()
    for (const [id, item] of this.blockerItems) if (!p.blockers?.some(b => b.id === id)) { this.blockerScene.remove(item.mesh); item.mesh.geometry.dispose(); item.mesh.material.dispose(); this.blockerItems.delete(id) }
    p.blockers?.forEach((original, i) => {
      const b = blockerAt(original, time)
      const signature = JSON.stringify([b.shape, b.vertices]); let item = this.blockerItems.get(b.id)
      if (!item || item.signature !== signature) {
        if (item) { this.blockerScene.remove(item.mesh); item.mesh.geometry.dispose(); item.mesh.material.dispose() }
        const shape = new THREE.Shape()
        if (b.shape === 'ellipse') shape.absellipse(0, 0, .5, .5, 0, Math.PI * 2, false, 0)
        else if (b.shape === 'polygon') { b.vertices?.forEach((v, index) => index ? shape.lineTo(v.x - .5, v.y - .5) : shape.moveTo(v.x - .5, v.y - .5)); shape.closePath() }
        else { shape.moveTo(-.5, -.5); shape.lineTo(.5, -.5); shape.lineTo(.5, .5); shape.lineTo(-.5, .5); shape.closePath() }
        const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape, 64), new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false }))
        item = { mesh, signature }; this.blockerItems.set(b.id, item); this.blockerScene.add(mesh)
      }
      const { mesh } = item, cutout = b.mode === 'cutout' && p.background === 'transparent', material = mesh.material
      mesh.visible = b.visible && b.opacity > 0; mesh.renderOrder = i; mesh.position.set(b.x, b.y, 0); mesh.scale.set(b.width, b.height, 1); mesh.rotation.z = b.rotation * Math.PI / 180
      material.color.set(b.mode === 'cutout' ? p.backgroundColor : b.color); material.opacity = b.opacity; material.blending = cutout ? THREE.CustomBlending : THREE.NormalBlending
      material.blendEquation = THREE.AddEquation; material.blendSrc = THREE.ZeroFactor; material.blendDst = THREE.OneMinusSrcAlphaFactor; material.blendSrcAlpha = THREE.ZeroFactor; material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor
    })
  }
  render(time: number, width?: number, height?: number) {
    const p = this.project; if (!p) return; this.frameTime = time; if(this.mapMode)configureCamera(this.camera,p,time)
    const w = Math.max(1, Math.round(width || this.canvas.width)), h = Math.max(1, Math.round(height || this.canvas.height)); this.renderer.getSize(this.renderSize); if (this.renderSize.x !== w || this.renderSize.y !== h || this.canvas.width !== w || this.canvas.height !== h) { this.renderer.setSize(w, h, false); if (this.mapMode) this.mapNeedsFit = true }
    for (const layer of p.layers) { const item = this.items.get(layer.id); if (!item) continue; const pos = poseAt(layer, time); item.mesh.visible = layer.visible && time >= layer.delay; item.mesh.position.set(pos.x - p.width / 2, p.height / 2 - pos.y, pos.z); item.mesh.rotation.set(-pos.rx * Math.PI / 180, -pos.ry * Math.PI / 180, -pos.rz * Math.PI / 180); item.mesh.scale.setScalar(pos.scale); if (item.model) item.model.update(layer, time, pos.opacity); else item.material!.opacity = pos.opacity }
    if (this.mapMode) { this.mapCamera.aspect = w / h; this.mapCamera.updateProjectionMatrix(); if (this.mapNeedsFit) this.frameMap('scene', this.mapAngle, false); this.renderer.setClearColor('#171717', 1); this.renderer.setRenderTarget(null); this.renderer.render(this.scene, this.mapCamera); this.mapUpdated?.(this.mapPoints()); return }
    const view = directorAt(p, time); configureCamera(this.camera, p, time, false)
    this.renderer.setClearColor(p.backgroundColor, p.background === 'color' ? 1 : 0)
    if (view.camera.dof) {
      if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h)
      this.renderer.setRenderTarget(this.target); this.renderer.render(this.scene, this.camera); this.renderer.setRenderTarget(null)
      const front = p.layers.find(l => l.visible), depth = front ? focusDepth(p, poseAt(front, time), time) : view.camera.focus
      this.postMaterial.uniforms.focus.value = view.camera.autofocus ? depth : view.camera.focus; this.postMaterial.uniforms.blur.value = view.camera.blur * w / p.width; this.postMaterial.uniforms.nearPlane.value = this.camera.near; this.postMaterial.uniforms.farPlane.value = this.camera.far; this.postMaterial.uniforms.resolution.value.set(w, h); this.renderer.render(this.postScene, this.postCamera)
    } else { this.renderer.setRenderTarget(null); this.renderer.render(this.scene, this.camera) }
    this.syncBlockers(p, time)
    if (this.blockerItems.size) { const autoClear = this.renderer.autoClear; this.renderer.autoClear = false; this.renderer.render(this.blockerScene, this.blockerCamera); this.renderer.autoClear = autoClear }
  }
  projectPoint(v: Vec): { x: number; y: number } { const p = this.project!; const world = new THREE.Vector3(v.x - p.width / 2, p.height / 2 - v.y, p.mode === '2d' ? 0 : v.z).project(this.camera); return { x: (world.x + 1) * p.width / 2, y: (1 - world.y) * p.height / 2 } }
  unprojectPoint(x: number, y: number, z: number): Vec { const p = this.project!, ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(x / p.width * 2 - 1, 1 - y / p.height * 2), this.camera); const result = new THREE.Vector3(); ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -z), result); return { x: result.x + p.width / 2, y: p.height / 2 - result.y, z } }
  mapPoints(): MapPoint[] {
    const p = this.project; if (!p || !this.mapLayer) return []
    return this.mapLayer.points.map((point, index) => { const q = new THREE.Vector3(point.x - p.width / 2, p.height / 2 - point.y, point.z).project(this.mapCamera); return { index, x: (q.x + 1) * this.canvas.clientWidth / 2, y: (1 - q.y) * this.canvas.clientHeight / 2, visible: q.z >= -1 && q.z <= 1 && Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1 } })
  }
  mapCameraMarker() {
    const q = this.camera.position.clone().project(this.mapCamera)
    return { x: (q.x + 1) * this.canvas.clientWidth / 2, y: (1 - q.y) * this.canvas.clientHeight / 2, visible: q.z >= -1 && q.z <= 1 && Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1 }
  }
  setMapLayer(layer: Layer | null, point: number | null) {
    if (!this.mapMode || !this.project) return
    this.mapLayer = layer; this.mapPoint = point
    const signature = JSON.stringify([layer?.id, layer?.points, point, this.project.width, this.project.height, this.project.camera, this.project.director?.enabled?directorAt(this.project,this.frameTime):null, this.cameraGuides])
    if (signature !== this.helperSignature) {
      this.helperSignature = signature
      disposeGuides(this.helpers)
      const p = this.project, unit = Math.max(p.width, p.height) / 1280; this.helpers.add(sceneFrameGuides(p))
      if (layer) {
        const vertices = buildPath(layer).samples.map(v => new THREE.Vector3(v.x - p.width / 2, p.height / 2 - v.y, v.z)); this.helpers.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(vertices), new THREE.LineBasicMaterial({ color: '#ee4623' })))
        layer.points.forEach((node, index) => { const marker = new THREE.Mesh(new THREE.SphereGeometry((index === point ? 12 : 9) * unit, 10, 8), new THREE.MeshBasicMaterial({ color: index === point ? '#ee4623' : index === 0 ? '#e7e0d6' : index === layer.points.length - 1 ? '#edb69c' : '#e7e0d6', depthTest: false })); marker.position.copy(worldPoint(p, node)); this.helpers.add(marker) })
        const node = point !== null ? layer.points[point] : null
        if (node) {
          const at = worldPoint(p, node), base = at.clone().setZ(0), material = new THREE.LineDashedMaterial({ color: '#91bee5', dashSize: 9 * unit, gapSize: 6 * unit, depthTest: false })
          const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([at, base]), material); line.name = 'Depth to base'; line.computeLineDistances(); this.helpers.add(line)
          const foot = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 24 }, (_, i) => new THREE.Vector3(base.x + Math.cos(i / 24 * Math.PI * 2) * 13 * unit, base.y + Math.sin(i / 24 * Math.PI * 2) * 13 * unit, 0))), new THREE.LineBasicMaterial({ color: '#91bee5', depthTest: false })); this.helpers.add(foot)
        }
      }
      if (this.cameraGuides) this.helpers.add(sceneCameraGuides(p,this.frameTime))
    }
    if (layer && !layer.locked && point !== null && layer.points[point]) { const pos = layer.points[point]; if (!this.transform?.dragging) this.activeProxy.position.set(pos.x - this.project.width / 2, this.project.height / 2 - pos.y, pos.z); if (this.transform?.object !== this.activeProxy) this.transform?.attach(this.activeProxy) } else this.transform?.detach()
  }
  dispose() { this.orbit?.dispose(); this.transform?.dispose(); this.mapUpdated = undefined; disposeGuides(this.helpers); for (const item of this.items.values()) this.disposeItem(item); for (const item of this.blockerItems.values()) { item.mesh.geometry.dispose(); item.mesh.material.dispose() }; this.blockerItems.clear(); this.postScene.traverse(child => (child as THREE.Mesh).geometry?.dispose()); this.environment?.dispose(); this.target.dispose(); this.postMaterial.dispose(); this.renderer.dispose() }
}

export type FrameRenderer = { canvas: HTMLCanvasElement; sync: (p: Project) => void; render: (time: number) => void | Promise<void>; dispose: () => void }
export async function createFrameRenderer(project: Project, outputCanvas?: HTMLCanvasElement): Promise<FrameRenderer> {
  await prepareAssets(project)
  const reader = project.video ? await createVideoReader(project.video) : null
  const canvas = outputCanvas ?? document.createElement('canvas'), overlayCanvas = document.createElement('canvas'), composite = document.createElement('canvas')
  canvas.width = overlayCanvas.width = composite.width = project.width; canvas.height = overlayCanvas.height = composite.height = project.height
  let scene: SceneRenderer | null = null, current = project, disposed = false, pending = Promise.resolve(), request = 0
  try { scene = project.mode === '3d' ? new SceneRenderer(overlayCanvas) : null } catch (error) { reader?.dispose(); throw error }
  function draw(p: Project, time: number, videoFrame?: HTMLCanvasElement | OffscreenCanvas) {
    const overlay: Project = reader ? { ...p, background: 'transparent' } : p
    if (scene) { scene.sync(overlay); scene.render(time, p.width, p.height) } else draw2D(overlayCanvas, overlay, time)
    for (const c of [canvas,composite]) if(c.width!==p.width||c.height!==p.height){c.width=p.width;c.height=p.height}
    const ctx=composite.getContext('2d')!;ctx.clearRect(0,0,p.width,p.height)
    if(videoFrame){const rect=videoPlacement(p.video!,p.width,p.height);ctx.fillStyle=p.backgroundColor;ctx.fillRect(0,0,p.width,p.height);ctx.drawImage(videoFrame,rect.x,rect.y,rect.width,rect.height)}
    ctx.drawImage(overlayCanvas,0,0)
    const out=canvas.getContext('2d')!,f=directorAt(p,time).frame;out.clearRect(0,0,p.width,p.height)
    if(p.background==='color'||videoFrame){out.fillStyle=p.backgroundColor;out.fillRect(0,0,p.width,p.height)}
    // Crop the complete composition, including background footage and screen-space blockers.
    out.drawImage(composite,-f.x*p.width/f.width,-f.y*p.height/f.height,p.width/f.width,p.height/f.height)
  }
  return { canvas, sync: p => { current = p }, render: time => {
    const p = current, serial = ++request
    if (!reader) { if (!disposed) draw(p, time); return }
    const job = async () => {
      if (disposed || (outputCanvas && serial !== request)) return
      const frame = await reader.frame(time)
      if (disposed || (outputCanvas && serial !== request)) return
      if (!frame) throw new Error('Could not decode this video frame.')
      draw(p,time,frame.canvas)
    }
    pending = pending.catch(() => {}).then(job); return pending
  }, dispose: () => { disposed = true; scene?.dispose(); reader?.dispose() } }
}
