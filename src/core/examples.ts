import { autoHandles, defaultLayer, defaultProject } from './animation'
export function cubeExample() {
  const p = defaultProject(); p.name = '3D cube · map + camera'; p.mode = '3d'
  const layer = defaultLayer(p.width, p.height, 'cube'); layer.name = 'Green cube'; layer.color = '#479c50'; layer.width = layer.height = 220
  layer.points = autoHandles(layer.points.map((point, i) => ({ ...point, x: i ? point.x : 260, z: [180, 0, -140, 40, 240][i], scale: [1, .8, .9, .75, 1.15][i], rx: [-20, 10, -10, 20, -15][i], ry: [-25, 25, -20, 30, -15][i] })))
  p.layers = [layer]
  return p
}
