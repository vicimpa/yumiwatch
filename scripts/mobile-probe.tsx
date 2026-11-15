import { render } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { App } from '../src/App';
import { useHash, useVisualViewport } from '../src/lib/hooks';
import { VideoControls } from '../src/components/VideoControls';
import { Sidebar } from '../src/components/Sidebar';
import { MediaNavigation } from '../src/components/MediaNavigation';

function PlayerProbe() {
  const media = useRef<HTMLVideoElement>(null), frame = useRef<HTMLDivElement>(null);
  const [episodes, setEpisodes] = useState(false);
  useVisualViewport();
  useLayoutEffect(() => {
    document.documentElement.dataset.screen = 'watch';
    Object.defineProperty(media.current, 'duration', { value: 1440, configurable: true });
    media.current!.dispatchEvent(new Event('loadedmetadata'));
  }, []);
  return <div class="media-app is-playback">
    <MediaNavigation path="/anime/10531?view=watch" selected="/" watching/>
    <section class="is-watching"><div class="watch-area immersive-player"><div class="watch-sticky"><div ref={frame} class="universal-stage"><div class="player-frame universal-frame">
      <video ref={media}/><VideoControls media={media} frame={frame} title="Монолог фармацевта · серия 1" position={123} loading={false} failed={false} settings={<label>Автоследующая серия<input type="checkbox"/></label>}
        onVisibility={()=>{}} onBack={()=>{ location.hash='/'; }} onVoice={()=>setEpisodes(true)} voiceLabel="AniLibria" onEpisodes={()=>setEpisodes(true)} onComments={()=>setEpisodes(true)}/>
    </div></div></div></div></section>
    <Sidebar open={episodes} title="Серии" close={()=>setEpisodes(false)}><div style={{ height: 1800 }}>Список серий</div></Sidebar>
  </div>;
}
function Probe() { const path = useHash(); return path === '/probe-player' ? <PlayerProbe/> : <App/>; }
render(<Probe/>, document.getElementById('app')!);
