import { afterEach, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInitialDocument } from '../../lib/document';
import { setTokenValue, hexToColor } from '../../lib/tokens';
import type { CmsPage, CmsSite, CmsUser } from '../../lib/cms';
import { CmsDashboard } from './CmsDashboard';
import { PageLibrary } from './PageLibrary';
import { ThemeWorkspace } from './ThemeWorkspace';

const originalFetch = globalThis.fetch;
const site: CmsSite = { name: '测试网站', theme: createInitialDocument().theme, themeRevision: 3, publishedThemeRevision: 2, updatedAt: '2026-11-13T00:00:00Z' };
const admin: CmsUser = { id: 'admin', name: '编辑者', email: 'admin@example.test', createdAt: '2026-11-13T00:00:00Z' };
const page: CmsPage = { id: 'page_one', title: '产品页面', slug: 'product', revision: 5, publishedRevision: 4, publishedSlug: 'product', createdAt: '2026-11-13T00:00:00Z', updatedAt: '2026-11-13T01:00:00Z', publishedAt: '2026-11-13T00:30:00Z', updatedBy: '编辑者', archived: false, spec: createInitialDocument().spec };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => { cleanup(); globalThis.fetch = originalFetch; localStorage.clear(); });

test('a failed create preserves the page form and does not open the editor', async () => {
  const user = userEvent.setup({ document });
  const edit = mock((_id: string) => {});
  const calls: { path: string; body: unknown }[] = [];
  globalThis.fetch = (async (input, options) => {
    const path = String(input);
    calls.push({ path, body: options?.body ? JSON.parse(String(options.body)) : undefined });
    return options?.method === 'POST' ? json({ error: '页面地址已存在' }, 409) : json({ pages: [page] });
  }) as typeof fetch;
  render(<PageLibrary onEdit={edit} />);
  await screen.findByText('产品页面');
  await user.click(screen.getByRole('button', { name: '新建页面' }));
  const dialog = await screen.findByRole('dialog', { name: '创建一个新页面' });
  const title = within(dialog).getByRole('textbox', { name: '页面名称' });
  await user.clear(title); await user.type(title, '新页面内容');
  const slug = within(dialog).getByRole('textbox', { name: '页面地址' });
  await user.clear(slug); await user.type(slug, 'product');
  fireEvent.submit(within(dialog).getByRole('button', { name: '创建并编辑' }).closest('form')!);
  await screen.findByRole('alert');
  expect((title as HTMLInputElement).value).toBe('新页面内容');
  expect((slug as HTMLInputElement).value).toBe('product');
  expect(edit).toHaveBeenCalledTimes(0);
  expect(calls.at(-1)?.body).toEqual({ title: '新页面内容', slug: 'product', template: 'blank' });
});

