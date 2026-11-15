import { savePlaybackSettings, usePlaybackSettings } from '../lib/playback-settings';
import { Select } from './Select';
import { Icon } from './Icon';
export function AutoSkipSettings() {
  const settings = usePlaybackSettings();
  return <div class="auto-skip-settings" role="group" aria-label="Автопропуск"><label class="watch-toggle"><input type="checkbox" checked={settings.autoSkipOpening} onChange={event => savePlaybackSettings({ autoSkipOpening: event.currentTarget.checked })}/>Автопропуск опенинга</label><label class="watch-toggle"><input type="checkbox" checked={settings.autoSkipEnding} onChange={event => savePlaybackSettings({ autoSkipEnding: event.currentTarget.checked })}/>Автопропуск титров</label><small>Только в нашем плеере, по меткам источника. Сцены после титров остаются.</small></div>;
}
export function PlaybackSettingsCard() {
  const settings = usePlaybackSettings();
  return <section class="settings-card"><div class="settings-icon"><Icon name="play" size={25}/></div><div><h2>Наш плеер</h2><p>Экран просмотра занимает только плеер. Озвучки, серии и комментарии доступны в его боковых панелях. Оригинальные плееры источников можно открыть со страницы аниме.</p><label class="playback-quality-setting">Предпочитаемое качество<Select aria-label="Предпочитаемое качество" value={settings.quality} onChange={event=>savePlaybackSettings({quality:event.currentTarget.value})}>{['144','240','360','480','720','1080','auto'].map(value=><option key={value} value={value}>{value==='auto'?'Авто · до 480p':`${value}p${value==='360'?' · экономия трафика':''}`}</option>)}</Select></label></div></section>;
}
