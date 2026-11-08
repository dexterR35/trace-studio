import { lazy, Suspense, useState } from 'react'
import { Clapperboard, FolderOpen, HelpCircle, Image, Layers2, Scan, Settings2, Spline } from 'lucide-react'
const MotionApp = lazy(() => import('./App'))
import { ImageStudio } from './pick/ImageStudio'
import { savePick, usePick } from './pick/store'
import { useStudio } from './store'
import { image, pixels } from './pick/imaging'
import { emptyProject } from './pick/types'
import './pick/studio.css'
import { sectionGuides } from './pick/guide'
export default function Suite(){const [workspace,setWorkspace]=useState<'image'|'motion'>('image'),s=usePick();const navigate=(page:typeof s.page)=>{useStudio.getState().set({playing:false});s.set({page});setWorkspace('image')}
 function animate(data:{src:string;name:string;width:number;height:number}){const st=useStudio.getState();if(st.project.layers.length>=60){s.notify('Motion scene has 60 elements. Remove one before adding more.');return}const width=Math.min(st.project.width*.3,300);st.addLayer('image',{src:data.src,name:data.name,width,height:width*data.height/data.width});st.notify('Extracted subject added to your motion scene');setWorkspace('motion')}
 async function editMotionImage(){const st=useStudio.getState(),layer=st.project.layers.find(v=>v.id===st.selectedLayer);if(layer?.kind!=='image'||!layer.src){st.notify('Select an image layer first');return}try{const im=await image(layer.src),p=emptyProject();p.name=layer.name;p.image={name:layer.name,src:layer.src,width:im.naturalWidth,height:im.naturalHeight};if(s.project.image.src)await savePick(s.project);s.load(p);navigate('select')}catch(e){st.notify((e as Error).message)}}
 const nav=[{label:'Studio',Icon:Scan,page:'select'},{label:'Motion',Icon:Clapperboard,page:'motion'},{label:'Assets',Icon:Image,page:'assets'},{label:'Projects',Icon:FolderOpen,page:'projects'}]
 return <div className={`trace-suite ${workspace==='motion'?'motion-workspace':''}`}><aside className="suite-rail" data-modal-inert><button className="suite-logo" aria-label="Trace Studio home" onClick={()=>navigate('select')}><Spline size={30}/></button><nav>{nav.map(({label,Icon,page})=><button key={page} title={sectionGuides.find(v=>v.name===label)?.description} className={(page==='motion'?workspace==='motion':workspace==='image'&&(page==='select'?['select','analyze','export'].includes(s.page):s.page===page))?'active':''} onClick={()=>page==='motion'?setWorkspace('motion'):navigate(page as typeof s.page)}><Icon size={22} strokeWidth={1.5}/><span>{label}</span></button>)}</nav><div className="suite-rail-bottom"><button className={workspace==='image'&&s.page==='models'?'active':''} onClick={()=>navigate('models')}><Settings2 size={21}/><span>Models</span></button><button title="Explain every icon, model and section" onClick={()=>navigate('help')}><HelpCircle size={21}/><span>Help</span></button></div></aside><main className="suite-content">{workspace==='image'?<ImageStudio onMotion={animate}/>:<><Suspense fallback={<div className="pk-empty-note">Loading motion workspace…</div>}><MotionApp/></Suspense><button className="motion-extract-link" onClick={()=>void editMotionImage()}><ScissorsIcon/>Select & extract image</button></>}</main></div>
}
function ScissorsIcon(){return <Scan size={14}/>}
