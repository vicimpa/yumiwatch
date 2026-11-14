import { useEffect, useRef, useState } from 'preact/hooks';
import { request } from '../lib/api';
import { useResource, useSession } from '../lib/hooks';
import { filterQuery, parseCatalogQuery, validateFilters, type CatalogFilters, type FilterKey } from '../lib/filters';
import { Icon } from './Icon';

interface Genre { title: string; href: string; value: number; group_id: number }
const TYPES = [['tv', 'ТВ-сериал'], ['movie', 'Фильм'], ['ova', 'OVA'], ['ona', 'ONA'], ['special', 'Спешл'], ['shorttv', 'Короткий сериал'], ['shortfilm', 'Короткий фильм']];
const STATUSES = [['ongoing', 'Онгоинг'], ['released', 'Вышел'], ['announcement', 'Анонс']];
const SEASONS = [['winter', 'Зима'], ['spring', 'Весна'], ['summer', 'Лето'], ['fall', 'Осень']];
const TRANSLATES = [['dubbing', 'Дубляж'], ['multivoice', 'Многоголосая'], ['onevoice', 'Одноголосая'], ['twovoice', 'Двухголосая'], ['subtitles', 'Субтитры']];
const AGES = [['1', 'G · все возрасты'], ['2', 'PG · дети'], ['3', 'PG-13 · 13+'], ['4', 'R · 17+'], ['5', 'R+ · 18+']];
const LISTS = [['watch_now', 'Смотрю'], ['will', 'В планах'], ['watched', 'Просмотрено'], ['lost', 'Брошено'], ['postpone', 'Отложено'], ['favourite', 'Избранное']];
function values(value: string) { return value.split(',').filter(Boolean); }
export function FilterSheet({ query, close }: { query: string; close: () => void }) {
  const session = useSession();
  const [draft, setDraft] = useState(() => parseCatalogQuery(query));
  const [error, setError] = useState('');
  const [genreSearch, setGenreSearch] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const genres = useResource(signal => request<{ genres: Genre[] }>('/anime/genres', {}, signal), []);
  useEffect(() => {
    const element = dialog.current!; const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (element.showModal) element.showModal(); else element.setAttribute('open', '');
    return () => { document.body.style.overflow = previous; if (element.close && element.open) element.close(); };
  }, []);
  const set = (key: keyof CatalogFilters, value: string) => setDraft(previous => ({ ...previous, [key]: value }));
  const toggle = (key: FilterKey, value: string) => { const selected = values(draft[key]); set(key, (selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value]).join(',')); };
  const choices = (title: string, key: FilterKey, options: string[][]) => <fieldset class="filter-group"><legend>{title}</legend><div class="filter-options">{options.map(([value, label]) => <button type="button" key={value} class={values(draft[key]).includes(value) ? 'filter-option included' : 'filter-option'} aria-pressed={values(draft[key]).includes(value)} onClick={() => toggle(key, value)}>{label}</button>)}</div></fieldset>;
  const range = (title: string, from: FilterKey, to: FilterKey, min: number, max: number, step = 1) => <fieldset class="filter-group"><legend>{title}</legend><div class="filter-range"><label>От<input aria-label={`${title} от`} type="number" min={min} max={max} step={step} value={draft[from]} onInput={event => set(from, event.currentTarget.value)} placeholder={String(min)}/></label><span>—</span><label>До<input aria-label={`${title} до`} type="number" min={min} max={max} step={step} value={draft[to]} onInput={event => set(to, event.currentTarget.value)} placeholder={String(max)}/></label></div></fieldset>;
  return <dialog ref={dialog} class="filter-sheet" aria-labelledby="filters-title" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === dialog.current) close(); }}><form class="filter-sheet-content" onSubmit={event => {
    event.preventDefault(); const validation = validateFilters(draft); setError(validation); if (validation) return;
    const next = filterQuery({ ...draft, q: parseCatalogQuery(query).q }); location.hash = `/catalog${next ? `?${next}` : ''}`; close();
  }}><header class="sheet-header"><div><h2 id="filters-title">Фильтры аниме</h2><p>Как на YummyAnime — с удобством на телефоне</p></div><button type="button" class="icon-button" aria-label="Закрыть фильтры" onClick={close}><Icon name="close"/></button></header><div class="sheet-body">
    {choices('Статус', 'status', STATUSES)}{choices('Формат', 'types', TYPES)}
    <div class="filter-ranges">{range('Год выхода', 'from_year', 'to_year', 1900, 2100)}{range('Количество серий', 'ep_from', 'ep_to', 0, 10000)}</div>
    {choices('Сезон', 'season', SEASONS)}{choices('Озвучка и субтитры', 'translates', TRANSLATES)}{choices('Возрастной рейтинг', 'min_age', AGES)}
    <div class="filter-ranges">{range('Рейтинг', 'min_rating', 'max_rating', 0, 10, 0.1)}{range('Количество оценок', 'min_rating_counters', 'max_rating_counters', 0, 1000000000)}</div>
    <fieldset class="filter-group genre-filter"><legend>Жанры и теги</legend><p class="filter-help"><span class="green-dot"/>Включить <span class="red-dot"/>Исключить · повторное нажатие меняет выбор</p><input type="search" value={genreSearch} onInput={event => setGenreSearch(event.currentTarget.value)} placeholder="Найти жанр или тег" aria-label="Найти жанр"/>{genres.loading ? <p class="filter-help">Загружаем все жанры…</p> : genres.error ? <div class="account-error">{genres.error}<button type="button" class="text-link" onClick={genres.retry}>Повторить</button></div> : <div class="filter-options all-genres">{genres.value?.data.genres.filter(genre => genre.title.toLocaleLowerCase().includes(genreSearch.toLocaleLowerCase())).map(genre => {
      const included = values(draft.genres).includes(genre.href) || values(draft.genres).includes(String(genre.value));
      const excluded = values(draft.exclude_genres).includes(genre.href) || values(draft.exclude_genres).includes(String(genre.value));
      return <button type="button" key={genre.value} class={`filter-option ${included ? 'included' : excluded ? 'excluded' : ''}`} aria-pressed={excluded ? 'mixed' : included} aria-label={`${genre.title}: ${included ? 'включён' : excluded ? 'исключён' : 'не выбран'}`} onClick={() => {
        const include = values(draft.genres).filter(value => value !== genre.href && value !== String(genre.value));
        const exclude = values(draft.exclude_genres).filter(value => value !== genre.href && value !== String(genre.value));
        if (!included && !excluded) include.push(genre.href); else if (included) exclude.push(genre.href);
        setDraft(previous => ({ ...previous, genres: include.join(','), exclude_genres: exclude.join(',') }));
      }}>{included ? '+ ' : excluded ? '− ' : ''}{genre.title}</button>;
    })}</div>}</fieldset>
    {session?.verified ? choices('Не показывать из моих списков', 'exclude_list', LISTS) : <div class="filter-help"><a href="#/account" onClick={close}>Войди в аккаунт</a>, чтобы исключать аниме из своих списков.</div>}
    <fieldset class="filter-group"><legend>Сортировка</legend><div class="filter-range"><label>Порядок<select value={draft.sort} onChange={event => set('sort', event.currentTarget.value)}><option value="views">По просмотрам</option><option value="top">По месту в топе</option><option value="rating">По рейтингу</option><option value="rating_counters">По числу оценок</option><option value="year">По году выхода</option><option value="title">По названию</option><option value="id">По добавлению</option><option value="random">Случайно</option></select></label><label>Направление<select value={draft.sort_forward} onChange={event => set('sort_forward', event.currentTarget.value)}><option value="">По умолчанию</option><option value="true">По возрастанию</option><option value="false">По убыванию</option></select></label></div></fieldset>
    {error && <p role="alert" class="account-error">{error}</p>}
  </div><footer class="sheet-footer"><button class="button secondary" type="button" onClick={() => { setDraft(previous => ({ ...parseCatalogQuery(''), q: previous.q })); setError(''); }}>Сбросить</button><button class="button primary" type="submit">Показать аниме<Icon name="arrow" size={17}/></button></footer></form></dialog>;
}
