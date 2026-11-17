import { afterEach, expect, mock, test } from 'bun:test';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CmsApp from '../src/CmsApp';
import { createInitialDocument } from '../src/lib/document';
import type { CmsPage, CmsSite, CmsUser } from '../src/lib/cms';

const originalFetch = globalThis.fetch;
const originalFormData = globalThis.FormData;
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  globalThis.FormData = originalFormData;
  window.history.replaceState(null, '', '/');
});

test('session expiry preserves the mounted editor and its unsaved document through reauthentication', async () => {
  const design = createInitialDocument();
  const user: CmsUser = {
    id: 'admin-a',
    name: '管理员 A',
    email: 'admin@example.test',
    createdAt: '2026-11-13T00:00:00Z',
  };
  const site: CmsSite = {
    name: '共同的网站',
    theme: design.theme,
    themeRevision: 1,
    publishedThemeRevision: 1,
    updatedAt: user.createdAt,
  };
  const page: CmsPage = {
    id: 'page-a',
    title: '原始页面',
    slug: 'home',
    spec: design.spec,
    revision: 1,
    publishedRevision: null,
    publishedSlug: null,
    publishedAt: null,
    createdAt: user.createdAt,
    updatedAt: user.createdAt,
    updatedBy: user.name,
    archived: false,
  };
  const saves: { title: string; revision: number }[] = [];
  let pageReads = 0;
  let logins = 0;
  globalThis.FormData = (window as unknown as { FormData: typeof FormData }).FormData;
  globalThis.fetch = Object.assign(
    mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.pathname
            : new URL(input.url).pathname;
      if (path === '/api/auth/session') return Response.json({ user, needsSetup: false });
      if (path === '/api/site') return Response.json(site);
      if (path === '/api/pages/page-a' && init?.method === 'GET') {
        pageReads++;
        return Response.json(page);
      }
      if (path === '/api/pages/page-a' && init?.method === 'PUT') {
        const payload = JSON.parse(String(init.body));
        saves.push(payload);
        if (saves.length === 1) return Response.json({ error: '请先登录' }, { status: 401 });
        return Response.json({ ...page, title: payload.title, spec: payload.spec, revision: 2 });
      }
      if (path === '/api/auth/login') {
        logins++;
        expect(JSON.parse(String(init?.body))).toEqual({
          email: user.email,
          password: 'Test-Password-2026',
        });
        return Response.json({ user });
      }
      throw new Error(`Unexpected request: ${init?.method} ${path}`);
    }),
    { preconnect: originalFetch.preconnect },
  );
  window.history.replaceState(null, '', '/admin/pages/page-a');
  const input = userEvent.setup({ document });
  render(<CmsApp />);
  const title = (await screen.findByRole('textbox', { name: '项目名称' })) as HTMLInputElement;
  await input.clear(title);
  await input.type(title, '尚未保存的重要页面');
  await input.click(screen.getByRole('button', { name: '保存草稿' }));
  const login = await screen.findByRole('dialog', { name: '重新登录，继续编辑' });
  expect(saves).toHaveLength(1);
  expect(saves[0]).toMatchObject({ title: '尚未保存的重要页面', revision: 1 });
  expect(title.isConnected).toBe(true);
  expect(title.value).toBe('尚未保存的重要页面');
  await input.type(within(login).getByLabelText('密码'), 'Test-Password-2026');
  await input.click(within(login).getByRole('button', { name: '重新登录' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: '重新登录，继续编辑' })).toBeNull(),
  );
  expect(logins).toBe(1);
  expect(pageReads).toBe(1);
  expect(screen.getByRole('textbox', { name: '项目名称' })).toBe(title);
  expect(title.value).toBe('尚未保存的重要页面');
  expect(screen.getByRole('button', { name: '保存草稿' }).hasAttribute('disabled')).toBe(false);
  await input.click(screen.getByRole('button', { name: '保存草稿' }));
  await screen.findByText('草稿已保存到服务器。');
  expect(saves).toHaveLength(2);
  expect(saves[1]).toMatchObject({ title: '尚未保存的重要页面', revision: 1 });
  expect(screen.getByRole('textbox', { name: '项目名称' })).toBe(title);
  expect(screen.getByRole('button', { name: '保存草稿' }).hasAttribute('disabled')).toBe(true);
});
