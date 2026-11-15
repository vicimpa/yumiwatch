import { useCachedImage } from './CachedImage';
import { useEffect, useRef } from 'preact/hooks';
import type { RefObject } from 'preact';
import { interfaceSettings } from '../lib/interface-settings';
import type shaka from 'shaka-player';
import type { Stream, StreamCaption } from '../lib/streams';
import { hlsSkips, metadataSkips, mergeSkips, type SkipMarkers } from '../../shared/skips.mjs';
import { isDesktopMedia } from '../lib/desktop';

export function nativeHls(element:HTMLVideoElement){
  if(!element.canPlayType('application/vnd.apple.mpegurl'))return false;
  const safari=/Safari/i.test(navigator.userAgent)&&!/(Chrome|Chromium|CriOS|FxiOS|Edg|OPR)/i.test(navigator.userAgent);
  // Desktop Chromium can advertise "maybe" while its native HLS path cannot recover segment errors.
  return safari||typeof MediaSource==='undefined';
}
export function selectQuality(player: shaka.Player, quality: number, clearBuffer=false) {
  const tracks = player.getVariantTracks().filter(track => track.height).sort((a,b) => a.height! - b.height!);
  const language = tracks.find(track => track.active)?.language;
  const compatible = language ? tracks.filter(track => track.language === language) : tracks;
  const track = compatible.filter(track => track.height! <= quality).at(-1) || compatible[0];
  if (track) { player.configure({ abr: { enabled: false } }); player.selectVariantTrack(track, clearBuffer); }
  return track?.height;
}

