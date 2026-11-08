import { create } from 'zustand'
import { contours } from './geometry'
import { emptyProject, uid } from './types'
import type { Page, PickProject, Subject, Tool } from './types'
function clone(p:PickProject):PickProject{return {version:p.version,id:p.id,name:p.name,calibration:p.calibration,changes:p.changes,perspective:p.perspective,depth:p.depth,image:{...p.image},subjects:p.subjects.map(s=>({...s,parts:s.parts.map(v=>({...v})),measures:s.measures.map(v=>({...v,points:v.points.map(p=>({...p}))})),outline:s.outline.map(r=>r.map(p=>({...p}))),landmarks:s.landmarks.map(v=>({...v,point:{...v.point}})),appearance:s.appearance?{...s.appearance,colors:s.appearance.colors.map(c=>({...c})),gradient:{...s.appearance.gradient}}:undefined})),constraints:{...p.constraints}}}
type State={project:PickProject;selected:string|null;part:string|null;page:Page;tool:Tool;mode:'replace'|'add'|'subtract'|'intersect';history:PickProject[];future:PickProject[];revision:number;ready:boolean;saving:string;toast:string;busy:string;analysisTab:'parts'|'geometry'|'appearance'|'recreate';activeJob:{projectId:string;subjectId:string|null;model:string}|null;zoom:number;pan:{x:number;y:number};overlay:number;outline:boolean;spacing:boolean;cutout:boolean;backdrop:string;brush:number;tolerance:number;unit:'px'|'%'|'cm';perspective:{x:number;y:number}[];api:string;model:string;cutoutModel:string;selectionCandidates:{mask:Uint8ClampedArray;score:number}[];selectionPrompts:{x:number;y:number;label:number}[];set:(v:Partial<State>)=>void;previewSubject:(mask:Uint8ClampedArray,origin:string,focus?:boolean)=>string|null;commitSubject:()=>void;edit:(fn:(p:PickProject)=>void,record?:boolean)=>void;subject:(fn:(s:Subject)=>void,record?:boolean)=>void;subjectById:(id:string,fn:(s:Subject)=>void,record?:boolean)=>void;selectSubject:(id:string|null)=>void;removeSubject:(id:string)=>void;begin:()=>void;undo:()=>void;redo:()=>void;load:(p:PickProject)=>void;addSubject:(mask:Uint8ClampedArray,name?:string,origin?:string)=>void;notify:(v:string)=>void}
export const usePick=create<State>((set,get)=>({project:emptyProject(),selected:null,part:null,page:'select',tool:'select',mode:'replace',history:[],future:[],revision:0,ready:false,saving:'Local workspace',toast:'',busy:'',zoom:1,pan:{x:0,y:0},overlay:.15,outline:true,spacing:false,cutout:false,backdrop:'checker',brush:18,tolerance:36,unit:'px',perspective:[],api:'http://127.0.0.1:8000',model:'sam2-large',cutoutModel:'birefnet',
 analysisTab:'parts',activeJob:null,selectionCandidates:[],selectionPrompts:[],set:v=>set(v),notify:toast=>set({toast}),
 edit:(fn,record=true)=>{const s=get(),p=clone(s.project);fn(p);set({project:p,revision:s.revision+1,...(record?{history:[...s.history.slice(-14),s.project],future:[]}:{})})},
 subject:(fn,record=true)=>{get().edit(p=>{const s=p.subjects.find(v=>v.id===get().selected);if(s){s.approved=false;fn(s)}},record)},
 subjectById:(id,fn,record=true)=>{if(get().project.subjects.some(v=>v.id===id))get().edit(p=>{const s=p.subjects.find(v=>v.id===id)!;s.approved=false;fn(s)},record)},
 selectSubject:id=>{const s=get();if(id&&!s.project.subjects.some(v=>v.id===id))return;set({selected:id,selectionCandidates:[],selectionPrompts:[],part:null,tool:'select',mode:'replace',zoom:1,pan:{x:0,y:0},...(!id?{cutout:false}:{})})},
 removeSubject:id=>{const s=get(),index=s.project.subjects.findIndex(v=>v.id===id);if(index<0)return;const name=s.project.subjects[index].name;s.edit(p=>{p.subjects=p.subjects.filter(v=>v.id!==id)});if(s.selected===id)get().selectSubject(get().project.subjects[Math.min(index,get().project.subjects.length-1)]?.id||null);set({toast:`${name} deleted. Undo restores the asset, masks and measurements.`})},
 previewSubject:(mask,origin,focus=true)=>{const s=get(),draft=s.project.subjects.find(v=>v.draft);if(draft){s.edit(p=>{const v=p.subjects.find(v=>v.id===draft.id)!;Object.assign(v,{mask,origin,parts:[],measures:[],landmarks:[],appearance:undefined,outline:contours(mask,p.image.width,p.image.height),approved:false})});if(focus)set({selected:draft.id,part:null});return draft.id}if(s.project.subjects.length>=60){s.notify('Extract or delete an asset before creating more selections.');return null}const id=uid();s.edit(p=>p.subjects.push({id,name:'Current selection',mask,origin,parts:[],measures:[],outline:contours(mask,p.image.width,p.image.height),landmarks:[],approved:false,draft:true}));if(focus)set({selected:id,part:null});return id},
 commitSubject:()=>{const s=get(),subject=s.project.subjects.find(v=>v.id===s.selected);if(!subject)return;s.subject(v=>{v.draft=false;v.approved=true;if(v.name==='Current selection')v.name=`Asset ${s.project.subjects.filter(v=>!v.draft).length+1}`});set({selectionCandidates:[],selectionPrompts:[]})},
 begin:()=>{const s=get();set({history:[...s.history.slice(-14),s.project],future:[]})},
 undo:()=>{const s=get(),p=s.history.at(-1);if(p)set({project:p,history:s.history.slice(0,-1),future:[s.project,...s.future],revision:s.revision+1,selected:p.subjects.some(v=>v.id===s.selected)?s.selected:p.subjects[0]?.id||null,part:null})},
 redo:()=>{const s=get(),p=s.future[0];if(p)set({project:p,history:[...s.history,s.project],future:s.future.slice(1),revision:s.revision+1,selected:p.subjects.some(v=>v.id===s.selected)?s.selected:p.subjects[0]?.id||null,part:null})},
 load:project=>set({project:clone(project),selectionCandidates:[],selectionPrompts:[],tool:'select',mode:'replace',cutout:false,analysisTab:'parts',selected:project.subjects[0]?.id||null,part:null,history:[],future:[],revision:get().revision+1,zoom:1,pan:{x:0,y:0},perspective:project.perspective?.corners.map(v=>({...v}))||[]}),
 addSubject:(mask,name,origin='Manual selection')=>{const s=get();if(s.project.subjects.length>=60){s.notify('A project supports up to 60 extracted subjects');return}const sub:Subject={id:uid(),name:name||`Subject ${s.project.subjects.length+1}`,mask,origin,parts:[],measures:[],outline:contours(mask,s.project.image.width,s.project.image.height),landmarks:[],approved:false};s.edit(p=>p.subjects.push(sub));set({selected:sub.id,part:null})}
}))
export type SavedProject=PickProject&{updated:number;deletedAt?:number}
function db(){return new Promise<IDBDatabase>((resolve,reject)=>{
 const request=indexedDB.open('trace-pick',2)
 request.onupgradeneeded=()=>{for(const name of ['projects','trash'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name,{keyPath:'id'})}
 request.onsuccess=()=>{const database=request.result;database.onversionchange=()=>database.close();resolve(database)}
 request.onerror=()=>reject(request.error)
 request.onblocked=()=>reject(new Error('Close older Trace Studio tabs, then retry the project storage upgrade.'))
})}
// Check the tombstone and write in the same transaction. An autosave already
// queued when Delete is clicked cannot resurrect a project moved to Trash.
export async function savePick(p:PickProject){const database=await db();return new Promise<boolean>((resolve,reject)=>{
 const tx=database.transaction(['projects','trash'],'readwrite');let saved=false
 const check=tx.objectStore('trash').getKey(p.id)
 check.onsuccess=()=>{if(check.result===undefined){tx.objectStore('projects').put({...clone(p),updated:Date.now()});saved=true}}
 tx.oncomplete=()=>{database.close();resolve(saved)};tx.onabort=tx.onerror=()=>{database.close();reject(tx.error)}
})}
export async function listProjects(trashed=false):Promise<SavedProject[]>{const database=await db();return new Promise((resolve,reject)=>{
 const tx=database.transaction(trashed?'trash':'projects'),request=tx.objectStore(trashed?'trash':'projects').getAll()
 tx.oncomplete=()=>{database.close();resolve(request.result.sort((a:SavedProject,b:SavedProject)=>(b.deletedAt||b.updated)-(a.deletedAt||a.updated)))}
 tx.onabort=tx.onerror=()=>{database.close();reject(tx.error)}
})}
export async function trashPick(p:PickProject){const database=await db();return new Promise<void>((resolve,reject)=>{
 const tx=database.transaction(['projects','trash'],'readwrite');tx.objectStore('trash').put({...clone(p),updated:Date.now(),deletedAt:Date.now()});tx.objectStore('projects').delete(p.id)
 tx.oncomplete=()=>{database.close();resolve()};tx.onabort=tx.onerror=()=>{database.close();reject(tx.error)}
})}
export async function restorePick(id:string){const database=await db();return new Promise<SavedProject|undefined>((resolve,reject)=>{
 const tx=database.transaction(['projects','trash'],'readwrite'),request=tx.objectStore('trash').get(id);let restored:SavedProject|undefined
 request.onsuccess=()=>{if(request.result){restored={...request.result,updated:Date.now()};delete restored!.deletedAt;tx.objectStore('projects').put(restored);tx.objectStore('trash').delete(id)}}
 tx.oncomplete=()=>{database.close();resolve(restored)};tx.onabort=tx.onerror=()=>{database.close();reject(tx.error)}
})}
