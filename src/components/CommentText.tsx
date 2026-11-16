import type { FunctionalComponent as FC } from 'preact';
import { useCallback, useMemo, useState } from 'preact/hooks';

import { Icon } from '~/ui';

function textOnly(value: string) {
  return value.replace(/\[\/?(?:ж|b|i|u|s|к|цитата|quote|url)(?:=[^\]]*)?\]/gi, '');
}

type TSpoilerProps = { text: string };

const Spoiler: FC<TSpoilerProps> = ({ text }) => {
  const [visible, setVisible] = useState(false);
  const reveal = useCallback(() => setVisible(true), []);

  return visible ? (
    <span class="revealed-spoiler">{textOnly(text)}</span>
  ) : (
    <button type="button" class="inline-spoiler" onClick={reveal} aria-label="Показать спойлер">
      <Icon name="bookmark" size={13} />
      Спойлер · показать
    </button>
  );
};

export type TCommentTextProps = { text: string };

export const CommentText: FC<TCommentTextProps> = ({ text }) => {
  const parts = useMemo(() => {
    const pattern = /\[(?:спойлер|spoiler)(?:=[^\]]*)?\]([\s\S]*?)\[\/(?:спойлер|spoiler)\]/gi;
    const parts: { value: string; spoiler: boolean }[] = [];
    let cursor = 0;

    for (const match of text.matchAll(pattern)) {
      parts.push(
        { value: text.slice(cursor, match.index), spoiler: false },
        { value: match[1], spoiler: true }
      );
      cursor = match.index! + match[0].length;
    }
    parts.push({ value: text.slice(cursor), spoiler: false });

    return parts;
  }, [text]);

  return (
    <div class="comment-text">
      {parts.map((part, index) =>
        part.spoiler ? (
          <Spoiler key={index} text={part.value} />
        ) : (
          <span key={index}>{textOnly(part.value)}</span>
        )
      )}
    </div>
  );
};
