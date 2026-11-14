export interface Anime {
  anime_id: number;
  anime_url: string;
  title: string;
  description?: string;
  poster?: { medium?: string; big?: string; huge?: string; fullsize?: string; mega?: string };
  rating?: { average: number; counters?: number };
  year?: number;
  type?: { name?: string; shortname?: string; alias?: string };
  anime_status?: { title: string; alias: string };
  genres?: { title: string; id: number; alias: string }[];
  episodes?: { aired: number; count: number; next_date?: number; prev_date?: number };
  min_age?: { title: string; title_long?: string };
  studios?: { title: string }[];
  videos?: Video[];
  random_screenshots?: { sizes: { small: string; full: string } }[];
}
export interface Video {
  video_id: number;
  iframe_url: string;
  data: { dubbing: string; player: string; player_id: number };
  number: string;
  index: number;
}
export interface WatchEntry { anime: Anime; episode: string; group: string; videoId: number; updatedAt: number }
export interface Library { favorites: Anime[]; history: WatchEntry[] }
export interface Result<T> { data: T; cached: boolean; savedAt: number }
export type Params = Record<string, string | number | boolean | undefined>;
