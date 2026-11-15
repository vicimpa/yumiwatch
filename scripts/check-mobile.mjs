import { build } from 'vite';
import preact from '@preact/preset-vite';
import { chromium, webkit } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const output = await build({ configFile:false, plugins:[preact()], logLevel:'error', build:{ write:false, lib:{entry:'scripts/mobile-probe.tsx',formats:['iife'],name:'MobileProbe'}, rollupOptions:{output:{inlineDynamicImports:true}} } });
const bundle = (Array.isArray(output)?output[0]:output).output.find(item=>item.type==='chunk').code;
const styles = (await Promise.all(['styles.css','yummy.css','mobile.css','gallery.css','media-center.css','desktop.css','interaction.css','touch.css'].map(file=>readFile(new URL(`../src/${file}`,import.meta.url),'utf8')))).join('\n');
const anime = {anime_id:10531,anime_url:'mobile-long-title',title:'Реинкарнация безработного: История о приключениях в другом мире 3',year:2026,rating:{average:9.2},type:{name:'ТВ-сериал',shortname:'ТВ'},episodes:{aired:24,count:24},genres:[{id:14,title:'Детектив',alias:'detektiv'}],description:'Проверяем длинное описание на небольшом экране.',comments_count:12345};
const poster=id=>Object.fromEntries(['medium','big','huge'].map(size=>[size,`https://static.yani.tv/posters/${id}/${size}.svg`]));
anime.poster=poster(anime.anime_id);
anime.viewing_order=[{anime_id:10530,title:'Первый сезон',year:2021},{anime_id:10531,title:anime.title,year:2026},{anime_id:10532,title:'Следующая история с очень длинным названием',year:2027}];
const list = Array.from({length:12},(_,index)=>({...anime,anime_id:10531+index,poster:poster(10531+index),title:index?`Длинное название аниме для мобильного экрана ${index}`:anime.title}));
await mkdir('test-results/mobile',{recursive:true});
for (const engine of [chromium,webkit]) {
  if(process.env.MOBILE_BROWSER&&process.env.MOBILE_BROWSER!==engine.name())continue;
  const browser = await engine.launch(engine === chromium && !process.env.CI ? {channel:'chrome'} : {});
  try {
    for (const viewport of [{width:320,height:568},{width:390,height:844},{width:430,height:932},{width:844,height:390},{width:1280,height:820}]) {
      if(process.env.MOBILE_WIDTH&&Number(process.env.MOBILE_WIDTH)!==viewport.width)continue;
      const phone = viewport.width <= 1000;
      const context = await browser.newContext({viewport,isMobile:phone,hasTouch:phone,deviceScaleFactor:1,reducedMotion:'reduce'});
      const page = await context.newPage(), errors=[],paginationOffsets=[],paginationPending=new Map(),imageRequests=[];
      page.setDefaultTimeout(10000);
      // This fixture has no service worker server; exercise the UI without an
      // artificial registration-error toast obscuring the screenshot.
      await page.addInitScript(()=>{delete Object.getPrototypeOf(navigator).serviceWorker;});
      page.on('pageerror',error=>errors.push(error.message));
      if(process.env.MOBILE_DEBUG){
        page.on('console',message=>console.log('Browser:',message.text()));
        page.on('requestfailed',request=>console.log('Failed request:',request.url(),request.failure()));
        await page.addInitScript(()=>document.addEventListener('error',event=>{if(event.target instanceof HTMLImageElement)console.log('Image error:',event.target.src,event.target.currentSrc,event.target.loading);},true));
      }
      await page.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(url.protocol==='blob:')return route.continue();
        if(url.hostname==='api.yani.tv') {
          if([390,1280].includes(viewport.width)&&url.pathname==='/anime'&&url.searchParams.get('limit')==='24'){
            const offset=Number(url.searchParams.get('offset')||0);paginationOffsets.push(offset);
            if(offset>0)await new Promise(resolve=>paginationPending.set(offset,resolve));
            return route.fulfill({json:{response:offset>=120?[]:Array.from({length:24},(_,index)=>({...anime,anime_id:20000+offset+index,poster:poster(20000+offset+index),title:`Каталог ${offset+index}`}))}});
          }
          const response=url.pathname==='/anime/genres'?{genres:[{value:14,href:'detektiv',title:'Детектив'}]}:/\/anime\/\d+$/.test(url.pathname)?anime:/\/anime\/\d+\//.test(url.pathname)?[]:list;
          return route.fulfill({json:{response}});
        }
        if(url.hostname==='static.yani.tv'){
          imageRequests.push(url.pathname);
          return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" fill="#3a5062"/><path d="M0 180 100 40 200 180 270 80 320 180" fill="#82978a"/></svg>'});
        }
        if(url.hostname!=='mobile.test')return route.abort();
        const name=url.pathname.slice(1);
        if(name.endsWith('.woff2'))return route.fulfill({body:await readFile(new URL(`../public/${name}`,import.meta.url)),contentType:'font/woff2'});
        if(name==='icons/icon.svg')return route.fulfill({body:await readFile(new URL('../public/icons/icon.svg',import.meta.url)),contentType:'image/svg+xml'});
        return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="app"></div></body></html>'});
      });
      try {
        await page.goto('https://mobile.test/#/');
        await page.evaluate(entries=>localStorage.setItem('yumiwatch:library:v1',JSON.stringify({favorites:[],history:entries.map((anime,index)=>({anime,episode:'1',videoId:1000+index,group:'',position:123,duration:1400,updatedAt:Date.now()-index,preview:'https://static.yani.tv/mobile-preview.svg'}))})),list.slice(0,3));
        await page.addStyleTag({content:styles});await page.addScriptTag({content:bundle});
        await page.getByRole('heading',{name:'Каталог',exact:true}).waitFor();
        await page.getByRole('region',{name:'Выбранное аниме'}).waitFor();
        const checkGeometry=async(label)=>{
          const geometry=await page.evaluate(()=>{
            const main=document.querySelector('.media-scroll');
            return {window:innerWidth,document:document.documentElement.scrollWidth,main:main?.clientWidth,scroll:main?.scrollWidth};
          });
          assert.ok(geometry.document<=geometry.window+1,`${label}: document overflows ${JSON.stringify(geometry)}`);
          assert.ok(!geometry.main||geometry.scroll<=geometry.main+1,`${label}: content overflows ${JSON.stringify(geometry)}`);
        };
        const checkPagination=async()=>{
            await page.waitForFunction(()=>document.querySelector('[data-total-items]')?.getAttribute('data-total-items')==='24');
            await page.locator('[data-total-items] .poster-artwork.is-loaded').first().waitFor();
            const requested=new Set(imageRequests.filter(path=>/^\/posters\/200\d\d\//.test(path)));
            assert.ok(requested.size>0&&requested.size<24,`Offscreen posters were eagerly downloaded: ${requested.size}/24`);
            assert.ok(!imageRequests.some(path=>path.endsWith('/huge.svg')),'Unused full-size posters are downloaded');
            console.log(`${engine.name()} ${viewport.width}: visible catalog requested ${requested.size}/24 posters, no huge images`);
            const main=page.locator('.media-scroll');
            for(const count of [48,72,96]){
              await main.evaluate(element=>{element.scrollTop=element.scrollHeight;});
              await page.locator('.catalog-loading-page').waitFor();
              // The user can reach the bottom of the temporary skeletons too.
              if(count!==48)await main.evaluate(element=>{element.scrollTop=element.scrollHeight;});
              const before=await main.evaluate(element=>element.scrollTop);
              const offset=count-24;
              assert.ok(paginationPending.has(offset),'Expected next page request');
              paginationPending.get(offset)();paginationPending.delete(offset);
              await page.waitForFunction(count=>document.querySelector('[data-total-items]')?.getAttribute('data-total-items')===String(count),count);
              await page.waitForTimeout(150);
              const after=await main.evaluate(element=>({top:element.scrollTop,remaining:element.scrollHeight-element.clientHeight-element.scrollTop}));
              assert.ok(Math.abs(after.top-before)<2,`Appending cards moves the viewport: ${before} -> ${after.top}`);
              assert.ok(after.remaining>600,`Appending cards leaves scrolling pinned to the end: ${JSON.stringify(after)}`);
              assert.deepEqual(paginationOffsets,Array.from({length:count/24},(_,index)=>index*24),'Page append triggers another request without scrolling');
            }
        };
        await checkGeometry('home');
        const resume=page.getByRole('region',{name:'Продолжить просмотр'});
        await resume.waitFor();
        const resumeGeometry=await resume.locator('.gallery-continue').evaluateAll(cards=>cards.map(card=>({card:card.getBoundingClientRect().width,image:card.querySelector('.continue-image').getBoundingClientRect().width,title:card.querySelector('h3').getBoundingClientRect().width})));
        for(const item of resumeGeometry){assert.ok(Math.abs(item.card-item.image)<1,'Resume preview does not fill its card');assert.ok(item.title<=item.card+1,'Resume title overflows card');}
        await resume.scrollIntoViewIfNeeded();
        await resume.screenshot({path:`test-results/mobile/${engine.name()}-${viewport.width}-continue.png`});
        await page.locator('.media-scroll').evaluate(element=>{element.scrollTop=0;});
        await page.screenshot({path:`test-results/mobile/${engine.name()}-${viewport.width}-home.png`});
        if(phone) {
          const navigation=page.getByRole('navigation',{name:'Основные разделы'});
          await navigation.waitFor();
          for(const control of await navigation.locator('a,button').all()) {
            const box=await control.boundingBox();assert.ok(box&&box.width>=44&&box.height>=44,'Navigation touch target below 44px');
          }
          await navigation.getByRole('link',{name:'Поиск',exact:true}).click();
          await page.locator('#anime-search').fill('Маомао');
          await checkGeometry('search');
          await navigation.getByRole('button',{name:'Открыть меню'}).click();
          await page.getByRole('dialog',{name:'Меню'}).getByRole('link',{name:'Настройки',exact:true}).click();
          await page.getByRole('heading',{name:'Настройки',exact:true}).waitFor();
          await checkGeometry('settings');
          await page.evaluate(()=>{location.hash='/catalog';});
          await page.getByRole('button',{name:'Фильтры',exact:true}).click();
          const filters=page.getByRole('dialog');await filters.waitFor();
          const filterBox=await filters.boundingBox();assert.ok(filterBox&&filterBox.x>=0&&filterBox.y>=0&&filterBox.x+filterBox.width<=viewport.width+1&&filterBox.y+filterBox.height<=viewport.height+1,'Filter sheet is clipped');
          await page.screenshot({path:`test-results/mobile/${engine.name()}-${viewport.width}-filters.png`});
          await filters.getByRole('button',{name:'Закрыть',exact:true}).click();
          if(viewport.width===390)await checkPagination();
          await page.evaluate(()=>{location.hash='/anime/10531';});
          await page.getByRole('heading',{name:anime.title,exact:true}).waitFor();
          await checkGeometry('detail');
          const detail=page.locator('.overview-heading');
          const headingBox=await detail.locator('h1').boundingBox(),actionsBox=await detail.locator('.watch-title-actions').boundingBox();
          assert.ok(headingBox&&actionsBox&&actionsBox.y>=headingBox.y+headingBox.height,'Detail actions overlap title');
          const actionBoxes=await detail.locator('.watch-title-actions .button:visible').evaluateAll(buttons=>buttons.map(button=>{const r=button.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
          for(let i=0;i<actionBoxes.length;i++)for(let j=i+1;j<actionBoxes.length;j++){const a=actionBoxes[i],b=actionBoxes[j];assert.ok(a.right<=b.x+1||b.right<=a.x+1||a.bottom<=b.y+1||b.bottom<=a.y+1,'Detail action buttons overlap');}
          const currentTitle=page.locator('.viewing-order [aria-current="page"]');
          assert.equal(await currentTitle.count(),1,'Current title is not marked in viewing order');
          assert.equal(await currentTitle.getAttribute('href'),'#/anime/10531');
          assert.ok(await currentTitle.locator('.viewing-order-current').isVisible(),'Current title has no visible label');
          await page.screenshot({path:`test-results/mobile/${engine.name()}-${viewport.width}-detail.png`});
          await page.locator('.viewing-order').screenshot({path:`test-results/mobile/${engine.name()}-${viewport.width}-order.png`});
          await page.evaluate(()=>{location.hash='/probe-player';});
          await page.getByRole('button',{name:'Настройки плеера'}).waitFor();
          assert.equal(await navigation.isVisible(),false,'Navigation overlaps video');
          const toolbar=await page.locator('.video-toolbar').boundingBox();
          assert.ok(toolbar&&toolbar.x>=0&&toolbar.x+toolbar.width<=viewport.width+1,'Player toolbar clipped');
          for(const control of await page.locator('.video-toolbar button:visible').all()) {
            const box=await control.boundingBox();assert.ok(box&&box.width>=44&&box.height>=44,'Player touch target below 44px');
          }
          await page.getByRole('button',{name:'Настройки плеера'}).click();
          const settings=page.getByRole('dialog',{name:'Настройки плеера'});await settings.waitFor();
          const settingsBox=await settings.boundingBox();assert.ok(settingsBox&&settingsBox.y>=0&&settingsBox.height>=60,'Player settings inaccessible');
          await page.screenshot({path:`test-results/mobile/${engine.name()}-${viewport.width}-player.png`});
          await page.getByRole('button',{name:'Закрыть настройки',exact:true}).click();
          await page.getByRole('button',{name:'Серии',exact:true}).click();
          const sidebar=page.getByRole('dialog',{name:'Серии'});await sidebar.waitFor();
          await sidebar.locator('.sidebar-scroll').evaluate(element=>{element.scrollTop=300;});
          assert.ok(await sidebar.locator('.sidebar-scroll').evaluate(element=>element.scrollTop)>0,'Episodes cannot scroll');
          await page.getByRole('button',{name:'Закрыть панель'}).click();
          await page.setViewportSize({width:viewport.height,height:viewport.width});
          const frame=await page.locator('.is-watching').boundingBox();assert.ok(frame&&Math.abs(frame.height-viewport.width)<2,'Player fails rotation');
        } else {
          assert.equal(await page.locator('.media-nav').isVisible(),true,'Desktop navigation lost');
          assert.equal(await page.locator('.phone-nav').count(),0,'Phone navigation on desktop');
          await page.evaluate(()=>{location.hash='/catalog';});
          await checkPagination();
        }
        assert.deepEqual(errors,[],'Browser errors');
        console.log(`${engine.name()} ${viewport.width}×${viewport.height}: layout, navigation and player OK`);
      } catch (error) {
        console.error('Image requests:',imageRequests);
        console.error('Image viewport:',await page.evaluate(()=>({hash:location.hash,screen:document.documentElement.dataset.screen,transition:document.documentElement.dataset.pageTransition,scroll:document.querySelector('.media-scroll')?.scrollTop,loaded:[...document.querySelectorAll('[data-total-items] .is-loaded')].map(el=>({src:el.querySelector('img')?.getAttribute('src'),box:el.getBoundingClientRect().toJSON()}))})));
        console.error('Image state:',await page.locator('[data-total-items] img').evaluateAll(images=>images.slice(0,8).map(image=>({src:image.getAttribute('src'),loaded:image.complete,width:image.naturalWidth,loading:image.loading,box:image.getBoundingClientRect().toJSON()}))));
        await page.screenshot({path:`test-results/mobile/${engine.name()}-${viewport.width}-failure.png`});
        console.error(await page.evaluate(()=>[...document.querySelectorAll('.media-scroll-content *')].filter(element=>{const r=element.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left< -1)&&!element.closest('.gallery-rail,.gallery-categories,.screenshot-rail');}).slice(0,15).map(element=>({tag:element.tagName,class:element.className,width:element.getBoundingClientRect().width,right:element.getBoundingClientRect().right}))));
        console.error(await page.evaluate(()=>[...document.querySelectorAll('.overview-heading,.watch-title,.watch-title h1,.watch-title-actions,.detail-list-control,.anime-about-content,.anime-room')].map(element=>{const style=getComputedStyle(element),r=element.getBoundingClientRect();return {class:element.className,x:r.x,y:r.y,w:r.width,h:r.height,display:style.display,position:style.position,grid:style.gridTemplateColumns,scroll:element.scrollWidth};})));
        throw error;
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
}
