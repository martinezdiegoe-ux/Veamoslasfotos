import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const html=await readFile('public/index.html','utf8'),code=await readFile('public/app.js','utf8');
const config={open:true,moderation:true,seconds:8,guestUrl:'https://fotos.example.com'};
const photo={id:'12345678-1234-1234-1234-123456789012',name:'<script>bad()</script>',caption:'<img src=x onerror=bad()>',status:'approved',url:'/media/test',reactions:{'❤️':2}};
async function ui(route){const dom=new JSDOM(html,{url:'https://fotos.example.com'+route,runScripts:'outside-only'}),w=dom.window;const calls=[];w.fetch=async(url,opts={})=>{calls.push([url,opts]);return {ok:true,json:async()=>url==='/api/config'?config:url.endsWith('/photos')?[photo]:{ok:true}};};w.EventSource=class{addEventListener(){} };w.HTMLElement.prototype.scrollIntoView=function(){};w.requestAnimationFrame=f=>f();await w.eval(`(async()=>{${code}\n})()`);return {w,calls,close:()=>w.close()};}
test('Invitados: render seguro, carga desplegable y reacción',async()=>{const u=await ui('/');try{const d=u.w.document;assert.equal(d.querySelector('h1').textContent,'Bianca');assert.equal(d.querySelectorAll('.photo-card').length,1);assert.equal(d.querySelectorAll('.photo-info script,.photo-info img').length,0);assert.equal(d.querySelector('#upload').hidden,true);d.querySelector('#show-upload').click();assert.equal(d.querySelector('#upload').hidden,false);d.querySelector('[data-react]').click();await new Promise(r=>setTimeout(r,20));assert.ok(u.calls.some(([url])=>url.endsWith('/reactions')));}finally{u.close();}});
test('Administración: sesión, configuración y filtro',async()=>{const u=await ui('/admin');try{const d=u.w.document;assert.equal(d.querySelector('#admin-content').hidden,false);assert.equal(d.querySelector('#settings').elements.namedItem('moderation').checked,true);const filter=d.querySelector('#filter');filter.value='approved';filter.dispatchEvent(new u.w.Event('change'));assert.equal(d.querySelectorAll('.photo-card').length,1);}finally{u.close();}});
test('Pantalla y QR: controles y destino del código',async()=>{for(const route of ['/pantalla','/qr']){const u=await ui(route);try{const d=u.w.document;assert.equal(d.querySelector('img[src="/api/qr"]').getAttribute('src'),'/api/qr');if(route==='/pantalla'){assert.equal(d.querySelectorAll('.slide').length,1);d.querySelector('#pause').click();assert.equal(d.querySelector('#pause').textContent,'Continuar');}else assert.equal(d.querySelector('.qr-url').textContent,config.guestUrl);}finally{u.close();}}});
test('GitHub Pages: rutas bajo subdirectorio y estado de preparación sin falsas cargas',async()=>{
 for(const view of ['', 'pantalla','qr','admin']){
 const dom=new JSDOM(html,{url:'https://martinezdiegoe-ux.github.io/Veamoslasfotos/'+(view?'?vista='+view:''),runScripts:'outside-only'}),w=dom.window;
 w.vfBackend={cloud:true,qrUrl:'data:image/png;base64,AAAA',api:async url=>{if(url==='/api/config')return {...config,setupPending:true,guestUrl:'https://martinezdiegoe-ux.github.io/Veamoslasfotos/'};if(url==='/api/admin/photos')throw Error('Ingresá');return [];},watch:()=>{}};
 try{await w.eval(`(async()=>{${code}\n})()`);
 if(!view){assert.equal(w.document.querySelector('#show-upload').disabled,true);assert.equal(w.document.querySelector('.art img').getAttribute('src'),'./public/assets/princesa-piano.png');assert.equal(w.document.querySelector('footer a').getAttribute('href'),'?vista=pantalla');}
 if(view==='pantalla')assert.ok(w.document.querySelector('#stage'));
 if(view==='qr')assert.equal(w.document.querySelector('.qr-url').textContent,'https://martinezdiegoe-ux.github.io/Veamoslasfotos/');
 if(view==='admin')assert.ok(w.document.querySelector('input[type=email]'));
 }finally{w.close();}
 }
});
