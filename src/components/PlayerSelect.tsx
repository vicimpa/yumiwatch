import type { Video } from '../lib/types';
import { groupKey, groupVideos } from '../lib/player';
import { voiceKey } from '../lib/streams';

export const OUR_PLAYER = 'universal';
export function PlayerSelect({ videos, current, universal, onChange }: {
  videos: Video[]; current: Video; universal: boolean; onChange: (video?: Video) => void;
}) {
  const providers = [...groupVideos(videos)].filter(([, group]) => voiceKey(group.videos[0].data.dubbing) === voiceKey(current.data.dubbing));
  return <label class="player-select">Плеер<select aria-label="Плеер" value={universal ? OUR_PLAYER : groupKey(current)} onChange={event => {
    if (event.currentTarget.value === OUR_PLAYER) onChange();
    else {
      const group = providers.find(([key]) => key === event.currentTarget.value)?.[1];
      if (group) onChange(group.videos.find(video => video.number === current.number) || group.videos[0]);
    }
  }}><option value={OUR_PLAYER}>Наш плеер</option>{providers.map(([key, group]) => <option key={key} value={key}>{group.videos[0].data.player}</option>)}</select></label>;
}
