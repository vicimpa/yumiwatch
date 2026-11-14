import type { Anime, Video } from '../src/lib/types';
export const anime: Anime = { anime_id: 10531, anime_url: 'monolog-farmatsevta', title: 'Монолог фармацевта', year: 2023, rating: { average: 9.2 }, type: { name: 'ТВ-сериал', shortname: 'ТВ' }, episodes: { aired: 24, count: 24 }, genres: [{ id: 14, title: 'Детектив', alias: 'detektiv' }] };
export function video(number: string, dubbing = 'AniLibria', playerId = 1): Video {
  return { video_id: Number(number) + playerId * 1000 + (dubbing === 'AniDub' ? 100 : 0), iframe_url: `https://player.example/video/${dubbing}/${playerId}/${number}`, number, index: Number(number), data: { dubbing, player: `Player ${playerId}`, player_id: playerId } };
}
