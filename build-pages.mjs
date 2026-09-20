import {build} from 'esbuild';
import {writeFile,readFile} from 'node:fs/promises';
const result=await build({entryPoints:['pages.js'],bundle:true,write:false,format:'esm',minify:true,target:['es2022'],legalComments:'inline'});
const js=result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
const css=await readFile('public/style.css','utf8');
let html=await readFile('public/index.html','utf8');
html=html.replace('<link rel="stylesheet" href="/style.css">',()=>'<style>'+css+'</style>');
html=html.replace('<script type="module" src="/app.js"></script>',()=>'<script type="module">'+js+'</script>');
await writeFile('index.html',html);
