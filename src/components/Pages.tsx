import { useEffect, useState } from 'preact/hooks';
import { animeDetail, animeList, animeSchedule, getToken, plainText, imageUrl } from '../lib/api';
import { useLibrary, useResource } from '../lib/hooks';
import { TOKEN_KEY } from '../lib/storage';
import { clearHistory, loadMoreHistory, syncLibrary } from '../lib/library';
import { AccountCard } from './Account';
import type { Anime, Params } from '../lib/types';
import { Icon } from './Icon';
import { AnimeCard, CachedNotice, Empty, ErrorState, FavoriteButton, notify, Poster, SectionHeading, Skeleton } from './UI';
import { Player } from './Player';

const PAGE_SIZE = 24;
const GENRES = [['', 'Все жанры'], ['ekshen', 'Экшен'], ['priklyucheniya', 'Приключения'], ['fentezi', 'Фэнтези'], ['romantika', 'Романтика'], ['komediya', 'Комедия'], ['drama', 'Драма'], ['detektiv', 'Детектив'], ['fantastika', 'Фантастика'], ['povsednevnost', 'Повседневность'], ['sport', 'Спорт'], ['triller', 'Триллер']];
export function Home() {
  const feature = useResource(signal => animeDetail(10531, signal), []);
  const popular = useResource(signal => animeList({ sort: 'views', sort_forward: false, limit: 12 }, signal), []);
  const ongoing = useResource(signal => animeList({ sort: 'views', sort_forward: false, status: 'ongoing', limit: 12 }, signal), []);
  const library = useLibrary();
  return <>
    <div class="home-intro"><div><p class="eyebrow">МАЛЕНЬКИЙ ПЕРЕРЫВ. БОЛЬШОЕ ПРИКЛЮЧЕНИЕ.</p><h1>Что посмотрим сегодня<span>?</span></h1><p class="intro-caption">Любимые миры всегда рядом.</p></div><span class="home-decoration" aria-hidden="true">✳</span></div>
    <div class="home-tabs"><a href="#/" class="active"><Icon name="spark" size={16}/>Для тебя</a><a href="#/catalog?status=ongoing">Онгоинги</a><a href="#/catalog?sort=top">Лучшее за всё время</a><a href="#/catalog?status=announcement">Скоро выйдет</a></div>
    {feature.value?.cached && <CachedNotice savedAt={feature.value.savedAt}/>}
    {feature.loading ? <div class="hero skeleton" aria-label="Загрузка рекомендации"/> : feature.value ? <section class="hero">
      <img class="hero-image" src={`${import.meta.env.BASE_URL}hero.avif`} alt="Кадр из аниме «Монолог фармацевта»" fetchPriority="high"/>
      <div class="hero-shade"/><div class="hero-content"><span class="hero-tag"><Icon name="spark" size={14}/>ВЫБОР ДЛЯ ВЕЧЕРА</span><h2>{feature.value.data.title}</h2><div class="hero-meta"><span class="hero-score">★ {feature.value.data.rating?.average.toFixed(1)}</span><span>{feature.value.data.year}</span><span>{feature.value.data.type?.shortname}</span><span>{feature.value.data.episodes?.count || 24} серии</span><span>{feature.value.data.min_age?.title}</span></div><p class="hero-description">Тайны императорского дворца, немного яда и очень много любопытства. Познакомься с Маомао.</p><div class="hero-buttons"><a class="button primary" href={`#/anime/${feature.value.data.anime_id}`}><Icon name="play" size={18}/>Смотреть<Icon name="arrow" size={17}/></a><FavoriteButton anime={feature.value.data}/></div></div><span class="hero-corner">ТВОЙ СЛЕДУЮЩИЙ ЛЮБИМЫЙ ТАЙТЛ</span>
    </section> : <ErrorState error={feature.error} retry={feature.retry}/>}
    {!!library.history.length && <section class="section"><SectionHeading title="Продолжим историю?" subtitle="Последние открытые серии" href="#/library?tab=history" action="Вся история"/><div class="continue-row">{library.history.slice(0, 3).map(entry => <a class="continue-card" href={`#/anime/${entry.anime.anime_id}`} key={entry.anime.anime_id}><Poster anime={entry.anime}/><div><span class="eyebrow">СЕРИЯ {entry.episode}</span><h3>{entry.anime.title}</h3><span class="muted">Вернуться к просмотру</span></div><span class="continue-play"><Icon name="play" size={18}/></span></a>)}</div></section>}
    <section class="section"><SectionHeading title="Сейчас на слуху" subtitle="Истории, к которым возвращаются" href="#/catalog?sort=views"/>{popular.loading ? <Skeleton/> : popular.error ? <ErrorState error={popular.error} retry={popular.retry}/> : <>{popular.value?.cached && <CachedNotice savedAt={popular.value.savedAt}/>}<div class="poster-rail">{popular.value?.data.map((anime, i) => <AnimeCard key={anime.anime_id} anime={anime} rank={i + 1}/>)}</div></>}</section>
    <div class="discovery-banner"><span class="discovery-star" aria-hidden="true">✧</span><div><p class="eyebrow">ПОД НАСТРОЕНИЕ</p><h2>В какой мир отправимся?</h2><p>От тихой повседневности до спасения вселенной.</p></div><div class="genre-links"><a href="#/catalog?genres=fentezi">Фэнтези ↗</a><a href="#/catalog?genres=romantika">Романтика ↗</a><a href="#/catalog?genres=ekshen">Экшен ↗</a><a href="#/catalog?genres=povsednevnost">Повседневность ↗</a></div></div>
    <section class="section"><SectionHeading title="Новая серия — новый повод" subtitle="Онгоинги, за которыми стоит следить" href="#/catalog?status=ongoing"/>{ongoing.loading ? <Skeleton/> : ongoing.error ? <ErrorState error={ongoing.error} retry={ongoing.retry}/> : <>{ongoing.value?.cached && <CachedNotice savedAt={ongoing.value.savedAt}/>}<div class="poster-rail">{ongoing.value?.data.map(anime => <AnimeCard key={anime.anime_id} anime={anime}/>)}</div></>}</section>
  </>;
}

