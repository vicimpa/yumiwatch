// Browser test entry: render the real player UI instead of a bare <video>.
import { render } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { VideoSurface } from '../src/components/VideoSurface';
import type { Stream, StreamCaption } from '../src/lib/streams';
import type { MediaUpdate } from '../src/lib/playback-session';

declare global {
  interface Window {
    surfaceInit: { streams: Stream[]; caption?: StreamCaption; provider: string; title: string };
    surfaceProbe: { media: () => HTMLVideoElement | null; setStream: (stream: Stream) => void; failures: boolean[]; updates: MediaUpdate[]; qualityFailures: Stream[] };
  }
}

function Probe() {
  const init=window.surfaceInit;
  const [stream,setStream]=useState(init.streams.find(s=>s.quality===360)||init.streams[0]);
  const media=useRef<HTMLVideoElement>(null);
  const report=useRef({failures:[] as boolean[],updates:[] as MediaUpdate[],qualityFailures:[] as Stream[]});
  useLayoutEffect(()=>{window.surfaceProbe={media:()=>media.current,setStream,...report.current};},[]);
  return <VideoSurface stream={stream} caption={init.caption} provider={init.provider} identity={1} start={0} autoplay={false} media={media}
    title={init.title} poster="" skips={{}} autoOpening={false} autoEnding={false} retry={()=>{}}
    onUpdate={update=>{report.current.updates.push(update);if(report.current.updates.length>100)report.current.updates.shift();}}
    onStreamError={playing=>{report.current.failures.push(playing);}}
    onQualityError={fallback=>{report.current.qualityFailures.push(fallback);setStream(fallback);}}
    onBack={()=>{}} onEpisodes={()=>{}} onComments={()=>{}}
    quality={<label>Качество<select aria-label="Качество видео" value={stream.quality} onChange={event=>{const next=init.streams.find(s=>s.quality===Number(event.currentTarget.value));if(next)setStream(next);}}>{init.streams.map(s=><option value={s.quality}>{s.quality}p</option>)}</select></label>}
    streamInfo={<span>{init.provider} · {stream.quality}p</span>}/>;
}

render(<div class="media-app is-playback"><section class="anime-detail-screen is-watching"><section class="watch-area immersive-player"><div class="watch-sticky"><div class="universal-stage"><Probe/></div></div></section></section></div>,document.getElementById('app')!);
