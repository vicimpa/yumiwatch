// @vitest-environment jsdom
import { useRef } from 'preact/hooks';
import { act, cleanup, render, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setPlaybackRate } from '~/lib/playback-rate';
import {
  StreamMedia,
  nativeHls,
  STREAM_STARTUP_TIMEOUT_MS,
  STREAM_LOAD_TIMEOUT_MS,
} from '~/components/StreamMedia';

const engine = vi.hoisted(() => ({
  listeners: new Map<string, (event: Event) => void>(),
  loaded: vi.fn(),
  retry: vi.fn().mockReturnValue(true),
  configure: vi.fn(),
  destroy: vi.fn(),
  rate: vi.fn(),
}));

vi.mock('shaka-player', () => ({
  default: {
    polyfill: { installAll: () => {} },
    net: { NetworkingEngine: { RequestType: { MANIFEST: 1 } } },
    Player: class {
      static isBrowserSupported() {
        return true;
      }

      async attach() {}

      trickPlay(rate: number) {
        engine.rate(rate);
      }

      configure(config: unknown) {
        engine.configure(config);
      }

      getVariantTracks() {
        return [];
      }

      getNetworkingEngine() {
        return { registerResponseFilter: () => {} };
      }

      addEventListener(name: string, callback: (event: Event) => void) {
        engine.listeners.set(name, callback);
      }

      retryStreaming() {
        return engine.retry();
      }

      async load() {
        await engine.loaded();
      }

      getChaptersTracks() {
        return [];
      }

      async destroy() {
        engine.destroy();
      }
    },
  },
}));

function Harness({
  failure,
  provider,
  type = 'hls',
  pending,
  fallback = false,
}: {
  failure: (error: Error) => void;
  provider?: string;
  type?: 'hls' | 'mp4';
  pending?: (value: boolean) => void;
  fallback?: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);

  return (
    <StreamMedia
      provider={provider}
      stream={{
        quality: 720,
        type,
        url: `https://cdn.example/video.${type === 'hls' ? 'm3u8' : 'mp4'}`,
        fallback: fallback ? { type: 'mp4', url: 'https://cdn.example/video.mp4' } : undefined,
      }}
      video={video}
      active
      title="Видео"
      poster=""
      start={() => 0}
      onReady={() => {}}
      onError={failure}
      onPending={pending}
      onSkips={() => {}}
    />
  );
}