function paramsFromQuery(query: string) {
  const params = new URLSearchParams(query);
  return { q: params.get('q') || '', sort: params.get('sort') || 'views', status: params.get('status') || '', genres: params.get('genres') || '', types: params.get('types') || '', year: params.get('year') || '' };
}
export function Catalog({ query }: { query: string }) {
  const filters = paramsFromQuery(query);
  const [search, setSearch] = useState(filters.q);
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<Anime[]>([]);
  const [moreError, setMoreError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const requestParams: Params = { q: filters.q, sort: filters.sort, sort_forward: filters.sort === 'top' || filters.sort === 'title', status: filters.status, genres: filters.genres, types: filters.types, from_year: filters.year || undefined, to_year: filters.year || undefined };
  const resource = useResource(signal => animeList(requestParams, signal), [query]);
  useEffect(() => { setSearch(filters.q); setItems([]); setPage(0); setHasMore(false); setMoreError(''); setLoadingMore(false); }, [query]);
  useEffect(() => { if (resource.value) { setItems(resource.value.data); setHasMore(resource.value.data.length === PAGE_SIZE); } }, [resource.value]);
  const change = (key: keyof typeof filters, value: string) => {
    const params = new URLSearchParams(query);
    value ? params.set(key, value) : params.delete(key);
    location.hash = `/catalog${params.size ? `?${params}` : ''}`;
  };
  useEffect(() => {
    if (search === filters.q) return;
    const timer = setTimeout(() => change('q', search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search, query]);
  useEffect(() => {
    if (!loadingMore) return;
    const controller = new AbortController();
    animeList({ ...requestParams, offset: (page + 1) * PAGE_SIZE }, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setItems(previous => [...previous, ...result.data.filter(a => !previous.some(b => b.anime_id === a.anime_id))]);
      setPage(previous => previous + 1); setHasMore(result.data.length === PAGE_SIZE);
    }).catch(error => { if (!controller.signal.aborted) setMoreError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoadingMore(false); });
    return () => controller.abort();
  }, [loadingMore, query]);
  const activeCount = [filters.status, filters.genres, filters.types, filters.year].filter(Boolean).length;
  return <>
    <div class="page-heading"><p class="eyebrow">НАЙДИ СВОЮ ИСТОРИЮ</p><h1>Каталог аниме</h1><p>Знакомые герои и миры, которые ещё предстоит открыть.</p></div>
    <form class="catalog-search" onSubmit={event => { event.preventDefault(); change('q', search.trim()); }} role="search"><Icon name="search" size={22}/><input id="catalog-search" type="search" value={search} onInput={event => setSearch(event.currentTarget.value)} placeholder="Название на русском, английском или японском" aria-label="Найти аниме" autoComplete="off" enterKeyHint="search"/>{search && <button type="button" class="icon-button" onClick={() => { setSearch(''); change('q', ''); }} aria-label="Очистить поиск"><Icon name="close" size={18}/></button>}</form>
    <div class="catalog-toolbar"><div class="filter-chips"><button class={!filters.status ? 'chip active' : 'chip'} onClick={() => change('status', '')}>Все аниме</button><button class={filters.status === 'ongoing' ? 'chip active' : 'chip'} onClick={() => change('status', 'ongoing')}><span class="status-dot"/>Онгоинги</button><button class={filters.status === 'released' ? 'chip active' : 'chip'} onClick={() => change('status', 'released')}>Вышедшие</button><button class={filters.status === 'announcement' ? 'chip active' : 'chip'} onClick={() => change('status', 'announcement')}>Анонсы</button></div><button class={`button filter-button ${activeCount ? 'has-filters' : ''}`} aria-expanded={expanded} aria-controls="catalog-filters" onClick={() => setExpanded(!expanded)}><Icon name="filter" size={17}/>Фильтры{activeCount > 0 && <span>{activeCount}</span>}</button></div>
    <div id="catalog-filters" class={`filters-panel ${expanded ? 'expanded' : ''}`}><label>Жанр<select value={filters.genres} onChange={event => change('genres', event.currentTarget.value)}>{GENRES.map(([value, title]) => <option value={value}>{title}</option>)}</select></label><label>Формат<select value={filters.types} onChange={event => change('types', event.currentTarget.value)}><option value="">Любой формат</option><option value="tv">ТВ-сериал</option><option value="movie">Фильм</option><option value="ona">ONA</option><option value="ova">OVA</option><option value="special">Спешл</option></select></label><label>Год<input type="number" min="1900" max="2100" placeholder="Любой год" value={filters.year} onChange={event => change('year', event.currentTarget.value)}/></label><button class="text-link" onClick={() => { location.hash = '/catalog'; setSearch(''); }}>Сбросить всё<Icon name="close" size={15}/></button></div>
    <div class="results-heading"><span>{filters.q ? `Поиск: «${filters.q}»` : 'Твоё следующее аниме'}{!resource.loading && ` · ${items.length}${hasMore ? '+' : ''}`}</span><label class="sort-label"><span>Сначала</span><select aria-label="Сортировка" value={filters.sort} onChange={event => change('sort', event.currentTarget.value)}><option value="views">популярные</option><option value="top">лучшие по рейтингу</option><option value="year">новые</option><option value="title">по алфавиту</option></select></label></div>
    {resource.loading ? <Skeleton count={12}/> : resource.error ? <ErrorState error={resource.error} retry={resource.retry}/> : <>{resource.value?.cached && <CachedNotice savedAt={resource.value.savedAt}/>}<div class="anime-grid">{items.map(anime => <AnimeCard key={anime.anime_id} anime={anime}/>)}</div>{!items.length && <Empty title="Пока ничего не нашлось" action={<button class="button secondary" onClick={() => { location.hash = '/catalog'; }}>Сбросить поиск</button>}>Попробуй другое название или убери несколько фильтров.</Empty>}{hasMore && <div class="load-more"><button class="button secondary" disabled={loadingMore} onClick={() => { setMoreError(''); setLoadingMore(true); }}>{loadingMore ? 'Загружаем…' : 'Ещё немного аниме'}<Icon name="arrow" size={18}/></button>{moreError && <p role="alert">{moreError}</p>}</div>}</>}
  </>;
}

export function Detail({ id }: { id: string }) {
  const resource = useResource(signal => animeDetail(id, signal), [id]);
  const library = useLibrary();
  const [fullDescription, setFullDescription] = useState(false);
  const anime = resource.value?.data;
  const history = library.history.find(entry => entry.anime.anime_id === anime?.anime_id);
  return <>
    <a class="back-link" href="#/catalog"><Icon name="back" size={18}/>В каталог</a>
    {resource.loading ? <div class="detail-loading"><div class="skeleton detail-poster"/><div><div class="skeleton line"/><div class="skeleton line short"/></div></div> : resource.error ? <ErrorState error={resource.error} retry={resource.retry}/> : anime && <>
      {resource.value?.cached && <CachedNotice savedAt={resource.value.savedAt}/>}
      <section class="detail-intro"><div class="detail-poster"><Poster anime={anime} large/></div><div class="detail-info"><p class="eyebrow">{anime.anime_status?.title || 'АНИМЕ'}{anime.min_age?.title && ` · ${anime.min_age.title}`}</p><h1>{anime.title}</h1><div class="detail-meta">{anime.rating?.average ? <span class="hero-score">★ {anime.rating.average.toFixed(1)}</span> : null}<span>{anime.year}</span><span>{anime.type?.name}</span>{anime.episodes?.count ? <span>{anime.episodes.count} серий</span> : null}</div><div class="detail-genres">{anime.genres?.slice(0, 6).map(genre => <a href={`#/catalog?genres=${encodeURIComponent(genre.alias)}`}>{genre.title}</a>)}</div><p class={`synopsis ${fullDescription ? 'expanded' : ''}`}>{plainText(anime.description) || 'Описание ещё не добавлено.'}</p>{(anime.description?.length || 0) > 260 && <button class="text-link synopsis-toggle" aria-expanded={fullDescription} onClick={() => setFullDescription(!fullDescription)}>{fullDescription ? 'Свернуть' : 'Читать полностью'}</button>}<div class="detail-buttons"><button class="button primary" onClick={() => document.getElementById('watch')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}><Icon name="play" size={17}/>{history ? `Продолжить · серия ${history.episode}` : 'К просмотру'}</button><FavoriteButton anime={anime}/></div></div></section>
      <Player key={anime.anime_id} anime={anime} history={history}/>
      <div class="source-note"><div><span class="eyebrow">ОБ ИСТОЧНИКЕ</span><p>Информация и доступные плееры — из Yani API.</p></div><a class="text-link" href={`https://ru.yummyani.me/catalog/item/${encodeURIComponent(anime.anime_url)}`} target="_blank" rel="noreferrer">На YummyAnime<Icon name="external" size={16}/></a></div>
    </>}
  </>;
}

export function LibraryPage({ query }: { query: string }) {
  const library = useLibrary();
  const historyTab = new URLSearchParams(query).get('tab') === 'history';
  const [confirmClear, setConfirmClear] = useState(false);
  return <><div class="page-heading"><p class="eyebrow">ВСЁ ТВОЁ — РЯДОМ</p><h1>Моя коллекция</h1><p>Сохраняй интересное. Возвращайся к любимому.</p></div><div class="library-tabs"><a class={!historyTab ? 'active' : ''} href="#/library"><Icon name="bookmark" size={18}/>Избранное<span>{library.favorites.length}</span></a><a class={historyTab ? 'active' : ''} href="#/library?tab=history"><Icon name="clock" size={18}/>История<span>{library.history.length}</span></a></div><div class="library-account-bar"><p class="collection-note">{library.account ? 'Твоя коллекция YummyAnime. Изменения сохраняются в аккаунте.' : 'Гостевая коллекция на этом устройстве.'}</p>{library.account ? <button class="text-link" disabled={library.loading} onClick={() => void syncLibrary()}><Icon name="refresh" size={15}/>{library.loading ? 'Обновляем…' : 'Обновить'}</button> : <a class="text-link" href="#/account">Войти и синхронизировать<Icon name="arrow" size={15}/></a>}</div>{library.error && <div class="account-error" role="alert">{library.error}<button class="text-link" onClick={() => void syncLibrary()}>Повторить</button></div>}{library.loading && !library.syncedAt ? <div class="account-loading" role="status">Загружаем коллекцию аккаунта…<br/><a class="text-link" href="#/account">Проверить вход в аккаунт</a></div> : <>{historyTab ? library.history.length ? <><div class="history-list">{library.history.map(entry => <a class="history-card" href={`#/anime/${entry.anime.anime_id}`} key={entry.anime.anime_id}><div class="history-poster"><Poster anime={entry.anime}/></div><div><span class="eyebrow">СЕРИЯ {entry.episode}</span><h2>{entry.anime.title}</h2><p>Открыто {new Date(entry.updatedAt).toLocaleDateString('ru', { day: 'numeric', month: 'long' })}</p></div><span class="continue-play"><Icon name="play" size={20}/></span></a>)}</div><div class="clear-history">{library.account ? <a class="text-link" href="https://ru.yummyani.me/watch-history" target="_blank" rel="noreferrer">Управлять историей на YummyAnime<Icon name="external" size={15}/></a> : confirmClear ? <><p>Удалить историю открытых серий на этом устройстве?</p><button class="button secondary" onClick={() => { try { clearHistory(); setConfirmClear(false); notify('История очищена'); } catch (error) { notify((error as Error).message); } }}>Удалить историю</button><button class="text-link" onClick={() => setConfirmClear(false)}>Отмена</button></> : <button class="text-link" onClick={() => setConfirmClear(true)}><Icon name="trash" size={16}/>Очистить историю</button>}</div></> : <Empty icon="clock" title="Здесь продолжится твоя история" action={<a class="button primary" href="#/catalog">Выбрать аниме<Icon name="arrow" size={18}/></a>}>Открой первую серию — мы запомним её и озвучку для следующего раза.</Empty> : library.favorites.length ? <div class="anime-grid">{library.favorites.map(anime => <AnimeCard key={anime.anime_id} anime={anime}/>)}</div> : <Empty icon="heart" title="Коллекция ждёт первую историю" action={<a class="button primary" href="#/catalog">Найти что-нибудь своё<Icon name="arrow" size={18}/></a>}>Нажми на закладку у понравившегося аниме — оно останется здесь.</Empty>}{historyTab && library.hasMore && <div class="load-more"><button class="button secondary" disabled={library.loadingMore} onClick={() => void loadMoreHistory()}>{library.loadingMore ? 'Загружаем…' : 'Ещё история'}</button></div>}</>}</>;
}

const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
function dayKey(timestamp: number) { return new Date(timestamp * 1000).toLocaleDateString('en-CA'); }
export function Schedule() {
  const resource = useResource(signal => animeSchedule(signal), []);
  const [selected, setSelected] = useState(() => new Date().toLocaleDateString('en-CA'));
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() + index); return date; });
  const data = (resource.value?.data || []).filter(anime => anime.episodes?.next_date && dayKey(anime.episodes.next_date) === selected).sort((a, b) => a.episodes!.next_date! - b.episodes!.next_date!);
  return <><div class="page-heading"><p class="eyebrow">НИ ОДНОЙ ПРОПУЩЕННОЙ ПРЕМЬЕРЫ</p><h1>Расписание</h1><p>Новые серии любимых историй. Время по твоему устройству: {zone}.</p></div><div class="schedule-days">{days.map((day, i) => <button class={selected === day.toLocaleDateString('en-CA') ? 'selected' : ''} onClick={() => setSelected(day.toLocaleDateString('en-CA'))}><span>{i === 0 ? 'Сегодня' : day.toLocaleDateString('ru', { weekday: 'short' })}</span><strong>{day.getDate()}</strong><small>{day.toLocaleDateString('ru', { month: 'short' })}</small></button>)}</div>{resource.loading ? <Skeleton/> : resource.error ? <ErrorState error={resource.error} retry={resource.retry}/> : <>{resource.value?.cached && <CachedNotice savedAt={resource.value.savedAt}/>}<div class="schedule-list">{data.map(anime => <a class="schedule-card" href={`#/anime/${anime.anime_id}`} key={anime.anime_id}><time dateTime={new Date(anime.episodes!.next_date! * 1000).toISOString()}>{new Date(anime.episodes!.next_date! * 1000).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</time><div class="schedule-poster"><Poster anime={anime}/></div><div><span class="eyebrow">СЕРИЯ {(anime.episodes?.aired || 0) + 1}</span><h2>{anime.title}</h2><p>Ориентировочное время выхода</p></div><Icon name="chevron" size={19}/></a>)}</div>{!data.length && <Empty icon="calendar" title="Немного тишины в эфире">На этот день в Yani пока нет запланированных серий. Самое время наверстать отложенное.</Empty>}<p class="collection-note">Расписание показывает время японской премьеры из Yani. Озвучка может появиться позже.</p></>}</>;
}

