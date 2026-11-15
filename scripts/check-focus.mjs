import { build } from 'vite';
import preact from '@preact/preset-vite';
import { webkit,chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const output=await build({configFile:false,plugins:[preact()],logLevel:'error',build:{write:false,lib:{entry:'scripts/focus-probe.tsx',formats:['iife'],name:'FocusProbe'},rollupOptions:{output:{inlineDynamicImports:true}}}});
const bundle=(Array.isArray(output)?output[0]:output).output.find(chunk=>chunk.type==='chunk').code;
const styles=await Promise.all(['styles.css','yummy.css','mobile.css','gallery.css','media-center.css','desktop.css','interaction.css','touch.css'].map(name=>readFile(new URL(`../src/${name}`,import.meta.url),'utf8')));
const animes=Array.from({length:12},(_,i)=>({anime_id:i+1,anime_url:`test-${i}`,title:i%2?'Короткое название':'Очень длинное название аниме, которое занимает несколько строк в блоке описания выбранного произведения',description:i%2?'Описание.':'Длинное описание выбранного произведения с несколькими предложениями. '.repeat(12),year:2026,type:{name:'Сериал',shortname:'ТВ'},episodes:{aired:12}}));
for(const engine of [webkit,chromium]){
 const browser=await engine.launch(engine===chromium?{channel:'chrome'}:{});
 try{
  const page=await browser.newPage({viewport:{width:1000,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://api.yani.tv/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({response:animes})}));
  await page.route('https://focus.test/**',async route=>{
   const name=new URL(route.request().url()).pathname.slice(1);
   if(name.endsWith('.woff2'))return route.fulfill({body:await readFile(new URL(`../public/${name}`,import.meta.url)),contentType:'font/woff2'});
   return route.fulfill({contentType:'text/html',body:'<!doctype html><html data-desktop="macos"><body><div id="app"></div></body></html>'});
  });
  await page.goto('https://focus.test/');for(const content of styles)await page.addStyleTag({content});await page.addScriptTag({content:bundle});
  await page.locator('.gallery-rail .card-title').first().waitFor();await page.evaluate(()=>document.fonts.ready);
  await page.locator('#main').focus();
  await page.keyboard.press('Shift');
  const containerOutline=await page.locator('#main').evaluate(n=>getComputedStyle(n).outlineStyle);
  await page.keyboard.press('ArrowDown');await page.waitForTimeout(600);
  const state=()=>page.evaluate(()=>({height:document.querySelector('.gallery-feature').getBoundingClientRect().height,scroll:document.getElementById('main').scrollTop,card:document.activeElement.closest('[data-gallery-item]')?.getBoundingClientRect().top}));
  const before=await state();await page.keyboard.press('ArrowRight');await page.waitForTimeout(600);const after=await state();
  console.log(engine.name(),{containerOutline,before,after});
  assert.ok(Math.abs(before.height-after.height)<1,`Preview height shifted: ${before.height} → ${after.height}`);
  assert.ok(Math.abs(before.scroll-after.scroll)<2,`Focusing neighboring bottom card moved vertical scroll: ${before.scroll} → ${after.scroll}`);
  assert.ok(Math.abs(before.card-after.card)<2,'Card jumped after selecting a different title');
  assert.equal(containerOutline,'none','Whole content container has a focus border');
  for(let i=0;i<3;i++){await page.keyboard.press('ArrowDown');await page.waitForTimeout(400);}
  assert.equal(await page.evaluate(()=>scrollY),0);assert.deepEqual(errors,[]);
  console.log(engine.name(),'no container outline; bottom card focus keeps preview height and vertical position stable');
  await page.goto('https://focus.test/?cursor=1#/cursor');for(const content of styles)await page.addStyleTag({content});await page.addScriptTag({content:bundle});
  await page.waitForFunction(()=>document.documentElement.dataset.playerChrome==='hidden');
  const cursors=()=>page.evaluate(()=>['html','body','.window-drag-region','.cursor-header','.video-hit-area'].map(selector=>getComputedStyle(document.querySelector(selector)).cursor));
  assert.ok((await cursors()).every(cursor=>cursor==='none'),'Cursor is visible over some parts of the player window');
  await page.mouse.move(12,12);await page.waitForFunction(()=>document.documentElement.dataset.playerChrome==='visible');
  assert.ok((await cursors()).every(cursor=>cursor!=='none'),'Moving over the window chrome did not restore cursor');
  await page.waitForFunction(()=>document.documentElement.dataset.playerChrome==='hidden');
  await page.evaluate(()=>{const video=document.querySelector('video');Object.defineProperty(video,'paused',{value:true,configurable:true});video.dispatchEvent(new Event('pause'));});
  await page.waitForFunction(()=>document.documentElement.dataset.playerChrome==='visible');
  assert.ok((await cursors()).every(cursor=>cursor!=='none'),'Pause did not restore cursor');
  await page.evaluate(()=>{document.documentElement.dataset.playerChrome='hidden';document.documentElement.dataset.screen='catalog';});
  assert.ok((await cursors()).every(cursor=>cursor!=='none'),'Hidden cursor leaked outside playback');
  assert.deepEqual(errors,[]);console.log(engine.name(),'cursor hides across the window and returns on movement, pause and leaving playback');
 }finally{await browser.close();}
}
