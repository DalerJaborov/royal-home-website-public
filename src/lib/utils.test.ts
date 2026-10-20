import { describe, expect, it } from 'vitest';
import { getTrpcErrorMessage } from './utils';

describe('public form errors', () => {
  it('translates individual validation issues before joining them', () => {
    const messages: Record<string, string> = { 'Укажите телефон': 'Enter a phone number', 'Укажите имя': 'Enter your name' };
    expect(getTrpcErrorMessage(JSON.stringify([{ message: 'Укажите телефон' }, { message: 'Укажите имя' }]), 'Try again', value => messages[value] ?? value, true)).toBe('Enter a phone number Enter your name');
  });
  it('shows a localized generic error for technical or untranslated runtime failures', () => {
    const translate = (value: string) => value === 'Повторите попытку' ? 'Try again' : value;
    expect(getTrpcErrorMessage('SQL query failed', 'Повторите попытку', translate)).toBe('Try again');
    expect(getTrpcErrorMessage('Unknown server failure', 'Повторите попытку', translate, true)).toBe('Try again');
    expect(getTrpcErrorMessage('{"details":"private"}', 'Повторите попытку', translate)).toBe('Try again');
  });
  it('retains ordinary existing Russian errors with the default identity translator', () => {
    expect(getTrpcErrorMessage('Проверьте номер телефона', 'Повторите попытку')).toBe('Проверьте номер телефона');
  });
});
