import type { PictureInPictureControls } from '~/lib/native-playback';
import { Icon } from '~/ui';

export function PictureInPictureButton({
  pip,
  floating = false,
}: {
  pip: PictureInPictureControls;
  floating?: boolean;
}) {
  return (
    <>
      <button
        class={floating ? 'video-placeholder-pip' : undefined}
        aria-label="Картинка в картинке"
        aria-pressed={pip.active}
        title={pip.active ? 'Вернуть видео в плеер' : 'Картинка в картинке'}
        disabled={pip.pending}
        onClick={pip.toggle}
      >
        <Icon name="pictureInPicture" />
      </button>
      {floating && pip.error && (
        <p class="video-fullscreen-error" role="status">
          {pip.error}
        </p>
      )}
    </>
  );
}
