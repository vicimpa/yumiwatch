export function PlaybackLoader({ label, detail }: { label: string; detail?: string }) {
  return <div class="playback-loader" role="status" aria-live="polite"><span class="playback-spinner" aria-hidden="true"/><strong>{label}</strong>{detail && <small>{detail}</small>}</div>;
}
