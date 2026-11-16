import { useEffect, useState } from 'preact/hooks';

import { readJSON, writeJSON } from './storage';

export const PLAYBACK_EVENT = 'yumiwatch:playback-settings';
export const PLAYBACK_FLUSH = 'yumiwatch:playback-flush';

export const PLAYBACK_QUALITIES = ['144', '240', '360', '480', '720', '1080', 'auto'];

export interface PlaybackSettings {
  mode: 'source' | 'universal';
  quality: string;
  autoSkipOpening: boolean;
  autoSkipEnding: boolean;
}

export function playbackSettings(): PlaybackSettings {
  const raw = readJSON<Partial<PlaybackSettings>>('yumiwatch:playback-settings', {});

  return {
    mode: raw.mode === 'universal' ? 'universal' : 'source',
    quality: PLAYBACK_QUALITIES.includes(raw.quality || '') ? raw.quality! : '360',
    autoSkipOpening: raw.autoSkipOpening === true,
    autoSkipEnding: raw.autoSkipEnding === true,
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
