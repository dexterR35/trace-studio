import { useEffect, useMemo, useRef, useState } from 'react'
import { MousePointer2, Scan, Brush, Eraser, Ruler, Hand, PenTool, Pipette, MapPin, Spline, Minus, Plus, Maximize, Crop, Triangle } from 'lucide-react'
import { usePick } from './store'
import { bounds, combine, contours, distance, measure, pathData, relationship, unitValue } from './geometry'
import { alphaOf, canvas, colorSelect, maskCanvas, paint, pickComponent, polygonMask, quickForeground, renderCutout, ringsMask } from './imaging'
import { uid } from './types'
import type { Tool, XY } from './types'
import { runModel } from './api'
import { applyTarget, captureTarget } from './target'
import { canvasTools } from './guide'
const tools:{id:Tool;name:string;key:string;Icon:typeof MousePointer2}[]=[{id:'select',name:'Click subject',key:'V',Icon:MousePointer2},{id:'box',name:'Box selection',key:'B',Icon:Scan},{id:'lasso',name:'Freehand selection',key:'L',Icon:Spline},{id:'brush',name:'Add to mask',key:'P',Icon:Brush},{id:'erase',name:'Erase mask',key:'E',Icon:Eraser},{id:'measure',name:'Distance ruler',key:'M',Icon:Ruler},{id:'angle',name:'Angle ruler',key:'A',Icon:Triangle},{id:'point',name:'Add landmark',key:'K',Icon:MapPin},{id:'vector',name:'Edit vector points',key:'N',Icon:PenTool},{id:'sample',name:'Sample color',key:'I',Icon:Pipette},{id:'perspective',name:'Perspective corners',key:'R',Icon:Crop},{id:'hand',name:'Pan canvas',key:'H',Icon:Hand}]
export function PickStage({pixels}:{pixels:ImageData}){
 const s=usePick(),p=s.project,subject=p.subjects.find(v=>v.id===s.selected),part=subject?.parts.find(v=>v.id===s.part),mask=part?.mask||subject?.mask,svg=useRef<SVGSVGElement>(null),viewport=useRef<HTMLDivElement>(null),bitmap=useRef<HTMLCanvasElement>(null),drag=useRef<{kind:Tool|'measure-point'|'vector-point'|'landmark';start:XY;last:XY;points:XY[];original?:Uint8ClampedArray;index?:number;ring?:number;id?:string;endpoint?:number;pan?:XY}|null>(null),[size,setSize]=useState({w:800,h:600}),[preview,setPreview]=useState<XY[]>([]),[cursor,setCursor]=useState<XY|null>(null),[pending,setPending]=useState<XY[]>([]),[hover,setHover]=useState<XY|null>(null)
 const w=p.image.width,h=p.image.height,visible=useMemo(()=>{if(s.cutout&&mask)return bounds(mask,w,h);const alpha=alphaOf(pixels);return alpha.some(v=>v<128)?bounds(alpha,w,h):null},[pixels,w,h,s.cutout,mask]),fit=Math.min((size.w-120)/(visible?.width||w),(size.h-120)/(visible?.height||h)),scale=Math.max(.01,fit)*s.zoom,b=mask?bounds(mask,w,h):null,foreground=useMemo(()=>quickForeground(pixels,s.tolerance),[pixels,s.tolerance])
 useEffect(()=>{const area=viewport.current;if(!area)return;const r=new ResizeObserver(()=>setSize({w:area.clientWidth,h:area.clientHeight}));r.observe(area);return()=>r.disconnect()},[])
 useEffect(()=>{drag.current=null;setPending([]);setPreview([])},[s.tool,p.image.src,s.selected,s.part,p.id])
 useEffect(()=>{if(!bitmap.current)return;const c=bitmap.current;c.width=w;c.height=h;const ctx=c.getContext('2d')!;ctx.clearRect(0,0,w,h);if(s.cutout&&mask)ctx.drawImage(renderCutout(pixels,mask),0,0);else ctx.putImageData(pixels,0,0);if(mask&&!s.cutout&&s.overlay)ctx.drawImage(maskCanvas(mask,w,h,true,'#26c4dc',s.overlay),0,0);if(s.page==='analyze'&&subject&&!part)for(const v of subject.parts.filter(v=>v.enabled))ctx.drawImage(maskCanvas(v.mask,w,h,true,v.color,.22),0,0)},[pixels,mask,s.cutout,s.overlay,s.page,subject?.parts,w,h])
 const location=(e:React.PointerEvent):XY=>{const r=svg.current!.getBoundingClientRect();return {x:Math.max(0,Math.min(w-1,(e.clientX-r.left)/r.width*w)),y:Math.max(0,Math.min(h-1,(e.clientY-r.top)/r.height*h))}}
 function updateMask(next:Uint8ClampedArray,record=true){const st=usePick.getState();st.set({selectionCandidates:[],selectionPrompts:[]});st.subject(v=>{if(st.part){const part=v.parts.find(q=>q.id===st.part);if(part)part.mask=next}else{v.mask=next;v.outline=contours(next,w,h);v.parts=[];v.appearance=undefined}},record)}
 async function select(point:XY,e:React.PointerEvent){
  const actualMode=e.altKey?'subtract':e.shiftKey?'add':s.mode
  if(actualMode==='replace'&&(s.model==='local'||s.busy)){const existing=[...p.subjects].reverse().find(v=>!v.draft&&v.mask[Math.floor(point.y)*w+Math.floor(point.x)]>127);if(existing){s.selectSubject(existing.id);return}}
  if(s.busy){s.notify('A model is running. Switch saved assets with the thumbnails, or cancel before making another selection.');return}
  if(s.model!=='local'&&s.model!=='browser'){
   const target=subject?captureTarget():undefined,partId=s.part,startedSelection=s.selected
   const prompts=actualMode==='replace'?[{...point,label:1}]:[...s.selectionPrompts,{...point,label:actualMode==='subtract'?0:1}]
   try{const result=await runModel('select',pixels,{model:s.model,targetSubjectId:actualMode==='replace'?null:subject?.id,points:prompts,box:actualMode==='replace'||s.selectionPrompts.length?undefined:b?[b.x,b.y,b.x+b.width,b.y+b.height]:undefined})
    const next=result.mask;if(!next)return;let resultSubjectId:string|null=null
    if(target&&actualMode!=='replace'){if(applyTarget(target,v=>{const combined=actualMode==='intersect'?combine(mask!,next,'intersect'):next,part=v.parts.find(q=>q.id===partId);if(part)part.mask=combined;else{v.mask=combined;v.outline=contours(combined,w,h);v.parts=[];v.appearance=undefined}}))resultSubjectId=target.subjectId}
    else resultSubjectId=s.previewSubject(next,s.model,usePick.getState().selected===startedSelection)
    if(resultSubjectId&&usePick.getState().project.id===p.id&&usePick.getState().selected===resultSubjectId)s.set({selectionCandidates:result.candidates||[],selectionPrompts:prompts})
    if(resultSubjectId)s.notify('Selection ready. Try another boundary if needed. Shift-click includes; Alt-click excludes. Extract saves an asset.')
   }catch(e){s.notify((e as Error).message)}return
  }
  let next=pickComponent(foreground,w,h,point);if(!next)next=colorSelect(pixels,point,s.tolerance)
  if(!bounds(next,w,h)){s.notify('No visible pixels here. Try a box or brush selection.');return}
  if(subject&&actualMode!=='replace')updateMask(combine(mask!,next,actualMode));else s.previewSubject(next,'Manual connected shape / color region')
  s.set({selectionCandidates:[],selectionPrompts:[]})
 }
 function down(e:React.PointerEvent){if(e.button!==0)return;const pt=location(e);svg.current?.setPointerCapture(e.pointerId)
  if(s.tool==='select'){void select(pt,e);return}
  if(s.busy&&s.tool!=='hand'){s.notify('You can switch assets while the model works. Mask edits resume when it finishes or is cancelled.');return}
  if(s.tool==='sample'){const i=(Math.floor(pt.y)*w+Math.floor(pt.x))*4,color='#'+[pixels.data[i],pixels.data[i+1],pixels.data[i+2]].map(v=>v.toString(16).padStart(2,'0')).join('');if(subject)s.subject(v=>{if(v.appearance)v.appearance.colors=[{hex:color,fraction:0},...v.appearance.colors].slice(0,8)});s.notify(`Sampled ${color} at ${Math.round(pt.x)}, ${Math.round(pt.y)}`);return}
  if(s.tool==='point'){if(!subject){s.notify('Select a subject first');return}s.subject(v=>v.landmarks.push({name:`Point ${v.landmarks.length+1}`,point:pt}));return}
  if(s.tool==='perspective'){const corners=s.perspective.length>=4?[]:s.perspective;s.set({perspective:[...corners,pt]});s.notify(corners.length===3?'Four corners ready. Use Rectify plane in Analyze → Geometry.':`Corner ${corners.length+1}/4 · click clockwise from top-left`);return}
  if(s.tool==='measure'||s.tool==='angle'){if(!subject){s.notify('Select a subject before adding measurements');return}const pts=[...pending,pt],needed=s.tool==='angle'?3:2;if(pts.length===needed){s.subject(v=>v.measures.push({id:uid(),name:`${s.tool==='angle'?'Angle':'Length'} ${v.measures.length+1}`,kind:s.tool==='angle'?'angle':'distance',points:pts}));setPending([])}else setPending(pts);return}
  if((s.tool==='brush'||s.tool==='erase')&&!mask){s.notify('Select a subject first, or use box selection');return}
  if(s.tool==='brush'||s.tool==='erase')s.begin()
  drag.current={kind:s.tool,start:pt,last:pt,points:[pt],original:mask?.slice(),pan:{x:e.clientX,y:e.clientY}};setPreview([pt]);if((s.tool==='brush'||s.tool==='erase')&&mask)updateMask(paint(mask,w,h,pt,pt,s.brush/2,s.tool==='erase'),false)
 }
 function move(e:React.PointerEvent){const pt=location(e);setCursor(pt);setHover(pt);const d=drag.current;if(!d)return
  if(d.kind==='hand'){s.set({pan:{x:s.pan.x+e.clientX-d.pan!.x,y:s.pan.y+e.clientY-d.pan!.y}});d.pan={x:e.clientX,y:e.clientY};return}
  if(d.kind==='measure-point'){s.subject(v=>{const m=v.measures.find(v=>v.id===d.id);if(m)m.points[d.endpoint!]=pt},false);return}
  if(d.kind==='vector-point'){s.subject(v=>{v.outline[d.ring!][d.index!]=pt},false);return}
  if(d.kind==='landmark'){s.subject(v=>{v.landmarks[d.index!].point=pt},false);return}
  if(d.kind==='brush'||d.kind==='erase'){const st=usePick.getState(),sub=st.project.subjects.find(v=>v.id===st.selected),current=st.part?sub?.parts.find(v=>v.id===st.part)?.mask:sub?.mask;if(current)updateMask(paint(current,w,h,d.last,pt,s.brush/2,d.kind==='erase'),false);d.last=pt;return}
  if(d.kind==='box'){setPreview([d.start,pt]);d.last=pt}else if(d.kind==='lasso'){d.points.push(pt);setPreview([...d.points])}
 }
 async function up(e:React.PointerEvent){const d=drag.current;drag.current=null;if(!d)return;setPreview([])
  if(d.kind==='vector-point'){const sub=usePick.getState().project.subjects.find(v=>v.id===s.selected);if(sub)s.subject(v=>{v.mask=ringsMask(sub.outline,w,h);v.parts=[];v.appearance=undefined},false)}
  if(d.kind==='box'||d.kind==='lasso'){let pts=d.points;if(d.kind==='box'){const a=d.start,b=location(e);if(distance(a,b)<3)return;pts=[a,{x:b.x,y:a.y},b,{x:a.x,y:b.y}]}
   const next=polygonMask(pts,w,h);if(!bounds(next,w,h))return;const actualMode=e.altKey?'subtract':e.shiftKey?'add':s.mode
   if(d.kind==='box'&&s.model!=='local'&&s.model!=='browser'){
    const b=bounds(next,w,h)!,target=subject?captureTarget():undefined,partId=s.part,startedSelection=s.selected
    try{const r=await runModel('select',pixels,{model:s.model,targetSubjectId:actualMode==='replace'?null:subject?.id,box:[b.x,b.y,b.x+b.width,b.y+b.height]});let resultSubjectId:string|null=null
     if(r.mask){if(target&&actualMode!=='replace'){if(applyTarget(target,v=>{const combined=combine(mask!,r.mask!,actualMode),part=v.parts.find(q=>q.id===partId);if(part)part.mask=combined;else{v.mask=combined;v.outline=contours(combined,w,h);v.parts=[];v.appearance=undefined}}))resultSubjectId=target.subjectId}else resultSubjectId=s.previewSubject(r.mask,s.model,usePick.getState().selected===startedSelection)
      if(resultSubjectId&&usePick.getState().selected===resultSubjectId)s.set({selectionCandidates:r.candidates||[],selectionPrompts:[]})
     }
    }catch(e){s.notify((e as Error).message)}return
   }
   if(subject&&actualMode!=='replace')updateMask(combine(mask!,next,actualMode));else s.previewSubject(next,d.kind==='box'?'Manual box':'Manual freehand')
  }
 }
 function handleStart(e:React.PointerEvent,kind:'measure-point'|'vector-point'|'landmark',data:Partial<NonNullable<typeof drag.current>>){e.stopPropagation();if(s.busy)return;s.begin();svg.current?.setPointerCapture(e.pointerId);const pt=location(e);drag.current={kind,start:pt,last:pt,points:[],...data}}
 const display=(v:number)=>`${unitValue(v,s.unit,p.calibration,w).toFixed(s.unit==='px'?0:1)} ${s.unit==='cm'&&!p.calibration?'px':s.unit}`
 const lineWidth=1.5/scale,font=11/scale,pointSize=4/scale
 return <div className="pk-stage-wrap"><div className="pk-tools" aria-label="Canvas tools">{tools.map(({id,name,key,Icon})=><button key={id} className={s.tool===id?'active':''} aria-label={name} aria-pressed={s.tool===id} title={`${name} (${key}) — ${canvasTools.find(v=>v.id===id)?.description||name}`} onClick={()=>s.set({tool:id,...(['measure','angle','point','vector','perspective'].includes(id)?{page:'analyze' as const}:{})})}><Icon size={19}/></button>)}</div>
  <div ref={viewport} className={`pk-viewport ${s.backdrop==='checker'?'pk-checker':''}`} style={{backgroundColor:s.backdrop==='checker'?undefined:s.backdrop}} onWheel={e=>{if(e.ctrlKey||e.metaKey){e.preventDefault();s.set({zoom:Math.max(.2,Math.min(6,s.zoom*(e.deltaY>0?.9:1.1)))})}}}>
   <div className="pk-artboard" style={{width:w*scale,height:h*scale,transform:`translate(${s.pan.x+(visible?(w/2-visible.x-visible.width/2)*scale:0)}px,${s.pan.y+(visible?(h/2-visible.y-visible.height/2)*scale:0)}px)`}}><canvas ref={bitmap} className="pk-bitmap" aria-label="Image artboard"/>
    <svg ref={svg} viewBox={`0 0 ${w} ${h}`} className={`pk-canvas-overlay tool-${s.tool}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>{drag.current=null;setPreview([])}} onPointerLeave={()=>{setCursor(null);setHover(null)}}>
     <defs><filter id="outline-shadow"><feDropShadow dx="0" dy="0" stdDeviation="1" floodColor="#fff"/></filter></defs>
     {s.outline&&subject&&<path d={pathData(subject.outline)} fill="none" stroke="#02afce" strokeWidth={lineWidth} pointerEvents="none"/>}
     {b&&s.outline&&<g pointerEvents="none" stroke="#17c1d5" strokeWidth={lineWidth}><rect x={b.x} y={b.y} width={b.width} height={b.height} fill="none" strokeDasharray={`${5/scale} ${3/scale}`}/>{[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y],i)=><rect key={i} x={x-3/scale} y={y-3/scale} width={6/scale} height={6/scale} fill="white"/>)}</g>}
     {b&&s.page==='analyze'&&<g fill="#173656" stroke="#16adc5" strokeWidth={lineWidth} pointerEvents="none"><path d={`M${b.x},${b.y-17/scale}h${b.width}m${-b.width},${-5/scale}v${10/scale}m${b.width},${-10/scale}v${10/scale}`} fill="none"/><text x={b.x+b.width/2} y={b.y-25/scale} textAnchor="middle" stroke="none" fontSize={font}>{display(b.width)}</text><path d={`M${b.x+b.width+18/scale},${b.y}v${b.height}m${-5/scale},${-b.height}h${10/scale}m${-10/scale},${b.height}h${10/scale}`} fill="none"/><text x={b.x+b.width+25/scale} y={b.y+b.height/2} stroke="none" fontSize={font}>{display(b.height)}</text></g>}
     {s.spacing&&b&&p.subjects.filter(v=>v.id!==subject?.id).map(other=>{const ob=bounds(other.mask,w,h);if(!ob)return null;const r=relationship(b,ob);return <g key={other.id} stroke="#658ebc" strokeWidth={lineWidth} fill="none" pointerEvents="none"><line x1={r.center_a.x} y1={r.center_a.y} x2={r.center_b.x} y2={r.center_b.y} strokeDasharray={`${5/scale} ${4/scale}`}/><text x={(r.center_a.x+r.center_b.x)/2} y={(r.center_a.y+r.center_b.y)/2-8/scale} stroke="white" paintOrder="stroke" strokeWidth={3/scale} fill="#416e9d" textAnchor="middle" fontSize={font}>gap {display(r.horizontal_gap)} · centers {display(r.distance)}</text></g>})}
     {subject?.measures.map(m=><g key={m.id} stroke="#8c5bdd" fill="white" strokeWidth={lineWidth}><polyline points={m.points.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" pointerEvents="none"/>{m.points.map((pt,i)=><circle key={i} cx={pt.x} cy={pt.y} r={pointSize} className="pk-draggable" onPointerDown={e=>handleStart(e,'measure-point',{id:m.id,endpoint:i})}/>)}<text x={m.points[0].x+8/scale} y={m.points[0].y-8/scale} fill="#7350b8" stroke="white" strokeWidth={3/scale} paintOrder="stroke" fontSize={font} pointerEvents="none">{m.name}: {m.kind==='angle'?`${measure(m).toFixed(1)}°`:display(measure(m))}</text></g>)}
     {subject?.landmarks.map((v,i)=><g key={i}><circle cx={v.point.x} cy={v.point.y} r={pointSize} fill="white" stroke="#e48b3f" strokeWidth={lineWidth} className="pk-draggable" onPointerDown={e=>handleStart(e,'landmark',{index:i})}/><text x={v.point.x+7/scale} y={v.point.y-7/scale} fontSize={font} fill="#a96425" pointerEvents="none">{v.name}</text></g>)}
     {s.tool==='vector'&&subject?.outline.map((r,ri)=>r.map((pt,i)=><circle key={`${ri}-${i}`} cx={pt.x} cy={pt.y} r={pointSize*.75} fill="white" stroke="#139fc7" strokeWidth={lineWidth} className="pk-draggable" onPointerDown={e=>handleStart(e,'vector-point',{ring:ri,index:i})}/>))}
     {preview.length>0&&<polyline points={(s.tool==='box'&&preview.length===2?[preview[0],{x:preview[1].x,y:preview[0].y},preview[1],{x:preview[0].x,y:preview[1].y},preview[0]]:preview).map(v=>`${v.x},${v.y}`).join(' ')} stroke="#078fc1" strokeWidth={lineWidth} fill={s.tool==='box'||s.tool==='lasso'?'#2dc8df22':'none'} pointerEvents="none"/>}
     {pending.length>0&&<polyline points={[...pending,...(hover?[hover]:[])].map(v=>`${v.x},${v.y}`).join(' ')} fill="none" stroke="#9062d4" strokeWidth={lineWidth} strokeDasharray={`${4/scale} ${3/scale}`} pointerEvents="none"/>}
     {s.perspective.length>0&&<g stroke="#e78431" strokeWidth={lineWidth}><polyline points={[...s.perspective,...(s.perspective.length===4?[s.perspective[0]]:[])].map(v=>`${v.x},${v.y}`).join(' ')} fill="#ffa34411" pointerEvents="none"/>{s.perspective.map((v,i)=><g key={i}><circle cx={v.x} cy={v.y} r={pointSize} fill="white" pointerEvents="none"/><text x={v.x+7/scale} y={v.y-8/scale} fontSize={font} stroke="none" fill="#ce782f">{i+1}</text></g>)}</g>}
     {s.selectionPrompts.map((v,i)=><g key={`prompt-${i}`} pointerEvents="none"><circle cx={v.x} cy={v.y} r={pointSize*1.5} fill={v.label?'#1687ae':'#e65746'} stroke="white" strokeWidth={lineWidth}/><text x={v.x} y={v.y+3/scale} textAnchor="middle" fontSize={font} fill="white">{v.label?'+':'−'}</text></g>)}
     {cursor&&(s.tool==='brush'||s.tool==='erase')&&<circle cx={cursor.x} cy={cursor.y} r={s.brush/2} fill="none" stroke={s.tool==='erase'?'#f05f51':'#12a7c9'} strokeWidth={lineWidth} pointerEvents="none"/>}
    </svg>
   </div>
  </div>
  <div className="pk-canvas-hint">{s.tool==='measure'?'Click two points to measure':s.tool==='angle'?'Click three points · vertex is the second':s.tool==='vector'?'Drag contour points · SVG preserves holes':s.tool==='perspective'?'Click four plane corners clockwise':s.tool==='brush'||s.tool==='erase'?'Drag to refine the selected mask':s.tool==='select'?'Click a subject · Shift adds · Alt subtracts':tools.find(t=>t.id===s.tool)?.name}</div>
  <div className="pk-stage-controls"><button aria-label="Zoom out" onClick={()=>s.set({zoom:Math.max(.2,s.zoom-.15)})}><Minus size={15}/></button><span>{Math.round(s.zoom*100)}%</span><button aria-label="Zoom in" onClick={()=>s.set({zoom:Math.min(6,s.zoom+.15)})}><Plus size={15}/></button><i/><button aria-label="Fit artboard" onClick={()=>s.set({zoom:1,pan:{x:0,y:0}})}><Maximize size={15}/></button><span className="pk-coordinates">X: {cursor?Math.round(cursor.x):'—'} &nbsp; Y: {cursor?Math.round(cursor.y):'—'}</span></div>
 </div>
}
