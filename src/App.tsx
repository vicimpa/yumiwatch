import { useEffect, useState } from 'preact/hooks';
import { Icon, type IconName } from './components/Icon';
import { Catalog, Detail, Home, LibraryPage, Schedule, Settings, type InstallPrompt } from './components/Pages';
import { Empty, Toast, notify } from './components/UI';
import { useHash, useLibrary } from './lib/hooks';

const NAV: { href: string; icon: IconName; title: string; mobile: string }[] = [
  { href: '/', icon: 'home', title: 'Главная', mobile: 'Главная' },
  { href: '/catalog', icon: 'grid', title: 'Каталог аниме', mobile: 'Каталог' },
  { href: '/schedule', icon: 'calendar', title: 'Расписание', mobile: 'Расписание' },
  { href: '/library', icon: 'bookmark', title: 'Моя коллекция', mobile: 'Моё' },
];
function Brand() {
  return <a class="brand" href="#/" aria-label="YumiWatch — главная"><img src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" width="37" height="37"/><span>yumi<span>watch</span><small>АНИМЕ ПОД РУКОЙ</small></span><span class="brand-dot"/></a>;
}
export function App() {
  const path = useHash();
  const [route, query = ''] = path.split('?');
  const library = useLibrary();
  const [online, setOnline] = useState(navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt>();
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches || !!(navigator as Navigator & { standalone?: boolean }).standalone);
  const [update, setUpdate] = useState<ServiceWorkerRegistration>();
  const [globalQuery, setGlobalQuery] = useState('');
  useEffect(() => {
    const offline = () => setOnline(false);
    const online = () => setOnline(true);
    const prompt = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPrompt); };
    const installed = () => { setInstalled(true); setInstallPrompt(undefined); };
    const keyboard = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key === 'k') { event.preventDefault(); if (location.hash.startsWith('#/catalog')) document.getElementById('catalog-search')?.focus(); else { location.hash = '/catalog'; setTimeout(() => document.getElementById('catalog-search')?.focus(), 100); } } };
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
    const titles: Record<string, string> = { '/': 'Аниме под рукой', '/catalog': 'Каталог', '/schedule': 'Расписание', '/library': 'Моя коллекция', '/settings': 'Настройки' };
    document.title = `${titles[route] || 'Аниме'} · YumiWatch`;
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [path]);
  const install = async () => {
    if (!installPrompt) { location.hash = '/settings'; return; }
    try { await installPrompt.prompt(); const choice = await installPrompt.userChoice; if (choice.outcome === 'accepted') notify('YumiWatch появится на главном экране'); setInstallPrompt(undefined); } catch { notify('Открой меню браузера и выбери установку приложения.'); }
  };
  const active = (href: string) => route === href || (href === '/catalog' && route.startsWith('/anime/'));
  const navLabel = NAV.find(n => active(n.href))?.title || 'Настройки';
  return <>
    <a class="skip-link" href="#main" onClick={event => { event.preventDefault(); document.getElementById('main')?.focus(); }}>К содержимому</a>
    <aside class="sidebar"><Brand/><div class="sidebar-label">ТВОЯ НАВИГАЦИЯ</div><nav aria-label="Основная навигация">{NAV.map(item => <a href={`#${item.href}`} class={active(item.href) ? 'nav-item active' : 'nav-item'} aria-current={active(item.href) ? 'page' : undefined}><Icon name={item.icon} size={21}/><span>{item.title}</span>{item.href === '/library' && library.favorites.length > 0 && <small>{library.favorites.length}</small>}{active(item.href) && <span class="nav-active-dot"/>}</a>)}</nav><div class="sidebar-divider"/><a class="nav-item" href="#/settings"><Icon name="settings" size={21}/>Настройки</a><div class="sidebar-bottom">{!installed && <div class="install-card"><span class="install-symbol"><Icon name="download" size={22}/></span><h3>Ещё ближе к аниме</h3><p>YumiWatch на главном экране.<br/>Один тап — и ты в другом мире.</p><button onClick={install}>Установить PWA<Icon name="arrow" size={16}/></button></div>}<a class="source-brand" href="https://ru.yummyani.me/" target="_blank" rel="noreferrer"><span>С любовью к аниме</span><strong>На основе YummyAnime<Icon name="external" size={12}/></strong></a></div></aside>
    <div class="workspace"><header class="topbar"><div class="desktop-breadcrumb">Твоё пространство<span>/</span><strong>{navLabel}</strong></div><div class="mobile-brand"><Brand/></div><div class="topbar-actions"><form class="global-search" role="search" onSubmit={event => { event.preventDefault(); location.hash = `/catalog${globalQuery.trim() ? `?q=${encodeURIComponent(globalQuery.trim())}` : ''}`; }}><Icon name="search" size={17}/><input placeholder="Найти свою историю…" aria-label="Поиск по каталогу" value={globalQuery} onInput={event => setGlobalQuery(event.currentTarget.value)}/><kbd>⌘ K</kbd></form><a class="icon-button mobile-search" href="#/catalog" aria-label="Найти аниме"><Icon name="search"/></a><a class={`icon-button settings-link ${route === '/settings' ? 'selected' : ''}`} href="#/settings" aria-label="Настройки"><Icon name="settings" size={21}/></a><div class="avatar" aria-hidden="true">Y<span/></div></div></header>
    {!online && <div class="offline-bar" role="status"><Icon name="wifi" size={17}/>Ты без сети. Коллекция и ранее загруженные страницы доступны.</div>}
    {update && <div class="update-bar" role="status"><Icon name="spark" size={17}/>Готова новая версия YumiWatch<button onClick={() => update.waiting?.postMessage({ type: 'SKIP_WAITING' })}>Обновить</button></div>}
    <main id="main" tabIndex={-1}>
      {route === '/' ? <Home/> : route === '/catalog' ? <Catalog query={query}/> : route === '/library' ? <LibraryPage query={query}/> : route === '/schedule' ? <Schedule/> : route === '/settings' ? <Settings installPrompt={installPrompt} install={install} installed={installed}/> : /^\/anime\/[^/]+$/.test(route) ? <Detail key={route} id={route.split('/')[2]}/> : <Empty title="Эта история затерялась" action={<a class="button primary" href="#/">На главную</a>}>Такой страницы нет. Вернёмся к аниме?</Empty>}
    </main><footer class="footer"><span>yumiwatch<span class="coral">.</span> <span class="footer-motto">Больше историй. Меньше лишнего.</span></span><span>Независимый клиент YummyAnime <span class="footer-heart">♡</span></span></footer></div>
    <nav class="bottom-nav" aria-label="Мобильная навигация">{NAV.map(item => <a href={`#${item.href}`} class={active(item.href) ? 'active' : ''} aria-current={active(item.href) ? 'page' : undefined}><span><Icon name={item.icon} size={22}/>{item.href === '/library' && library.favorites.length > 0 && <i/>}</span><span>{item.mobile}</span></a>)}</nav><Toast/>
  </>;
}