export interface InstallPrompt extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
export function Settings({ installPrompt, install, installed }: { installPrompt?: InstallPrompt; install: () => void; installed: boolean }) {
  const [token, setToken] = useState(getToken);
  const [hasSaved, setHasSaved] = useState(false);
  return <><div class="page-heading"><p class="eyebrow">ЧУТЬ БОЛЬШЕ УЮТА</p><h1>Настройки</h1><p>YumiWatch, как удобно тебе.</p></div><AccountCard/><section class="settings-card"><div class="settings-icon"><Icon name="download" size={25}/></div><div><h2>{installed ? 'Уже на главном экране' : 'Аниме на расстоянии одного касания'}</h2><p>Установи YumiWatch: отдельное окно, быстрый запуск и любимая коллекция под рукой.</p>{installPrompt ? <button class="button primary" onClick={install}><Icon name="download" size={18}/>Установить приложение</button> : !installed && <div class="install-help"><p><strong>iPhone / iPad</strong> — в Safari нажми «Поделиться» → «На экран Домой» → «Добавить».</p><p><strong>Android</strong> — в меню Chrome нажми «Установить приложение» или «Добавить на главный экран».</p><p><strong>Компьютер</strong> — используй значок установки в адресной строке Chrome или Edge, если он доступен.</p></div>}</div></section><details class="advanced-api"><summary>Дополнительные настройки подключения</summary><section class="settings-card"><div class="settings-icon"><Icon name="settings" size={25}/></div><div><h2>Подключение к Yani API</h2><p>Публичный каталог сейчас может работать без токена. По документации Yani для приложения нужен собственный публичный токен.</p><a class="text-link" href="https://yummyani.me/dev/applications" target="_blank" rel="noreferrer">Создать приложение в Yani<Icon name="external" size={15}/></a><form class="token-form" onSubmit={event => { event.preventDefault(); try { token.trim() ? localStorage.setItem(TOKEN_KEY, token.trim()) : localStorage.removeItem(TOKEN_KEY); setHasSaved(true); notify('Настройки подключения сохранены'); } catch { notify('Браузер не разрешил сохранить настройки.'); } }}><label htmlFor="application-token">Публичный токен приложения<input id="application-token" type="password" value={token} onInput={event => { setToken(event.currentTarget.value); setHasSaved(false); }} placeholder="X-Application" autoComplete="off" spellcheck={false}/></label><button class="button secondary" type="submit"><Icon name={hasSaved ? 'check' : 'check'} size={17}/>{hasSaved ? 'Сохранено' : 'Сохранить'}</button></form><p class="fine-print">Нужен public application token, а не пароль или токен аккаунта. Сохраняется только в этом браузере и отправляется на api.yani.tv.</p></div></section></details><section class="settings-card"><div class="settings-icon"><Icon name="wifi" size={25}/></div><div><h2>Когда сеть пропала</h2><p>Оболочка приложения и последние загруженные данные остаются доступны после первого посещения. Гостевая коллекция хранится на устройстве. Для коллекции аккаунта, синхронизации и видео нужен интернет.</p></div></section><div class="about-card"><img src={`${import.meta.env.BASE_URL}icons/icon.svg`} width="42" height="42" alt=""/><h2>YumiWatch <span>v1.1</span></h2><p>Маленький клиент для больших историй.</p><p>Независимый проект на Preact. Каталог и видео — YummyAnime / Yani.<br/>Не является официальным приложением YummyAnime.</p><a class="text-link" href="https://api.yani.tv/swagger" target="_blank" rel="noreferrer">Документация API<Icon name="external" size={15}/></a></div></>;
}
