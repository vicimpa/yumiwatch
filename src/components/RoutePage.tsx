import type { FunctionalComponent as FC } from 'preact';

import type { Installation } from '~/hooks/useInstallation';

import { AccountPage } from './Account';
import { ConnectionSettings } from './ConnectionSettings';
import { Detail } from './Detail';
import { LibraryPage } from './Library';
import { Schedule } from './Schedule';
import { Settings } from './Settings';
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
    case '/library':
      return <LibraryPage query={query} />;
    case '/schedule':
      return <Schedule />;
    case '/account':
      return <AccountPage query={query} />;
    case '/settings/connection':
      return <ConnectionSettings />;
    case '/settings':
      return <Settings {...installation} />;
  }

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
