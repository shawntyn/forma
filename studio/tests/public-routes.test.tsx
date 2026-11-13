import { afterEach, expect, mock, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import CmsApp from '../src/CmsApp';
import { createInitialDocument } from '../src/lib/document';

const originalFetch = globalThis.fetch;
const originalTitle = document.title;
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  window.history.replaceState(null, '', '/');
  document.title = originalTitle;
});

function publishedPage(slug: string) {
  const design = createInitialDocument();
  design.name = slug === 'home' ? '网站首页' : '关于我们';
  design.spec.elements['hero-heading'].props.text = `${design.name}的已发布内容`;
  return { document: design, publishedAt: '2026-11-13T00:00:00Z' };
}
function stubPublished(slug: string) {
  const calls: string[] = [];
  const page = publishedPage(slug);
  globalThis.fetch = mock(async (input: RequestInfo | URL) => {
    const path = String(input); calls.push(path);
    if (path !== `/api/public/pages/${slug}`) throw new Error(`Public view requested an admin endpoint: ${path}`);
    return Response.json(page);
  }) as typeof fetch;
  return { calls, heading: String(page.document.spec.elements['hero-heading'].props.text) };
}

for (const [path, slug] of [['/', 'home'], ['/about', 'about']] as const) {
  test(`anonymous ${path} renders the published page without requesting an administrator session`, async () => {
    const { calls, heading } = stubPublished(slug);
    window.history.replaceState(null, '', path);
    render(<CmsApp />);
    expect((await screen.findByRole('heading', { name: heading })).textContent).toBe(heading);
    expect(calls).toEqual([`/api/public/pages/${slug}`]);
    expect(screen.queryByRole('button', { name: '登录工作空间' })).toBeNull();
    expect(document.querySelectorAll('[data-element-id]')).toHaveLength(0);
    expect(window.location.pathname).toBe(path);
  });
}

for (const [path, expectedHeading] of [['/', '网站即将上线'], ['/about', '页面不存在或已下线']] as const) {
  test(`an unpublished ${path} stays a public unavailable-page view instead of opening the admin login`, async () => {
    const calls: string[] = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return Response.json({ error: '这个页面尚未发布或已经下线' }, { status: 404 });
    }) as typeof fetch;
    window.history.replaceState(null, '', path);
    render(<CmsApp />);
    expect((await screen.findByRole('heading', { name: expectedHeading })).textContent).toBe(expectedHeading);
    expect(calls).toEqual([`/api/public/pages/${path === '/' ? 'home' : 'about'}`]);
    expect(screen.queryByRole('textbox', { name: '邮箱' })).toBeNull();
    expect(screen.getByRole('link', { name: '进入管理后台' }).getAttribute('href')).toBe('/admin');
  });
}

test('/admin alone loads the administrator session and login screen', async () => {
  const calls: string[] = [];
  globalThis.fetch = mock(async (input: RequestInfo | URL) => {
    const path = String(input); calls.push(path);
    if (path !== '/api/auth/session') throw new Error(`Unexpected public request from admin: ${path}`);
    return Response.json({ user: null, needsSetup: false });
  }) as typeof fetch;
  window.history.replaceState(null, '', '/admin');
  render(<CmsApp />);
  expect((await screen.findByRole('button', { name: '登录工作空间' })).textContent).toContain('登录工作空间');
  expect(calls).toEqual(['/api/auth/session']);
  expect(screen.getByRole('textbox', { name: '邮箱' })).toBeTruthy();
  expect(document.querySelector('.cms-published-page')).toBeNull();
});

for (const [oldPath, slug, nextPath] of [['/p/about', 'about', '/about'], ['/p/home', 'home', '/'], ['/home', 'home', '/']] as const) {
  test(`${oldPath} redirects to ${nextPath} while preserving the query and fragment`, async () => {
    const { calls, heading } = stubPublished(slug);
    window.history.replaceState(null, '', `${oldPath}?source=bookmark#features`);
    render(<CmsApp />);
    await screen.findByRole('heading', { name: heading });
    expect(window.location.pathname).toBe(nextPath);
    expect(window.location.search).toBe('?source=bookmark');
    expect(window.location.hash).toBe('#features');
    expect(calls).toEqual([`/api/public/pages/${slug}`]);
    expect(screen.queryByRole('button', { name: '登录工作空间' })).toBeNull();
  });
}

for (const path of ['/unknown/nested', '/INVALID', '/assets']) {
  test(`unknown route ${path} never falls through to administrator authentication`, async () => {
    const fetch = mock(async () => { throw new Error('An invalid route must not request authentication'); });
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
    window.history.replaceState(null, '', path);
    render(<CmsApp />);
    expect((await screen.findByRole('heading', { name: '页面不存在或已下线' })).textContent).toBe('页面不存在或已下线');
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: '返回网站首页' }).getAttribute('href')).toBe('/');
    expect(screen.queryByRole('button', { name: '登录工作空间' })).toBeNull();
  });
}
