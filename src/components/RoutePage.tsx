import type { FunctionalComponent as FC } from 'preact';

import type { Installation } from '~/hooks/useInstallation';

import { AccountPage } from './Account';
import { ConnectionSettings } from './ConnectionSettings';
import { Detail } from './Detail';
import { Schedule } from './Schedule';
import { Settings } from './Settings';
import { ProfilePage } from './Profile';
import { NotificationsPage } from './Social';
import { MessagesPage } from './Messages';
import { ButtonLink, Empty } from '~/ui';

type TRoutePageProps = {
  route: string;
  query: string;
  returnTo: string;
  installation: Installation;
};

export const RoutePage: FC<TRoutePageProps> = ({ route, query, returnTo, installation }) => {
  switch (route) {
    case '/':
    case '/catalog':
    case '/search':
      return null;
    case '/schedule':
      return <Schedule />;
    case '/account':
      return <AccountPage query={query} />;
    case '/profile':
      return <ProfilePage query={query} />;
    case '/notifications':
      return <NotificationsPage />;
    case '/messages':
      return <MessagesPage query={query} />;
    case '/settings/connection':
      return <ConnectionSettings />;
    case '/settings':
      return <Settings {...installation} />;
  }

  if (/^\/users\/id[1-9]\d*$/.test(route) && Number.isSafeInteger(Number(route.slice(9))))
    return <ProfilePage key={route} userId={Number(route.slice(9))} query={query} />;

  if (/^\/anime\/[^/]+$/.test(route))
    return <Detail key={route} id={route.split('/')[2]} query={query} returnTo={returnTo} />;

  return (
    <Empty
      title="Эта история затерялась"
      action={
        <ButtonLink href="#/" variant="primary">
          На главную
        </ButtonLink>
      }
    >
      Такой страницы нет. Вернёмся к аниме?
    </Empty>
  );
};
