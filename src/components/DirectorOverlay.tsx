import { useRef, useState } from 'react'
import { useStudio } from '../store'
import { framePoint, layerUVAtScreen } from '../core/director'
import { clamp } from '../core/types'
export function DirectorOverlay(){
 const s=useStudio(),p=s.project,tool=s.directorTool,shot=p.director?.shots.find(v=>v.id===s.directorShot),start=useRef<{x:number;y:number}|null>(null),[end,setEnd]=useState<{x:number;y:number}|null>(null)
 if(!tool||!shot)return null
 function point(e:React.PointerEvent<SVGGElement>){const r=e.currentTarget.ownerSVGElement!.getBoundingClientRect();return {x:clamp((e.clientX-r.left)/r.width,0,1)*p.width,y:clamp((e.clientY-r.top)/r.height,0,1)*p.height}}
 function finish(e:React.PointerEvent<SVGGElement>){e.stopPropagation();const a=start.current,b=point(e);start.current=null;setEnd(null);if(!a||Math.hypot(b.x-a.x,b.y-a.y)<8){s.notify('Drag a larger region.');return}
  if(tool==='target-region'){const layer=p.layers.find(v=>v.id===shot!.targetId);if(!layer){s.notify('Choose a target element first.');return}const uv=[a,b,{x:a.x,y:b.y},{x:b.x,y:a.y}].map(q=>layerUVAtScreen(p,layer,s.time,q));if(uv.some(v=>!v)){s.notify('The target plane cannot be reached from this view.');return}const xs=uv.map(v=>clamp(v!.x,0,1)),ys=uv.map(v=>clamp(v!.y,0,1)),x=Math.min(...xs),y=Math.min(...ys),width=Math.max(...xs)-x,height=Math.max(...ys)-y;if(width<.005||height<.005){s.notify('Draw inside the target element.');return}s.edit(p=>{p.director!.shots.find(v=>v.id===shot!.id)!.region={x,y,width,height}})}
  else {const aa=framePoint(p,a,s.time,true),bb=framePoint(p,b,s.time,true),box={x:Math.min(aa.x,bb.x)/p.width,y:Math.min(aa.y,bb.y)/p.height,width:Math.abs(aa.x-bb.x)/p.width,height:Math.abs(aa.y-bb.y)/p.height};s.edit(p=>{const v=p.director!.shots.find(v=>v.id===shot!.id)!;v[tool==='frame-start'?'frameStart':'frameEnd']=box;v.targetId=null;v.framing='custom'})}
  s.set({directorTool:null,directorOpen:true});s.notify('Framing region saved in normalized coordinates.')
 }
 const a=start.current,r=a&&end?{x:Math.min(a.x,end.x),y:Math.min(a.y,end.y),width:Math.abs(a.x-end.x),height:Math.abs(a.y-end.y)}:null
 return <g className="director-overlay" onPointerDown={e=>{if(e.button!==0)return;e.stopPropagation();e.preventDefault();start.current=point(e);setEnd(start.current);e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(start.current){e.stopPropagation();setEnd(point(e))}}} onPointerUp={finish} onPointerCancel={e=>{e.stopPropagation();start.current=null;setEnd(null)}}><rect width={p.width} height={p.height} fill="#1b3f7220" pointerEvents="all"/>{r&&<rect {...r} fill="#56b6ff33" stroke="#378df0" strokeWidth="2" vectorEffect="non-scaling-stroke" pointerEvents="none"/>}</g>
}
