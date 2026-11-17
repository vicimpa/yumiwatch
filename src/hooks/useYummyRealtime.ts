import { useEffect, useState } from 'preact/hooks';
import { realtime, startSocial } from '~/lib/social';
import type { UserProfile } from '~/lib/profile';

export function useYummyRealtime() {
  useEffect(startSocial, []);
}

export function useLiveUsers(users: UserProfile[]) {
  const [updates, setUpdates] = useState<Record<number, Partial<UserProfile>>>({});
  const ids = users
    .map(user => user.id)
    .sort((a, b) => a - b)
    .join(',');
  useEffect(() => {
    setUpdates({});
    const cleanups = users.map(user =>
      realtime.subscribe('user', user.id, event => {
        const data = event.data as Partial<UserProfile> | undefined;
        if (!data || typeof data !== 'object') return;
        setUpdates(previous => ({
          ...previous,
          [user.id]: {
            ...previous[user.id],
            ...(typeof data.last_online === 'number' ? { last_online: data.last_online } : {}),
            ...(typeof data.nickname === 'string' ? { nickname: data.nickname } : {}),
          },
        }));
      })
    );
    const timer = setInterval(() => setUpdates(value => ({ ...value })), 30_000);
    return () => {
      cleanups.forEach(cleanup => cleanup());
      clearInterval(timer);
    };
  }, [ids]);
  return users.map(user => ({ ...user, ...updates[user.id] }));
}
