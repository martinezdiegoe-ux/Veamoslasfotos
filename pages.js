import {createClient} from '@supabase/supabase-js';
import QRCode from 'qrcode';
import {cloudConfig} from './pages-config.js';
const guestUrl=new URL('./',location.href).href;
const qrUrl=await QRCode.toDataURL(guestUrl,{width:600,margin:3,errorCorrectionLevel:'M',color:{dark:'#362b20',light:'#ffffff'}});
const ready=Boolean(cloudConfig.publishableKey);
const client=ready?createClient(cloudConfig.url,cloudConfig.publishableKey):null;
const unavailable='El álbum todavía está en preparación. Pronto vas a poder compartir tus fotos.';
const defaults={open:false,moderation:true,seconds:8,guestUrl,qrUrl,setupPending:!ready};
const unwrap=({data,error})=>{if(error)throw Error(error.message);return data;};
async function session(){
  let s=unwrap(await client.auth.getSession()).session;
  if(!s)s=unwrap(await client.auth.signInAnonymously()).session;
  return s;
}
async function requireAdmin(){if(!unwrap(await client.rpc('vf_is_admin')))throw Error('Ingresá con la cuenta de administración.');}
const signed=new Map();
async function photos(all){
  if(all)await requireAdmin();
  const rows=unwrap(await client.rpc('vf_list_photos',{include_pending:all}));
  return Promise.all(rows.map(async p=>{
    const cached=signed.get(p.path);
    let url=cached?.expires>Date.now()?cached.url:null;
    if(!url){url=unwrap(await client.storage.from('birthday-photos').createSignedUrl(p.path,120)).signedUrl;signed.set(p.path,{url,expires:Date.now()+90000});}
    return {...p,url};
  }));
}
async function compress(file){
  if(file.size>15*1024*1024)throw Error('La foto supera los 15 MB.');
  let image;
  try{image=await createImageBitmap(file,{imageOrientation:'from-image'});}catch{throw Error('Este teléfono no pudo abrir la foto. Elegí una foto JPG, PNG o WebP.');}
  try{
    if(image.width*image.height>50e6)throw Error('La imagen es demasiado grande.');
    let edge=1800;
    for(let attempt=0;attempt<5;attempt++){
      const ratio=Math.min(1,edge/Math.max(image.width,image.height));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*ratio));canvas.height=Math.max(1,Math.round(image.height*ratio));
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.82-attempt*.06));
      if(blob&&blob.size<=700*1024)return blob;
      edge=Math.round(edge*.8);
    }
    throw Error('No se pudo reducir la foto. Probá con otra imagen.');
  }finally{image.close();}
}
window.vfBackend={
  cloud:true,qrUrl,
  async api(url,options={}){
    if(url==='/api/config')return ready?{...defaults,...unwrap(await client.from('vf_settings').select('open,moderation,seconds').eq('id',1).single()),setupPending:false}:defaults;
    if(!ready){if(url==='/api/photos')return [];throw Error(unavailable);}
    const body=options.body?JSON.parse(options.body):{};
    if(url==='/api/photos')return photos(false);
    if(url==='/api/admin/photos')return photos(true);
    if(url==='/api/login'){
      unwrap(await client.auth.signInWithPassword({email:body.email,password:body.password}));
      try{await requireAdmin();}catch(error){await client.auth.signOut();throw error;}return {ok:true};
    }
    if(url==='/api/logout'){unwrap(await client.auth.signOut());return {ok:true};}
    if(url==='/api/admin/settings'){
      await requireAdmin();return unwrap(await client.from('vf_settings').update(body).eq('id',1).select('open,moderation,seconds').single());
    }
    const reaction=url.match(/^\/api\/photos\/([\w-]+)\/reactions$/);
    if(reaction){await session();unwrap(await client.rpc('vf_react',{photo_id:reaction[1],reaction:body.emoji}));return {ok:true};}
    const photo=url.match(/^\/api\/admin\/photos\/([\w-]+)$/);
    if(photo){
      await requireAdmin();
      if(options.method==='DELETE'){
        // Hide first; a failed storage removal leaves the record available for retry.
        unwrap(await client.from('vf_photos').update({status:'hidden'}).eq('id',photo[1]));
        const row=unwrap(await client.from('vf_photos').select('path').eq('id',photo[1]).single());
        unwrap(await client.storage.from('birthday-photos').remove([row.path]));
        unwrap(await client.from('vf_photos').delete().eq('id',photo[1]));
      }else unwrap(await client.from('vf_photos').update({status:body.status}).eq('id',photo[1]));
      return {ok:true};
    }
    throw Error('Operación desconocida.');
  },
  async upload(form,onProgress){
    if(!ready)throw Error(unavailable);
    const blob=await compress(form.get('photo'));onProgress(20);await session();
    const reservation=unwrap(await client.rpc('vf_reserve_photo',{guest_name:String(form.get('name')||'Invitado'),dedication:String(form.get('caption')||'')}));
    try{
      unwrap(await client.storage.from('birthday-photos').upload(reservation.path,blob,{contentType:'image/jpeg',upsert:false}));onProgress(85);
      const result=unwrap(await client.rpc('vf_finish_photo',{photo_id:reservation.id}));onProgress(100);return result;
    }catch(error){
      await client.storage.from('birthday-photos').remove([reservation.path]);
      await client.rpc('vf_cancel_photo',{photo_id:reservation.id});throw error;
    }
  },
  watch({refresh,config,status}){
    if(!ready){status('En preparación',true);return;}
    let busy=false;
    const tick=async()=>{
      if(busy||document.hidden)return;busy=true;
      try{await config();await refresh();status('Actualización automática',false);}catch{status('Sin conexión · reintentando',true);}finally{busy=false;}
    };
    const interval=setInterval(tick,8000);document.addEventListener('visibilitychange',tick);
    window.addEventListener('pagehide',()=>clearInterval(interval),{once:true});tick();
  }
};
await import('./public/app.js');
