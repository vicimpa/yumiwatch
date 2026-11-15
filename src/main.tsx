import { render, Component, type ComponentChildren } from 'preact';
import { App } from './App';
import './styles.css';
import './yummy.css';
import './mobile.css';
import './gallery.css';
import './media-center.css';
import './desktop.css';
import './interaction.css';
import './touch.css';
import { initializeDesktop, isDesktop } from './lib/desktop';
import { WindowChrome } from './components/WindowChrome';
import { initializeCache } from './lib/cache-store';
import { initializeSession } from './lib/session';
import { notify } from './components/UI';
class ErrorBoundary extends Component<{ children: ComponentChildren }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <><WindowChrome/><div class="fatal-error"><img src={`${import.meta.env.BASE_URL}icons/icon.svg`} width="64" height="64" alt=""/><h1>Небольшой перерыв</h1><p>Не удалось открыть приложение. Твоя коллекция осталась на устройстве.</p><button class="button primary" onClick={() => location.reload()}>Перезагрузить</button></div></> : this.props.children;
  }
}
async function start() {
  const root = document.getElementById('app')!;
  if (isDesktop()) render(<div class="fatal-error" role="status">Открываем YummyWatch…</div>, root);
  try {
    await initializeDesktop();
    let sessionError='';
    try { await initializeSession(); } catch(error) { sessionError=(error as Error).message; }
    await initializeCache();
    render(<ErrorBoundary><App/></ErrorBoundary>, root);
    if(sessionError)setTimeout(()=>notify(sessionError),0);
  } catch {
    render(<><WindowChrome/><div class="fatal-error"><h1>Не удалось запустить приложение</h1><p>Перезапусти YummyWatch, чтобы подключить встроенный сервер.</p><button class="button primary" onClick={() => location.reload()}>Попробовать снова</button></div></>, root);
  }
}
void start();
