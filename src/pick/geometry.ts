import type { Bounds, Measure, XY } from './types'
export const distance = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y)
export function bounds(mask: Uint8ClampedArray, w: number, h: number): Bounds | null {
 let x=w,y=h,right=-1,bottom=-1,area=0
 for(let i=0;i<mask.length;i++) if(mask[i]>127){const px=i%w,py=Math.floor(i/w);x=Math.min(x,px);y=Math.min(y,py);right=Math.max(right,px);bottom=Math.max(bottom,py);area++}
 return right<0?null:{x,y,width:right-x+1,height:bottom-y+1,area}
}
export function encodeMask(mask: Uint8ClampedArray): number[] { const out:number[]=[];if(!mask.length)return out;let value=mask[0],count=0;for(const v of mask){if(v===value)count++;else{out.push(value,count);value=v;count=1}}out.push(value,count);return out }
export function decodeMask(runs: unknown, length: number): Uint8ClampedArray {
 if(!Array.isArray(runs)||runs.length%2||runs.length>length*2)throw new Error('Invalid mask encoding')
 const mask=new Uint8ClampedArray(length);let pos=0
 for(let i=0;i<runs.length;i+=2){const v=runs[i],n=runs[i+1];if(!Number.isInteger(v)||v<0||v>255||!Number.isInteger(n)||n<1||pos+n>length)throw new Error('Invalid mask data');mask.fill(v,pos,pos+n);pos+=n}if(pos!==length)throw new Error('Mask dimensions do not match image');return mask
}
export function combine(a:Uint8ClampedArray,b:Uint8ClampedArray,mode:'replace'|'add'|'subtract'|'intersect'){
 if(a.length!==b.length)throw new Error('Mask dimensions differ');if(mode==='replace')return b.slice();const out=a.slice();for(let i=0;i<a.length;i++)out[i]=mode==='add'?Math.max(a[i],b[i]):mode==='subtract'?Math.max(0,a[i]-b[i]):Math.min(a[i],b[i]);return out
}
export function components(mask:Uint8ClampedArray,w:number,h:number,minArea=16){
 const seen=new Uint8Array(mask.length),queue=new Int32Array(mask.length),groups:{indices:number[];bounds:Bounds}[]=[]
 for(let i=0;i<mask.length;i++){if(seen[i]||mask[i]<128)continue;let head=0,tail=0;queue[tail++]=i;seen[i]=1;const indices:number[]=[];let x=w,y=h,r=0,b=0
 const add=(j:number)=>{if(!seen[j]&&mask[j]>127){seen[j]=1;queue[tail++]=j}}
 while(head<tail){const j=queue[head++],px=j%w,py=Math.floor(j/w);indices.push(j);x=Math.min(x,px);y=Math.min(y,py);r=Math.max(r,px);b=Math.max(b,py);if(px>0)add(j-1);if(px<w-1)add(j+1);if(j>=w)add(j-w);if(j<w*(h-1))add(j+w)}if(indices.length>=minArea)groups.push({indices,bounds:{x,y,width:r-x+1,height:b-y+1,area:indices.length}})}return groups.sort((a,b)=>b.indices.length-a.indices.length)
}
function segmentDistance(p:XY,a:XY,b:XY){const t=Math.max(0,Math.min(1,((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/Math.max(1e-12,distance(a,b)**2)));return distance(p,{x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)})}
export function simplify(points:XY[],tolerance=1.5):XY[]{if(points.length<3)return points;let d=0,index=0;for(let i=1;i<points.length-1;i++){const next=segmentDistance(points[i],points[0],points.at(-1)!);if(next>d){d=next;index=i}}if(d<=tolerance)return [points[0],points.at(-1)!];return [...simplify(points.slice(0,index+1),tolerance).slice(0,-1),...simplify(points.slice(index),tolerance)]}
// Trace directed pixel edges. Each closed ring is retained, including holes and detached islands.
export function contours(mask:Uint8ClampedArray,w:number,h:number,tolerance=1.5):XY[][]{
 const edges=new Map<number,number[]>(),stride=w+1,key=(x:number,y:number)=>y*stride+x
 const edge=(a:number,b:number)=>{const list=edges.get(a)||[];list.push(b);edges.set(a,list)}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(mask[i]<128)continue;if(y===0||mask[i-w]<128)edge(key(x,y),key(x+1,y));if(x===w-1||mask[i+1]<128)edge(key(x+1,y),key(x+1,y+1));if(y===h-1||mask[i+w]<128)edge(key(x+1,y+1),key(x,y+1));if(x===0||mask[i-1]<128)edge(key(x,y+1),key(x,y))}
 const rings:XY[][]=[];while(edges.size){const start=edges.keys().next().value!;let current=start;const ring:XY[]=[];let guard=0;do{ring.push({x:current%stride,y:Math.floor(current/stride)});const targets=edges.get(current);if(!targets?.length)break;const next=targets.pop()!;if(!targets.length)edges.delete(current);current=next}while(current!==start&&guard++<w*h*4);if(current===start&&ring.length>=4){ring.push(ring[0]);const simple=simplify(ring,tolerance);if(simple.length>=4)rings.push(simple.slice(0,-1))}}return rings
}
export function pathData(rings:XY[][]){return rings.filter(r=>r.length>=3).map(r=>`M${r.map(p=>`${+p.x.toFixed(2)},${+p.y.toFixed(2)}`).join('L')}Z`).join(' ')}
export function angle(a:XY,b:XY,c:XY){const u={x:a.x-b.x,y:a.y-b.y},v={x:c.x-b.x,y:c.y-b.y};return Math.acos(Math.max(-1,Math.min(1,(u.x*v.x+u.y*v.y)/Math.max(1e-12,distance(a,b)*distance(c,b)))))*180/Math.PI}
export function measure(m:Measure){return m.kind==='angle'&&m.points.length===3?angle(m.points[0],m.points[1],m.points[2]):m.points.slice(1).reduce((sum,p,i)=>sum+distance(m.points[i],p),0)}
export function unitValue(px:number,unit:string,calibration:{pixels:number;centimeters:number}|null,reference:number){if(unit==='%')return px/reference*100;if(unit==='cm'&&calibration)return px/calibration.pixels*calibration.centimeters;return px}
// Solve the four-corner projective mapping with Gaussian elimination.
export function homography(from:XY[],to:XY[]):number[]{if(from.length!==4||to.length!==4)throw new Error('Select four perspective corners');const a:number[][]=[];for(let i=0;i<4;i++){const {x,y}=from[i],u=to[i].x,v=to[i].y;a.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v])}for(let c=0;c<8;c++){let p=c;for(let r=c+1;r<8;r++)if(Math.abs(a[r][c])>Math.abs(a[p][c]))p=r;if(Math.abs(a[p][c])<1e-10)throw new Error('Perspective corners are degenerate');[a[c],a[p]]=[a[p],a[c]];const d=a[c][c];for(let j=c;j<9;j++)a[c][j]/=d;for(let r=0;r<8;r++)if(r!==c){const f=a[r][c];for(let j=c;j<9;j++)a[r][j]-=f*a[c][j]}}return [...a.map(r=>r[8]),1]}
export function projectPoint(p:XY,m:number[]):XY{const d=m[6]*p.x+m[7]*p.y+m[8];if(Math.abs(d)<1e-10)throw new Error('Point lies at perspective infinity');return {x:(m[0]*p.x+m[1]*p.y+m[2])/d,y:(m[3]*p.x+m[4]*p.y+m[5])/d}}
export function relationship(a:Bounds,b:Bounds){const centerA={x:a.x+a.width/2,y:a.y+a.height/2},centerB={x:b.x+b.width/2,y:b.y+b.height/2};return {center_a:centerA,center_b:centerB,delta_x:centerB.x-centerA.x,delta_y:centerB.y-centerA.y,distance:distance(centerA,centerB),angle_degrees:Math.atan2(centerB.y-centerA.y,centerB.x-centerA.x)*180/Math.PI,horizontal_gap:Math.max(0,Math.max(a.x,b.x)-Math.min(a.x+a.width,b.x+b.width)),vertical_gap:Math.max(0,Math.max(a.y,b.y)-Math.min(a.y+a.height,b.y+b.height)),width_ratio:b.width/a.width,height_ratio:b.height/a.height}}
export function poseMeasurements(landmarks:{name:string;point:XY;confidence?:number}[]):Measure[]{
 const lengths=[['Shoulders','Left shoulder','Right shoulder'],['Hips','Left hip','Right hip'],...['Left','Right'].flatMap(side=>[[`${side} upper arm`,`${side} shoulder`,`${side} elbow`],[`${side} forearm`,`${side} elbow`,`${side} wrist`],[`${side} thigh`,`${side} hip`,`${side} knee`],[`${side} shin`,`${side} knee`,`${side} ankle`],[`${side} torso`,`${side} shoulder`,`${side} hip`]])]
 const angles=['Left','Right'].flatMap(side=>[[`${side} elbow angle`,`${side} shoulder`,`${side} elbow`,`${side} wrist`],[`${side} knee angle`,`${side} hip`,`${side} knee`,`${side} ankle`]])
 const out:Measure[]=[];for(const suffix of new Set(landmarks.map(v=>v.name.includes(' · person ')?v.name.slice(v.name.indexOf(' · person ')):''))){for(const [kind,rows] of [['distance',lengths],['angle',angles]] as const)for(const [name,...names] of rows){const found=names.map(n=>landmarks.find(v=>v.name===n+suffix&&(v.confidence??1)>=.5));if(found.every(Boolean))out.push({id:crypto.randomUUID(),name:`AI · ${name}${suffix}`,kind,points:found.map(v=>({...v!.point}))})}}return out
}
