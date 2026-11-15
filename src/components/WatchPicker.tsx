import { Icon } from './Icon';

export function WatchPicker({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return <button aria-haspopup="dialog" aria-label={`${label}: ${value}`} onClick={onClick}><span><small>{label}</small><strong>{value.replace(/^(Озвучка|Плеер) /, '')}</strong></span><Icon name="chevron" size={17}/></button>;
}
