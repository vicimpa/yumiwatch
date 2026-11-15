import { version } from '../../package.json';
import { useEffect, useState } from 'preact/hooks';
import { isDesktop } from '../lib/desktop';
import { animeSchedule,peekAnimeSchedule, getToken } from '../lib/api';
import { useResource } from '../lib/hooks';
import { TOKEN_KEY } from '../lib/storage';
import { AccountCard } from './Account';
import { InterfaceSettingsCard } from './InterfaceSettings';
import { PlaybackSettingsCard } from './PlaybackSettings';
import { Icon } from './Icon';
import { Empty, ErrorState, notify, Poster, Skeleton } from './UI';

export { Gallery as Home } from './Gallery';

export { Catalog } from './Catalog';

export { Detail } from './Detail';

export { LibraryPage } from './Library';

const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
function dayKey(timestamp: number) { return new Date(timestamp * 1000).toLocaleDateString('en-CA'); }
export function Schedule() {
  const resource = useResource(signal => animeSchedule(signal), [],peekAnimeSchedule);
  useEffect(()=>{const refresh=()=>resource.retry();window.addEventListener('online',refresh);return()=>window.removeEventListener('online',refresh);},[]);
  const [selected, setSelected] = useState(() => new Date().toLocaleDateString('en-CA'));
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() + index); return date; });
  const data = (resource.value?.data || []).filter(anime => anime.episodes?.next_date && dayKey(anime.episodes.next_date) === selected).sort((a, b) => a.episodes!.next_date! - b.episodes!.next_date!);
  return <><div class="page-heading"><p class="eyebrow">НИ ОДНОЙ ПРОПУЩЕННОЙ ПРЕМЬЕРЫ</p><h1>Расписание</h1><p>Новые серии любимых историй. Время по твоему устройству: {zone}.<span class="schedule-status" role="status" aria-live="polite" aria-atomic="true">{resource.loading?'Загружаем расписание…':resource.refreshing?'Обновляем расписание в фоне…':resource.value?.cached?`Сохранённое расписание от ${new Date(resource.value.savedAt).toLocaleString('ru', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}`:''}</span></p></div><div class="schedule-days">{days.map((day, i) => <button class={selected === day.toLocaleDateString('en-CA') ? 'selected' : ''} onClick={() => setSelected(day.toLocaleDateString('en-CA'))}><span>{i === 0 ? 'Сегодня' : day.toLocaleDateString('ru', { weekday: 'short' })}</span><strong>{day.getDate()}</strong><small>{day.toLocaleDateString('ru', { month: 'short' })}</small></button>)}</div>{resource.loading ? <Skeleton/> : resource.error ? <ErrorState error={resource.error} retry={resource.retry}/> : <><div class="schedule-list">{data.map(anime => <a class="schedule-card" href={`#/anime/${anime.anime_id}`} key={anime.anime_id}><time dateTime={new Date(anime.episodes!.next_date! * 1000).toISOString()}>{new Date(anime.episodes!.next_date! * 1000).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</time><div class="schedule-poster"><Poster anime={anime}/></div><div><span class="eyebrow">СЕРИЯ {(anime.episodes?.aired || 0) + 1}</span><h2>{anime.title}</h2><p>Ориентировочное время выхода</p></div><Icon name="chevron" size={19}/></a>)}</div>{!data.length && <Empty icon="calendar" title="Немного тишины в эфире">На этот день в Yani пока нет запланированных серий. Самое время наверстать отложенное.</Empty>}<p class="collection-note">Расписание показывает время японской премьеры из Yani. Озвучка может появиться позже.</p></>}</>;
}

