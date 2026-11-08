import { strToU8, zipSync } from 'fflate'
import { seedancePlan } from './seedance'
import { cloneProject, resizeForExport } from './project'
import { createFrameRenderer, loadImage } from './renderer'
import { exportScene } from './export'
import { motionReference } from './motion-reference'
import { defaultCamera } from './camera'
import { poseAt } from './animation'
import type { Project } from './types'
async function png(canvas:HTMLCanvasElement){const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(v=>v?resolve(v):reject(new Error('Could not encode a reference image.')),'image/png'));return new Uint8Array(await blob.arrayBuffer())}
export async function seedancePackage(project:Project,progress:(value:number,message:string)=>void,signal?:AbortSignal){
 const p=cloneProject(project),plan=seedancePlan(p),files:Record<string,Uint8Array>={}
 const check=()=>{if(signal?.aborted)throw new DOMException('Export cancelled','AbortError')}
 const add=(name:string,value:unknown)=>{files[name]=strToU8(typeof value==='string'?value:JSON.stringify(value,null,2))}
 // Build this first so a sampling limit error is reported before expensive video encoding.
 progress(0,'Evaluating motion JSON');check();add('motion.json',motionReference(p));add('project.trace.json',p)
 const maxSide=1280,scale=Math.min(1,maxSide/Math.max(p.width,p.height)),width=Math.max(2,Math.round(p.width*scale/2)*2),height=Math.max(2,Math.round(p.height*scale/2)*2)
 const render=resizeForExport(p,width,height);render.fps=24;render.background='color';if(render.video)render.video.muted=true
 for(let i=0;i<plan.tasks.length;i++){check();const task=plan.tasks[i];const video=await exportScene(render,'mp4',v=>progress((i+v)/plan.tasks.length*.72,`Rendering animatic ${i+1} of ${plan.tasks.length}`),signal,{codec:'avc',quality:'high',range:{start:task.start,end:task.end}});files[task.file]=new Uint8Array(await video.blob.arrayBuffer());add(`prompts/clip-${task.index}.txt`,task.prompt);add(`requests/clip-${task.index}.template.json`,task.request)}
 for(let i=0;i<plan.references.length;i++){
  check();const ref=plan.references[i],l=p.layers.find(l=>l.id===ref.id)!,src=l.direction?.reference?.src||(l.kind==='image'?l.src:undefined)
  if(src){const image=await loadImage(src),c=document.createElement('canvas'),scale=Math.min(1,1536/Math.max(image.naturalWidth,image.naturalHeight));c.width=Math.max(1,Math.round(image.naturalWidth*scale));c.height=Math.max(1,Math.round(image.naturalHeight*scale));c.getContext('2d')!.drawImage(image,0,0,c.width,c.height);files[ref.file]=await png(c)}
  else {const isolated=cloneProject(p),asset=isolated.layers.find(v=>v.id===l.id)!,at=poseAt(asset,asset.delay);isolated.layers=[asset];delete isolated.director;delete isolated.video;isolated.blockers=[];isolated.width=isolated.height=768;isolated.camera={...defaultCamera(),distance:1000};isolated.background='color';isolated.backgroundColor='#e8edf4';const scale=500/Math.max(asset.width,asset.height);asset.width*=scale;asset.height*=scale;asset.points.forEach(v=>{v.x=384;v.y=384;v.z=0;v.scale=1;v.rx=0;v.ry=0;v.rz=at.rz;v.opacity=1});asset.motion=[];asset.delay=0;const r=await createFrameRenderer(isolated);try{await r.render(0);files[ref.file]=await png(r.canvas)}finally{r.dispose()}}
  progress(.72+(i+1)/Math.max(1,plan.references.length)*.1,'Preparing appearance references')
 }
 const r=await createFrameRenderer(render)
 try{for(let i=0;i<p.director!.shots.length;i++){check();const shot=p.director!.shots[i];for(const [label,t] of [['start',shot.start],['end',Math.max(shot.start,shot.end-1/render.fps)]] as const){await r.render(t);files[`keyframes/${String(i+1).padStart(2,'0')}-${label}.png`]=await png(r.canvas)}progress(.82+(i+1)/p.director!.shots.length*.13,'Rendering shot keyframes')}}finally{r.dispose()}
 check();add('manifest.json',{...plan,renderedReference:{width,height,fps:24,audio:'silent animatic; audio intentions supplied in shot prompts'},shotKeyframes:'keyframes/NN-start.png and NN-end.png; optional review images, not attached to API templates',sourceSpecification:'motion.json',sourceProject:'project.trace.json'})
 add('README.txt',`TRACE MOTION STUDIO — DIRECTOR PACKAGE\n\n1. Review video/ animatics and references/ appearance PNGs.\n2. Upload each clip and the numbered appearance references in a provider interface that supports the selected Seedance model. Bind @Video 1 and @Image 1… in the same order as manifest.json.\n3. Paste the matching prompts/clip-N.txt. For an API workflow replace the model ID and every media URL in requests/clip-N.template.json. Nothing has been uploaded or submitted by this app.\n4. Generate each part, then join the results in sequence. A 30-second Seedance 2.0 sequence is split into two 15-second requests.\n\nThe local animatic is deterministic. Generative output may change trajectories, framing, appearance or timing. Custom motion.json is NOT a Seedance API scene format. It contains original-resolution controls and per-frame mathematical samples for tools that choose to consume them.\n\nShot framing applies after the scene, footage and blockers are composited. 2D uses an aspect-preserving XY crop; 3D additionally uses camera position, target, lens and depth of field. Model mesh interiors and facial expressions require appropriate source assets or generation instructions. Local cast descriptions do not synthesize acting.\n\nThe animatic is silent 24 FPS H.264, with its longest side at most 1280 px. Original timing/FPS/resolution remain in motion.json. Separate keyframes are optional review material and are not attached in API templates. Real-person references may require the provider's supported portrait workflow.\n\nProvider documentation: https://docs.byteplus.com/en/docs/modelark/create-video-generation-task-api\n`)
 progress(.97,'Packing local ZIP');await new Promise(r=>setTimeout(r,0));check();const blob=new Blob([zipSync(files,{level:0}) as Uint8Array<ArrayBuffer>],{type:'application/zip'});progress(1,'Reference package ready');return {blob,name:`${p.name.replace(/[^a-z0-9_-]+/gi,'-')||'film'}-seedance.zip`}
}
