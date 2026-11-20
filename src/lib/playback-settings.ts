import { useEffect, useState } from 'preact/hooks';

import { PLAYBACK_RATES } from './playback-rate';
import { readJSON, writeJSON } from './storage';

export const PLAYBACK_EVENT = 'yumiwatch:playback-settings';
export const PLAYBACK_FLUSH = 'yumiwatch:playback-flush';
export const PLAYBACK_SHUTDOWN = 'yumiwatch:playback-shutdown';

export const PLAYBACK_QUALITIES = ['144', '240', '360', '480', '720', '1080', 'auto'];

export const PLAYBACK_UPSCALERS = [
  { value: 'default', label: 'Стандартный' },
  { value: 'ewa-lanczos', label: 'EWA Lanczos' },
  { value: 'fsr', label: 'AMD FSR 1.0' },
  { value: 'anime4k', label: 'Anime4K CNN x2 S' },
  { value: 'fsrcnnx', label: 'FSRCNNX x2 8-0-4-1' },
] as const;

export type UpscaleMode = (typeof PLAYBACK_UPSCALERS)[number]['value'];

export const UPSCALE_SHARPNESS = [
  { value: 'off', label: 'Выкл.' },
  { value: 'moderate', label: 'Умеренно' },
  { value: 'strong', label: 'Сильно' },
] as const;

export type UpscaleSharpness = (typeof UPSCALE_SHARPNESS)[number]['value'];

export interface PlaybackSettings {
  mode: 'source' | 'universal';
  quality: string;
  upscale: UpscaleMode;
  upscaleSharpness: UpscaleSharpness;
  rate: number;
  muted: boolean;
  autoSkipOpening: boolean;
  autoSkipEnding: boolean;
  autoPictureInPicture: boolean;
}

export function playbackSettings(): PlaybackSettings {
  const raw = readJSON<Partial<PlaybackSettings> & { upscaleSharpen?: boolean }>(
    'yumiwatch:playback-settings',
    {}
  );

  return {
    mode: raw.mode === 'universal' ? 'universal' : 'source',
    quality: PLAYBACK_QUALITIES.includes(raw.quality || '') ? raw.quality! : '360',
    upscale: PLAYBACK_UPSCALERS.find(option => option.value === raw.upscale)?.value ?? 'default',
    upscaleSharpness:
      UPSCALE_SHARPNESS.find(option => option.value === raw.upscaleSharpness)?.value ??
      (raw.upscaleSharpen === true ? 'moderate' : 'off'),
    rate: typeof raw.rate === 'number' && PLAYBACK_RATES.includes(raw.rate) ? raw.rate : 1,
    muted: raw.muted === true,
    autoSkipOpening: raw.autoSkipOpening === true,
    autoSkipEnding: raw.autoSkipEnding === true,
    autoPictureInPicture: raw.autoPictureInPicture === true,
  };
}

export function savePlaybackSettings(patch: Partial<PlaybackSettings>) {
  window.dispatchEvent(new Event(PLAYBACK_FLUSH));
  if (!writeJSON('yumiwatch:playback-settings', { ...playbackSettings(), ...patch }))
    throw new Error('Не удалось сохранить настройки плеера.');
  window.dispatchEvent(new Event(PLAYBACK_EVENT));
}

export function usePlaybackSettings() {
  const [settings, setSettings] = useState(playbackSettings);

  useEffect(() => {
    const update = () => setSettings(playbackSettings());

    window.addEventListener(PLAYBACK_EVENT, update);

    return () => window.removeEventListener(PLAYBACK_EVENT, update);
  }, []);

  return settings;
}