export interface InstallPrompt extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
export function Settings({ installPrompt, install, installed }: { installPrompt?: InstallPrompt; install: () => void; installed: boolean }) {
  return <><div class="page-heading"><p class="eyebrow">ЧУТЬ БОЛЬШЕ УЮТА</p><h1>Настройки</h1><p>YummyWatch, как удобно тебе.</p></div><InterfaceSettingsCard/><AccountCard/><PlaybackSettingsCard/>{!isDesktop()&&<section class="settings-card"><div class="settings-icon"><Icon name="download" size={25}/></div><div><h2>{installed ? 'Уже на главном экране' : 'Аниме на расстоянии одного касания'}</h2><p>Установи YummyWatch: отдельное окно, быстрый запуск и любимая коллекция под рукой.</p>{installPrompt ? <button class="button primary" onClick={install}><Icon name="download" size={18}/>Установить приложение</button> : !installed && <div class="install-help"><p><strong>iPhone / iPad</strong> — в Safari нажми «Поделиться» → «На экран Домой» → «Добавить».</p><p><strong>Android</strong> — в меню Chrome нажми «Установить приложение» или «Добавить на главный экран».</p><p><strong>Компьютер</strong> — используй значок установки в адресной строке Chrome или Edge, если он доступен.</p></div>}</div></section>}<a class="settings-card settings-connection-link" href="#/settings/connection"><div class="settings-icon"><Icon name="settings" size={25}/></div><div><h2>Подключение к Yani</h2><p>Дополнительные настройки приложения</p></div><Icon name="chevron" size={20}/></a><section class="settings-card"><div class="settings-icon"><Icon name="wifi" size={25}/></div><div><h2>Когда сеть пропала</h2><p>Оболочка приложения и последние загруженные данные остаются доступны после первого посещения. Гостевая коллекция хранится на устройстве. Для коллекции аккаунта, синхронизации и видео нужен интернет.</p></div></section><div class="about-card"><img src={`${import.meta.env.BASE_URL}icons/icon.svg`} width="42" height="42" alt=""/><h2>YummyWatch <span>v{version}</span></h2><p>Маленький клиент для больших историй.</p><p>Независимый проект на {isDesktop()?'Tauri 2 и Preact':'Preact'}. Каталог и видео — YummyAnime / Yani.<br/>Не является официальным приложением YummyAnime.</p><a class="text-link" href="https://api.yani.tv/swagger" target="_blank" rel="noreferrer">Документация API<Icon name="external" size={15}/></a></div></>;
}

export function ConnectionSettings() {
  const [token, setToken] = useState(getToken);
  const [hasSaved, setHasSaved] = useState(false);
  return <><a class="back-link" href="#/settings"><Icon name="back" size={17}/>Настройки</a><div class="page-heading"><h1>Подключение</h1><p>YummyWatch уже настроен для работы с Yani.</p></div><section class="settings-card"><div class="settings-icon"><Icon name="settings" size={25}/></div><div><h2>Подключение к Yani API</h2><p>Здесь можно заменить публичный токен приложения для собственного подключения к API.</p><a class="text-link" href="https://yummyani.me/dev/applications" target="_blank" rel="noreferrer">Создать приложение в Yani<Icon name="external" size={15}/></a><form class="token-form" onSubmit={event => { event.preventDefault(); try { token.trim() ? localStorage.setItem(TOKEN_KEY, token.trim()) : localStorage.removeItem(TOKEN_KEY); setHasSaved(true); notify('Настройки подключения сохранены'); } catch { notify('Браузер не разрешил сохранить настройки.'); } }}><label htmlFor="application-token">Публичный токен приложения<input id="application-token" type="password" value={token} onInput={event => { setToken(event.currentTarget.value); setHasSaved(false); }} placeholder="X-Application" autoComplete="off" spellcheck={false}/></label><button class="button secondary" type="submit"><Icon name={hasSaved ? 'check' : 'check'} size={17}/>{hasSaved ? 'Сохранено' : 'Сохранить'}</button></form><p class="fine-print">Нужен public application token, а не пароль или токен аккаунта. Сохраняется только в этом браузере и отправляется на api.yani.tv.</p></div></section></>;
}
