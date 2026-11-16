import type { FunctionalComponent as FC, JSX } from 'preact';
import { useCallback, useMemo } from 'preact/hooks';

import { groupKey, groupVideos } from '~/lib/player';
import { voiceKey } from '~/lib/streams';
import type { Video } from '~/lib/types';

import { Field, Select } from '~/ui';

export const OUR_PLAYER = 'universal';

export type TPlayerSelectProps = {
  videos: Video[];
  current: Video;
  universal: boolean;
  onChange: (video?: Video) => void;
};

export const PlayerSelect: FC<TPlayerSelectProps> = ({ videos, current, universal, onChange }) => {
  const groups = useMemo(() => [...groupVideos(videos)], [videos]);
  const providers = useMemo(
    () =>
      groups.filter(
        ([, group]) => voiceKey(group.videos[0].data.dubbing) === voiceKey(current.data.dubbing)
      ),
    [groups, current.data.dubbing]
  );
  const select = useCallback(
    (event: JSX.TargetedEvent<HTMLSelectElement>) => {
      const value = event.currentTarget.value;

      if (value === OUR_PLAYER) return onChange();

      const group = providers.find(([key]) => key === value)?.[1];

      if (group)
        onChange(group.videos.find(video => video.number === current.number) || group.videos[0]);
    },
    [providers, current.number, onChange]
  );

  return (
    <Field class="player-select" label="Плеер">
      <Select
        aria-label="Плеер"
        value={universal ? OUR_PLAYER : groupKey(current)}
        onChange={select}
      >
        <option value={OUR_PLAYER}>Наш плеер</option>
        {providers.map(([key, group]) => (
          <option key={key} value={key}>
            {group.videos[0].data.player}
          </option>
        ))}
      </Select>
    </Field>
  );
};
