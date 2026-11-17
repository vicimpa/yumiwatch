import type { FunctionalComponent as FC } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useSession } from '~/lib/hooks';
import { notify } from '~/lib/notifications';
import { acknowledge, socialRequest } from '~/lib/social-api';
import { SUBSCRIPTIONS_EVENT } from '~/lib/social';
import { voiceKey } from '~/lib/streams';
import type { Video } from '~/lib/types';
import { Button, ButtonLink, FormError, Icon } from '~/ui';

type Subscription = { anime_id: number; sub?: { dubbing?: string; player_id?: number } };
const keyFor = (video: Video) => `${video.data.player_id}:${voiceKey(video.data.dubbing)}`;

export function useEpisodeSubscriptions(animeId: number) {
  const session = useSession();
  const token = session?.verified ? session.token : undefined;
  const [state, setState] = useState<{
    token?: string;
    keys: Set<string>;
    loading: boolean;
    error: string;
  }>({ keys: new Set(), loading: false, error: '' });
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState('');
  useEffect(() => {
    if (!token || !session) {
      setState({ keys: new Set(), loading: false, error: '' });
      return;
    }
    const controller = new AbortController();
    setState(previous => ({ ...previous, token, loading: true, error: '' }));
    void socialRequest<Subscription[]>(`/users/${session.user.id}/lists/subs`, {
      signal: controller.signal,
    })
      .then(values => {
        if (!Array.isArray(values)) throw new Error('Не удалось прочитать подписки.');
        if (!controller.signal.aborted)
          setState({
            token,
            loading: false,
            error: '',
            keys: new Set(
              values
                .filter(v => v.anime_id === animeId && v.sub)
                .map(v => `${v.sub!.player_id}:${voiceKey(v.sub!.dubbing || '')}`)
            ),
          });
      })
      .catch(error => {
        if (!controller.signal.aborted)
          setState({ token, keys: new Set(), loading: false, error: error.message });
      });
    return () => controller.abort();
  }, [token, animeId, revision]);
  useEffect(() => {
    const update = () => setRevision(value => value + 1);
    window.addEventListener(SUBSCRIPTIONS_EVENT, update);
    return () => window.removeEventListener(SUBSCRIPTIONS_EVENT, update);
  }, []);
  return {
    available: !!token,
    loading: !!token && (state.token !== token || state.loading),
    error: state.token === token ? state.error : '',
    busy,
    subscribed: (video: Video) => state.token === token && state.keys.has(keyFor(video)),
    retry: () => setRevision(value => value + 1),
    toggle: async (video: Video) => {
      if (busy || !token || state.loading || state.error) return;
      const key = keyFor(video);
      const enabled = !state.keys.has(key);
      setBusy(key);
      try {
        await acknowledge(`/video/${video.video_id}/subscribe`, enabled ? 'PUT' : 'DELETE');
        setState(previous => {
          const keys = new Set(previous.keys);
          if (enabled) keys.add(key);
          else keys.delete(key);
          return { ...previous, keys };
        });
        window.dispatchEvent(new Event(SUBSCRIPTIONS_EVENT));
        notify(enabled ? 'Подписка на новые серии оформлена' : 'Подписка на новые серии отключена');
      } catch (error) {
        notify((error as Error).message);
      } finally {
        setBusy('');
      }
    },
  };
}

export const EpisodeSubscriptionButton: FC<{
  video: Video;
  subscription: ReturnType<typeof useEpisodeSubscriptions>;
}> = ({ video, subscription }) => {
  if (!subscription.available)
    return (
      <ButtonLink
        href={`#/account?next=${encodeURIComponent(location.hash.slice(1))}`}
        variant="text"
      >
        <Icon name="bell" size={15} />
        Уведомлять о сериях
      </ButtonLink>
    );
  if (subscription.error)
    return (
      <FormError>
        <Button variant="text" onClick={subscription.retry}>
          Повторить загрузку подписок
        </Button>
      </FormError>
    );
  const subscribed = subscription.subscribed(video);
  return (
    <Button
      variant="text"
      disabled={subscription.loading || !!subscription.busy}
      aria-pressed={subscribed}
      aria-label={`${subscribed ? 'Отписаться от новых серий' : 'Подписаться на новые серии'}: ${video.data.dubbing}, ${video.data.player}`}
      onClick={() => void subscription.toggle(video)}
    >
      <Icon name={subscribed ? 'check' : 'bell'} size={15} />
      {subscribed ? 'Подписка оформлена' : 'Уведомлять о сериях'}
    </Button>
  );
};
