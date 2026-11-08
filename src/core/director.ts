import * as THREE from 'three'
import { poseAt } from './animation'
import { configureBaseCamera } from './camera'
import { clamp, id, type CameraSettings, type Director, type FilmShot, type FrameBox, type Layer, type Project } from './types'

export const fullFrame=():FrameBox=>({x:0,y:0,width:1,height:1})
export const mix=(a:number,b:number,t:number)=>a+(b-a)*t
export function interpolateCamera(a:CameraSettings,b:CameraSettings,t:number,canvasWidth?:number):CameraSettings{
 const result={...a};for(const k of ['distance','zoom','focus','blur','positionX','positionY','targetX','targetY','targetZ','roll'] as const)result[k]=mix(a[k],b[k],t)
 result.focalLength=a.focalLength===null&&b.focalLength===null?null:canvasWidth?mix(a.focalLength??36*Math.max(1,Math.abs(a.distance))/canvasWidth,b.focalLength??36*Math.max(1,Math.abs(b.distance))/canvasWidth,t):a.focalLength!==null&&b.focalLength!==null?mix(a.focalLength,b.focalLength,t):(t<1?a.focalLength:b.focalLength)
 result.dof=t<1?a.dof:b.dof;result.autofocus=t<1?a.autofocus:b.autofocus;return result
}
export function newShot(p:Project,start:number,end:number,name='New shot'):FilmShot{return {id:id(),name,start,end,description:'',dialogue:'',sound:'',framing:'wide',targetId:null,region:fullFrame(),follow:true,focusId:null,frameStart:fullFrame(),frameEnd:fullFrame(),zoomStart:1,zoomEnd:1,cameraStart:{...p.camera},cameraEnd:{...p.camera},easing:'smooth'}}
export function createDirector(p:Project,duration=15):Director{return {enabled:true,duration,model:duration>15?'seedance-2.5':'seedance-2.0',style:'Cinematic lighting, coherent characters and physically plausible motion.',notes:'',audio:'',shots:Array.from({length:3},(_,i)=>newShot(p,i*duration/3,(i+1)*duration/3,`Shot ${i+1}`))}}
export function activeShot(p:Project,time:number){if(!p.director?.enabled)return undefined;const list=[...p.director.shots].sort((a,b)=>a.start-b.start);return list.find(s=>time>=s.start&&time<s.end)||(Math.abs(time-p.director.duration)<1e-8?list.at(-1):undefined)}
export function fitFrame(box:FrameBox,zoom=1):FrameBox{const size=Math.max(.005,Math.max(box.width,box.height)/Math.max(.05,zoom));return {x:box.x+box.width/2-size/2,y:box.y+box.height/2-size/2,width:size,height:size}}
export function regionProjection(p:Project,l:Layer,time:number,c:CameraSettings,region:FrameBox){
 const pose=poseAt(l,time),camera=p.mode==='3d'?configureBaseCamera(new THREE.PerspectiveCamera(),{...p,camera:c}):null,angle=pose.rz*Math.PI/180,origin=new THREE.Vector3(pose.x-p.width/2,p.height/2-pose.y,pose.z),rotation=new THREE.Euler(-pose.rx*Math.PI/180,-pose.ry*Math.PI/180,-pose.rz*Math.PI/180)
 const corners=[[region.x,region.y],[region.x+region.width,region.y],[region.x+region.width,region.y+region.height],[region.x,region.y+region.height]].map(([u,v])=>{const x=(u-.5)*l.width*pose.scale,y=(v-.5)*l.height*pose.scale;if(!camera)return {x:(pose.x+x*Math.cos(angle)-y*Math.sin(angle))/p.width,y:(pose.y+x*Math.sin(angle)+y*Math.cos(angle))/p.height};const world=new THREE.Vector3(x,-y,0).applyEuler(rotation).add(origin);if(world.clone().applyMatrix4(camera.matrixWorldInverse).z>=-camera.near)return {x:NaN,y:NaN};const q=world.project(camera);return {x:(q.x+1)/2,y:(1-q.y)/2}})
 if(corners.some(q=>!Number.isFinite(q.x)||!Number.isFinite(q.y)))return null
 const xs=corners.map(q=>q.x),ys=corners.map(q=>q.y);return {x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)}
}
export function shotProgress(s:FilmShot,raw:number){
 const a=s.easingRange?.start??0,b=s.easingRange?.end??1
 const ease=(v:number)=>s.easing==='hold'?(v>=1?1:0):s.easing==='linear'?v:v*v*(3-2*v)
 const lo=ease(a),hi=ease(b),value=ease(mix(a,b,clamp(raw,0,1)))
 return hi-lo>1e-12?clamp((value-lo)/(hi-lo),0,1):0
}
const cache=new WeakMap<Project,{time:number;value:{shot:FilmShot|undefined;camera:CameraSettings;frame:FrameBox;progress:number}}>()
export function directorAt(p:Project,time=0){
 const old=cache.get(p);if(old?.time===time)return old.value
 const shot=activeShot(p,time);let camera={...p.camera},frame=fullFrame(),progress=0
 if(shot){const raw=clamp((time-shot.start)/Math.max(1e-9,shot.end-shot.start),0,1);progress=shotProgress(shot,raw);camera=interpolateCamera(shot.cameraStart,shot.cameraEnd,progress,p.width)
  const box={x:mix(shot.frameStart.x,shot.frameEnd.x,progress),y:mix(shot.frameStart.y,shot.frameEnd.y,progress),width:mix(shot.frameStart.width,shot.frameEnd.width,progress),height:mix(shot.frameStart.height,shot.frameEnd.height,progress)},target=p.layers.find(l=>l.id===shot.targetId)
  const targetBox=target?regionProjection(p,target,shot.follow?time:shot.start,shot.follow?camera:shot.cameraStart,shot.region):null
  frame=fitFrame(targetBox||box,mix(shot.zoomStart,shot.zoomEnd,progress))
  const focus=p.layers.find(l=>l.id===shot.focusId)
  if(focus&&p.mode==='3d'){const v=poseAt(focus,time),cam=configureBaseCamera(new THREE.PerspectiveCamera(),{...p,camera});camera.focus=Math.max(1,-new THREE.Vector3(v.x-p.width/2,p.height/2-v.y,v.z).applyMatrix4(cam.matrixWorldInverse).z);camera.autofocus=false}
 }
 const value={shot,camera,frame,progress};cache.set(p,{time,value});return value
}
export function framePoint(p:Project,q:{x:number;y:number},time=0,inverse=false){const f=directorAt(p,time).frame;return inverse?{x:f.x*p.width+q.x*f.width,y:f.y*p.height+q.y*f.height}:{x:(q.x-f.x*p.width)/f.width,y:(q.y-f.y*p.height)/f.height}}
export function layerUVAtScreen(p:Project,l:Layer,time:number,q:{x:number;y:number}){
 const base=framePoint(p,q,time,true),pose=poseAt(l,time)
 if(p.mode==='2d'){const angle=-pose.rz*Math.PI/180,dx=base.x-pose.x,dy=base.y-pose.y;return {x:.5+(dx*Math.cos(angle)-dy*Math.sin(angle))/(l.width*pose.scale),y:.5+(dx*Math.sin(angle)+dy*Math.cos(angle))/(l.height*pose.scale)}}
 const c=configureBaseCamera(new THREE.PerspectiveCamera(),{...p,camera:directorAt(p,time).camera}),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(base.x/p.width*2-1,1-base.y/p.height*2),c)
 const matrix=new THREE.Matrix4().compose(new THREE.Vector3(pose.x-p.width/2,p.height/2-pose.y,pose.z),new THREE.Quaternion().setFromEuler(new THREE.Euler(-pose.rx*Math.PI/180,-pose.ry*Math.PI/180,-pose.rz*Math.PI/180)),new THREE.Vector3(pose.scale,pose.scale,pose.scale)),plane=new THREE.Plane(new THREE.Vector3(0,0,1),0).applyMatrix4(matrix),hit=ray.ray.intersectPlane(plane,new THREE.Vector3());if(!hit)return null;hit.applyMatrix4(matrix.invert());return {x:hit.x/l.width+.5,y:.5-hit.y/l.height}
}
export function splitShot(p:Project,shotId:string,time:number){const d=p.director,s=d?.shots.find(v=>v.id===shotId);if(!d||!s||time<=s.start+1/p.fps||time>=s.end-1/p.fps)throw new Error('Place the playhead inside the shot, at least one frame from either edge.');if(d.shots.length>=30)throw new Error('Use at most 30 shots.');const raw=(time-s.start)/(s.end-s.start),fraction=shotProgress(s,raw),camera=interpolateCamera(s.cameraStart,s.cameraEnd,fraction,p.width),box={x:mix(s.frameStart.x,s.frameEnd.x,fraction),y:mix(s.frameStart.y,s.frameEnd.y,fraction),width:mix(s.frameStart.width,s.frameEnd.width,fraction),height:mix(s.frameStart.height,s.frameEnd.height,fraction)},zoom=mix(s.zoomStart,s.zoomEnd,fraction),rangeStart=s.easingRange?.start??0,rangeEnd=s.easingRange?.end??1,rangeMid=mix(rangeStart,rangeEnd,raw),next={...structuredClone(s),easingRange:{start:rangeMid,end:rangeEnd},id:id(),name:s.name+' · next',start:time,cameraStart:camera,frameStart:box,zoomStart:zoom};s.easingRange={start:rangeStart,end:rangeMid};s.end=time;s.cameraEnd=camera;s.frameEnd=box;s.zoomEnd=zoom;d.shots.push(next);d.shots.sort((a,b)=>a.start-b.start);return next.id}
export function directorIssues(p:Project){const d=p.director;if(!d)return ['Create a directing sequence first.'];const list=[...d.shots].sort((a,b)=>a.start-b.start),issues:string[]=[];if(!list.length)issues.push('Add at least one shot.');let end=0;for(const s of list){if(Math.abs(s.start-end)>1e-6)issues.push(`${s.name}: shots must cover the sequence without gaps or overlaps.`);if(s.end<=s.start||s.end>d.duration+1e-6)issues.push(`${s.name}: use increasing times within the sequence.`);end=s.end;for(const ref of [s.targetId,s.focusId])if(ref&&!p.layers.some(l=>l.id===ref))issues.push(`${s.name}: a referenced element is missing.`)}if(Math.abs(end-d.duration)>1e-6)issues.push('The final shot must end at the sequence duration.');return [...new Set(issues)]}
