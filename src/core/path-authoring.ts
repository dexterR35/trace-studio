import { autoHandles, buildPath, defaultLayer, invalidatePath, makePoint, mix, mixVec, pathPoseAt } from './animation'
import { cloneLayer } from './project'
import { POSITION_LIMIT, type Layer, type Point, type Vec } from './types'

export function stationaryLayer(width:number,height:number,kind:Layer['kind']='image'):Layer {
 const layer=defaultLayer(width,height,kind)
 layer.points=[0,layer.duration].map(time=>({...makePoint({x:width/2,y:height/2,z:0},time),curve:'linear' as const,handleMode:'free' as const}))
 return layer
}
export function authoredPath(layer:Layer,positions:Vec[],smooth=false,at=layer.delay) {
 if(layer.locked)throw new Error('Unlock this element before drawing its path.')
 if(positions.length<2||positions.length>60)throw new Error('Place between 2 and 60 path points.')
 if(positions.some(v=>!['x','y','z'].every(k=>Number.isFinite(v[k as keyof Vec])&&Math.abs(v[k as keyof Vec])<=POSITION_LIMIT)))throw new Error('Path coordinates must be finite and inside the world limits.')
 const duration=buildPath(layer).duration,pose=pathPoseAt({...layer,orient:false},at)
 const lengths=[0];for(let i=1;i<positions.length;i++)lengths.push(lengths[i-1]+Math.hypot(positions[i].x-positions[i-1].x,positions[i].y-positions[i-1].y,positions[i].z-positions[i-1].z))
 const total=lengths.at(-1)!
 const points=positions.map((v,i)=>({...makePoint(v,(total?lengths[i]/total:i/(positions.length-1))*duration),scale:pose.scale,rx:pose.rx,ry:pose.ry,rz:pose.rz,opacity:pose.opacity,curve:'linear' as const,handleMode:'free' as const}))
 if(layer.timing==='keyframes'&&points.some((v,i)=>i>0&&v.time<=points[i-1].time))throw new Error('Consecutive timed points need different positions.')
 layer.points=smooth?autoHandles(points):points
 invalidatePath(layer)
}
const sub=(a:Vec,b:Vec):Vec=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z})
const add=(a:Vec,b:Vec):Vec=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z})
/** De Casteljau subdivision retains every original cubic, including XYZ handles. */
export function pointsBetween(layer:Layer,start:number,end:number,count:number,spacing:'distance'|'time'='distance') {
 if(layer.locked)throw new Error('Unlock this element first.')
 if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>=layer.points.length||end<=start)throw new Error('Choose point A before point B.')
 if(!Number.isInteger(count)||count<1||count+layer.points.length>60)throw new Error('Choose a positive count within the 60-point path limit.')
 const original=cloneLayer(layer),data=buildPath(original),a=spacing==='distance'?data.nodeDistances[start]:data.nodeTimes[start],b=spacing==='distance'?data.nodeDistances[end]:data.nodeTimes[end]
 const targets:{segment:number;t:number;time:number}[]=[]
 for(let n=1;n<=count;n++){
  const value=mix(a,b,n/(count+1)),key=spacing==='distance'?'distance':'seconds'
  if(b-a<1e-10){const u=start+(end-start)*n/(count+1),segment=Math.min(end-1,Math.floor(u));targets.push({segment,t:u-segment,time:mix(data.nodeTimes[segment],data.nodeTimes[segment+1],u-segment)});continue}
  let hi=data.samples.findIndex(v=>v[key]>=value);if(hi<1)hi=1
  const left=data.samples[hi-1],right=data.samples[hi],f=(value-left[key])/Math.max(1e-12,right[key]-left[key]),segment=right.segment,t=left.segment===segment?mix(left.t,right.t,f):right.t*f
  if(t>1e-8&&t<1-1e-8)targets.push({segment,t,time:mix(left.seconds,right.seconds,f)})
 }
 if(spacing==='time'){layer.points.forEach((v,i)=>{v.time=data.nodeTimes[i]});layer.timing='keyframes';layer.duration=data.duration}
 let previousSegment=-1,previousT=1
 for(const target of targets.reverse()){
  if(target.segment!==previousSegment)previousT=1
  const i=target.segment,a=layer.points[i],b=layer.points[i+1],t=target.t/previousT,p0:Vec=a,p1=a.curve==='linear'?mixVec(a,b,1/3):add(a,a.outgoing),p2=a.curve==='linear'?mixVec(a,b,2/3):add(b,b.incoming),p3:Vec=b
  const p01=mixVec(p0,p1,t),p12=mixVec(p1,p2,t),p23=mixVec(p2,p3,t),p012=mixVec(p01,p12,t),p123=mixVec(p12,p23,t),position=mixVec(p012,p123,t)
  const oa=original.points[i],ob=original.points[i+1],e=target.t**2*(3-2*target.t),point:Point={...makePoint(position,target.time),curve:oa.curve,handleMode:'aligned',incoming:sub(p012,position),outgoing:sub(p123,position)}
  for(const k of ['scale','rx','ry','rz','opacity'] as const)point[k]=mix(oa[k],ob[k],e)
  point.speed=mix(oa.speed,ob.speed,target.t)
  if(a.handleMode==='auto')a.handleMode='aligned';if(b.handleMode==='auto')b.handleMode='aligned'
  a.outgoing=sub(p01,p0);b.incoming=sub(p23,p3);layer.points.splice(i+1,0,point)
  previousSegment=i;previousT=target.t
 }
 invalidatePath(layer);return targets.length
}
