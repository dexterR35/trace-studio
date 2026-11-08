import { useRef, useState } from 'react'
import { useStudio } from '../store'
import { mapDrawingPoint, mapProjectPoint } from '../core/map'
import type { SceneRenderer } from '../core/renderer'
import type { Vec } from '../core/types'
export function MapPathOverlay({engine}:{engine:SceneRenderer|null}){
 const s=useStudio(),gesture=useRef<Vec[]|null>(null),[freehand,setFreehand]=useState<Vec[]>([]),[hover,setHover]=useState<Vec|null>(null)
 if(s.tool!=='draw'||!engine)return null
 const p=s.project,canvas=engine.canvas,width=canvas.clientWidth,height=canvas.clientHeight
 const location=(e:React.PointerEvent<SVGSVGElement>)=>{const r=e.currentTarget.getBoundingClientRect();return mapDrawingPoint(engine.mapCamera,p,(e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2,s.drawPlane,s.drawDepth)}
 function down(e:React.PointerEvent<SVGSVGElement>){if(e.button!==0)return;e.preventDefault();e.stopPropagation();const v=location(e);if(!v){s.notify('This view cannot reach the drawing plane. Choose XY, XZ or YZ to align the view.');return}if(s.drawMethod==='points')s.placePathPoint(v);else{gesture.current=[v];setFreehand([v]);e.currentTarget.setPointerCapture(e.pointerId)}}
 function move(e:React.PointerEvent<SVGSVGElement>){const v=location(e);setHover(v);if(!v||!gesture.current)return;e.stopPropagation();const last=gesture.current.at(-1)!,a=mapProjectPoint(engine!.mapCamera,p,last,width,height),b=mapProjectPoint(engine!.mapCamera,p,v,width,height);if(Math.hypot(a.x-b.x,a.y-b.y)<3)return;gesture.current.push(v);if(gesture.current.length>4096)gesture.current=gesture.current.filter((_,i)=>i%2===0);setFreehand([...gesture.current])}
 function finish(e:React.PointerEvent<SVGSVGElement>){if(!gesture.current)return;e.stopPropagation();const v=location(e),list=[...gesture.current,...(v?[v]:[])].filter((v,i,a)=>!i||Math.hypot(v.x-a[i-1].x,v.y-a[i-1].y,v.z-a[i-1].z)>1e-7);gesture.current=null;setFreehand([]);if(list.length<2)return;const count=Math.min(60,list.length),points=Array.from({length:count},(_,i)=>list[Math.round(i/(count-1)*(list.length-1))]);s.replacePath(points,true)}
 const points=s.drawMethod==='points'?s.pathDraft?.points||[]:freehand,projected=points.map(v=>mapProjectPoint(engine.mapCamera,p,v,width,height))
 return <svg className="map-draw-overlay" aria-label="Draw path in 3D space" onPointerDown={down} onPointerMove={move} onPointerUp={finish} onPointerCancel={()=>{gesture.current=null;setFreehand([])}} onPointerLeave={()=>setHover(null)}><rect width="100%" height="100%" fill="transparent"/><polyline points={projected.map(q=>`${q.x},${q.y}`).join(' ')} fill="none" stroke="#67baff" strokeWidth="2" pointerEvents="none"/>{points.map((v,i)=>{const q=projected[i];return q.visible?<g key={i} pointerEvents="none"><circle cx={q.x} cy={q.y} r="5" fill="white" stroke="#479ce4" strokeWidth="2"/><text x={q.x+10} y={q.y-10}>P{i+1} · {v.x.toFixed(1)}, {v.y.toFixed(1)}, {v.z.toFixed(1)}</text></g>:null})}{hover&&<text x="12" y={height-14} className="map-draw-coordinate" pointerEvents="none">X {hover.x.toFixed(2)} · Y {hover.y.toFixed(2)} · Z {hover.z.toFixed(2)}</text>}</svg>
}
