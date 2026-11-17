import { render } from 'preact';
import { useState } from 'preact/hooks';
import { Comments } from '~/components/Comments';
import { useVisualViewport } from '~/lib/hooks';
import { saveSession } from '~/lib/session';
import { Sidebar } from '~/ui';

saveSession({
  token: 'comments-probe',
  user: { id: 42, nickname: 'Зритель' },
  remember: false,
  verified: true,
  refreshedAt: Date.now(),
});
function Probe() {
  useVisualViewport();
  const [open, setOpen] = useState(true);
  return (
    <>
      <button onClick={() => setOpen(true)}>Открыть комментарии</button>
      <Sidebar
        open={open}
        title="Комментарии"
        subtitle="Тестовое обсуждение"
        close={() => setOpen(false)}
        className="comments-sidebar"
      >
        <Comments animeId={10531} />
      </Sidebar>
    </>
  );
}
render(<Probe />, document.getElementById('app')!);
