import type { FunctionalComponent as FC, JSX } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

import { initializeAccount, loginAccount, logoutAccount } from '~/lib/account';
import { ApiError } from '~/lib/api';
import { useLibrary, useSession } from '~/lib/hooks';
import { syncLibrary } from '~/lib/library';
import { notify } from '~/lib/notifications';
import { ProfilePage } from './Profile';

import {
  Avatar,
  Button,
  ButtonLink,
  Field,
  Form,
  FormActions,
  FormError,
  Icon,
  Input,
  SettingsCard,
} from '~/ui';

interface HCaptchaAPI {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  remove(id: string): void;
}

declare global {
  interface Window {
    hcaptcha?: HCaptchaAPI;
  }
}

let captchaLoader: Promise<HCaptchaAPI> | undefined;

function loadCaptcha() {
  if (window.hcaptcha) return Promise.resolve(window.hcaptcha);
  if (captchaLoader) return captchaLoader;
  captchaLoader = new Promise<HCaptchaAPI>((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = setTimeout(() => {
      script.remove();
      reject(new Error('Капча Yummy не загрузилась. Проверь соединение и попробуй снова.'));
    }, 15000);

    script.src = 'https://js.hcaptcha.com/1/api.js?render=explicit&hl=ru';
    script.async = true;
    script.onload = () => {
      clearTimeout(timeout);
      window.hcaptcha ? resolve(window.hcaptcha) : reject(new Error('Капча Yummy недоступна.'));
    };
    script.onerror = () => {
      clearTimeout(timeout);
      script.remove();
      reject(new Error('Не удалось загрузить капчу Yummy.'));
    };
    document.head.appendChild(script);
  }).catch(error => {
    captchaLoader = undefined;
    throw error;
  });

  return captchaLoader;
}

type TCaptchaProps = { onToken: (value: string) => void };

const Captcha: FC<TCaptchaProps> = ({ onToken }) => {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);

  callback.current = onToken;

  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let widget: string | undefined;

    setError('');
    loadCaptcha()
      .then(api => {
        if (cancelled || !container.current) return;
        widget = api.render(container.current, {
          sitekey: 'b1847961-208e-4a90-9671-1e6bba9e0b36',
          theme: 'dark',
          size: 'compact',
          callback: (token: string) => callback.current(token),
          'expired-callback': () => callback.current(''),
          'error-callback': () => {
            callback.current('');
            setError('Капча Yummy не прошла проверку. Попробуй загрузить её снова.');
          },
        });
      })
      .catch(error => {
        if (!cancelled) setError(error.message);
      });

    return () => {
      cancelled = true;
      if (widget !== undefined) window.hcaptcha?.remove(widget);
    };
  }, [attempt]);

  const retryCaptcha = useCallback(() => setAttempt(value => value + 1), []);

  return (
    <div class="login-captcha">
      <div ref={container} />
      {error && (
        <>
          <FormError>{error}</FormError>
          <Button type="button" onClick={retryCaptcha} variant="text">
            Загрузить капчу снова
          </Button>
        </>
      )}
    </div>
  );
};

export const AccountCard: FC = () => {
  const session = useSession();
  const library = useLibrary();
  const [retrying, setRetrying] = useState(false);

  const retryAccount = useCallback(async () => {
    setRetrying(true);
    try {
      await initializeAccount();
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setRetrying(false);
    }
  }, []);

  const syncAccount = useCallback(() => void syncLibrary(), []);

  const logout = useCallback(() => {
    logoutAccount();
    notify('Ты вышел из аккаунта');
  }, []);

  return (
    <SettingsCard
      class="account-card"
      title={
        session?.verified
          ? session.user.nickname
          : session
            ? 'Проверяем аккаунт'
            : 'Твои истории на всех устройствах'
      }
      description={
        session?.verified
          ? 'Ты в аккаунте YummyAnime. Избранное и история синхронизируются с ним.'
          : session
            ? 'Чтобы открыть коллекцию, нужно подтвердить сохранённую сессию через Yummy.'
            : 'Войди в свой аккаунт YummyAnime — здесь появятся твои избранные аниме и история просмотров.'
      }
      icon={
        session ? (
          <Avatar url={session.user.avatar} name={session.user.nickname} />
        ) : (
          <Icon name="heart" size={25} />
        )
      }
      iconClass={session ? 'profile-avatar' : ''}
    >
      {session ? (
        <>
          <FormActions class="account-actions">
            {!session.verified && (
              <Button disabled={retrying} onClick={retryAccount}>
                {retrying ? 'Проверяем…' : 'Повторить проверку'}
              </Button>
            )}
            {session.verified && (
              <Button disabled={library.loading} onClick={syncAccount}>
                <Icon name="refresh" size={16} />
                {library.loading ? 'Обновляем…' : 'Обновить коллекцию'}
              </Button>
            )}
            <Button onClick={logout} variant="text">
              Выйти
            </Button>
          </FormActions>
          {library.error && <FormError class="account-error">{library.error}</FormError>}
        </>
      ) : (
        <ButtonLink href="#/account" variant="primary">
          Войти в YummyAnime
          <Icon name="arrow" size={17} />
        </ButtonLink>
      )}
    </SettingsCard>
  );
};

