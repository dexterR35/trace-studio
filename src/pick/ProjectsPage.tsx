import { useEffect, useState } from 'react'
import { FolderOpen, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { listProjects, restorePick, savePick, trashPick, usePick } from './store'
import type { SavedProject } from './store'
import { emptyProject } from './types'

export function ProjectsPage(){
 const s=usePick(),[projects,setProjects]=useState<SavedProject[]>([]),[trash,setTrash]=useState<SavedProject[]>([]),[view,setView]=useState<'saved'|'trash'>('saved'),[working,setWorking]=useState(false)
 async function refresh(){const [saved,deleted]=await Promise.all([listProjects(),listProjects(true)]);setProjects(saved);setTrash(deleted)}
 useEffect(()=>{void refresh().catch(e=>s.notify(e.message))},[s.project.id])
 async function create(){setWorking(true);try{const current=usePick.getState().project;if(current.image.src)await savePick(current);s.load(emptyProject());s.set({page:'select'})}catch(e){s.notify((e as Error).message)}finally{setWorking(false)}}
 async function open(project:SavedProject){setWorking(true);try{const current=usePick.getState().project;if(current.image.src)await savePick(current);s.load(project);s.set({page:'select'})}catch(e){s.notify((e as Error).message)}finally{setWorking(false)}}
 async function remove(project:SavedProject){setWorking(true);try{const current=usePick.getState().project;await trashPick(current.id===project.id?current:project);if(usePick.getState().project.id===project.id){s.load(emptyProject());s.set({page:'projects',saving:'Project moved to Trash'})}await refresh();s.notify(`${project.name} moved to Trash. Restore it here at any time.`)}catch(e){s.notify((e as Error).message)}finally{setWorking(false)}}
 async function restore(project:SavedProject){setWorking(true);try{await restorePick(project.id);await refresh();s.notify(`${project.name} restored to Saved projects.`)}catch(e){s.notify((e as Error).message)}finally{setWorking(false)}}
 const visible=view==='saved'?projects:trash
 return <div className="pk-page"><div className="pk-page-heading"><span className="pk-eyebrow">SAVED ON THIS DEVICE</span><h1>Your ideas, kept close.</h1><p>Projects autosave locally. Delete moves the complete project to Trash, where you can restore it.</p></div>
 <div className="pk-project-toolbar"><button className="pk-btn pk-primary" disabled={working} onClick={()=>void create()}><Plus size={15}/>New image project</button><div className="pk-segment"><button className={view==='saved'?'active':''} onClick={()=>setView('saved')}><FolderOpen size={14}/>Saved projects ({projects.length})</button><button className={view==='trash'?'active':''} onClick={()=>setView('trash')}><Trash2 size={14}/>Trash ({trash.length})</button></div></div>
 {!visible.length&&<div className="pk-card pk-empty-note"><FolderOpen size={30}/><h3>{view==='trash'?'Trash is empty.':'No saved image projects yet.'}</h3><p>{view==='trash'?'Deleted projects appear here until you restore them.':'Upload an image to begin. Your work saves on this device.'}</p></div>}
 <div className="pk-asset-grid">{visible.map(project=><article className="pk-card pk-project" key={project.id}><button disabled={working||view==='trash'} onClick={()=>void open(project)}><img src={project.image.src} alt={project.name}/><h3>{project.name}{s.project.id===project.id&&<span className="pk-tag">Open</span>}</h3><small>{project.subjects.length} assets · {new Date(project.deletedAt||project.updated).toLocaleDateString()}</small></button>{view==='saved'?<button className="pk-icon" disabled={working} aria-label={`Delete project ${project.name}`} title="Move this complete project to Trash. Restore is available." onClick={()=>void remove(project)}><Trash2 size={16}/></button>:<button className="pk-btn pk-project-restore" disabled={working} aria-label={`Restore project ${project.name}`} onClick={()=>void restore(project)}><RotateCcw size={14}/>Restore</button>}</article>)}</div></div>
}
