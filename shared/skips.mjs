const kinds = ['opening', 'ending'];
export function skipKind(label) {
  if (typeof label !== 'string' || label.length > 512) return null;
  const value = label.toLowerCase();
  if (/(?:^|[\s_.:/-])(?:opening|intro|op|опенинг|заставка)(?:$|[\s_.:/-])/.test(value)) return 'opening';
  if (/(?:^|[\s_.:/-])(?:ending|outro|credits|ed|эндинг|титры)(?:$|[\s_.:/-])/.test(value)) return 'ending';
  return null;
}
export function seconds(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 && value <= 86400 ? value : null;
  if (typeof value !== 'string' || !/^\d+(?::[0-5]?\d){0,2}(?:\.\d+)?$/.test(value.trim())) return null;
  const result = value.trim().split(':').reduce((total, part) => total * 60 + Number(part), 0);
  return result <= 86400 ? result : null;
}
function interval(raw, duration) {
  if (!raw || typeof raw !== 'object') return null;
  const time = seconds(Array.isArray(raw) ? raw[0] : raw.time ?? raw.start ?? raw.startTime);
  const length = Array.isArray(raw) ? null : seconds(raw.length ?? raw.duration);
  let end = length !== null && time !== null ? time + length : seconds(Array.isArray(raw) ? raw[1] : raw.end ?? raw.endTime);
  if (time === null || end === null || end <= time || end > 86400) return null;
  if (Number.isFinite(duration) && duration > 0) end = Math.min(end, duration);
  return end > time ? { time, length: end - time } : null;
}
export function normalizeSkips(raw, duration) {
  const result = {};
  if (!raw || typeof raw !== 'object') return result;
  for (const kind of kinds) {
    const names = kind === 'opening' ? ['opening', 'intro', 'op'] : ['ending', 'outro', 'ed'];
    for (const name of names) {
      const value = interval(raw[name], duration);
      if (value) { result[kind] = value; break; }
    }
  }
  return result;
}
export function mergeSkips(...sources) { return Object.assign({}, ...sources.map(value => normalizeSkips(value))); }
export function parseSkipTimes(raw) {
  if (typeof raw !== 'string' || raw.length > 160) return {};
  const ranges = raw.split(','); if (ranges.length > 2) return {};
  return normalizeSkips(Object.fromEntries(ranges.map((value, index) => {
    const pair = value.trim().split('-'); return [kinds[index], pair.length === 2 ? pair.map(part => seconds(part)) : null];
  })));
}
export function providerSkips(data, html = '') {
  if (!data || typeof data !== 'object') data = {};
  const explicit = normalizeSkips({
    opening: { time: data.opening_start ?? data.intro_start, length: data.opening_length ?? data.intro_length },
    ending: { time: data.ending_start ?? data.outro_start, length: data.ending_length ?? data.outro_length }
  });
  const match = typeof html === 'string' ? html.match(/\bparseSkipButton\(\s*(["'])([\d\s:.,-]{1,160})\1\s*,\s*["']anime["']/) : null;
  return mergeSkips(data.skips, data.skip, explicit, parseSkipTimes(data.skipTime), match ? parseSkipTimes(match[2]) : {});
}
export function metadataSkips(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const kind = skipKind([raw.type, raw.title, raw.label, raw.id, raw.value, raw.schemeIdUri].filter(value => typeof value === 'string').join(' '));
  const value = kind ? interval(raw) : null;
  return mergeSkips(raw.skips, value ? { [kind]: value } : {});
}
export function hlsSkips(text) {
  if (typeof text !== 'string' || text.length > 512000 || !text.startsWith('#EXTM3U') || !text.includes('#EXT-X-DATERANGE:')) return {};
  let offset = 0, pending = 0, anchor; const ranges = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('#EXTINF:')) { const time = Number(line.slice(8).split(',')[0]); pending = Number.isFinite(time) && time > 0 ? time : 0; }
    if (line.trim() && !line.startsWith('#')) { offset += pending; pending = 0; }
    if (line.startsWith('#EXT-X-PROGRAM-DATE-TIME:') && anchor === undefined) {
      const date = Date.parse(line.slice(25)); if (Number.isFinite(date)) anchor = date / 1000 - offset;
    }
    if (line.startsWith('#EXT-X-DATERANGE:')) {
      const values = {}; for (const match of line.slice(17).matchAll(/([A-Z0-9-]+)=(?:"([^"]*)"|([^,]*))/g)) values[match[1]] = match[2] ?? match[3];
      ranges.push(values);
    }
  }
  let result = {};
  for (const range of ranges) {
    const kind = skipKind([range.CLASS, range.ID, range['X-TITLE']].filter(Boolean).join(' ')); if (!kind) continue;
    let start = seconds(range['X-START-TIME']), end = seconds(range['X-END-TIME']);
    if (start === null && anchor !== undefined) { const date = Date.parse(range['START-DATE']); if (Number.isFinite(date)) start = date / 1000 - anchor; }
    if (end === null && start !== null) {
      const length = seconds(range.DURATION); if (length !== null) end = start + length;
      else if (anchor !== undefined) { const date = Date.parse(range['END-DATE']); if (Number.isFinite(date)) end = date / 1000 - anchor; }
    }
    result = mergeSkips(result, normalizeSkips({ [kind]: { start, end } }));
  }
  return result;
}
export function activeSkip(skips, position, duration) {
  const valid = normalizeSkips(skips, duration);
  for (const kind of kinds) { const range = valid[kind]; if (range && position >= range.time && position < range.time + range.length) return { kind, ...range }; }
  return null;
}
