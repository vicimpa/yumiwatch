// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveStream, selectStream, voiceKey, voiceVideos } from '~/lib/streams';
import { playbackSettings, savePlaybackSettings } from '~/lib/playback-settings';
import { video } from './fixtures';

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());
describe('universal playback', () => {
  it('groups providers by voice but keeps subtitles separate', () => {
    expect(voiceKey('Озвучка AniLibria')).toBe(voiceKey('Озвучка AniLiberty'));
    expect(voiceKey('Субтитры Studio')).not.toBe(voiceKey('Озвучка Studio'));

    const values = [video('1'), video('2'), video('1', 'AniLibria', 4), video('1', 'AniDub')];

    expect(voiceVideos(values, 'AniLibria').map(v => v.number)).toEqual(['1', '2']);
  });
  it('chooses a quality within the requested limit and reports the available higher quality honestly', () => {
    const low = { quality: 360, url: 'https://cdn.example/360.mp4', type: 'mp4' as const };
    const high = { ...low, quality: 1080 };

    expect(selectStream([high, low], '480')).toBe(low);
    expect(selectStream([high], '360')).toBe(high);
  });
  it('keeps episode progress from the most recently watched provider when grouping a voice', () => {
    const watched = { ...video('2'), watched: { date: 200, end_time: 30 } };
    const older = { ...video('2', 'AniLiberty', 2), watched: { date: 100, end_time: 1200 } };
    const unwatched = video('2', 'AniLibria', 3);

    expect(voiceVideos([watched, older, unwatched], 'AniLibria')).toEqual([watched]);
    expect(voiceVideos([unwatched, older, watched], 'AniLibria')).toEqual([watched]);
  });
  it('keeps source mode by default and persists the explicit user choice', () => {
    expect(playbackSettings().mode).toBe('source');
    savePlaybackSettings({ mode: 'universal', quality: '240' });
    expect(playbackSettings()).toMatchObject({ mode: 'universal', quality: '240' });
    savePlaybackSettings({ mode: 'source' });
    expect(playbackSettings().mode).toBe('source');
  });
  it('ignores a legacy server address and loads browser CVH directly with skip markers', async () => {
    localStorage.setItem(
      'yumiwatch:playback-settings',
      JSON.stringify({ resolver: 'http://127.0.0.1:8788', quality: '720' })
    );
    expect(playbackSettings()).not.toHaveProperty('resolver');

    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            isSerial: true,
            items: [{ episode: 1, voiceStudio: 'AniLibria', vkId: 42 }],
          })
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            duration: 1400,
            opening_start: 12,
            opening_length: 90,
            sources: { mpegLowUrl: 'https://cdn.example/360.mp4' },
          })
        )
      );

    vi.stubGlobal('fetch', fetcher);

    const result = await resolveStream(
      [{ ...video('1'), iframe_url: 'https://ru.yummyani.me/iframeCVH.html?anime_id=10531' }],
      new AbortController().signal
    );

    expect(result).toMatchObject({
      provider: 'CVH',
      videoId: 1001,
      skips: { opening: { time: 12, length: 90 } },
      streams: [{ quality: 360, type: 'mp4', url: 'https://cdn.example/360.mp4' }],
    });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      'https://plapi.cdnvideohub.com/api/v1/player/sv/playlist?pub=745&aggr=mali&id=10531',
      'https://plapi.cdnvideohub.com/api/v1/player/sv/video/42',
    ]);
    savePlaybackSettings({ quality: '480' });
    expect(JSON.parse(localStorage.getItem('yumiwatch:playback-settings')!)).not.toHaveProperty(
      'resolver'
    );
  });
  it('does not call a local HTTP fallback for providers that need the desktop backend', async () => {
    localStorage.setItem(
      'yumiwatch:playback-settings',
      JSON.stringify({ resolver: 'http://127.0.0.1:8788' })
    );

    const fetcher = vi.fn();

    vi.stubGlobal('fetch', fetcher);
    await expect(
      resolveStream(
        [{ ...video('1'), iframe_url: 'https://alloha.yani.tv/?token=public' }],
        new AbortController().signal
      )
    ).rejects.toThrow('Открой приложение');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not substitute a different CVH voice or episode', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          isSerial: true,
          items: [
            { episode: 1, voiceStudio: 'AniDub', vkId: 42 },
            { episode: 2, voiceStudio: 'AniLibria', vkId: 43 },
          ],
        })
      )
    );

    vi.stubGlobal('fetch', fetcher);
    await expect(
      resolveStream(
        [{ ...video('1'), iframe_url: 'https://ru.yummyani.me/iframeCVH.html?anime_id=10531' }],
        new AbortController().signal
      )
    ).rejects.toThrow('нет этой серии');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('stops trying browser candidates when cancelled', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn().mockImplementation(() => {
      controller.abort();

      return Promise.reject(new DOMException('Cancelled', 'AbortError'));
    });

    vi.stubGlobal('fetch', fetcher);

    const candidates = [1, 2].map(id => ({
      ...video('1', 'AniLibria', id),
      iframe_url: `https://ru.yummyani.me/iframeCVH.html?anime_id=${id}`,
    }));

    await expect(resolveStream(candidates, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('keeps automatic opening and ending skips independent and off by default', () => {
    expect(playbackSettings()).toMatchObject({ autoSkipOpening: false, autoSkipEnding: false });
    savePlaybackSettings({ autoSkipOpening: true });
    expect(playbackSettings()).toMatchObject({ autoSkipOpening: true, autoSkipEnding: false });
    savePlaybackSettings({ quality: '720', autoSkipEnding: true });
    expect(playbackSettings()).toMatchObject({ autoSkipOpening: true, autoSkipEnding: true });
  });
});
