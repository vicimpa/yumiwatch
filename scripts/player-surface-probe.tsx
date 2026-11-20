// Browser test entry: render the real player UI instead of a bare <video>.
import { render } from 'preact';
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { VideoSurface } from '~/components/VideoSurface';
import type { Stream, StreamCaption } from '~/lib/streams';
import type { MediaUpdate } from '~/lib/playback-session';
import { Dropdown } from '~/ui/Dropdown';

declare global {
  interface Window {
    surfaceInit: {
      streams: Stream[];
      caption?: StreamCaption;
      provider: string;
      title: string;
      start?: number;
    };
    surfaceProbe: {
      media: () => HTMLVideoElement | null;
      setStream: (stream: Stream) => void;
      failures: boolean[];
      updates: MediaUpdate[];
      qualityFailures: Stream[];
    };
  }
}

mockWindows('main');
mockIPC(
  (command, args) => {
    if (command.endsWith('|is_fullscreen'))
      return document.documentElement.dataset.desktopFullscreen === 'true';
    if (command.endsWith('|set_fullscreen')) {
      document.documentElement.dataset.desktopFullscreen = String(
        (args as { value: boolean }).value
      );
      window.dispatchEvent(new Event('yumiwatch:fullscreen'));
    }
  },
  { shouldMockEvents: true }
);

function Probe() {
  const init = window.surfaceInit;
  const [stream, setStream] = useState(
    init.streams.find(s => s.quality === 360) || init.streams[0]
  );
  const media = useRef<HTMLVideoElement>(null);
  const report = useRef({
    failures: [] as boolean[],
    updates: [] as MediaUpdate[],
    qualityFailures: [] as Stream[],
  });

  useLayoutEffect(() => {
    window.surfaceProbe = { media: () => media.current, setStream, ...report.current };
  }, []);

  return (
    <VideoSurface
      stream={stream}
      caption={init.caption}
      provider={init.provider}
      identity={1}
      start={init.start || 0}
      autoplay={false}
      media={media}
      title={init.title}
      poster=""
      skips={{}}
      autoOpening={false}
      autoEnding={false}
      retry={() => {}}
      onUpdate={update => {
        report.current.updates.push(update);
        if (report.current.updates.length > 100) report.current.updates.shift();
      }}
      onStreamError={playing => {
        report.current.failures.push(playing);
      }}
      onQualityError={fallback => {
        report.current.qualityFailures.push(fallback);
        setStream(fallback);
      }}
      onBack={() => {}}
      onEpisodes={() => {}}
      onComments={() => {}}
      quality={
        <label>
          Качество
          <Dropdown
            aria-label="Качество видео"
            value={String(stream.quality)}
            onChange={value => {
              const next = init.streams.find(s => s.quality === Number(value));

              if (next) setStream(next);
            }}
            options={init.streams.map(s => ({ value: String(s.quality), label: `${s.quality}p` }))}
          />
        </label>
      }
      streamInfo={
        <span>
          {init.provider} · {stream.quality}p
        </span>
      }
    />
  );
}

render(
  <div class="media-app is-playback">
    <section class="anime-detail-screen is-watching">
      <section class="watch-area immersive-player">
        <div class="watch-sticky">
          <div class="universal-stage">
            <Probe />
          </div>
        </div>
      </section>
    </section>
  </div>,
  document.getElementById('app')!
);
