import type { DiscordActivity } from '~/core/DiscordPresence';

const screens: Partial<Record<string, string>> = {
  '/': 'В каталоге',
  '/catalog': 'В каталоге',
  '/search': 'В поиске',
  '/library': 'В коллекции',
  '/schedule': 'Смотрит расписание',
  '/settings': 'Настраивает приложение',
  '/settings/connection': 'Настраивает подключение',
  '/account': 'В аккаунте',
  '/profile': 'В своём профиле',
};

export function searchPresence(query: string, location = 'В поиске'): DiscordActivity {
  const text = Array.from(query.trim().replace(/\s+/gu, ' ')).slice(0, 80).join('');

  return { type: 0, details: text ? `Ищет «${text}»` : 'Выбирает аниме', state: location };
}

export function routePresence(path: string): DiscordActivity {
  const [route, query = ''] = path.split('?');
  const screen =
    screens[route] ||
    (/^\/anime\/[^/]+$/.test(route)
      ? 'Открывает аниме'
      : /^\/users\/id\d+$/.test(route)
        ? 'Смотрит профили'
        : 'В приложении');
  const text =
    route === '/search' || route === '/catalog' ? new URLSearchParams(query).get('q') || '' : '';

  return searchPresence(text, screen);
}
