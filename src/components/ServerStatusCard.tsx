import { useEffect, useRef, useState } from 'preact/hooks';
import { activeApiUrl, API_URL, API_URLS } from '~/lib/api-endpoints';
import {
  fetchServerStatus,
  SERVER_STATUS_INTERVAL,
  SERVER_STATUS_STALE_MS,
  SERVER_STATUS_URL,
  type ServerState,
  type ServerStatusSnapshot,
  type ServerStatus,
} from '~/lib/server-status';
import { realtimeStatus } from '~/lib/social';
import { Button, ButtonLink, Icon, SettingsCard } from '~/ui';
import './ServerStatusCard.css';

const labels: Record<ServerState, string> = {
  up: 'Работает',
  degraded: 'Перебои',
  down: 'Недоступен',
  captcha: 'Капча',
  unknown: 'Нет данных',
};
const time = (value: number) =>
  new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

export function ServerStatusCard() {
  const [snapshot, setSnapshot] = useState<ServerStatusSnapshot>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const refresh = useRef(() => {});
  const selected = new URL(activeApiUrl.value).hostname;
  const socket = realtimeStatus.value;
  const servers: ServerStatus[] =
    snapshot?.servers ??
    API_URLS.map(endpoint => ({ domain: new URL(endpoint).hostname, state: 'unknown' }));

  useEffect(() => {
    const controller = new AbortController();
    let pending = false,
      lastCheck = -Infinity;
    const check = async (force = false) => {
      if (
        pending ||
        document.hidden ||
        navigator.onLine === false ||
        (!force && Date.now() - lastCheck < SERVER_STATUS_INTERVAL)
      )
        return;
      pending = true;
      lastCheck = Date.now();
      setLoading(true);
      try {
        const value = await fetchServerStatus(controller.signal);
        if (!controller.signal.aborted) {
          setSnapshot(value);
          setError('');
        }
      } catch {
        if (!controller.signal.aborted) setError('Не удалось обновить статус серверов.');
      } finally {
        pending = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    refresh.current = () => void check(true);
    const resume = () => void check();
    const online = () => void check(true);
    void check();
    const timer = setInterval(resume, SERVER_STATUS_INTERVAL);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', online);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', online);
      refresh.current = () => {};
    };
  }, []);

  return (
    <SettingsCard
      title="Состояние серверов Yummy"
      description="Последние проверки YummyStatus из разных стран."
      icon={<Icon name="wifi" size={25} />}
      class="server-status-card"
    >
      <p class="server-status-current">
        Выбранный API: <strong>{selected}</strong>
      </p>
      {activeApiUrl.value !== API_URL && (
        <p>
          Основной API проверяется раз в минуту. После восстановления вернёмся к нему автоматически.
        </p>
      )}
      <ul class="server-status-list" aria-label="Состояние серверов">
        {servers.map(server => {
          const stale =
            server.checkedAt !== undefined &&
            Date.now() - server.checkedAt > SERVER_STATUS_STALE_MS;
          const state = stale ? 'unknown' : server.state;
          return (
            <li key={server.domain}>
              <span class="server-status-domain">
                {server.domain}
                {server.domain === selected && <small>Выбран</small>}
              </span>
              <span class={`server-status-value is-${state}`}>
                <span aria-hidden="true" class="server-status-dot" />
                {stale ? 'Данные устарели' : labels[state]}
                {state === 'up' && server.latency !== undefined && (
                  <small>{server.latency} мс</small>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <p class="server-status-socket">
        Обновления в реальном времени:{' '}
        {socket === 'connected'
          ? 'подключены'
          : socket === 'offline'
            ? 'нет сети'
            : 'соединение не установлено'}
        .
      </p>
      <div class="server-status-actions">
        <Button
          variant="text"
          onClick={() => refresh.current()}
          disabled={loading}
          aria-busy={loading}
        >
          <Icon name="refresh" size={15} />
          {loading ? 'Проверяем…' : 'Обновить статус'}
        </Button>
        <ButtonLink href={SERVER_STATUS_URL} target="_blank" rel="noreferrer" variant="text">
          YummyStatus
          <Icon name="external" size={15} />
        </ButtonLink>
      </div>
      <p class="fine-print" role="status">
        {error ||
          (loading && !snapshot
            ? 'Загружаем данные мониторинга…'
            : snapshot
              ? `Данные мониторинга на ${time(snapshot.updatedAt)}.`
              : 'Статус пока неизвестен.')}
        {error && snapshot && ` Последние данные на ${time(snapshot.updatedAt)}.`}
      </p>
    </SettingsCard>
  );
}
