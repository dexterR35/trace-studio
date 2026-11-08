import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { glbFromDataUri } from './glb'
import { modelTimeAt } from './model-animation'
import type { Layer, ModelAnimation } from './types'

type Asset = { gltf: GLTF; center: THREE.Vector3; extent: number; refs: number }
const ready = new Map<string, Asset>(), pending = new Map<string, Promise<Asset>>()

function disposeAsset(asset: Asset) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>()
  for (const scene of asset.gltf.scenes) scene.traverse(object => { const mesh = object as THREE.Mesh; if (mesh.geometry) geometries.add(mesh.geometry); for (const material of mesh.material ? Array.isArray(mesh.material) ? mesh.material : [mesh.material] : []) materials.add(material) })
  for (const material of materials) { for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value); material.dispose() }
  geometries.forEach(geometry => geometry.dispose()); textures.forEach(texture => { texture.dispose(); const image = texture.source.data; if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) image.close() })
}

export function pruneModels(keep: Set<string>) {
  for (const [src, asset] of ready) if (!asset.refs && !keep.has(src)) { disposeAsset(asset); ready.delete(src); pending.delete(src) }
}

export function loadModel(src: string) {
  let request = pending.get(src)
  if (!request) {
    request = (async () => {
      const buffer = glbFromDataUri(src), manager = new THREE.LoadingManager()
      manager.setURLModifier(url => { if (!url.startsWith('blob:') && !url.startsWith('data:')) throw new Error('GLB resources must be embedded.'); return url })
      let gltf: GLTF
      try { gltf = await new GLTFLoader(manager).parseAsync(buffer, '') } catch (error) { throw new Error(`Could not load GLB: ${(error as Error).message}`) }
      gltf.scene.updateMatrixWorld(true)
      const bounds = new THREE.Box3().setFromObject(gltf.scene), size = bounds.getSize(new THREE.Vector3()), extent = Math.max(size.x, size.y, size.z)
      const asset = { gltf, center: bounds.getCenter(new THREE.Vector3()), extent, refs: 0 }
      if (!Number.isFinite(extent) || extent <= 0 || !gltf.scene.getObjectsByProperty('isMesh', true).length) { disposeAsset(asset); throw new Error('This GLB contains no visible mesh geometry.') }
      if (gltf.animations.length > 100 || gltf.animations.some(clip => !Number.isFinite(clip.duration) || clip.duration < 0 || clip.duration > 3600)) { disposeAsset(asset); throw new Error('Use at most 100 animation clips, each up to one hour.') }
      ready.set(src, asset); return asset
    })().catch(error => { pending.delete(src); throw error })
    pending.set(src, request)
  }
  return request
}

export function describeModel(asset: Awaited<ReturnType<typeof loadModel>>, fileName: string): ModelAnimation {
  return { fileName, clips: asset.gltf.animations.map((clip, i) => ({ name: clip.name || `Animation ${i + 1}`, duration: clip.duration })), clip: asset.gltf.animations.length ? 0 : null, speed: 1, start: 0, offset: 0, loop: true }
}

export function createModelInstance(src: string) {
  const asset = ready.get(src)
  if (!asset) throw new Error('The GLB is not loaded. Import the model again.')
  asset.refs++
  // Bones, morph weights and materials must be independent between duplicates and viewports.
  const content = clone(asset.gltf.scene), root = new THREE.Group(), size = new THREE.Group(), centered = new THREE.Group(), materials: { material: THREE.Material; opacity: number; transparent: boolean; depthWrite: boolean }[] = []
  content.traverse(object => {
    if ((object as THREE.Light).isLight || (object as THREE.Camera).isCamera) object.visible = false
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    // Bind-pose bounds do not follow bones or morph deformation near the camera edges.
    if (asset.gltf.animations.length && ((mesh as THREE.SkinnedMesh).isSkinnedMesh || mesh.morphTargetInfluences)) mesh.frustumCulled = false
    const copy = (original: THREE.Material) => { const material = original.clone(); materials.push({ material, opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite }); return material }
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(copy) : copy(mesh.material)
  })
  centered.position.copy(asset.center).negate(); centered.add(content); size.add(centered); root.add(size)
  const mixer = new THREE.AnimationMixer(content)
  let selected: number | null = null, action: THREE.AnimationAction | null = null
  return { root, content, mixer,
    update(layer: Layer, time: number, opacity: number) {
      size.scale.setScalar(layer.width / asset.extent)
      const index = layer.model?.clip ?? null, clip = index === null ? null : asset.gltf.animations[index]
      if (selected !== index) { mixer.stopAllAction(); selected = index; action = clip ? mixer.clipAction(clip) : null }
      if (action && clip) { action.reset().setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play(); mixer.setTime(modelTimeAt(layer, time, clip.duration) ?? 0) }
      for (const entry of materials) { const { material } = entry, transparent = entry.transparent || opacity < 1; if (material.transparent !== transparent) { material.transparent = transparent; material.needsUpdate = true }; material.opacity = entry.opacity * opacity; material.depthWrite = opacity < 1 ? false : entry.depthWrite }
    },
    dispose() {
      mixer.stopAllAction(); mixer.uncacheRoot(content); materials.forEach(entry => entry.material.dispose())
      content.traverse(object => { const mesh = object as THREE.SkinnedMesh; if (mesh.isSkinnedMesh) mesh.skeleton.dispose() })
      asset.refs--
    }
  }
}