// Each layer owns its decoder. Preparing another layer never unloads the live one.
export function StreamMedia({ stream, caption, video, active, title, poster, provider, start, onReady, onError, onSkips, onPending }: {
  stream: Stream; caption?: StreamCaption; video: RefObject<HTMLVideoElement>; active: boolean; title: string; poster: string; provider?:string;
  start: () => number; onReady: () => void; onError: (error: Error) => void; onSkips: (skips: SkipMarkers) => void;
  onPending?: (pending:boolean)=>void;
}) {
  const cachedPoster=useCachedImage(poster);
  const callbacks = useRef({ start, onReady, onError, onSkips, onPending }); callbacks.current = { start, onReady, onError, onSkips, onPending };
  const engine = useRef<shaka.Player>();
  const desiredQuality = useRef(stream.quality); desiredQuality.current = stream.quality;
  const closing = useRef<Promise<unknown>>(Promise.resolve());
  const relayed = isDesktopMedia(stream.url);
  const native = stream.type === 'mp4' || provider!=='Kodik' && !relayed && stream.type === 'hls' && !!video.current && nativeHls(video.current);
  useEffect(() => { if (engine.current) selectQuality(engine.current, stream.quality); }, [stream.quality]);
  useEffect(() => {
    const element = video.current!; element.volume=interfaceSettings().volume; let disposed = false, notified = false, prepared=false, targetHeight=0;
    callbacks.current.onPending?.(false);
    let player: shaka.Player | undefined;
    let networkRetries=0,retryPosition=-Infinity;
    const discover = (skips: SkipMarkers) => { if (!disposed) callbacks.current.onSkips(skips); };
    const ready = () => { if (!disposed && prepared && element.readyState >= 2 && !element.seeking && (!targetHeight||element.videoHeight>=targetHeight)) { callbacks.current.onPending?.(false);if(!notified){notified = true; callbacks.current.onReady();} } };
    const restore = () => {
      const time = callbacks.current.start();
      if (time > 0 && Math.abs(element.currentTime - time) > .01) element.currentTime = Math.min(time, Number.isFinite(element.duration) ? Math.max(0, element.duration) : time);
    };
    const failed = (event?: Event) => {
      const detail=(event as Event&{detail?:{severity?:number;category?:number}}|undefined)?.detail;
      if(!prepared&&!detail&&player)return; // Shaka's load promise owns setup failures.
      // Shaka retries recoverable segment/network errors itself. They are not a failed source.
      if(detail?.severity===1)return;
      // VOD network failures stop Shaka's streaming engine; explicitly allow a bounded retry.
      if(!disposed&&detail?.category===1&&player&&!element.error){
        if(Math.abs(element.currentTime-retryPosition)>1)networkRetries=0;
        if(networkRetries<2&&player.retryStreaming(1)){networkRetries++;retryPosition=element.currentTime;return;}
      }
      if (!disposed) { callbacks.current.onPending?.(false);callbacks.current.onError(new Error('Не удалось загрузить видеопоток.',{cause:detail})); }
    };
    element.addEventListener('loadedmetadata', restore);
    for (const event of ['loadeddata','canplay','seeked','playing','resize','timeupdate']) element.addEventListener(event, ready);
    element.addEventListener('error', failed);
    void (async () => {
      try {
        await closing.current; if (disposed) return;
        // WebKit's AVFoundation HLS loader cannot load an application scheme. Shaka
        // requests these bounded segments through WebView's in-process protocol.
        // AVFoundation repeatedly stalls Kodik HLS while seeking a hidden
        // replacement. Use the same bounded, timestamp-aware engine as Windows.
        const useNative = stream.type === 'mp4' || provider!=='Kodik' && !relayed && stream.type === 'hls' && nativeHls(element);
        if (useNative) { prepared=true;element.src = stream.url; element.load(); }
        else {
          callbacks.current.onPending?.(true);
          const { default: shaka } = await import('shaka-player'); if (disposed) return;
          shaka.polyfill.installAll();
          if (relayed) shaka.net.NetworkingEngine.registerScheme('yumiwatch-media', shaka.net.HttpFetchPlugin.parse);
          if (!shaka.Player.isBrowserSupported()) throw new Error('Этот браузер не поддерживает поток.');
          player = new shaka.Player(); await player.attach(element);
          if (disposed) { await player.destroy(); return; }
          engine.current = player;
          player.configure({
            abr: { defaultBandwidthEstimate: 350000, restrictions: { maxHeight: desiredQuality.current } },
            streaming: { bufferingGoal: 15, rebufferingGoal: 2, bufferBehind: 15, ...(relayed ? { preferNativeHls:false, fallbackToNativeHlsOnMseError:false } : {}), retryParameters: { maxAttempts: 3, baseDelay: 1000, timeout: 20000 } },
            manifest: {
              // Kodik's rounded EXTINF durations can disagree with continuous TS timestamps.
              // Re-aligning every segment to the playlist introduces artificial gaps and skips whole seconds.
              hls: provider==='Kodik'?{sequenceMode:false,ignoreManifestTimestampsInSegmentsMode:true}:{},
              retryParameters: { maxAttempts: 3, timeout: 20000 }
            }
          });
          player.getNetworkingEngine()?.registerResponseFilter((type, response) => {
            if (!disposed && type === shaka.net.NetworkingEngine.RequestType.MANIFEST && response.data.byteLength <= 512000) {
              const text = new TextDecoder().decode(response.data); if (text.startsWith('#EXTM3U')) discover(hlsSkips(text));
            }
          });
          const region = (event: Event) => {
            const data = event as Event & { detail?: unknown; region?: unknown };
            discover(mergeSkips(metadataSkips(data.detail), metadataSkips(data.region), metadataSkips(data)));
          };
          player.addEventListener('timelineregionadded', region); player.addEventListener('metadataadded', region); player.addEventListener('metadata', region);
          player.addEventListener('error', failed);
          await player.load(stream.url, callbacks.current.start(), stream.type === 'hls' ? 'application/vnd.apple.mpegurl' : 'application/dash+xml'); if (disposed) return;
          // Only the standby decoder loses its startup buffer. The live layer
          // continues until the requested variant actually decodes a frame.
          targetHeight=selectQuality(player, desiredQuality.current, true)||0;prepared=true;
          callbacks.current.onPending?.(false);
          for (const track of player.getChaptersTracks()) {
            try { for (const chapter of await player.getChaptersAsync(track.language)) discover(metadataSkips(chapter)); } catch { /* Optional chapters. */ }
          }
          if (caption && !disposed) { const track = await player.addTextTrackAsync(caption.url, caption.language, 'subtitles', 'text/vtt', undefined, caption.label); player.selectTextTrack(track); }
          ready();
        }
      } catch (error) { if (!disposed) { callbacks.current.onPending?.(false);callbacks.current.onError(error as Error); } }
    })();
    return () => {
      disposed = true;
      element.removeEventListener('loadedmetadata', restore);
      for (const event of ['loadeddata','canplay','seeked','playing','resize','timeupdate']) element.removeEventListener(event, ready);
      element.removeEventListener('error', failed);
      element.pause(); engine.current = undefined;
      if (player) closing.current = player.destroy(); else { element.removeAttribute('src'); element.load(); }
    };
  }, [stream.url, caption?.url, provider]);
  // CVH's MP4 CDN rejects Origin instead of implementing CORS. Native media
  // needs no CORS mode; setting it here makes an otherwise playable URL fail.
  return <video ref={video} class={`stream-layer ${active ? 'is-active' : 'is-standby'}`} data-active={active} aria-hidden={!active} crossOrigin={stream.type === 'mp4' ? undefined : 'anonymous'} playsInline preload="auto" poster={cachedPoster || undefined} aria-label={active ? title : undefined}>{caption && native && <track key={caption.url} kind="subtitles" src={caption.url} srcLang={caption.language} label={caption.label} default/>}</video>;
}
