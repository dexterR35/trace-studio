import { strToU8, zipSync } from 'fflate'
import { bounds } from './geometry'
import { annotate, crop, maskCanvas, renderCutout, svgOutline, tile } from './imaging'
import { reconstructionPrompt, referenceData, safeName, serialize } from './project'
import { downloadBlob } from '../core/storage'
import type { PickProject, Subject } from './types'
export const pngBlob=(c:HTMLCanvasElement)=>new Promise<Blob>((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('Could not encode PNG')),'image/png'))
export async function png(c:HTMLCanvasElement,name:string){downloadBlob(await pngBlob(c),`${safeName(name)}.png`)}
export function json(p:PickProject,full=false){downloadBlob(new Blob([JSON.stringify(full?serialize(p):referenceData(p),null,2)],{type:'application/json'}),`${safeName(p.name)}.${full?'pick':'reference'}.json`)}
export async function packageZip(p:PickProject,pixels:ImageData,options:{sizes:number[];padding:number;optical:boolean}){
 const subjects=p.subjects.filter(s=>bounds(s.mask,p.image.width,p.image.height))
 if(!subjects.length)throw new Error('Select at least one subject to export')
 const bundle:Record<string,Uint8Array>={},add=async(name:string,c:HTMLCanvasElement)=>{bundle[name]=new Uint8Array(await (await pngBlob(c)).arrayBuffer())}
 const source=p.image.src.slice(p.image.src.indexOf(',')+1),mime=p.image.src.match(/^data:([^;]+)/)?.[1]||'image/png',ext=mime.includes('svg')?'svg':mime.includes('jpeg')?'jpg':mime.includes('webp')?'webp':'png'
 bundle[`original.${ext}`]=Uint8Array.from(atob(source),v=>v.charCodeAt(0))
 const selectedProject={...p,subjects};bundle['reference.json']=strToU8(JSON.stringify({...referenceData(selectedProject),export:{padding_px:options.padding,preset_sizes_px:options.sizes,optical_matching:options.optical,cutout_coordinates:'A cropped cutout begins at bounds_px.x/y in the source; add padding_px to map source-local points into the cutout.'}},null,2));bundle['reconstruction-prompt.txt']=strToU8(reconstructionPrompt(selectedProject));bundle['project.pick.json']=strToU8(JSON.stringify(serialize(p)))
 await add('annotated-reference.png',annotate(pixels,subjects))
 for(const s of subjects){const path=`subjects/${safeName(s.name)}-${s.id.slice(0,8)}`;if(!bounds(s.mask,p.image.width,p.image.height))continue;await add(`${path}/cutout.png`,crop(renderCutout(pixels,s.mask),s.mask,options.padding));await add(`${path}/mask.png`,maskCanvas(s.mask,p.image.width,p.image.height));bundle[`${path}/outline.svg`]=strToU8(svgOutline(s,p.image.width,p.image.height));for(const size of options.sizes)await add(`${path}/${size}px.png`,tile(pixels,s,size,options.padding,options.optical));for(const part of s.parts.filter(v=>v.enabled)){if(!bounds(part.mask,p.image.width,p.image.height))continue;await add(`${path}/parts/${safeName(part.name)}-${part.id.slice(0,8)}.png`,crop(renderCutout(pixels,part.mask),part.mask,options.padding));await add(`${path}/parts/${safeName(part.name)}-${part.id.slice(0,8)}-mask.png`,maskCanvas(part.mask,p.image.width,p.image.height))}}
 bundle['README.txt']=strToU8('Trace Studio reference package\n\nAttach original, annotated reference, cutout, masks and reference.json alongside reconstruction-prompt.txt in GPT Image.\nCoordinates refer to the full original image, not the padded cutout. Masks are full-canvas grayscale PNGs: white is selected, black is excluded. SVG paths use even-odd fill to preserve holes. Part names and appearance descriptions are editable suggestions.\nPNG presets share square artboards, centered placement and padding. Optical matching uses mask area subject to fit limits.\nOpen project.pick.json in Trace Studio to continue editing.\n')
 downloadBlob(new Blob([zipSync(bundle,{level:3}) as Uint8Array<ArrayBuffer>],{type:'application/zip'}),`${safeName(p.name)}-reference.zip`)
}
export function subjectFilename(s:Subject){return `${safeName(s.name)}-${s.id.slice(0,8)}`}
