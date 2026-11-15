import { build } from 'vite';
import preact from '@preact/preset-vite';
import { webkit,chromium } from 'playwright';
import { readFile,mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const output=await build({configFile:false,plugins:[preact()],logLevel:'error',build:{write:false,lib:{entry:'scripts/keyboard-probe.tsx',formats:['iife'],name:'KeyboardProbe'},rollupOptions:{output:{inlineDynamicImports:true}}}});
const bundle=(Array.isArray(output)?output[0]:output).output.find(chunk=>chunk.type==='chunk').code;
const styles=await Promise.all(['styles.css','yummy.css','mobile.css','gallery.css','media-center.css','desktop.css','interaction.css','touch.css'].map(name=>readFile(new URL(`../src/${name}`,import.meta.url),'utf8')));
await mkdir('/private/tmp/yumiwatch-keyboard-qa',{recursive:true});
for(const engine of [webkit,chromium]){
 const browser=await engine.launch(engine===chromium?{channel:'chrome'}:{});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://keyboard.test/**',async route=>{
   const name=new URL(route.request().url()).pathname.slice(1);
   if(name.endsWith('.woff2'))return route.fulfill({body:await readFile(new URL(`../public/${name}`,import.meta.url)),contentType:'font/woff2'});
   if(name)return route.abort();
   return route.fulfill({contentType:'text/html',body:'<!doctype html><html data-desktop="macos"><body><div id="app"></div></body></html>'});
  });
  await page.goto('https://keyboard.test/#/');
  for(const content of styles)await page.addStyleTag({content});
  await page.addScriptTag({content:bundle});await page.evaluate(()=>document.fonts.ready);
  const brandFits=async()=>assert.ok(await page.locator('.media-nav .media-brand').evaluate(node=>{
   const label=node.querySelector(':scope>span'),range=document.createRange();range.selectNodeContents(label);
   return label.textContent.startsWith('YummyWatch')&&range.getBoundingClientRect().right<=node.closest('.media-nav').getBoundingClientRect().right-4;
  }),'YummyWatch wordmark is clipped');
  await page.getByRole('link',{name:'YummyWatch — каталог',exact:true}).waitFor();await brandFits();
  await page.locator('.media-nav').getByRole('link',{name:'Каталог',exact:true}).focus();
  await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.textContent.trim()),'Все аниме');
  await page.keyboard.press('Enter');await page.waitForFunction(()=>location.hash==='#/catalog'&&document.querySelector('[data-route="/catalog"]:not([hidden])')&&!document.documentElement.dataset.pageTransition&&!document.documentElement.dataset.pageFallback);
  await page.locator('#main').focus();await page.keyboard.press('ArrowDown');
  assert.ok(await page.evaluate(()=>document.activeElement.matches('[data-gallery-link]')&&!document.activeElement.closest('[hidden]')),'Arrow focused a retained hidden route');
  const visibleCard=()=>page.waitForFunction(()=>{
   const node=document.activeElement,card=node.closest('[data-gallery-item]');if(!card)return false;
   const r=card.getBoundingClientRect(),rail=card.closest('.gallery-rail').getBoundingClientRect(),main=document.getElementById('main').getBoundingClientRect();
   return r.top>=Math.max(main.top+56,0)-1&&r.bottom<=Math.min(main.bottom,innerHeight)-8&&r.left>=rail.left+2&&r.right<=rail.right-2;
  });
  await visibleCard();
  for(let index=0;index<9;index++){
   await page.keyboard.press('ArrowRight');
   if(process.env.KEYBOARD_TRACE==='1')console.log(engine.name(),'arrow',index,await page.evaluate(()=>({focus:document.activeElement.outerHTML,main:document.getElementById('main').scrollTop,rails:[...document.querySelectorAll('section:not([hidden]) .gallery-rail')].map(n=>n.scrollLeft)})));
  }
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.index),'9');await visibleCard();
  assert.equal(await page.evaluate(()=>getComputedStyle(document.activeElement.closest('[data-gallery-item]')).outlineStyle),'solid');
  await page.keyboard.press('ArrowDown');await visibleCard();
  assert.equal(await page.evaluate(()=>document.activeElement.closest('.gallery-shelf').getAttribute('aria-label')),'Ряд 1');
  await page.keyboard.press('ArrowDown');await visibleCard();
  assert.equal(await page.evaluate(()=>document.activeElement.closest('.gallery-shelf').getAttribute('aria-label')),'Ряд 2');
  assert.equal(await page.evaluate(()=>scrollY),0);
  await page.screenshot({path:`/private/tmp/yumiwatch-keyboard-qa/${engine.name()}-card.png`});
  await page.setViewportSize({width:1100,height:480});await visibleCard();
  await page.setViewportSize({width:1280,height:720});await visibleCard();
  const destination=await page.evaluate(()=>document.activeElement.getAttribute('href'));
  await page.keyboard.press('Enter');await page.waitForFunction(hash=>location.hash===hash,destination);
  console.log(engine.name(),'menu arrows, Enter, retained routes, whole cards and nested rails OK');

  await page.evaluate(()=>{location.hash='/catalog';});
  await page.waitForFunction(()=>document.querySelector('[data-route="/catalog"]:not([hidden])')&&!document.documentElement.dataset.pageTransition&&!document.documentElement.dataset.pageFallback);
  const select=async selector=>{
   const node=page.locator(`section:not([hidden]) ${selector}`).first();await node.scrollIntoViewIfNeeded();
   await page.evaluate(()=>getSelection().removeAllRanges());const r=await node.boundingBox();
   await page.mouse.move(r.x+5,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+Math.min(r.width-5,220),r.y+r.height/2,{steps:16});await page.mouse.up();
   return page.evaluate(()=>getSelection().toString());
  };
  assert.equal(await select('.gallery-heading h1'),'','Interface label can be selected');
  assert.ok((await select('.gallery-feature-copy h2')).length>0,'Title cannot be selected');
  assert.ok((await select('.gallery-feature-description')).length>0,'Description cannot be selected');
  assert.ok((await select('.comment-text span')).length>0,'Comment cannot be selected');
  assert.equal(await page.locator('section:not([hidden]) .inline-spoiler').evaluate(node=>getComputedStyle(node).userSelect),'none');
  console.log(engine.name(),'UI labels blocked, information remains selectable OK');

  await page.setViewportSize({width:900,height:480});
  await brandFits();
  await page.locator('.media-nav').getByRole('link',{name:'Каталог',exact:true}).focus();
  const mainBefore=await page.locator('#main').evaluate(node=>node.scrollTop);
  for(let index=0;index<8;index++)await page.keyboard.press('ArrowDown');
  await page.waitForFunction(()=>{const n=document.activeElement,r=n.getBoundingClientRect();return n.matches('.media-account')&&r.top>=56&&r.bottom<=innerHeight-8;});
  assert.equal(await page.locator('#main').evaluate(node=>node.scrollTop),mainBefore,'Menu focus scrolled content');
  await page.getByRole('button',{name:'Открыть серии',exact:true}).click();await page.getByRole('button',{name:'Закрыть панель',exact:true}).waitFor();
  await page.waitForFunction(()=>document.activeElement.matches('.sidebar-close'));
  const navBefore=await page.locator('.media-nav').evaluate(node=>node.scrollTop);
  for(let index=0;index<18;index++)await page.keyboard.press('Tab');
  await page.waitForFunction(()=>{const n=document.activeElement,r=n.getBoundingClientRect(),panel=document.querySelector('.sidebar-scroll').getBoundingClientRect();return n.textContent.startsWith('Серия ')&&r.top>=panel.top+8&&r.bottom<=panel.bottom-8;});
  assert.equal(await page.locator('.media-nav').evaluate(node=>node.scrollTop),navBefore,'Sidebar focus scrolled navigation');
  assert.equal(await page.evaluate(()=>scrollY),0);
  await page.screenshot({path:`/private/tmp/yumiwatch-keyboard-qa/${engine.name()}-sidebar.png`});
  assert.deepEqual(errors,[]);console.log(engine.name(),'short menu, Tab, sidebar visibility and stationary root OK');
 }finally{await browser.close();}
}
