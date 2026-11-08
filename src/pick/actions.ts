import { savePick, usePick } from './store'
import { analyzeAppearance, colorParts, extractComponents, originalCanvas, pixels, refine, renderCutout } from './imaging'
import { pngBlob } from './exports'
import { bounds, contours, poseMeasurements } from './geometry'
import { runModel, registerLocalCancel } from './api'
import { applyTarget, captureTarget, targetIsCurrent } from './target'
import { uid } from './types'
function idle(){const s=usePick.getState();if(s.busy){s.notify('A model is working. Select other assets freely; wait or cancel before starting another model.');return false}return true}
export async function autoExtract(p:ImageData){
 if(!idle())return;const s=usePick.getState(),projectId=s.project.id;s.set({busy:'Finding separate subjects…'})
 try{await new Promise(r=>setTimeout(r,30));if(usePick.getState().project.id!==projectId)return
  const masks=extractComponents(p,s.tolerance);if(!masks.length)throw new Error('No separate subjects found. Use a box or an AI selection model.')
  const fresh=masks.filter(m=>!s.project.subjects.some(v=>v.mask.length===m.length&&v.mask.every((a,i)=>a===m[i])))
  for(const mask of fresh.slice(0,60-s.project.subjects.length))usePick.getState().addSubject(mask,undefined,'Local connected components')
  s.notify(`${fresh.length} new regions found. Review each mask before export.`)
 }catch(e){s.notify((e as Error).message)}finally{s.set({busy:''})}
}
export async function analyze(p:ImageData,semantic=false){
 if(!idle())return;const s=usePick.getState();let target:ReturnType<typeof captureTarget>|undefined
 try{target=captureTarget()
  if(semantic){const result=await runModel('describe',p,{model:'qwen',mask:Array.from(target.mask),name:target.name})
   if(applyTarget(target,v=>{v.appearance=analyzeAppearance(p,v.mask);if(result.description){v.name=result.description.name||v.name;v.appearance.material=result.description.material||'Unspecified';v.appearance.finish=result.description.finish||'Unspecified';v.appearance.notes=result.description.notes||'';v.appearance.origin='Qwen3-VL suggestion · review before export'}}))s.notify(`Descriptions saved to ${target.name}. Review the suggestions.`)
  }else{s.set({busy:'Analyzing colors and editable regions…'});await new Promise(r=>setTimeout(r,30))
   if(applyTarget(target,v=>{v.appearance=analyzeAppearance(p,v.mask);v.parts=colorParts(p,v.mask);v.outline=contours(v.mask,p.width,p.height)}))s.notify(`Color regions saved to ${target.name}. Rename or correct any part.`)
  }
 }catch(e){s.notify((e as Error).message)}finally{s.set({busy:''});if(target&&usePick.getState().project.id===target.projectId&&usePick.getState().selected===target.subjectId)s.set({page:'analyze',cutout:true})}
}
export async function semanticParts(p:ImageData){
 if(!idle())return;const s=usePick.getState()
 try{const target=captureTarget(),r=await runModel('parts',p,{model:'sam3',mask:Array.from(target.mask),name:target.name})
  if(r.parts&&applyTarget(target,v=>{v.parts=r.parts!.map((part,i)=>({id:uid(),name:part.name,mask:part.mask,color:['#17a8ce','#e89e38','#ba65cf','#ef6f6c','#6d9dc9'][i%5],enabled:true,origin:'Qwen suggested name + SAM 3 mask · review'}))}))s.notify(`Semantic parts saved to ${target.name}.`)
 }catch(e){s.notify((e as Error).message)}
}
export async function browserCutout(p:ImageData){
 if(!idle())return;const s=usePick.getState();let cancelled=false
 try{const target=captureTarget();registerLocalCancel(()=>{cancelled=true;s.set({busy:'Cancelling browser inference after its current step…'})})
  s.set({busy:'Loading lightweight IS-Net browser model…',activeJob:{projectId:target.projectId,subjectId:target.subjectId,model:'IS-Net'}})
  const {removeBackground}=await import('@imgly/background-removal')
  const blob=await removeBackground(await pngBlob(originalCanvas(p)),{model:'isnet_quint8',device:'cpu',proxyToWorker:true,progress:(key,current,total)=>{if(!cancelled)s.set({busy:total?`IS-Net ${key.includes('onnx')?'model':'runtime'} · ${Math.round(current/total*100)}%`:'Running browser AI…'})}})
  if(cancelled)throw new Error('Browser analysis cancelled')
  const url=URL.createObjectURL(blob);let out:ImageData;try{out=await pixels(url)}finally{URL.revokeObjectURL(url)}
  const mask=new Uint8ClampedArray(p.width*p.height),gate=refine(target.mask,p.width,p.height,3)
  for(let i=0;i<mask.length;i++)mask[i]=Math.min(out.data[i*4+3],p.data[i*4+3],gate[i])
  if(!bounds(mask,p.width,p.height))throw new Error('The model returned an empty mask')
  if(applyTarget(target,v=>{v.mask=mask;v.outline=contours(mask,p.width,p.height);v.parts=[];v.appearance=undefined;v.origin='IS-Net quantized · local browser inference'})){if(usePick.getState().selected===target.subjectId)s.set({cutout:true});s.notify(`Background refined for ${target.name}. Other asset selections are unchanged.`)}
 }catch(e){s.notify((e as Error).message)}finally{registerLocalCancel(null);s.set({busy:'',activeJob:null})}
}
export async function modelAction(p:ImageData,operation:'matte'|'inpaint'|'pose'|'depth'|'select',model:string){
 if(!idle())return;const s=usePick.getState()
 try{const target=captureTarget(),box=bounds(target.mask,p.width,p.height)
  if(!box)throw new Error('The selection is empty. Pick a subject first.')
  const r=await runModel(operation,p,{model,mask:Array.from(target.mask),...(operation==='select'?{box:[box.x,box.y,box.x+box.width,box.y+box.height]}:{})})
  if(!targetIsCurrent(target)){s.notify(`Result skipped: ${target.name} was edited or deleted, or its project changed.`);return}
  if(r.mask&&applyTarget(target,v=>{v.mask=r.mask!;v.outline=contours(r.mask!,p.width,p.height);v.parts=[];v.appearance=undefined;v.origin=model})&&usePick.getState().selected===target.subjectId)s.set({selectionCandidates:operation==='select'?r.candidates||[]:[],selectionPrompts:[]})
  if(r.landmarks)applyTarget(target,v=>{v.landmarks=r.landmarks!;v.measures=[...v.measures.filter(m=>!m.name.startsWith('AI · ')),...poseMeasurements(r.landmarks!)].slice(0,100)})
  if(r.depth)s.edit(project=>{project.depth=r.depth})
  if(r.image){const original=usePick.getState().project,next={...original,id:uid(),name:original.name+' · filled',image:{...original.image,src:r.image},subjects:[],depth:undefined};await savePick(original);await savePick(next)
   if(usePick.getState().project.id===target.projectId&&usePick.getState().selected===target.subjectId){s.load(next);s.set({page:'select',cutout:false})}
   s.notify('Filled image saved as a new project. Find it in Projects; the original is kept.')
  }else s.notify(`${model} result saved to ${target.name}.`)
 }catch(e){s.notify((e as Error).message)}
}
export function applyPartMask(mask:Uint8ClampedArray){const s=usePick.getState();s.addSubject(mask.slice(),'Extracted part','Extracted from reviewed part');s.set({part:null,page:'select'})}
export function cutoutSource(p:ImageData){const s=usePick.getState(),sub=s.project.subjects.find(v=>v.id===s.selected);if(!sub)throw new Error('Select a subject first');return {src:renderCutout(p,sub.mask).toDataURL(),name:sub.name,width:p.width,height:p.height}}
