// Real Rust resolver + media transport + video decoding, without a web server.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { webkit, chromium } from 'playwright';
import assert from 'node:assert/strict';

const binary = new URL(`../src-tauri/target/debug/examples/media_probe${process.platform==='win32'?'.exe':''}`, import.meta.url);
const probe = spawn(fileURLToPath(binary), [], { stdio:['pipe','pipe','inherit'] });
let sequence=0;const pending=new Map();
const lines=createInterface({input:probe.stdout});
lines.on('line',line=>{const data=JSON.parse(line);const waiter=pending.get(data.id);if(!waiter)return;pending.delete(data.id);clearTimeout(waiter.timer);if(data.error)waiter.reject(new Error(data.error));else waiter.resolve(data.result);});
probe.on('exit',()=>{for(const waiter of pending.values()){clearTimeout(waiter.timer);waiter.reject(new Error('Native probe exited'));}pending.clear();});
function call(action,values){return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`Native ${action} timeout`));},35000);pending.set(id,{resolve,reject,timer});probe.stdin.write(`${JSON.stringify({id,action,...values})}\n`);});}

const id=process.env.ANIME_ID||'21747',voice=process.env.PLAYER_VOICE||'SHIZA';
const surfaceMode=process.env.CHECK_SURFACE==='1'||process.argv.includes('--surface');
let browser;
const failures=[];
try {
 const payload=await(await fetch(`https://api.yani.tv/anime/${id}/videos`)).json();
 const candidates=payload.response.filter(video=>video.number===(process.env.PLAYER_EPISODE||'1')&&video.data.dubbing.includes(voice)&&(!process.env.PLAYER_FAMILY||video.iframe_url.includes(process.env.PLAYER_FAMILY)));
 assert.ok(candidates.length,'No selected videos');
 browser=await(process.env.MEDIA_BROWSER==='chrome'?chromium:webkit).launch({headless:true,...(process.env.MEDIA_BROWSER==='chrome'?{channel:'chrome'}:{})});
 const groups=process.env.RESOLVE_ALL==='1'?[candidates]:candidates.map(video=>[video]);
 for(const group of groups){
  const video=group[0];
  let page;
  try {
  const result=await call('resolve',{candidates:group.map(video=>({url:video.iframe_url,videoId:video.video_id,dubbing:video.data.dubbing,episode:video.number}))});
  const stream=result.streams.find(s=>s.quality===360)||result.streams[0];
  const root='https://yumiwatch-media.localhost/';
  if(result.relay)stream.url=new URL(stream.url,root).href;
  const caption=result.caption?{...result.caption,url:result.relay?new URL(result.caption.url,root).href:result.caption.url}:undefined;
  page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  if(process.env.MEDIA_TRACE==='1')page.on('console',message=>{if(message.type()==='error')console.error(result.provider,message.text());});
  await page.route('https://media-probe.test/',route=>route.fulfill({contentType:'text/html',body:'<video muted playsinline></video>'}));
  await page.route(`${root}**`,async route=>{
   try {
    const request=route.request();const response=await call('media',{uri:`yumiwatch-media://localhost${new URL(request.url()).pathname}`,method:request.method(),range:request.headers().range});
    // Playwright is the test substitute for WebView's scheme handler. Rewrite
    // only its origin, keeping Rust's resource registration and bytes intact.
    const headers={...response.headers,'access-control-allow-origin':'*'};
    delete headers['content-length'];delete headers['vary'];
    await route.fulfill({status:response.status,headers,body:Buffer.from(response.body,'base64')});
   }catch(error){console.error('Native media probe:',error.message);await route.abort();}
  });
  await page.goto('https://media-probe.test/');
  if(surfaceMode){
    const {checkPlayerSurface}=await import('./check-player-surface.mjs');
    const streams=result.streams.map(value=>({...value,url:result.relay?new URL(value.url,root).href:value.url}));
    await checkPlayerSurface(page,{streams,caption,provider:result.provider,title:`${id} · ${video.data.dubbing}`},`${id}-${result.provider}-${video.video_id}`);
    continue;
  }
  await page.addScriptTag({path:'node_modules/shaka-player/dist/shaka-player.compiled.js'});
  await page.evaluate(async({stream,relayed,caption})=>{
   const video=document.querySelector('video');video.muted=true;
   if(stream.type==='mp4'||stream.type==='hls'&&!relayed&&video.canPlayType('application/vnd.apple.mpegurl')){
    if(stream.type!=='mp4')video.crossOrigin='anonymous';video.src=stream.url;
   }else{
    shaka.polyfill.installAll();const player=new shaka.Player();await player.attach(video);
    player.configure({streaming:{preferNativeHls:false,fallbackToNativeHlsOnMseError:false},abr:{enabled:false}});
    await player.load(stream.url,0,stream.type==='hls'?'application/vnd.apple.mpegurl':'application/dash+xml');
    const tracks=player.getVariantTracks().filter(t=>t.height).sort((a,b)=>a.height-b.height);
    const track=tracks.filter(t=>t.height<=stream.quality).at(-1)||tracks[0];if(track)player.selectVariantTrack(track,false);
    window.probePlayer=player;
    if(caption){const track=await player.addTextTrackAsync(caption.url,caption.language,'subtitles','text/vtt',undefined,caption.label);player.selectTextTrack(track);}
   }
   window.playError='';void video.play().catch(e=>window.playError=e.message);
  },{stream,relayed:!!result.relay,caption});
  await page.waitForFunction(()=>document.querySelector('video').currentTime>2||window.playError,{timeout:30000});
  const state=await page.evaluate(()=>{const v=document.querySelector('video');return{time:v.currentTime,width:v.videoWidth,height:v.videoHeight,error:window.playError};});
  assert.ok(state.time>2,`${result.provider}: ${state.error||'No video frames'}`);assert.equal(errors.length,0);
  await page.evaluate(()=>{document.querySelector('video').currentTime=60;});
  await page.waitForFunction(()=>{const v=document.querySelector('video');return v.currentTime>61&&!v.seeking&&v.readyState>=2;},{timeout:30000});
  console.log(`${result.provider}: ${state.width}×${state.height}, decoded playback and seek to 60s, ${video.data.dubbing}`);
  } catch(error) {
    if(surfaceMode&&page)console.error('Player state:',await page.evaluate(()=>({layers:[...document.querySelectorAll('video')].map(v=>({active:v.dataset.active,time:v.currentTime,height:v.videoHeight,ready:v.readyState,paused:v.paused,seeking:v.seeking,error:v.error?.code})),qualityFailures:window.surfaceProbe?.qualityFailures.map(s=>s.quality),alert:document.querySelector('.native-error')?.textContent})).catch(()=>({})));
    if(process.env.MEDIA_TRACE==='1'&&page)console.error('Media events:',JSON.stringify(await page.evaluate(()=>window.mediaDiagnostics).catch(()=>[]),null,2));
    const message=String(error?.message||error);
    const reason=message.match(/Shaka Error \d+/)?.[0]||message.split('\n')[0];
    failures.push(video.data.player);console.error(`${video.data.player}: FAILED — ${reason}`);
  } finally {await page?.close();}
 }
 assert.equal(failures.length,0,`Failed sources: ${failures.join(', ')}`);
} finally {await browser?.close();probe.stdin.end();probe.kill();lines.close();}
