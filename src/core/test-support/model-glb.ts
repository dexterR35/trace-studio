/** Tiny embedded glTF with a skinned triangle, morph target and two independent clips. */
export function modelGlb(extra: Record<string, unknown> = {}) {
  const chunks: Uint8Array[] = [], views: object[] = [], accessors: object[] = []; let offset = 0
  function accessor(values: Float32Array | Uint16Array, type: string, count: number, bounds?: { min: number[]; max: number[] }) {
    const bytes = new Uint8Array(values.buffer), padded = new Uint8Array(Math.ceil(bytes.length / 4) * 4); padded.set(bytes); chunks.push(padded)
    views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length }); offset += padded.length
    accessors.push({ bufferView: views.length - 1, componentType: values instanceof Float32Array ? 5126 : 5123, count, type, ...bounds }); return accessors.length - 1
  }
  const position = accessor(new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]), 'VEC3', 3, { min: [-1, -1, 0], max: [1, 1, 0] }), normal = accessor(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 'VEC3', 3), joints = accessor(new Uint16Array(12), 'VEC4', 3), weights = accessor(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 'VEC4', 3), morph = accessor(new Float32Array([0, 0, 0, 0, 0, 0, 0, 1, 0]), 'VEC3', 3, { min: [0, 0, 0], max: [0, 1, 0] }), bind = accessor(new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), 'MAT4', 1)
  const times = accessor(new Float32Array([0, 1]), 'SCALAR', 2, { min: [0], max: [1] }), lift = accessor(new Float32Array([0, 0, 0, 0, 1, 0]), 'VEC3', 2), morphWeights = accessor(new Float32Array([0, 1]), 'SCALAR', 2)
  const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'Root', children: [1, 2] }, { name: 'Bone' }, { name: 'Triangle', mesh: 0, skin: 0 }], skins: [{ joints: [1], inverseBindMatrices: bind }], meshes: [{ weights: [0], primitives: [{ attributes: { POSITION: position, NORMAL: normal, JOINTS_0: joints, WEIGHTS_0: weights }, targets: [{ POSITION: morph }], material: 0 }] }], materials: [{ pbrMetallicRoughness: { baseColorFactor: [.9, .2, .1, 1], metallicFactor: 0, roughnessFactor: .7 }, doubleSided: true }], animations: [{ name: 'Lift', samplers: [{ input: times, output: lift }], channels: [{ sampler: 0, target: { node: 1, path: 'translation' } }] }, { name: 'Morph', samplers: [{ input: times, output: morphWeights }], channels: [{ sampler: 0, target: { node: 2, path: 'weights' } }] }], buffers: [{ byteLength: offset }], bufferViews: views, accessors, ...extra }
  const encoded = new TextEncoder().encode(JSON.stringify(json)), text = new Uint8Array(Math.ceil(encoded.length / 4) * 4).fill(32); text.set(encoded)
  const result = new ArrayBuffer(28 + text.length + offset), header = new DataView(result); header.setUint32(0, 0x46546c67, true); header.setUint32(4, 2, true); header.setUint32(8, result.byteLength, true); header.setUint32(12, text.length, true); header.setUint32(16, 0x4e4f534a, true); new Uint8Array(result, 20, text.length).set(text)
  const binaryOffset = 20 + text.length; header.setUint32(binaryOffset, offset, true); header.setUint32(binaryOffset + 4, 0x004e4942, true); let cursor = binaryOffset + 8
  for (const chunk of chunks) { new Uint8Array(result, cursor, chunk.length).set(chunk); cursor += chunk.length }
  return result
}