export type TAccountPageProps = { query: string };

export const AccountPage: FC<TAccountPageProps> = ({ query }) => {
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

  const submit = useCallback(
    async (event: JSX.TargetedSubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (busy) return;
      setBusy(true);
      setError('');
      controller.current = new AbortController();
      try {
        await loginAccount(login, password, remember, captcha, controller.current.signal);
        setPassword('');

        const next = new URLSearchParams(query).get('next');

        location.hash = next?.startsWith('/') && !next.startsWith('//') ? next : '/profile';
        notify('Ты в аккаунте. Загружаем твою коллекцию');
      } catch (error) {
        if (controller.current.signal.aborted) return;
        if (error instanceof ApiError && (error.status === 420 || error.code === 5)) {
          setCaptchaRequired(true);
          setCaptcha('');
          setChallenge(value => value + 1);
        }
        setError((error as Error).message);
      } finally {
        if (!controller.current?.signal.aborted) setBusy(false);
      }
    },
    [busy, login, password, remember, captcha, query]
  );

  const changeLogin = useCallback(
    (event: JSX.TargetedInputEvent<HTMLInputElement>) => setLogin(event.currentTarget.value),
    []
  );

  const changePassword = useCallback(
    (event: JSX.TargetedInputEvent<HTMLInputElement>) => setPassword(event.currentTarget.value),
    []
  );

  const changeRemember = useCallback(
    (event: JSX.TargetedEvent<HTMLInputElement>) => setRemember(event.currentTarget.checked),
    []
  );

  if (session) return <ProfilePage query={query} />;

  return (
    <div class="login-page">
      <ButtonLink href="#/settings" variant="text" class="account-settings-link">
        <Icon name="settings" size={16} />
        Настройки приложения
      </ButtonLink>
      <div class="page-heading">
        <p class="eyebrow">ТВОИ ИСТОРИИ ВСЕГДА С ТОБОЙ</p>
        <h1>Войти в YummyAnime</h1>
        <p>Используй почту и пароль своего аккаунта YummyAnime.</p>
      </div>
      <Form class="login-form" onSubmit={submit}>
        <Field htmlFor="account-email" label="Почта на YummyAnime">
          <Input
            id="account-email"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            spellcheck={false}
            required
            maxLength={320}
            value={login}
            disabled={busy}
            onInput={changeLogin}
          />
        </Field>
        <Field htmlFor="account-password" label="Пароль">
          <Input
            id="account-password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={500}
            value={password}
            disabled={busy}
            onInput={changePassword}
          />
        </Field>
        <label class="remember-account">
          <Input type="checkbox" checked={remember} disabled={busy} onChange={changeRemember} />
          <span>Оставаться в аккаунте на этом устройстве</span>
        </label>
        {captchaRequired && <Captcha key={challenge} onToken={setCaptcha} />}
        <FormError class="login-error" as="div">
          {error}
        </FormError>
        <Button
          type="submit"
          disabled={busy || (captchaRequired && !captcha)}
          aria-busy={busy}
          variant="primary"
        >
          {busy ? 'Входим…' : 'Войти'}
          <Icon name="arrow" size={17} />
        </Button>
        <p class="login-privacy">
          Данные отправляются напрямую в Yummy. Пароль не сохраняется в YummyWatch. Без «Оставаться
          в аккаунте» вход действует до закрытия браузерной сессии.
        </p>
        <ButtonLink href="https://ru.yummyani.me/" target="_blank" rel="noreferrer" variant="text">
          Забыли пароль? Открыть YummyAnime
          <Icon name="external" size={15} />
        </ButtonLink>
      </Form>
      <p class="collection-note">
        Гостевая коллекция хранится отдельно и не добавляется в аккаунт автоматически.
      </p>
      <ButtonLink href="#/profile" variant="text">
        Открыть гостевой профиль
        <Icon name="arrow" size={16} />
      </ButtonLink>
    </div>
  );
};
