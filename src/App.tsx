import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon, type IconName } from './components/Icon';
import { Catalog, Detail, Home, LibraryPage, Schedule, Settings, ConnectionSettings, type InstallPrompt } from './components/Pages';
import { Empty, Toast, notify } from './components/UI';
import { useHash, useLibrary, useSession, useVisualViewport } from './lib/hooks';
import { initializeAccount } from './lib/account';
import { resetAccountLibrary, syncLibrary } from './lib/library';
import { imageUrl } from './lib/api';
import { AccountPage } from './components/Account';
import { Search } from './components/Search';

const NAV: { href: string; icon: IconName; title: string; mobile: string }[] = [
  { href: '/', icon: 'home', title: 'Главная', mobile: 'Главная' },
  { href: '/catalog', icon: 'grid', title: 'Каталог аниме', mobile: 'Каталог' },
  { href: '/search', icon: 'search', title: 'Поиск', mobile: 'Поиск' },
  { href: '/schedule', icon: 'calendar', title: 'Расписание', mobile: 'Расписание' },
  { href: '/library', icon: 'bookmark', title: 'Моя коллекция', mobile: 'Моё' },
];
function Brand() {
  return <a class="brand" href="#/" aria-label="YumiWatch — главная"><img src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" width="37" height="37"/><span>yumi<span>watch</span><small>АНИМЕ ПОД РУКОЙ</small></span><span class="brand-dot"/></a>;
}
export function App() {
  const path = useHash();
  const [route, query = ''] = path.split('?');
  useVisualViewport();
  const retainedCatalog = useRef<string>();
  const retainedSearch = useRef<string>();
  if (route === '/catalog') retainedCatalog.current = query;
  if (route === '/search') retainedSearch.current = query;
  const detailRoute = /^\/anime\/[^/]+$/.test(route);
  const detailView = new URLSearchParams(query).get('view') || 'watch';
  const contextLabel = ({ watch: 'Просмотр', 'anime-about': 'Об аниме', 'viewing-order': 'Порядок просмотра', comments: 'Комментарии' } as Record<string, string>)[detailView] || 'Аниме';
  const library = useLibrary();
  const session = useSession();
  const [online, setOnline] = useState(navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt>();
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches || !!(navigator as Navigator & { standalone?: boolean }).standalone);
  const [update, setUpdate] = useState<ServiceWorkerRegistration>();
  const [globalQuery, setGlobalQuery] = useState('');
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
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
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
  useEffect(() => {
    const titles: Record<string, string> = { '/': 'Аниме под рукой', '/catalog': 'Каталог', '/schedule': 'Расписание', '/library': 'Моя коллекция', '/settings': 'Настройки', '/settings/connection': 'Подключение', '/account': 'Аккаунт', '/search': 'Поиск' };
    document.documentElement.dataset.screen = detailRoute ? detailView : route.slice(1) || 'home';
    document.title = `${titles[route] || 'Аниме'} · YumiWatch`;
  }, [path]);
  useEffect(() => { if (route !== '/search') document.getElementById('main')?.focus({ preventScroll: true }); }, [route]);
  const install = async () => {
    if (!installPrompt) { location.hash = '/settings'; return; }
    try { await installPrompt.prompt(); const choice = await installPrompt.userChoice; if (choice.outcome === 'accepted') notify('YumiWatch появится на главном экране'); setInstallPrompt(undefined); } catch { notify('Открой меню браузера и выбери установку приложения.'); }
  };
  const active = (href: string) => route === href || (href === '/catalog' && route.startsWith('/anime/'));
  const navLabel = NAV.find(n => active(n.href))?.title || (route === '/account' ? 'Аккаунт' : 'Настройки');
  return <>
    <a class="skip-link" href="#main" onClick={event => { event.preventDefault(); document.getElementById('main')?.focus(); }}>К содержимому</a>

    <div class={`workspace ${detailRoute ? 'detail-workspace' : ''}`}><header class="topbar">{detailRoute && <div class="context-appbar"><button class="icon-button" aria-label="Назад" onClick={() => { if (history.length > 1) history.back(); else location.hash = '/catalog'; }}><Icon name="back"/></button><strong>{contextLabel}</strong><button class="icon-button" aria-label="Поделиться аниме" onClick={async () => { try { if (navigator.share) await navigator.share({ title: 'YumiWatch', url: location.href }); else { await navigator.clipboard.writeText(location.href); notify('Ссылка скопирована'); } } catch (error) { if ((error as Error).name !== 'AbortError') notify('Не удалось поделиться ссылкой'); } }}><Icon name="external" size={19}/></button></div>}<div class="desktop-breadcrumb">Твоё пространство<span>/</span><strong>{navLabel}</strong></div><div class="mobile-brand"><Brand/></div><nav class="desktop-nav" aria-label="Навигация сайта">{NAV.map(item => <a href={`#${item.href}`} class={active(item.href) ? 'active' : ''} key={item.href}>{item.title}</a>)}</nav><div class="topbar-actions"><form class="global-search" role="search" onSubmit={event => { event.preventDefault(); location.hash = `/catalog${globalQuery.trim() ? `?q=${encodeURIComponent(globalQuery.trim())}` : ''}`; }}><Icon name="search" size={17}/><input placeholder="Найти свою историю…" aria-label="Поиск по каталогу" value={globalQuery} onInput={event => setGlobalQuery(event.currentTarget.value)}/><kbd>⌘ K</kbd></form><a class="icon-button mobile-search" href="#/search" aria-label="Найти аниме"><Icon name="search"/></a><a class={`icon-button settings-link ${route === '/settings' ? 'selected' : ''}`} href="#/settings" aria-label="Настройки"><Icon name="settings" size={21}/></a><a class="account-entry" href="#/account" aria-label={session?.verified ? `Аккаунт ${session.user.nickname}` : 'Войти в аккаунт'}>{session?.verified && imageUrl(session.user.avatar) ? <img src={imageUrl(session.user.avatar)} alt=""/> : <span>{session?.verified ? session.user.nickname.slice(0, 1).toUpperCase() : <Icon name="heart" size={18}/>}</span>}</a></div></header>
    {!online && <div class="offline-bar" role="status"><Icon name="wifi" size={17}/>{session ? 'Ты без сети. Для коллекции аккаунта нужен интернет.' : 'Ты без сети. Гостевая коллекция и загруженные страницы доступны.'}</div>}
    {update && <div class="update-bar" role="status"><Icon name="spark" size={17}/>Готова новая версия YumiWatch<button onClick={() => update.waiting?.postMessage({ type: 'SKIP_WAITING' })}>Обновить</button></div>}
    <main id="main" tabIndex={-1}>
      {retainedCatalog.current !== undefined && <div class="route-panel" hidden={route !== '/catalog'}><Catalog query={retainedCatalog.current} active={route === '/catalog'}/></div>}
      {retainedSearch.current !== undefined && <div class="route-panel" hidden={route !== '/search'}><Search query={retainedSearch.current} active={route === '/search'}/></div>}
      {route === '/catalog' || route === '/search' ? null : route === '/' ? <Home/> : route === '/library' ? <LibraryPage query={query}/> : route === '/schedule' ? <Schedule/> : route === '/account' ? <AccountPage query={query}/> : route === '/settings/connection' ? <ConnectionSettings/> : route === '/settings' ? <Settings installPrompt={installPrompt} install={install} installed={installed}/> : /^\/anime\/[^/]+$/.test(route) ? <Detail key={route} id={route.split('/')[2]} query={query}/> : <Empty title="Эта история затерялась" action={<a class="button primary" href="#/">На главную</a>}>Такой страницы нет. Вернёмся к аниме?</Empty>}
    </main><footer class="footer"><span>yumiwatch<span class="coral">.</span> <span class="footer-motto">Больше историй. Меньше лишнего.</span></span><span>Независимый клиент YummyAnime <span class="footer-heart">♡</span></span></footer></div>
    <nav class={`bottom-nav ${detailRoute ? 'detail-nav-hidden' : ''}`} aria-label="Мобильная навигация">{NAV.map(item => <a href={`#${item.href}`} class={active(item.href) ? 'active' : ''} aria-current={active(item.href) ? 'page' : undefined}><span><Icon name={item.icon} size={22}/>{item.href === '/library' && library.favorites.length > 0 && <i/>}</span><span>{item.mobile}</span></a>)}</nav><Toast/>
  </>;
}
