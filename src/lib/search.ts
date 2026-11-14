import { readJSON, writeJSON } from './storage';
const KEY = 'yumiwatch:recent-searches';
export function recentSearches(): string[] {
  const values = readJSON<unknown>(KEY, []);
  return Array.isArray(values) ? values.filter(value => typeof value === 'string' && value.length <= 500).slice(0, 8) : [];
}
export function rememberSearch(query: string) {
  const value = query.trim().slice(0, 500);
  if (value.length < 2) return;
  writeJSON(KEY, [value, ...recentSearches().filter(previous => previous.toLocaleLowerCase() !== value.toLocaleLowerCase())].slice(0, 8));
}
export function removeSearch(query?: string) { writeJSON(KEY, query ? recentSearches().filter(value => value !== query) : []); }
