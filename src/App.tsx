import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './components/Icon';
import { Catalog, Detail, Home, LibraryPage, Schedule, Settings, ConnectionSettings, type InstallPrompt } from './components/Pages';
import { Empty, Toast, notify } from './components/UI';
import { useHash, useSession, useVisualViewport } from './lib/hooks';
import { initializeAccount } from './lib/account';
import { resetAccountLibrary, syncLibrary } from './lib/library';
import { AccountPage } from './components/Account';
import { Search } from './components/Search';
import { InterfaceEffects } from './components/InterfaceEffects';
import { MediaNavigation } from './components/MediaNavigation';
import { WindowChrome } from './components/WindowChrome';
import { WindowCursor } from './components/WindowCursor';
import { CardTitleTooltip } from './components/CardTitleTooltip';
import { isDesktop } from './lib/desktop';
import { SESSION_STORAGE_ERROR } from './lib/session';

export function App() {
  const path = useHash();
  const [route, query = ''] = path.split('?');
  useVisualViewport();
  const retainedHome = useRef(false);
  if (route === '/') retainedHome.current = true;
  const retainedCatalog = useRef<string>();
  const retainedSearch = useRef<string>();
  if (route === '/catalog') retainedCatalog.current = query;
  if (route === '/search') retainedSearch.current = query;
  const browseReturn = useRef('/');
  if (['/', '/catalog', '/search', '/library'].includes(route)) browseReturn.current = path;
  const detailRoute = /^\/anime\/[^/]+$/.test(route);
  const detailView = new URLSearchParams(query).get('view') === 'watch' || new URLSearchParams(query).has('watch') ? 'watch' : 'anime-about';
  const watching = detailRoute && detailView === 'watch';
  const session = useSession();
  const [online, setOnline] = useState(navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt>();
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches || !!(navigator as Navigator & { standalone?: boolean; }).standalone);
  const [update, setUpdate] = useState<ServiceWorkerRegistration>();
  useEffect(() => { const error = (event: Event) => notify((event as CustomEvent<string>).detail); window.addEventListener(SESSION_STORAGE_ERROR, error); return () => window.removeEventListener(SESSION_STORAGE_ERROR, error); }, []);
  useEffect(() => {
    if (!session) { resetAccountLibrary(); return; }
    if (!session.verified) {
      const restore = () => { void initializeAccount().catch(error => notify(error.message)); };
      restore(); window.addEventListener('online', restore);
      return () => window.removeEventListener('online', restore);
    }
    void syncLibrary();
    const refresh = () => { if (document.visibilityState === 'visible') void initializeAccount().then(() => syncLibrary()).catch(error => notify(error.message)); };
    const timer = setInterval(refresh, 60 * 60 * 1000);
    window.addEventListener('online', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); window.removeEventListener('online', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [session?.token, session?.verified]);
  useEffect(() => {
    const offline = () => setOnline(false);
    const online = () => setOnline(true);
    const prompt = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPrompt); };
    const installed = () => { setInstalled(true); setInstallPrompt(undefined); };
    const keyboard = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key === 'k') { event.preventDefault(); if (location.hash.startsWith('#/search')) document.getElementById('anime-search')?.focus(); else { location.hash = '/search'; setTimeout(() => document.getElementById('anime-search')?.focus(), 100); } } };
    window.addEventListener('online', online); window.addEventListener('offline', offline);
    window.addEventListener('beforeinstallprompt', prompt); window.addEventListener('appinstalled', installed);
    window.addEventListener('keydown', keyboard);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); window.removeEventListener('beforeinstallprompt', prompt); window.removeEventListener('appinstalled', installed); window.removeEventListener('keydown', keyboard); };
  }, []);
  useEffect(() => {
    if (isDesktop() || !import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let cancelled = false;
    let reloading = false;
    const controllerChange = () => { if (!reloading) { reloading = true; location.reload(); } };
    // Only listen after a controller exists: first installation needs no reload.
    if (navigator.serviceWorker.controller) navigator.serviceWorker.addEventListener('controllerchange', controllerChange);
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then(registration => {
      if (cancelled) return;
      if (registration.waiting) setUpdate(registration);
      registration.addEventListener('updatefound', () => { const worker = registration.installing; worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) setUpdate(registration); }); });
    }).catch(() => notify('Не удалось включить офлайн-режим. Остальные функции доступны.'));
    return () => { cancelled = true; navigator.serviceWorker.removeEventListener('controllerchange', controllerChange); };
  }, []);
  useLayoutEffect(() => {
    const titles: Record<string, string> = { '/': 'Каталог', '/catalog': 'Каталог', '/schedule': 'Расписание', '/library': 'Моя коллекция', '/settings': 'Настройки', '/settings/connection': 'Подключение', '/account': 'Аккаунт', '/search': 'Поиск' };
    document.documentElement.dataset.screen = detailRoute ? detailView : route.slice(1) || 'home';
    document.title = `${titles[route] || 'Аниме'} · YummyWatch`;
  }, [path]);
  useEffect(() => { if (route !== '/search') document.getElementById('main')?.focus({ preventScroll: true }); }, [route]);
  const install = async () => {
    if (!installPrompt) { location.hash = '/settings'; return; }
    try { await installPrompt.prompt(); const choice = await installPrompt.userChoice; if (choice.outcome === 'accepted') notify('YummyWatch появится на главном экране'); setInstallPrompt(undefined); } catch { notify('Открой меню браузера и выбери установку приложения.'); }
  };
  const goBack = () => { if (detailRoute) location.hash = detailView === 'watch' ? route : browseReturn.current; else if (route !== '/') location.hash = '/'; };
  return <div class={`media-app ${watching ? 'is-playback' : ''}`}>
    <WindowChrome />
    <WindowCursor />
    <InterfaceEffects onBack={goBack} watching={detailRoute && detailView === 'watch'} />

    <MediaNavigation path={path} watching={watching} selected={detailRoute ? browseReturn.current.split('?')[0] : route} />
    <div class={`workspace media-workspace ${detailRoute ? 'detail-workspace' : ''}`}>
      {!watching && !online && <div class="offline-bar" role="status"><Icon name="wifi" size={17} />{session ? 'Ты без сети. Для коллекции аккаунта нужен интернет.' : 'Ты без сети. Гостевая коллекция и загруженные страницы доступны.'}</div>}
      {!watching && update && <div class="update-bar" role="status"><Icon name="spark" size={17} />Готова новая версия YummyWatch<button onClick={() => update.waiting?.postMessage({ type: 'SKIP_WAITING' })}>Обновить</button></div>}
      <main id="main" class="media-scroll" tabIndex={-1}><div class="media-scroll-content">
        {retainedHome.current && <div class="route-panel" hidden={route !== '/'}><Home active={route === '/'} /></div>}
        {retainedCatalog.current !== undefined && <div class="route-panel" hidden={route !== '/catalog'}><Catalog query={retainedCatalog.current} active={route === '/catalog'} /></div>}
        {retainedSearch.current !== undefined && <div class="route-panel" hidden={route !== '/search'}><Search query={retainedSearch.current} active={route === '/search'} /></div>}
        {route === '/catalog' || route === '/search' || route === '/' ? null : route === '/library' ? <LibraryPage query={query} /> : route === '/schedule' ? <Schedule /> : route === '/account' ? <AccountPage query={query} /> : route === '/settings/connection' ? <ConnectionSettings /> : route === '/settings' ? <Settings installPrompt={installPrompt} install={install} installed={installed} /> : /^\/anime\/[^/]+$/.test(route) ? <Detail key={route} id={route.split('/')[2]} query={query} returnTo={browseReturn.current} /> : <Empty title="Эта история затерялась" action={<a class="button primary" href="#/">На главную</a>}>Такой страницы нет. Вернёмся к аниме?</Empty>}
      </div></main></div>
    <Toast />
    <CardTitleTooltip />
  </div>;
}
