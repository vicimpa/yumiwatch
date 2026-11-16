// Film entries have no episode field. Never apply that fallback to a serial.
export function cvhEpisodeMatches(playlist, item, episode) {
  const expected = Number(episode);

  if (!Number.isFinite(expected)) return false;
  if (item.episode === undefined || item.episode === null)
    return playlist.isSerial === false && expected === 1;

  return item.episode !== '' && Number(item.episode) === expected;
}

const studio = value =>
  String(value || '')
    .toLowerCase()
    .replace(/(?:озвучка|субтитры)|[^a-zа-яё0-9]/g, '');

const alias = value =>
  studio(value)
    .replace(/aniliberty|anilibriatv/g, 'anilibria')
    .replace(/^jamclub$/, 'jam')
    .replace(/^мсentertainment$/, 'mcentertainment')
    .replace(/^anidubonline$/, 'anidub');

export function selectCvhItem(playlist, dubbing, episode, dubbingCode) {
  const dubbed = /^дубляж\s/i.test(dubbing),
    subtitles = /субтитры/i.test(dubbing);
  const label = dubbing.replace(/^дубляж\s+/i, ''),
    keys = [alias(label), ...(dubbingCode ? [alias(dubbingCode)] : [])];
  const items = (playlist.items || []).filter(
    item =>
      cvhEpisodeMatches(playlist, item, episode) &&
      /субтитры/i.test(item.voiceType || '') === subtitles &&
      (!dubbed || /дубляж/i.test(item.voiceType || '')) &&
      keys.includes(alias(item.voiceStudio))
  );
  // A provider code distinguishes AniLiberty's new dub from AniLibria's
  // older voice-over even though their studio names are aliases elsewhere.
  const exact =
    dubbingCode && items.filter(item => studio(item.voiceStudio) === studio(dubbingCode));
  const pool = exact?.length ? exact : items;

  return (!dubbed && pool.find(item => !/дубляж/i.test(item.voiceType || ''))) || pool[0];
}
