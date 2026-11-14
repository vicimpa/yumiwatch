import { useEffect, useRef, useState } from 'preact/hooks';
import { ApiError, imageUrl } from '../lib/api';
import { initializeAccount, loginAccount, logoutAccount } from '../lib/account';
import { useLibrary, useSession } from '../lib/hooks';
import { syncLibrary } from '../lib/library';
import { Icon } from './Icon';
import { notify } from './UI';

interface HCaptchaAPI { render(container: HTMLElement, options: Record<string, unknown>): string; remove(id: string): void }
declare global { interface Window { hcaptcha?: HCaptchaAPI } }
let captchaLoader: Promise<HCaptchaAPI> | undefined;
function loadCaptcha() {
  if (window.hcaptcha) return Promise.resolve(window.hcaptcha);
  if (captchaLoader) return captchaLoader;
  captchaLoader = new Promise<HCaptchaAPI>((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = setTimeout(() => { script.remove(); reject(new Error('Капча Yani не загрузилась. Проверь соединение и попробуй снова.')); }, 15000);
    script.src = 'https://js.hcaptcha.com/1/api.js?render=explicit&hl=ru'; script.async = true;
    script.onload = () => { clearTimeout(timeout); window.hcaptcha ? resolve(window.hcaptcha) : reject(new Error('Капча Yani недоступна.')); };
    script.onerror = () => { clearTimeout(timeout); script.remove(); reject(new Error('Не удалось загрузить капчу Yani.')); };
    document.head.appendChild(script);
  }).catch(error => { captchaLoader = undefined; throw error; });
  return captchaLoader;
}
function Captcha({ onToken }: { onToken: (value: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken); callback.current = onToken;
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false; let widget: string | undefined;
    setError('');
    loadCaptcha().then(api => {
      if (cancelled || !container.current) return;
      widget = api.render(container.current, { sitekey: 'b1847961-208e-4a90-9671-1e6bba9e0b36', theme: 'dark', size: 'compact', callback: (token: string) => callback.current(token), 'expired-callback': () => callback.current(''), 'error-callback': () => { callback.current(''); setError('Капча Yani не прошла проверку. Попробуй загрузить её снова.'); } });
    }).catch(error => { if (!cancelled) setError(error.message); });
    return () => { cancelled = true; if (widget !== undefined) window.hcaptcha?.remove(widget); };
  }, [attempt]);
  return <div class="login-captcha"><div ref={container}/>{error && <><p role="alert">{error}</p><button type="button" class="text-link" onClick={() => setAttempt(value => value + 1)}>Загрузить капчу снова</button></>}</div>;
}
export function AccountCard() {
  const session = useSession();
  const library = useLibrary();
  const [retrying, setRetrying] = useState(false);
  return <section class="settings-card account-card"><div class="settings-icon"><Icon name="heart" size={25}/></div><div><h2>{session?.verified ? session.user.nickname : session ? 'Проверяем аккаунт' : 'Твои истории на всех устройствах'}</h2><p>{session?.verified ? 'Ты в аккаунте YummyAnime. Избранное и история синхронизируются с ним.' : session ? 'Чтобы открыть коллекцию, нужно подтвердить сохранённую сессию через Yani.' : 'Войди в свой аккаунт YummyAnime — здесь появятся твои избранные аниме и история просмотров.'}</p>{session ? <><div class="account-actions">{!session.verified && <button class="button secondary" disabled={retrying} onClick={async () => { setRetrying(true); try { await initializeAccount(); } catch (error) { notify((error as Error).message); } finally { setRetrying(false); } }}>{retrying ? 'Проверяем…' : 'Повторить проверку'}</button>}{session.verified && <button class="button secondary" disabled={library.loading} onClick={() => void syncLibrary()}><Icon name="refresh" size={16}/>{library.loading ? 'Обновляем…' : 'Обновить коллекцию'}</button>}<button class="text-link" onClick={() => { logoutAccount(); notify('Ты вышел из аккаунта'); }}>Выйти</button></div>{library.error && <p class="account-error" role="alert">{library.error}</p>}</> : <a href="#/account" class="button primary">Войти в YummyAnime<Icon name="arrow" size={17}/></a>}</div></section>;
}
export function AccountPage({ query }: { query: string }) {
  const session = useSession();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captcha, setCaptcha] = useState('');
  const [challenge, setChallenge] = useState(0);
  const controller = useRef<AbortController>();
  useEffect(() => () => controller.current?.abort(), []);
  if (session) return <><div class="page-heading"><p class="eyebrow">ТВОЙ АККАУНТ</p><h1>{session.verified ? `Привет, ${session.user.nickname}` : 'Возвращаемся в твой мир'}</h1></div><AccountCard/><a class="button secondary" href="#/library">В мою коллекцию<Icon name="arrow" size={17}/></a></>;
  return <div class="login-page"><div class="page-heading"><p class="eyebrow">ТВОИ ИСТОРИИ ВСЕГДА С ТОБОЙ</p><h1>Войти в YummyAnime</h1><p>Используй почту и пароль своего аккаунта YummyAnime.</p></div><form class="login-form" onSubmit={async event => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    controller.current = new AbortController();
    try {
      await loginAccount(login, password, remember, captcha, controller.current.signal);
      setPassword('');
      const next = new URLSearchParams(query).get('next');
      location.hash = next?.startsWith('/') && !next.startsWith('//') ? next : '/library';
      notify('Ты в аккаунте. Загружаем твою коллекцию');
    } catch (error) {
      if (controller.current.signal.aborted) return;
      if (error instanceof ApiError && (error.status === 420 || error.code === 5)) { setCaptchaRequired(true); setCaptcha(''); setChallenge(value => value + 1); }
      setError((error as Error).message);
    } finally { if (!controller.current?.signal.aborted) setBusy(false); }
  }}><label htmlFor="account-email">Почта на YummyAnime<input id="account-email" type="email" autoComplete="username" autoCapitalize="none" spellcheck={false} required maxLength={320} value={login} disabled={busy} onInput={event => setLogin(event.currentTarget.value)}/></label><label htmlFor="account-password">Пароль<input id="account-password" type="password" autoComplete="current-password" required maxLength={500} value={password} disabled={busy} onInput={event => setPassword(event.currentTarget.value)}/></label><label class="remember-account"><input type="checkbox" checked={remember} disabled={busy} onChange={event => setRemember(event.currentTarget.checked)}/><span>Оставаться в аккаунте на этом устройстве</span></label>{captchaRequired && <Captcha key={challenge} onToken={setCaptcha}/>}<div class="login-error" role="alert">{error}</div><button class="button primary" type="submit" disabled={busy || (captchaRequired && !captcha)} aria-busy={busy}>{busy ? 'Входим…' : 'Войти'}<Icon name="arrow" size={17}/></button><p class="login-privacy">Данные отправляются напрямую в Yani. Пароль не сохраняется в YumiWatch. Без «Оставаться в аккаунте» вход действует до закрытия браузерной сессии.</p><a class="text-link" href="https://ru.yummyani.me/" target="_blank" rel="noreferrer">Забыли пароль? Открыть YummyAnime<Icon name="external" size={15}/></a></form><p class="collection-note">Гостевая коллекция хранится отдельно и не добавляется в аккаунт автоматически.</p></div>;
}
