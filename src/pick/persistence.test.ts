import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import { listProjects, restorePick, savePick, trashPick } from './store'
import { emptyProject } from './types'

test('storage upgrade preserves existing projects; Trash blocks stale autosaves and Restore preserves masks',async()=>{
 const p=emptyProject();p.name='Storage regression';p.image={name:'test.png',src:'data:image/png;base64,AAAA',width:2,height:2}
 p.subjects=[{id:'asset-a',name:'A',mask:new Uint8ClampedArray([0,128,255,0]),origin:'Manual',parts:[],measures:[],outline:[],landmarks:[],approved:true}]
 await new Promise<void>((resolve,reject)=>{const request=indexedDB.open('trace-pick',1);request.onupgradeneeded=()=>request.result.createObjectStore('projects',{keyPath:'id'});request.onsuccess=()=>{const d=request.result,tx=d.transaction('projects','readwrite');tx.objectStore('projects').put({...p,updated:1});tx.oncomplete=()=>{d.close();resolve()}};request.onerror=()=>reject(request.error)})
 assert.equal((await listProjects())[0].id,p.id)
 assert.deepEqual((await listProjects())[0].subjects[0].mask,p.subjects[0].mask)
 await Promise.all([savePick(p),trashPick(p),savePick({...p,name:'stale autosave'})])
 assert.equal(await savePick({...p,name:'late autosave'}),false)
 assert.equal((await listProjects()).length,0)
 const trash=await listProjects(true);assert.equal(trash.length,1);assert.equal(trash[0].name,p.name)
 const restored=await restorePick(p.id);assert.equal(restored?.id,p.id);assert.deepEqual(restored?.subjects[0].mask,p.subjects[0].mask)
 assert.equal((await listProjects(true)).length,0);assert.equal((await listProjects()).length,1)
 assert.equal(await savePick({...p,name:'edited after restore'}),true)
 assert.equal((await listProjects())[0].name,'edited after restore')
})
