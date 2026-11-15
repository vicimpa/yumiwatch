// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeAudioPlayback } from '../src/lib/autoplay';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('audio autoplay permission probe', () => {
  it('allows an already unlocked audio context and closes it', async () => {
    const close=vi.fn().mockResolvedValue(undefined), resume=vi.fn();
    vi.stubGlobal('AudioContext',class { state='running';close=close;resume=resume; });
    expect(await probeAudioPlayback()).toBe(true);expect(close).toHaveBeenCalledOnce();expect(resume).not.toHaveBeenCalled();
  });
  it('allows a context that can resume without another user gesture', async () => {
    const close=vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('AudioContext',class {state='suspended';close=close;async resume(){this.state='running';}});
    expect(await probeAudioPlayback()).toBe(true);expect(close).toHaveBeenCalledOnce();
  });
  it('times out a context blocked by autoplay policy without leaving it open', async () => {
    vi.useFakeTimers();const close=vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('AudioContext',class {state='suspended';close=close;resume(){return new Promise(()=>{});}});
    const allowed=probeAudioPlayback();await vi.advanceTimersByTimeAsync(251);expect(await allowed).toBe(false);expect(close).toHaveBeenCalledOnce();
  });
  it('stays paused when the browser does not support audio contexts', async () => {
    vi.stubGlobal('AudioContext',undefined);expect(await probeAudioPlayback()).toBe(false);
  });
});
