import type { FunctionalComponent as FC } from 'preact';
import { useEffect } from 'preact/hooks';
import { navigateBack, navigateForward, navigation } from '~/lib/navigation';
import { Button, Icon } from '~/ui';

export const NavigationHistory: FC<{
  path: string;
  hidden?: boolean;
  placement?: 'page' | 'sidebar';
}> = ({ path, hidden, placement = 'page' }) => {
  const { canBack, canForward } = navigation.value;
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if ((event.altKey && event.key === 'ArrowLeft') || (event.metaKey && event.key === '[')) {
        event.preventDefault();
        navigateBack();
      } else if (
        (event.altKey && event.key === 'ArrowRight') ||
        (event.metaKey && event.key === ']')
      ) {
        event.preventDefault();
        navigateForward();
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);
  return (
    <nav
      class={`navigation-history ${placement === 'sidebar' ? 'is-sidebar' : ''}`}
      aria-label="История переходов"
      hidden={hidden}
    >
      <Button
        variant="icon"
        aria-label="Назад"
        title="Назад"
        disabled={!canBack && path === '/'}
        onClick={() => navigateBack()}
      >
        <Icon name="back" size={placement === 'sidebar' ? 16 : 18} />
      </Button>
      <Button
        variant="icon"
        aria-label="Вперёд"
        title="Вперёд"
        disabled={!canForward}
        onClick={navigateForward}
      >
        <Icon name="arrow" size={placement === 'sidebar' ? 16 : 18} />
      </Button>
    </nav>
  );
};
