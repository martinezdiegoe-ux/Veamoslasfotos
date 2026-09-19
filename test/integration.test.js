import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
test('Flujo completo y persistencia del festejo',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'vf-test-'));let child,base,cookie;
 const start=()=>new Promise((resolve,reject)=>{child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'0',DATA_DIR:dir,ADMIN_PASSWORD:'test-password-only-12345'},stdio:['ignore','pipe','pipe']});child.once('error',reject);child.stderr.on('data',()=>{});child.stdout.on('data',d=>{const m=String(d).match(/puerto (\d+)/);if(m){base=`http://127.0.0.1:${m[1]}`;resolve();}});child.once('exit',code=>{if(code)reject(Error('Servidor terminó: '+code));});});
 const stop=()=>new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');});
 const req=(url,method='GET',body,auth=false)=>fetch(base+url,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(auth?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
 const upload=async(bytes,type='image/png')=>{const form=new FormData();form.set('photo',new Blob([bytes],{type}),'photo.png');form.set('name','Diego');form.set('caption','¡Feliz cumple!');return fetch(base+'/api/photos',{method:'POST',body:form});};
 try{
 await start();assert.equal((await req('/api/admin/photos')).status,401);
 assert.equal((await req('/api/login','POST',{password:'incorrecta'})).status,401);
 const login=await req('/api/login','POST',{password:'test-password-only-12345'});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];
 assert.equal((await upload('fake image')).status,400);
 const buffer=await sharp({create:{width:60,height:80,channels:3,background:'#a58243'}}).png().toBuffer();
 const uploaded=await upload(buffer);assert.equal(uploaded.status,201);const p=await uploaded.json();assert.equal(p.status,'pending');
 assert.equal((await req('/api/photos').then(r=>r.json())).length,0);
 assert.equal((await req('/media/'+p.id)).status,404);
 assert.equal((await req('/media/'+p.id,'GET',null,true)).status,200);
 assert.equal((await req('/api/admin/photos/'+p.id,'PATCH',{status:'approved'})).status,401);
 assert.equal((await req('/api/admin/photos/'+p.id,'PATCH',{status:'approved'},true)).status,200);
 assert.equal((await req('/api/photos').then(r=>r.json())).length,1);
 assert.equal((await req('/media/'+p.id)).headers.get('content-type'),'image/jpeg');
 for(const emoji of ['❤️','✨'])assert.equal((await req(`/api/photos/${p.id}/reactions`,'POST',{visitor:'visitor-test-123456',emoji})).status,200);
 const reacted=(await req('/api/photos').then(r=>r.json()))[0];assert.deepEqual(reacted.reactions,{'✨':1});
 assert.equal((await req('/api/admin/settings','PATCH',{open:false,moderation:true,seconds:8},true)).status,200);
 assert.equal((await upload(buffer)).status,403);
 assert.equal((await req('/api/admin/settings','PATCH',{open:true,moderation:true,seconds:0},true)).status,400);
 assert.equal((await req('/api/qr')).headers.get('content-type'),'image/png');
 await stop();await start();assert.equal((await req('/api/photos').then(r=>r.json())).length,1);assert.equal((await req('/api/config').then(r=>r.json())).open,false);
 const login2=await req('/api/login','POST',{password:'test-password-only-12345'});cookie=login2.headers.get('set-cookie').split(';')[0];
 await req('/api/admin/photos/'+p.id,'PATCH',{status:'hidden'},true);assert.equal((await req('/media/'+p.id)).status,404);
 assert.equal((await req('/api/admin/photos/'+p.id,'DELETE',null,true)).status,200);assert.equal((await req('/api/admin/photos','GET',null,true).then(r=>r.json())).length,0);
 }finally{if(child?.exitCode===null)await stop();await rm(dir,{recursive:true,force:true});}
});