beforeEach(() => {
  engine.listeners.clear();
  engine.loaded.mockClear();
  engine.retry.mockClear();
  engine.configure.mockClear();
  engine.destroy.mockClear();
  engine.rate.mockClear();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('adaptive stream errors', () => {
  it('bounds setup of a stream with an MP4 fallback and ignores its late setup rejection', async () => {
    vi.useFakeTimers();
    let reject!: (error: Error) => void;
    engine.loaded.mockImplementationOnce(
      () =>
        new Promise<void>((_, fail) => {
          reject = fail;
        })
    );
    const failure = vi.fn();
    render(<Harness provider="Kodik" failure={failure} fallback />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(typeof reject).toBe('function');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STREAM_STARTUP_TIMEOUT_MS);
    });
    expect(failure).toHaveBeenCalledOnce();
    await act(async () => {
      reject(new Error('Late setup error'));
    });
    expect(failure).toHaveBeenCalledOnce();
  });
  it('sends user speed to the adaptive controller rather than fighting its buffering rate', async () => {
    const { container } = render(<Harness failure={() => {}} />);

    await waitFor(() => expect(engine.rate).toHaveBeenCalledWith(1));

    const video = container.querySelector('video')!;

    setPlaybackRate(video, 2);
    expect(engine.rate).toHaveBeenLastCalledWith(2);
    expect(video.defaultPlaybackRate).toBe(2);
  });

  it('keeps startup retries pending until the engine finishes loading', async () => {
    let finish!: () => void;

    engine.loaded.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        })
    );

    const pending = vi.fn(),
      failure = vi.fn();

    render(<Harness provider="CVH" failure={failure} pending={pending} />);
    await waitFor(() => expect(typeof finish).toBe('function'));
    expect(pending).toHaveBeenLastCalledWith(true);
    expect(failure).not.toHaveBeenCalled();
    finish();
    await waitFor(() => expect(pending).toHaveBeenLastCalledWith(false));
  });
  it('bounds a hung Alloha manifest even without a format fallback and ignores late completion', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    engine.loaded.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        })
    );
    const failure = vi.fn(),
      pending = vi.fn();
    render(<Harness provider="Alloha" failure={failure} pending={pending} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(typeof finish).toBe('function');
    await act(async () => {
      vi.advanceTimersByTime(STREAM_LOAD_TIMEOUT_MS + 1);
    });
    expect(failure).toHaveBeenCalledOnce();
    expect(pending).toHaveBeenLastCalledWith(false);
    await act(async () => finish());
    expect(failure).toHaveBeenCalledOnce();
    expect(engine.destroy).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
  it('loads native MP4 without a CORS Origin that the CVH CDN rejects', async () => {
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    const failure = vi.fn();
    const { container } = render(<Harness provider="CVH" type="mp4" failure={failure} />);

    await waitFor(() => expect(load).toHaveBeenCalled());

    const video = container.querySelector('video')!;

    expect(video.getAttribute('crossorigin')).toBeNull();
    expect(video.src).toBe('https://cdn.example/video.mp4');
    expect(engine.loaded).not.toHaveBeenCalled();
    expect(failure).not.toHaveBeenCalled();
  });
  it('uses the adaptive engine for desktop Chromium despite native HLS advertising maybe', () => {
    const media = document.createElement('video');

    vi.spyOn(media, 'canPlayType').mockReturnValue('maybe');
    vi.stubGlobal('MediaSource', class {});

    const agent = vi.spyOn(navigator, 'userAgent', 'get');

    agent.mockReturnValue('Mozilla/5.0 Chrome/144.0.0.0 Safari/537.36');
    expect(nativeHls(media)).toBe(false);
    agent.mockReturnValue('Mozilla/5.0 Version/18.0 Safari/605.1.15');
    expect(nativeHls(media)).toBe(true);
  });
  it('uses managed Kodik HLS retries even when WebKit advertises native playback', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('maybe');
    vi.stubGlobal('MediaSource', class {});
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 Version/18.0 Safari/605.1.15'
    );

    const { container } = render(<Harness provider="Kodik" failure={() => {}} />);

    await waitFor(() => expect(engine.loaded).toHaveBeenCalled());
    expect(container.querySelector('video')?.getAttribute('src')).toBeNull();
  });
  it('keeps the full episode seek range when a provider omits the VOD end marker', async () => {
    render(<Harness provider="Kodik" failure={() => {}} />);
    await waitFor(() => expect(engine.loaded).toHaveBeenCalled());

    expect(engine.configure.mock.calls[0][0].manifest.availabilityWindowOverride).toBe(Infinity);
  });
  it.each(['Kodik', 'Alloha', 'CVH', 'Aksor'])(
    'keeps segment timestamps continuous for Kodik and Alloha HLS (%s)',
    async provider => {
      render(<Harness provider={provider} failure={() => {}} />);
      await waitFor(() => expect(engine.loaded).toHaveBeenCalled());

      const hls = engine.configure.mock.calls[0][0].manifest.hls;
      expect(engine.configure.mock.calls[0][0].streaming.inaccurateManifestTolerance).toBe(
        provider === 'Alloha' || provider === 'Kodik' ? 2 : undefined
      );

      if (provider === 'Kodik' || provider === 'Alloha')
        expect(hls).toEqual({ sequenceMode: false, ignoreManifestTimestampsInSegmentsMode: true });
      else expect(hls).toEqual({});
    }
  );
  it('leaves recoverable HLS errors to the decoder and reports a critical error', async () => {
    const failure = vi.fn();

    render(<Harness failure={failure} />);
    await waitFor(() => expect(engine.loaded).toHaveBeenCalled());
    engine.listeners.get('error')!(new CustomEvent('error', { detail: { severity: 1 } }));
    expect(failure).not.toHaveBeenCalled();
    engine.listeners.get('error')!(new CustomEvent('error', { detail: { severity: 2 } }));
    expect(failure).toHaveBeenCalledOnce();
  });
  it('retries a stopped VOD network engine twice before discarding the source', async () => {
    const failure = vi.fn();

    render(<Harness failure={failure} />);
    await waitFor(() => expect(engine.loaded).toHaveBeenCalled());

    const error = () =>
      engine.listeners.get('error')!(
        new CustomEvent('error', { detail: { severity: 2, category: 1 } })
      );

    error();
    error();
    expect(engine.retry).toHaveBeenCalledTimes(2);
    expect(failure).not.toHaveBeenCalled();
    error();
    expect(failure).toHaveBeenCalledOnce();
  });
});
