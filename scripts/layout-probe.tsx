// Exercise the real navigation, transitions and scroll containers without a CDN.
import { render } from 'preact';
import { useLayoutEffect, useState } from 'preact/hooks';
import { useHash } from '~/lib/hooks';
import { MediaNavigation } from '~/components/MediaNavigation';
import { Sidebar } from '~/ui';

function Probe() {
  const path = useHash(),
    watching = path.includes('view=watch'),
    [panel, setPanel] = useState(false);

  useLayoutEffect(() => {
    document.documentElement.dataset.screen = watching ? 'watch' : 'catalog';
  }, [watching]);

  return (
    <div class={`media-app ${watching ? 'is-playback' : ''}`}>
      <MediaNavigation path={path} selected={path} watching={watching} />
      <div class="workspace media-workspace">
        <main id="main" class="media-scroll" tabIndex={-1}>
          <div class="media-scroll-content">
            {watching ? (
              <section class="is-watching">
                <button onClick={() => setPanel(true)}>Открыть серии</button>
              </section>
            ) : (
              <>
                <a href="#/catalog">Каталог</a>
                <a href="#/search">Поиск</a>
                <a href="#/anime/1?view=watch">Смотреть</a>
                <div
                  style={{ width: 240, height: 2400, background: 'var(--surface)', marginTop: 24 }}
                >
                  Контент {path}
                </div>
              </>
            )}
          </div>
        </main>
      </div>
      <Sidebar open={panel} title="Серии" close={() => setPanel(false)}>
        <div style={{ height: 2000 }}>Список серий</div>
      </Sidebar>
    </div>
  );
}

render(<Probe />, document.getElementById('app')!);
