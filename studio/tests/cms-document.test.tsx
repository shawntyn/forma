import { afterEach, describe, expect, mock, test } from 'bun:test';
import { act, cleanup, renderHook } from '@testing-library/react';
import { createInitialDocument, STORAGE_KEY, type DesignDocument } from '../src/lib/document';
import { useDocument } from '../src/lib/use-document';
import legacyOrbit from './fixtures/orbit-v1.forma.json';

afterEach(() => {
  cleanup();
  localStorage.removeItem(STORAGE_KEY);
});

describe('CMS editor document isolation', () => {
  test('the previous local v1 draft opens as v2 and is upgraded on the next explicit edit', () => {
    const stored = JSON.stringify(legacyOrbit);
    localStorage.setItem(STORAGE_KEY, stored);
    const editor = renderHook(() => useDocument());
    expect(editor.result.current.document.version).toBe(2);
    expect(editor.result.current.document.theme.version).toBe(2);
    expect<unknown>(editor.result.current.document.spec).toEqual(legacyOrbit.spec);
    expect(editor.result.current.warning).toBe('');
    expect(localStorage.getItem(STORAGE_KEY)).toBe(stored);
    act(() =>
      editor.result.current.commit({ ...editor.result.current.document, name: '已迁移的本地草稿' }),
    );
    act(() => window.dispatchEvent(new Event('pagehide')));
    const migrated = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(migrated.version).toBe(2);
    expect(migrated.theme.version).toBe(2);
    expect(migrated.spec).toEqual(legacyOrbit.spec);
    editor.unmount();
    const reopened = renderHook(() => useDocument());
    expect(reopened.result.current.document).toEqual(migrated);
    expect(reopened.result.current.warning).toBe('');
  });

  test('remote edits and history notify the CMS without replacing the previous local draft', async () => {
    const local = { ...createInitialDocument(), name: '以前的本地设计' };
    const stored = JSON.stringify(local);
    localStorage.setItem(STORAGE_KEY, stored);
    const remote = { ...createInitialDocument(), name: '服务端页面 A' };
    const changed = mock((_document: DesignDocument) => {});
    const editor = renderHook(() =>
      useDocument({ initialDocument: remote, persist: false, onChange: changed }),
    );
    expect(editor.result.current.document.name).toBe('服务端页面 A');
    expect(changed).toHaveBeenCalledTimes(0);

    act(() =>
      editor.result.current.commit({
        ...editor.result.current.document,
        name: '页面 A 的草稿修改',
      }),
    );
    expect(changed.mock.calls.at(-1)?.[0].name).toBe('页面 A 的草稿修改');
    act(() => editor.result.current.undo());
    expect(changed.mock.calls.at(-1)?.[0].name).toBe('服务端页面 A');
    act(() => editor.result.current.redo());
    expect(changed.mock.calls.at(-1)?.[0].name).toBe('页面 A 的草稿修改');

    // Let the legacy autosave interval elapse, then exercise its flush events.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 450));
    });
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    editor.unmount();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(stored);

    const next = renderHook(() =>
      useDocument({ initialDocument: { ...remote, name: '服务端页面 B' }, persist: false }),
    );
    expect(next.result.current.document.name).toBe('服务端页面 B');
    expect(next.result.current.canUndo).toBe(false);
    expect(next.result.current.canRedo).toBe(false);
  });
});
