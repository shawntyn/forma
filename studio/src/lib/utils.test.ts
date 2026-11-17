import { describe, expect, test } from 'bun:test';
import { cn } from './utils';

describe('class merging uses the registered Tailwind scales', () => {
  test('keeps typography alongside semantic colors', () => {
    expect(cn('text-body', 'text-muted')).toBe('text-body text-muted');
    expect(cn('text-body text-label', 'text-muted')).toBe('text-label text-muted');
  });
  test('resolves custom scale conflicts without deleting component recipes', () => {
    expect(cn('ds-button', 'p-md', 'p-lg')).toBe('ds-button p-lg');
    expect(cn('rounded-control rounded-surface')).toBe('rounded-surface');
    expect(cn('hidden', 'vp-sm:inline')).toBe('hidden vp-sm:inline');
    expect(cn('p-md', false && 'p-lg', { 'ds-card': true })).toBe('p-md ds-card');
  });
});
