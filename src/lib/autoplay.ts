// Probe without playing audible samples or leaving an audio context open.
export async function probeAudioPlayback(timeout = 250): Promise<boolean> {
  const Context =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!Context) return false;

  let context: AudioContext | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    context = new Context();
    if (context.state === 'running') return true;

    const active = context;

    return await Promise.race([
      active.resume().then(
        () => active.state === 'running',
        () => false
      ),
      new Promise<boolean>(resolve => {
        timer = setTimeout(() => resolve(false), timeout);
      }),
    ]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }
}
