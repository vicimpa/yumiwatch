import type { FunctionalComponent as FC, JSX } from 'preact';
import { useCallback, useState } from 'preact/hooks';

import { getToken } from '~/lib/api';
import { notify } from '~/lib/notifications';
import { TOKEN_KEY } from '~/lib/storage';

import { Button, ButtonLink, Field, Form, Icon, Input, SettingsCard } from '~/ui';

export const ConnectionSettings: FC = () => {
  const [token, setToken] = useState(getToken);
  const [hasSaved, setHasSaved] = useState(false);

  const submit = useCallback(
    (event: JSX.TargetedSubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      try {
        token.trim()
          ? localStorage.setItem(TOKEN_KEY, token.trim())
          : localStorage.removeItem(TOKEN_KEY);
        setHasSaved(true);
        notify('Настройки подключения сохранены');
      } catch {
        notify('Браузер не разрешил сохранить настройки.');
      }
    },
    [token]
  );

  const changeToken = useCallback((event: JSX.TargetedInputEvent<HTMLInputElement>) => {
    setToken(event.currentTarget.value);
    setHasSaved(false);
  }, []);

  return (
    <>
      <a class="back-link" href="#/settings">
        <Icon name="back" size={17} />
        Настройки
      </a>
      <div class="page-heading">
        <h1>Подключение</h1>
        <p>YummyWatch уже настроен для работы с Yummy.</p>
      </div>
      <SettingsCard
        title="Подключение к Yummy API"
        description="Здесь можно заменить публичный токен приложения для собственного подключения к API."
        icon={<Icon name="settings" size={25} />}
      >
        <ButtonLink
          href="https://yummyani.me/dev/applications"
          target="_blank"
          rel="noreferrer"
          variant="text"
        >
          Создать приложение в Yummy
          <Icon name="external" size={15} />
        </ButtonLink>
        <Form class="token-form" onSubmit={submit}>
          <Field htmlFor="application-token" label="Публичный токен приложения">
            <Input
              id="application-token"
              type="password"
              value={token}
              onInput={changeToken}
              placeholder="X-Application"
              autoComplete="off"
              spellcheck={false}
            />
          </Field>
          <Button type="submit">
            <Icon name="check" size={17} />
            {hasSaved ? 'Сохранено' : 'Сохранить'}
          </Button>
        </Form>
        <p class="fine-print">
          Нужен public application token, а не пароль или токен аккаунта. Сохраняется только в этом
          браузере и отправляется на api.yani.tv.
        </p>
      </SettingsCard>
    </>
  );
};
