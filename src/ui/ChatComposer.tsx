import type { ComponentChildren, FunctionalComponent as FC, RefObject } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { Button } from './Button';
import { Icon } from './Icon';
import { Textarea } from './Textarea';
import './ChatComposer.css';

export type TChatComposerProps = {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => Promise<void>;
  sending: boolean;
  label: string;
  placeholder: string;
  context?: ComponentChildren;
  tools?: ComponentChildren;
  error?: ComponentChildren;
  className?: string;
  textareaRef?: RefObject<HTMLTextAreaElement>;
};

export const ChatComposer: FC<TChatComposerProps> = ({
  value,
  onValueChange,
  onSubmit,
  sending,
  label,
  placeholder,
  context,
  tools,
  error,
  className = '',
  textareaRef,
}) => {
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const input = textareaRef || ownRef;
  const submitting = useRef(false);
  const wasSending = useRef(sending);
  useLayoutEffect(() => {
    const element = input.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(160, element.scrollHeight)}px`;
  }, [value]);
  useLayoutEffect(() => {
    if (wasSending.current && !sending) input.current?.focus({ preventScroll: true });
    wasSending.current = sending;
  }, [sending]);
  return (
    <form
      class={`chat-composer ${className}`}
      onSubmit={async event => {
        event.preventDefault();
        if (submitting.current || sending || !value.trim() || value.length > 10000) return;
        submitting.current = true;
        try {
          await onSubmit();
        } finally {
          submitting.current = false;
        }
      }}
    >
      {context && <div class="chat-composer-context">{context}</div>}
      {error && (
        <div class="chat-composer-error" role="alert">
          {error}
        </div>
      )}
      <Textarea
        ref={input}
        class="chat-composer-input"
        aria-label={label}
        placeholder={placeholder}
        rows={1}
        maxLength={10000}
        value={value}
        disabled={sending}
        onInput={event => onValueChange(event.currentTarget.value)}
        onKeyDown={event => {
          if (
            event.key === 'Enter' &&
            !event.shiftKey &&
            !event.isComposing &&
            event.keyCode !== 229
          ) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <Button
        type="submit"
        variant="primary"
        disabled={sending || !value.trim() || value.length > 10000}
        aria-busy={sending}
      >
        {sending ? 'Отправляем…' : 'Отправить'}
        <Icon name="arrow" size={16} />
      </Button>
      {tools && <div class="chat-composer-tools">{tools}</div>}
      <small class="message-compose-hint">Enter — отправить · Shift+Enter — новая строка</small>
    </form>
  );
};
