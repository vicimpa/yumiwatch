import type { FunctionalComponent as FC } from 'preact';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'preact/hooks';

import { useAccountSync } from '~/hooks/useAccountSync';
import { useAppEnvironment } from '~/hooks/useAppEnvironment';
import { useAppDiscordPresence } from '~/hooks/useAppDiscordPresence';
import { useAppUpdate } from '~/hooks/useAppUpdate';
import { useInstallation } from '~/hooks/useInstallation';
import { useHash, useSession, useVisualViewport } from '~/lib/hooks';

import { InterfaceEffects } from '~/components/InterfaceEffects';
import { MediaNavigation } from '~/components/MediaNavigation';
import { Catalog, Home } from '~/components/Pages';
import { RoutePage } from '~/components/RoutePage';
import { Search } from '~/components/Search';
import { WindowChrome } from '~/components/WindowChrome';
import { WindowCursor } from '~/components/WindowCursor';
import { CardTitleTooltip, Icon, Toast } from '~/ui';

const titles: Partial<Record<string, string>> = {
  '/': 'Каталог',
  '/catalog': 'Каталог',
  '/schedule': 'Расписание',
  '/library': 'Моя коллекция',
  '/settings': 'Настройки',
  '/settings/connection': 'Подключение',
  '/account': 'Аккаунт',
  '/search': 'Поиск',
};

export const App: FC = () => {
  const path = useHash();
  const [route, query = ''] = path.split('?');

  useAppDiscordPresence(path);

  useVisualViewport();

  const retainedHome = useRef(false);
  const retainedCatalog = useRef<string>();
  const retainedSearch = useRef<string>();
  const browseReturn = useRef('/');

  if (route === '/') retainedHome.current = true;
  if (route === '/catalog') retainedCatalog.current = query;
  if (route === '/search') retainedSearch.current = query;
  if (['/', '/catalog', '/search', '/library'].includes(route)) browseReturn.current = path;

  const detailRoute = /^\/anime\/[^/]+$/.test(route);
  const params = new URLSearchParams(query);
  const detailView =
    params.get('view') === 'watch' || params.has('watch') ? 'watch' : 'anime-about';
  const watching = detailRoute && detailView === 'watch';
  const session = useSession();
  const online = useAppEnvironment();
  const installation = useInstallation();
  const update = useAppUpdate();

  useAccountSync(session);

  useLayoutEffect(() => {
    document.documentElement.dataset.screen = detailRoute ? detailView : route.slice(1) || 'home';
    document.title = `${titles[route] ?? 'Аниме'} · YummyWatch`;
  }, [path]);

  useEffect(() => {
    if (route !== '/search') document.getElementById('main')?.focus({ preventScroll: true });
  }, [route]);

  const goBack = useCallback(() => {
    if (detailRoute) location.hash = detailView === 'watch' ? route : browseReturn.current;
    else if (route !== '/') location.hash = '/';
  }, [detailRoute, detailView, route]);

  const applyUpdate = useCallback(
    () => update?.waiting?.postMessage({ type: 'SKIP_WAITING' }),
    [update]
  );

  return (
    <div class={`media-app ${watching ? 'is-playback' : ''}`}>
      <WindowChrome />
      <WindowCursor />
      <InterfaceEffects onBack={goBack} watching={watching} />

      <MediaNavigation
        path={path}
        watching={watching}
        selected={detailRoute ? browseReturn.current.split('?')[0] : route}
      />
      <div class={`workspace media-workspace ${detailRoute ? 'detail-workspace' : ''}`}>
        {!watching && !online && (
          <div class="offline-bar" role="status">
            <Icon name="wifi" size={17} />
            {session
              ? 'Ты без сети. Для коллекции аккаунта нужен интернет.'
              : 'Ты без сети. Гостевая коллекция и загруженные страницы доступны.'}
          </div>
        )}
        {!watching && update && (
          <div class="update-bar" role="status">
            <Icon name="spark" size={17} />
            Готова новая версия YummyWatch
            <button onClick={applyUpdate}>Обновить</button>
          </div>
        )}
        <main id="main" class="media-scroll" tabIndex={-1}>
          <div class="media-scroll-content">
            {retainedHome.current && (
              <div class="route-panel" hidden={route !== '/'}>
                <Home active={route === '/'} />
              </div>
            )}
            {retainedCatalog.current !== undefined && (
              <div class="route-panel" hidden={route !== '/catalog'}>
                <Catalog query={retainedCatalog.current} active={route === '/catalog'} />
              </div>
            )}
            {retainedSearch.current !== undefined && (
              <div class="route-panel" hidden={route !== '/search'}>
                <Search query={retainedSearch.current} active={route === '/search'} />
              </div>
            )}
            <RoutePage
              route={route}
              query={query}
              returnTo={browseReturn.current}
              installation={installation}
            />
          </div>
        </main>
      </div>
      <Toast />
      <CardTitleTooltip />
    </div>
  );
};
