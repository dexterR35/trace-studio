import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const python=path.join(root,'server','.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python')
const serverOnly=process.argv.includes('--server')
const children=[]
function launch(cmd,args){const child=spawn(cmd,args,{cwd:root,stdio:'inherit',windowsHide:true});children.push(child);child.on('error',e=>console.error(e.message));return child}
if(existsSync(python)){
 try{const response=await fetch('http://127.0.0.1:8000/health',{signal:AbortSignal.timeout(1000)});const health=await response.json();if(health.service!=='trace-sam3')console.warn('Port 8000 is occupied. Configure another local service port in Models.');else console.log('Using existing Trace model service on port 8000.')}
 catch{launch(python,['-m','uvicorn','server.app:app','--host','127.0.0.1','--port','8000'])}
}else console.log('Optional AI service is not installed. Run SETUP-AI.cmd cpu; browser editing works immediately.')
if(!serverOnly){const vite=path.join(root,'node_modules','vite','bin','vite.js');const web=launch(process.execPath,[vite,'--host','127.0.0.1',...process.argv.slice(2)]);web.on('exit',code=>{for(const c of children)if(c!==web)c.kill();process.exit(code||0)})}
function stop(){for(const child of children)child.kill();process.exit(0)}
process.on('SIGINT',stop);process.on('SIGTERM',stop)