test('unsaved shared theme cannot publish and leaving requires a decision', async () => {
  const user = userEvent.setup({ document });
  globalThis.fetch = (async () => json({ pages: [page] })) as unknown as typeof fetch;
  render(<CmsDashboard user={admin} site={site} onEdit={() => {}} onLogout={() => {}} onSiteChange={() => {}} initialSection="theme" />);
  expect((screen.getByRole('button', { name: '发布全站主题' }) as HTMLButtonElement).disabled).toBe(false);
  await user.click(screen.getByRole('button', { name: '应用森林绿主题' }));
  expect((screen.getByRole('button', { name: '发布全站主题' }) as HTMLButtonElement).disabled).toBe(true);
  await user.click(screen.getByRole('button', { name: '页面管理' }));
  await screen.findByRole('dialog', { name: '主题修改还没有保存' });
  await user.click(screen.getByRole('button', { name: '继续编辑' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('heading', { name: '一个网站，一种设计语言。' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: '页面管理' }));
  await user.click(screen.getByRole('button', { name: '放弃修改并离开' }));
  await screen.findByText('产品页面');
  expect(screen.queryByRole('heading', { name: '一个网站，一种设计语言。' })).toBeNull();
});

test('archive requires confirmation and submits the listed revision', async () => {
  const user = userEvent.setup({ document });
  const requests: { path: string; body: unknown }[] = [];
  globalThis.fetch = (async (input, options) => {
    const path = String(input);
    requests.push({ path, body: options?.body ? JSON.parse(String(options.body)) : undefined });
    return options?.method === 'POST' ? json({ ...page, archived: true }) : json({ pages: [page] });
  }) as typeof fetch;
  render(<PageLibrary onEdit={() => {}} />);
  await screen.findByText('产品页面');
  const summary = screen.getByLabelText('更多操作：产品页面');
  await user.click(summary);
  await user.click(screen.getByRole('button', { name: '归档页面' }));
  const dialog = await screen.findByRole('dialog', { name: '归档页面「产品页面」？' });
  expect(requests.filter(request => request.path.endsWith('/archive')).length).toBe(0);
  await user.click(within(dialog).getByRole('button', { name: '归档页面' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(requests.find(request => request.path.endsWith('/archive'))?.body).toEqual({ revision: 5 });
});

test('an external site refresh never advances the revision of an unsaved theme', async () => {
  const user = userEvent.setup({ document });
  const requests: unknown[] = [];
  globalThis.fetch = (async (_input, options) => {
    requests.push(JSON.parse(String(options?.body)));
    return json({ error: '主题已被其他管理员修改，请重新载入' }, 409);
  }) as typeof fetch;
  const onDirtyChange = () => {};
  const onSiteChange = mock((_site: CmsSite) => {});
  const { rerender } = render(<ThemeWorkspace site={site} onDirtyChange={onDirtyChange} onSiteChange={onSiteChange} />);
  await user.click(screen.getByRole('button', { name: '应用森林绿主题' }));
  const newerSite = { ...site, themeRevision: 4, theme: setTokenValue(site.theme, 'semantic.color.action', hexToColor('#3268da')) };
  rerender(<ThemeWorkspace site={newerSite} onDirtyChange={onDirtyChange} onSiteChange={onSiteChange} />);
  await user.click(screen.getByRole('button', { name: '保存主题草稿' }));
  await screen.findByRole('alert');
  expect((requests[0] as { revision: number }).revision).toBe(3);
  expect((screen.getByRole('textbox', { name: /semantic.color.action$/ }) as HTMLInputElement).value).toBe('#188767');
  expect(onSiteChange).toHaveBeenCalledTimes(0);
});

test('page library and main-site entry use canonical published paths', async () => {
  const home: CmsPage = { ...page, id: 'page_home', title: '网站首页', slug: 'home', publishedSlug: 'home' };
  const renamedDraft = { ...page, slug: 'product-next' };
  globalThis.fetch = (async () => json({ pages: [home, renamedDraft] })) as unknown as typeof fetch;
  render(<CmsDashboard user={admin} site={site} onEdit={() => {}} onLogout={() => {}} onSiteChange={() => {}} />);
  await screen.findByText('网站首页');
  expect(screen.getByRole('link', { name: '访问主站' }).getAttribute('href')).toBe('/');
  expect(screen.getByRole('link', { name: '查看 网站首页 的线上页面' }).getAttribute('href')).toBe('/');
  expect(screen.getByRole('link', { name: '查看 产品页面 的线上页面' }).getAttribute('href')).toBe('/product');
  expect(screen.getByText('/product-next')).toBeTruthy();
  expect(screen.queryByText('/p/home')).toBeNull();
});

test('reserved page addresses are rejected before create or rename requests', async () => {
  const user = userEvent.setup({ document });
  const writes: string[] = [];
  globalThis.fetch = (async (input, options) => {
    if (options?.method !== 'GET') writes.push(String(input));
    return String(input) === '/api/pages/page_one' ? json(page) : json({ pages: [page] });
  }) as typeof fetch;
  render(<PageLibrary onEdit={() => {}} />);
  await screen.findByText('产品页面');
  await user.click(screen.getByRole('button', { name: '新建页面' }));
  const create = await screen.findByRole('dialog', { name: '创建一个新页面' });
  const newAddress = within(create).getByRole('textbox', { name: '页面地址' });
  await user.clear(newAddress); await user.type(newAddress, 'admin');
  fireEvent.submit(within(create).getByRole('button', { name: '创建并编辑' }).closest('form')!);
  expect(within(create).getByRole('alert').textContent).toContain('系统保留');
  expect(writes).toHaveLength(0);
  await user.click(within(create).getByRole('button', { name: /^取消$/ }));
  await user.click(screen.getByLabelText('更多操作：产品页面'));
  await user.click(screen.getByRole('button', { name: /^页面信息$/ }));
  const rename = await screen.findByRole('dialog', { name: '页面信息' });
  const address = within(rename).getByRole('textbox', { name: '页面地址' });
  await user.clear(address); await user.type(address, 'api');
  fireEvent.submit(within(rename).getByRole('button', { name: '保存信息' }).closest('form')!);
  expect(within(rename).getByRole('alert').textContent).toContain('系统保留');
  expect((address as HTMLInputElement).value).toBe('api');
  expect(writes).toHaveLength(0);
});
