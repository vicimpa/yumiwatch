import { readFile, writeFile, mkdtemp, readdir, copyFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli=fileURLToPath(new URL('../node_modules/@tauri-apps/cli/tauri.js',import.meta.url));
const root=fileURLToPath(new URL('../',import.meta.url));
const work=await mkdtemp(join(tmpdir(),'yummywatch-icons-'));
function generate(input,output,extra=[]){
 const result=spawnSync(process.execPath,[cli,'icon',input,'--output',output,...extra],{cwd:root,stdio:'inherit'});
 if(result.status!==0)throw new Error('Tauri icon generation failed');
}
try{
 const svg=await readFile(resolve(root,'public/icons/icon.svg'),'utf8');
 const source=resolve(root,'public/icons/icon.svg');
 generate(source,resolve(root,'src-tauri/icons'),['--ios-color','#ff7b83']);
 // macOS expects a silhouette inside the canvas, with transparent margins.
 const dock=join(work,'dock.svg');
 await writeFile(dock,`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs><filter id="dock-shadow" x="-25%" y="-25%" width="150%" height="160%"><feDropShadow dy="15" stdDeviation="16" flood-color="#240a18" flood-opacity=".24"/></filter></defs><g filter="url(#dock-shadow)"><svg x="96" y="88" width="832" height="832" viewBox="0 0 128 128">${svg.replace(/^<svg[^>]*>/,'').replace(/<\/svg>\s*$/,'')}</svg></g></svg>`);
 generate(dock,join(work,'desktop'));
 await copyFile(join(work,'desktop/icon.icns'),resolve(root,'src-tauri/icons/icon.icns'));
 for(const name of ['32x32.png','128x128.png','128x128@2x.png'])await copyFile(join(work,'desktop',name),resolve(root,'src-tauri/icons',name));
 generate(source,join(work,'web'),['--png','180','--png','192','--png','512']);
 const names={180:'apple-touch-icon.png',192:'icon-192.png',512:'icon-512.png'};
 for(const file of await readdir(join(work,'web'))){
  if(!file.endsWith('.png'))continue;
  const bytes=await readFile(join(work,'web',file)),size=bytes.readUInt32BE(16);
  if(names[size])await writeFile(resolve(root,'public/icons',names[size]),bytes);
 }
 console.log('Updated web, macOS, Windows, Linux, Android and iOS icons.');
}finally{await rm(work,{recursive:true,force:true});}
