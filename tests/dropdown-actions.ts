import { fireEvent, screen, within } from '@testing-library/preact';

export function chooseOption(trigger: HTMLElement, label: string) {
  fireEvent.click(trigger);
  fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: label }));
}
