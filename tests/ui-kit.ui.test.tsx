// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { createRef } from 'preact';

import {
  Button,
  ButtonLink,
  Field,
  Form,
  FormActions,
  Icon,
  Input,
  SearchField,
  SettingsCard,
  Textarea,
  Toggle,
} from '~/ui';

afterEach(cleanup);

it('preserves native form submission, disabled state and link semantics', () => {
  const submit = vi.fn(event => event.preventDefault());
  const click = vi.fn();

  render(
    <form onSubmit={submit}>
      <Button variant="primary" type="submit">
        Сохранить
      </Button>
      <Button disabled onClick={click}>
        Недоступно
      </Button>
      <ButtonLink href="https://example.com/anime" target="_blank" rel="noreferrer" variant="text">
        Открыть аниме
      </ButtonLink>
    </form>
  );

  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  expect(submit).toHaveBeenCalledTimes(1);
  (screen.getByRole('button', { name: 'Недоступно' }) as HTMLButtonElement).click();
  expect(click).not.toHaveBeenCalled();
  expect(screen.getByRole('link', { name: 'Открыть аниме' }).getAttribute('href')).toBe(
    'https://example.com/anime'
  );
});

it('keeps checkbox labels, checked state and native change events', () => {
  const changed = vi.fn();

  render(
    <Toggle checked={false} onChange={event => changed(event.currentTarget.checked)}>
      Показывать просмотр
    </Toggle>
  );

  fireEvent.click(screen.getByRole('checkbox', { name: 'Показывать просмотр' }));
  expect(changed).toHaveBeenCalledExactlyOnceWith(true);
});

it('passes search terms unchanged and disables browser corrections', () => {
  const change = vi.fn();

  render(
    <SearchField value="" label="Найти серию" placeholder="Номер серии" onValueChange={change} />
  );

  const input = screen.getByRole('searchbox', { name: 'Найти серию' }) as HTMLInputElement;

  fireEvent.input(input, { target: { value: '  Сезон 2: Ёжик!?  ' } });
  expect(change).toHaveBeenCalledExactlyOnceWith('  Сезон 2: Ёжик!?  ');
  expect(input.getAttribute('autocomplete')).toBe('off');
  expect(input.getAttribute('autocapitalize')).toBe('none');
});

it('composes settings content without changing its document structure', () => {
  const { container } = render(
    <SettingsCard
      title="Discord"
      description="Твой просмотр"
      icon={<Icon name="play" />}
      class="account-card"
      iconClass="profile-avatar"
    >
      <Toggle checked={true}>Включено</Toggle>
    </SettingsCard>
  );

  expect(
    container.querySelector('section.settings-card.account-card > .settings-icon.profile-avatar')
  ).not.toBeNull();
  expect(screen.getByRole('heading', { name: 'Discord', level: 2 })).toBeTruthy();
  expect(screen.getByText('Твой просмотр').tagName).toBe('P');
  expect((screen.getByRole('checkbox', { name: 'Включено' }) as HTMLInputElement).checked).toBe(
    true
  );
});

it('preserves field focus, native validation and submission from a sheet footer', () => {
  const input = createRef<HTMLInputElement>();
  const form = createRef<HTMLFormElement>();
  const submit = vi.fn(event => event.preventDefault());

  render(
    <>
      <Form id="profile" ref={form} onSubmit={submit}>
        <Field label="Почта">
          <Input ref={input} type="email" required />
        </Field>
      </Form>
      <FormActions>
        <Button type="submit" form="profile">
          Сохранить
        </Button>
      </FormActions>
    </>
  );

  input.current!.focus();
  expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Почта' }));
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  expect(submit).not.toHaveBeenCalled();
  fireEvent.input(input.current!, { target: { value: 'vic@example.com' } });
  expect(form.current!.checkValidity()).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  expect(submit).toHaveBeenCalledOnce();
});

it('links field hints and errors while preserving existing descriptions', () => {
  const content = (error?: string) => (
    <Field label="Имя" hint="От двух символов" error={error}>
      <Input aria-describedby="existing-help" />
    </Field>
  );

  const { rerender } = render(content('Слишком короткое имя'));
  const input = screen.getByRole('textbox', { name: 'Имя' });
  const descriptionIds = input.getAttribute('aria-describedby')!.split(' ');

  expect(descriptionIds[0]).toBe('existing-help');
  expect(descriptionIds.slice(1).map(id => document.getElementById(id)?.textContent)).toEqual([
    'От двух символов',
    'Слишком короткое имя',
  ]);
  expect(input.getAttribute('aria-invalid')).toBe('true');
  rerender(content());
  expect(input.hasAttribute('aria-invalid')).toBe(false);
  expect(screen.queryByRole('alert')).toBeNull();
});

it('forwards textarea refs for focus and spoiler selection', () => {
  const textarea = createRef<HTMLTextAreaElement>();

  render(
    <Field label="Комментарий">
      <Textarea ref={textarea} value="Текст спойлера" />
    </Field>
  );
  textarea.current!.focus();
  textarea.current!.setSelectionRange(6, 13);
  expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Комментарий' }));
  expect(textarea.current!.selectionStart).toBe(6);
  expect(textarea.current!.selectionEnd).toBe(13);
});
