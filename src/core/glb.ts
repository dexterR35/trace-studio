export const MAX_GLB_BYTES = 25 * 1024 * 1024
export const GLB_DATA_PREFIX = 'data:model/gltf-binary;base64,'

/** Validate the self-contained container before loading any model resources. */
export function validateGlb(data: ArrayBuffer) {
  if (data.byteLength > MAX_GLB_BYTES) throw new Error('Choose a GLB smaller than 25 MB.')
  if (data.byteLength < 20) throw new Error('This is not a valid GLB file.')
  const view = new DataView(data)
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== data.byteLength) throw new Error('Choose a binary glTF 2.0 (.glb) file exported from Blender.')
  const size = view.getUint32(12, true)
  if (view.getUint32(16, true) !== 0x4e4f534a || size % 4 || 20 + size > data.byteLength) throw new Error('The GLB scene description is invalid.')
  let json
  try { json = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 20, size))) } catch { throw new Error('The GLB scene description is invalid.') }
  if (!json.asset || json.asset.version !== '2.0') throw new Error('Only glTF 2.0 models are supported.')
  for (let offset = 12; offset < data.byteLength;) { if (offset + 8 > data.byteLength) throw new Error('The GLB is incomplete.'); const length = view.getUint32(offset, true); if (length % 4 || offset + 8 + length > data.byteLength) throw new Error('The GLB is incomplete.'); offset += 8 + length }
  for (const resource of [...(json.buffers ?? []), ...(json.images ?? [])]) if (resource.uri && !resource.uri.startsWith('data:')) throw new Error('Export a self-contained GLB with embedded textures and buffers.')
  const compressed = ['KHR_draco_mesh_compression', 'KHR_texture_basisu', 'EXT_meshopt_compression', 'KHR_meshopt_compression']
  if ((json.extensionsUsed ?? []).some((extension: string) => compressed.includes(extension))) throw new Error('Re-export GLB with mesh compression disabled and PNG/JPEG textures.')
  return json
}

export function glbFromDataUri(src: string) {
  if (!src.startsWith(GLB_DATA_PREFIX) || src.length > GLB_DATA_PREFIX.length + Math.ceil(MAX_GLB_BYTES / 3) * 4) throw new Error('Models must be embedded GLB files smaller than 25 MB.')
  let bytes: Uint8Array<ArrayBuffer>
  try { bytes = Uint8Array.from(atob(src.slice(GLB_DATA_PREFIX.length)), c => c.charCodeAt(0)) } catch { throw new Error('The embedded GLB is invalid.') }
  validateGlb(bytes.buffer)
  return bytes.buffer
}
