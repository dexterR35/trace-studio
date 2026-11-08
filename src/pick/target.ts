import { usePick } from './store'
import type { Subject } from './types'

function signature(subject:Subject){const {mask:_mask,parts,...details}=subject;return JSON.stringify({...details,parts:parts.map(({mask:_partMask,...part})=>part)})}
export type SubjectTarget={projectId:string;source:string;subjectId:string;mask:Uint8ClampedArray;name:string;signature:string;partMasks:{id:string;mask:Uint8ClampedArray}[]}
export function captureTarget():SubjectTarget{
 const state=usePick.getState(),subject=state.project.subjects.find(v=>v.id===state.selected)
 if(!subject)throw new Error('Select an asset first.')
 return {projectId:state.project.id,source:state.project.image.src,subjectId:subject.id,mask:subject.mask,name:subject.name,signature:signature(subject),partMasks:subject.parts.map(v=>({id:v.id,mask:v.mask}))}
}
export function targetIsCurrent(target:SubjectTarget){
 const state=usePick.getState(),subject=state.project.subjects.find(v=>v.id===target.subjectId)
 return state.project.id===target.projectId&&state.project.image.src===target.source&&subject?.mask===target.mask&&signature(subject)===target.signature&&target.partMasks.every(v=>subject.parts.find(p=>p.id===v.id)?.mask===v.mask)
}
export function applyTarget(target:SubjectTarget,update:(subject:Subject)=>void){
 if(!targetIsCurrent(target)){usePick.getState().notify(`Result skipped: ${target.name} was deleted, edited, or its project changed. Run the model again if needed.`);return false}
 usePick.getState().subjectById(target.subjectId,update);return true
}
