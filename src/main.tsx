import { render, Component, type ComponentChildren } from 'preact';
import { App } from './App';
import './styles.css';
import './yummy.css';
import './mobile.css';
class ErrorBoundary extends Component<{ children: ComponentChildren }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div class="fatal-error"><img src={`${import.meta.env.BASE_URL}icons/icon.svg`} width="64" height="64" alt=""/><h1>Небольшой перерыв</h1><p>Не удалось открыть приложение. Твоя коллекция осталась в браузере.</p><button class="button primary" onClick={() => location.reload()}>Перезагрузить</button></div> : this.props.children;
  }
}
render(<ErrorBoundary><App/></ErrorBoundary>, document.getElementById('app')!);
