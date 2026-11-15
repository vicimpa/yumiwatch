import { describe, expect, it } from 'vitest';
import { activeSkip, hlsSkips, metadataSkips, normalizeSkips, parseSkipTimes, providerSkips } from '../shared/skips.mjs';

describe('source skip markers', () => {
  it('reads the actual Kodik, Alloha and Aksor formats without executing player scripts', () => {
    expect(providerSkips({}, 'playerSettings.skipButton = parseSkipButton("0:00-1:30,21:05-22:35", "anime")')).toEqual({ opening: { time: 0, length: 90 }, ending: { time: 1265, length: 90 } });
    expect(providerSkips({ skipTime: '0-90,1265-1371' })).toEqual({ opening: { time: 0, length: 90 }, ending: { time: 1265, length: 106 } });
    expect(providerSkips({ opening_start: 15, opening_length: 90, ending_start: 1300, ending_length: 70 })).toEqual({ opening: { time: 15, length: 90 }, ending: { time: 1300, length: 70 } });
    expect(providerSkips({ opening_start: 0, opening_length: 0, ending_start: 0, ending_length: 0 })).toEqual({});
  });
  it('rejects malformed or guessed markers and never skips post-credit scenes', () => {
    for (const value of ['-1-90', '90-0', '0-Infinity', 'alert(1)', '0-90,100-110,120-130']) expect(parseSkipTimes(value)).toEqual({});
    expect(normalizeSkips({ opening: { time: NaN, length: 90 }, ending: { time: -1, length: 90 } })).toEqual({});
    const skips = { ending: { time: 1200, length: 90 } };
    expect(activeSkip(skips, 1250, 1400)).toMatchObject({ kind: 'ending', time: 1200, length: 90 });
    expect(activeSkip(skips, 1290, 1400)).toBeNull();
    expect(activeSkip({ ending: { time: 1300, length: 200 } }, 1350, 1400)?.length).toBe(100);
  });
  it('reads named stream chapters and ignores unrelated/ad markers', () => {
    expect(metadataSkips({ title: 'Opening', startTime: 12, endTime: 102 })).toEqual({ opening: { time: 12, length: 90 } });
    expect(metadataSkips({ id: 'chapter:credits', startTime: 1200, endTime: 1290 })).toEqual({ ending: { time: 1200, length: 90 } });
    expect(metadataSkips({ title: 'advertisement', startTime: 0, endTime: 30 })).toEqual({});
  });
  it('maps HLS date ranges to media time even when PDT follows EXTINF', () => {
    const manifest = '#EXTM3U\n#EXTINF:10,\n#EXT-X-PROGRAM-DATE-TIME:2026-01-01T00:00:00Z\nfirst.ts\n#EXTINF:10,\nsecond.ts\n#EXT-X-DATERANGE:ID="opening",START-DATE="2026-01-01T00:00:20Z",DURATION=90\n#EXT-X-DATERANGE:ID="ending",X-START-TIME=1200,X-END-TIME=1290\n#EXT-X-DATERANGE:ID="ad",X-START-TIME=0,DURATION=15';
    expect(hlsSkips(manifest)).toEqual({ opening: { time: 20, length: 90 }, ending: { time: 1200, length: 90 } });
    expect(hlsSkips('#EXTM3U\n#EXT-X-DATERANGE:ID="intro",START-DATE="2026-01-01T00:00:20Z",DURATION=90')).toEqual({});
  });
});
