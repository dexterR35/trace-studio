import { usePick } from './store'
import { originalCanvas, pixels } from './imaging'
import { pngBlob } from './exports'
import type { XY } from './types'
import { encodeMask } from './geometry'
export type ModelInfo={id:string;name:string;task:string;installed:boolean;weights:boolean;available:boolean;message:string;gpu:boolean;source:string}
export type ModelResult={mask?:Uint8ClampedArray;candidates?:{mask:Uint8ClampedArray;score:number}[];image?:string;description?:{name?:string;material?:string;finish?:string;notes?:string;parts?:{name:string;box?:number[]}[]};parts?:{name:string;mask:Uint8ClampedArray}[];landmarks?:{name:string;point:XY;confidence:number}[];depth?:{model:string;relative:boolean;preview:string;points:number[][];origin:string}}
let controller:AbortController|null=null,jobId:string|null=null,localCancel:(()=>void)|null=null
export function registerLocalCancel(callback:(()=>void)|null){localCancel=callback}
export function canCancelModel(){return !!controller||!!localCancel}
function endpoint(){const value=usePick.getState().api,url=new URL(value);if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Use a local service address (localhost or 127.0.0.1)');return url.origin}
async function request(path:string,init?:RequestInit,signal?:AbortSignal){const response=await fetch(endpoint()+path,{...init,signal});const data=await response.json();if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail:`Local service returned ${response.status}`);return data}
export async function modelStatus():Promise<{models:ModelInfo[];device:string;cache:string}>{return request('/images/models',undefined,AbortSignal.timeout(12000))}
export async function downloadWeights(id:string){return request(`/images/models/${encodeURIComponent(id)}/download`,{method:'POST'},AbortSignal.timeout(10000))}
export function cancelModel(){if(localCancel){localCancel();return}controller?.abort();if(jobId)void request(`/images/jobs/${jobId}`,{method:'DELETE'}).catch(()=>{});usePick.getState().set({busy:controller?'Cancelling local analysis…':''})}
export async function runModel(operation:string,source:ImageData,options:Record<string,unknown>):Promise<ModelResult>{
 if(controller||localCancel||usePick.getState().busy)throw new Error('A model is already working. You can select another asset or choose the next model; wait or cancel before starting it.')
 const st=usePick.getState(),sourceId=st.project.image.src,projectId=st.project.id;controller=new AbortController();const signal=controller.signal
 st.set({busy:`Preparing ${options.model||operation}…`,activeJob:{projectId,subjectId:options.targetSubjectId===null?null:typeof options.targetSubjectId==='string'?options.targetSubjectId:st.selected,model:String(options.model||operation)}})
 try{const form=new FormData();form.append('image',await pngBlob(originalCanvas(source)),'image.png');form.append('options',JSON.stringify({operation,...options,...(Array.isArray(options.mask)?{mask:encodeMask(new Uint8ClampedArray(options.mask)),maskEncoding:'value-length-rle'}:{})}));const started=await request('/images/jobs',{method:'POST',body:form},signal);jobId=started.id
  let result:Record<string,unknown>={}
  while(true){const state=await request(`/images/jobs/${jobId}`,undefined,signal);st.set({busy:state.message||`${operation} · ${Math.round(state.progress*100)}%`});if(state.status==='failed')throw new Error(state.error||'Model inference failed');if(state.status==='cancelled')throw new Error('Analysis cancelled');if(state.status==='complete'){result=state.result;break}await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve()},700);const abort=()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'))};signal.addEventListener('abort',abort,{once:true})})}
  if(usePick.getState().project.id!==projectId||usePick.getState().project.image.src!==sourceId)throw new Error('The source image changed. Run analysis again on this image.')
  const out:ModelResult={...result} as ModelResult
  const readMask=async(src:unknown)=>{if(typeof src!=='string'||!src.startsWith('data:image/png;base64,'))throw new Error('Invalid model mask');const p=await pixels(src);if(p.width!==source.width||p.height!==source.height)throw new Error('Model mask size does not match the image');const m=new Uint8ClampedArray(p.width*p.height);for(let i=0;i<m.length;i++)m[i]=Math.min(p.data[i*4],source.data[i*4+3]);return m}
  if(result.mask)out.mask=await readMask(result.mask)
  if(Array.isArray(result.candidates))out.candidates=await Promise.all(result.candidates.slice(0,3).map(async(v:{mask:string;score:number})=>({mask:await readMask(v.mask),score:v.score})))
  if(Array.isArray(result.parts))out.parts=await Promise.all(result.parts.map(async(v:{name:string;mask:string})=>({name:v.name,mask:await readMask(v.mask)})))
  return out
 }catch(e){if(signal.aborted)throw new Error('Local analysis cancelled');if(e instanceof TypeError)throw new Error('Local AI service is not reachable. Open Models for setup and connection status.');throw e}
 finally{controller=null;jobId=null;st.set({busy:'',activeJob:null})}
}
