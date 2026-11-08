import { directorIssues } from './director'
import type { Project } from './types'
export const seedanceProfiles={
 'seedance-2.0':{name:'Seedance 2.0',maxDuration:15,maxImages:9},
 'seedance-2.5':{name:'Seedance 2.5',maxDuration:30,maxImages:30},
} as const
export function seedancePlan(p:Project){
 const issues=directorIssues(p);if(issues.length)throw new Error(issues.join(' '))
 const d=p.director!;if(!d.enabled)throw new Error('Enable the directing sequence before exporting.')
 if(!p.layers.some(l=>l.visible)&&!p.video)throw new Error('Add a visible element or background video first.')
 if(!Number.isInteger(d.duration))throw new Error('Use an integer sequence duration in seconds for the Seedance package.')
 const profile=seedanceProfiles[d.model],cast=p.layers.filter(l=>l.direction?.includeReference!==false)
 if(cast.length>profile.maxImages)throw new Error(`${profile.name} accepts at most ${profile.maxImages} appearance images per request. Deselect extra references in Cast.`)
 const count=Math.ceil(d.duration/profile.maxDuration),base=Math.floor(d.duration/count),extra=d.duration%count
 let start=0
 const clips=Array.from({length:count},(_,i)=>{const duration=base+(i<extra?1:0),clip={index:i+1,start,end:start+duration,duration,file:`video/animatic-${i+1}.mp4`};start+=duration;return clip})
 if(clips.some(c=>c.duration<4))throw new Error('Each generation clip needs at least four seconds.')
 const references=cast.map((l,i)=>({id:l.id,name:l.name,role:l.direction?.role||'prop',binding:`@Image ${i+1}`,file:`references/${String(i+1).padStart(2,'0')}-${l.id}.png`,description:l.direction?.description||l.name,identity:l.direction?.identity||'',performance:l.direction?.performance||''}))
 const ratios=[['16:9',16/9],['9:16',9/16],['1:1',1],['4:3',4/3],['3:4',3/4],['21:9',21/9]] as const
 const ratio=ratios.find(([,v])=>Math.abs(p.width/p.height-v)<.012)?.[0]
 if(!ratio)throw new Error('Choose a supported film aspect ratio: 16:9, 9:16, 1:1, 4:3, 3:4 or 21:9.')
 const tasks=clips.map(clip=>{
  const shots=[...d.shots].sort((a,b)=>a.start-b.start).filter(s=>s.start<clip.end&&s.end>clip.start)
  const prompt=[`Create a ${clip.duration}-second ${ratio} cinematic video. Use @Video 1 as the composition, blocking, timing, motion and camera reference. Replace simple stand-ins with the described characters and objects. Preserve their relative placement and shot continuity as closely as possible.`,d.style,d.notes,
   ...references.map(r=>`${r.binding}: ${r.name} [${r.role}, stable element ID ${r.id}]. ${r.description} Preserve: ${r.identity||'the reference appearance'}. Performance: ${r.performance||'as directed below'}.`),
   ...p.layers.filter(l=>!references.some(r=>r.id===l.id)).map(l=>`${l.name} [${l.direction?.role||'prop'}, element ${l.id}]: ${l.direction?.description||l.name}. ${l.direction?.identity||''} ${l.direction?.performance||''}`),
   ...shots.map((s,i)=>{const a=Math.max(s.start,clip.start)-clip.start,b=Math.min(s.end,clip.end)-clip.start,target=p.layers.find(l=>l.id===s.targetId),focus=p.layers.find(l=>l.id===s.focusId);return `${d.model==='seedance-2.5'?`[${Math.floor(a)}s–${Math.ceil(b)}s]`:`Shot ${i+1} (${(b-a).toFixed(2)} seconds)`} ${s.name}: ${s.framing}${target?` on ${target.name}, region UV ${JSON.stringify(s.region)}`:''}. ${s.description||'Follow the reference blocking.'} ${s.follow&&target?'Track the target. ':''}${focus?`Focus on ${focus.name}. `:''}Zoom ${s.zoomStart} → ${s.zoomEnd}; ${s.easing} camera motion. ${s.dialogue?`Dialogue: ${s.dialogue}. `:''}${s.sound?`Sound: ${s.sound}.`:''}`}),
   `Audio direction: ${d.audio||'Natural scene ambience; no additional dialogue unless specified.'}`,
   'Follow the reference video for exact visual cut placement; timestamp windows in this prompt are rounded to whole seconds. Keep character faces, wardrobe and prop identities consistent across shots. The reference video defines the intended movement; use the separate images for appearance.'].filter(Boolean).join('\n\n')
  return {...clip,prompt,shots:shots.map(s=>({id:s.id,sequenceStart:s.start,sequenceEnd:s.end,clipStart:Math.max(s.start,clip.start)-clip.start,clipEnd:Math.min(s.end,clip.end)-clip.start})),request:{model:'REPLACE_WITH_YOUR_ENABLED_MODEL_ID',content:[{type:'text',text:prompt},...references.map(r=>({type:'image_url',image_url:{url:`https://YOUR_UPLOAD_HOST/${r.file}`},role:'reference_image'})),{type:'video_url',video_url:{url:`https://YOUR_UPLOAD_HOST/${clip.file}`},role:'reference_video'}],duration:clip.duration,ratio,generate_audio:true}}
 })
 return {elements:p.layers.map(l=>({id:l.id,name:l.name,direction:l.direction||null})),schema:'trace-seedance-reference/1.0',modelProfile:d.model,profile,sequence:{duration:d.duration,fps:p.fps,width:p.width,height:p.height},references,tasks,notes:['Custom motion JSON is a local reconstruction specification, not a Seedance API input.','Request templates require uploaded media URLs and an account-enabled model ID.','Separate clips require joining; generated continuity and exact trajectories are not guaranteed.','Real-person appearance references may require the provider’s supported portrait workflow.']}
}
