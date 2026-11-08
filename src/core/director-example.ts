import { defaultProject, makePoint } from './animation'
import { createDirector } from './director'
import { stationaryLayer } from './path-authoring'
import type { Layer } from './types'

// An explicit blocking example. Ordinary imported elements still start stationary.
export function directorExample() {
  const p = defaultProject(); p.name = 'The brass compass - director example'; p.mode = '2d'; p.fps = 24
  p.background = 'color'; p.backgroundColor = '#101c30'; p.layers = []
  function add(name: string, x: number, y: number, width: number, height: number, color: string, kind: Layer['kind'] = 'shape') {
    const l = stationaryLayer(p.width, p.height, kind); l.name = name; l.width = width; l.height = height; l.color = color; l.duration = 15
    l.points.forEach(q => { q.x = x; q.y = y })
    l.direction = { role: 'environment', description: name, identity: '', performance: '', includeReference: false }
    p.layers.push(l); return l
  }
  add('Window glow', 920, 280, 400, 400, '#365570')
  add('Window glass', 920, 280, 360, 360, '#19334c')
  add('Moon', 1000, 185, 85, 85, '#cfdbdc').shape = 'ellipse'
  add('Window crossbar', 920, 280, 12, 400, '#101c30')
  add('Window sill', 920, 420, 400, 12, '#101c30')
  add('Floor', 640, 665, 1280, 150, '#17273d')
  const actor = add('Mira - character stand-in', 380, 390, 190, 390, '#416680')
  actor.direction = { role: 'character', description: 'Mira, an adult detective with short dark hair, a navy coat, cream shirt and dark trousers. The rectangle is a blocking stand-in; replace it with a photorealistic actor.', identity: 'Same face, short dark hair, navy wardrobe and adult proportions across every shot.', performance: 'Restrained and thoughtful, then alert. Natural breathing and eye movement.', includeReference: false }
  actor.points = [makePoint({ x: 380, y: 390, z: 0 }), makePoint({ x: 490, y: 390, z: 0 }), makePoint({ x: 490, y: 390, z: 0 })]
  actor.points.forEach((q, i) => { q.time = [0, 7, 15][i]; q.curve = 'linear' }); actor.timing = 'keyframes'
  add('Table', 860, 595, 440, 32, '#566174')
  add('Table leg', 870, 660, 24, 110, '#283349')
  const compass = add('Brass compass', 825, 546, 68, 68, '#e5b950'); compass.shape = 'ellipse'
  compass.direction = { role: 'prop', description: 'A small brass compass with a dark dial and a pale needle. The circle is a blocking stand-in.', identity: 'Brass rim, dark dial and pale needle.', performance: 'Rest on the table and catch a soft glint.', includeReference: false }
  const label = add('Mira label', 380, 390, 160, 40, '#d5e4ec', 'text'); label.text = 'MIRA'
  label.points = actor.points.map(q => ({ ...q, incoming: { ...q.incoming }, outgoing: { ...q.outgoing } })); label.timing = 'keyframes'
  label.direction!.description = 'Blocking label only. Omit all labels and text from generated footage.'
  p.director = createDirector(p, 15)
  p.director.style = 'Photorealistic cinematic noir. A quiet room at night, blue moonlight, warm gold glints, subtle film grain. Replace geometric stand-ins with realistic characters and props; omit blocking labels.'
  p.director.audio = 'Rain outside, quiet room tone, sparse low strings. No dialogue.'
  const [wide, face, detail] = p.director.shots
  wide.name = 'Establish the room'; wide.description = 'Mira takes a slow step toward the table. Establish the moonlit window and brass compass.'; wide.zoomEnd = 1.08
  face.name = 'A quiet decision'; face.framing = 'close-up'; face.targetId = actor.id; face.region = { x: .1, y: 0, width: .8, height: .32 }; face.zoomStart = .82; face.zoomEnd = 1.05
  face.description = 'Close-up of Mira as she glances toward the compass. A slight change in her eyes reveals a decision. Preserve her face.'
  detail.name = 'The brass compass'; detail.framing = 'detail'; detail.targetId = compass.id; detail.zoomStart = .7; detail.zoomEnd = .95
  detail.description = 'Cut to a detail of the brass compass on the table. A narrow moonlight glint crosses its glass face. Hold the final composition.'
  return p
}
