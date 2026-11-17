import { afterEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCmsApp } from './app';
import { createInitialDocument } from '../src/lib/document';
import { createTheme, getTokenValue, parseTheme, themeSchema } from '../src/lib/tokens';
import type { CmsPage, CmsSite } from '../src/lib/cms';
import { RESERVED_PAGE_SLUGS } from '../src/lib/routes';
import legacyOrbit from '../tests/fixtures/orbit-v1.forma.json';

const ORIGIN = 'http://localhost:3001';
const password = 'Local-Test-Password-2026';
const applications: ReturnType<typeof createCmsApp>[] = [];
const directories: string[] = [];
afterEach(() => {
  for (const app of applications.splice(0)) app.close();
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});
function app(dbPath = ':memory:') {
  const value = createCmsApp({ dbPath });
  applications.push(value);
  return value;
}
function staticApp() {
  const directory = mkdtempSync(join(tmpdir(), 'forma-routes-'));
  directories.push(directory);
  writeFileSync(
    join(directory, 'index.html'),
    '<!doctype html><div id="root">Public application shell</div>',
  );
  mkdirSync(join(directory, 'assets'));
  writeFileSync(join(directory, 'assets', 'site.js'), 'console.log("site asset");');
  const value = createCmsApp({ dbPath: ':memory:', staticDir: directory });
  applications.push(value);
  return value;
}
function client(server: ReturnType<typeof createCmsApp>) {
  let cookie = '';
  async function call(
    path: string,
    method = 'GET',
    data?: unknown,
    headers: Record<string, string> = {},
  ) {
    const response = await server.fetch(
      new Request(`${ORIGIN}/api${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Forma-Request': '1',
          Origin: ORIGIN,
          ...(cookie ? { Cookie: cookie } : {}),
          ...headers,
        },
        ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
      }),
    );
    const nextCookie = response.headers.get('set-cookie');
    if (nextCookie) cookie = nextCookie.split(';')[0];
    return { status: response.status, headers: response.headers, data: await response.json() };
  }
  return { call, cookie: () => cookie };
}
async function initialized(server = app()) {
  const admin = client(server);
  const setup = await admin.call('/auth/setup', 'POST', {
    siteName: '共同的网站',
    name: '管理员 A',
    email: 'admin@example.test',
    password,
  });
  expect(setup.status).toBe(201);
  const pages = await admin.call('/pages');
  return { server, admin, page: pages.data.pages[0] as CmsPage };
}

describe('single-site CMS authentication and persistence', () => {
  test('initialization is one-time; anonymous clients cannot inspect or mutate drafts or administrators', async () => {
    const server = app();
    const anonymous = client(server);
    expect((await anonymous.call('/auth/session')).data).toEqual({ user: null, needsSetup: true });
    expect((await anonymous.call('/pages')).status).toBe(401);
    const { admin, page } = await initialized(server);
    expect((await anonymous.call(`/pages/${page.id}`)).status).toBe(401);
    expect((await anonymous.call('/users')).status).toBe(401);
    expect(
      (await anonymous.call(`/pages/${page.id}/publish`, 'POST', { revision: 1 })).status,
    ).toBe(401);
    expect(
      (
        await anonymous.call('/auth/setup', 'POST', {
          siteName: 'other',
          name: 'x',
          email: 'x@example.test',
          password,
        })
      ).status,
    ).toBe(409);
    const session = await admin.call('/auth/session');
    expect(session.data.needsSetup).toBe(false);
    expect(session.data.user.name).toBe('管理员 A');
    expect(session.data.user.password_hash).toBeUndefined();
    expect((await anonymous.call('/public/pages/home')).status).toBe(404);
  });

  test('two accounts log in independently and share pages; password changes revoke old sessions', async () => {
    const { server, admin, page } = await initialized();
    const created = await admin.call('/users', 'POST', {
      name: '管理员 B',
      email: 'second@example.test',
      password,
    });
    expect(created.status).toBe(201);
    expect(created.data.user.password_hash).toBeUndefined();
    const second = client(server);
    const oldSession = client(server);
    const login = await second.call('/auth/login', 'POST', {
      email: 'SECOND@example.test',
      password,
    });
    expect(login.status).toBe(200);
    expect(login.headers.get('set-cookie')).toContain('HttpOnly');
    expect(login.headers.get('set-cookie')).toContain('SameSite=Lax');
    expect(login.headers.get('set-cookie')).not.toContain('Secure');
    await oldSession.call('/auth/login', 'POST', { email: 'second@example.test', password });
    expect((await second.call('/pages')).data.pages[0].id).toBe(page.id);
    const changed = await second.call('/auth/password', 'POST', {
      currentPassword: password,
      password: 'Another-Local-Password-2026',
    });
    expect(changed.status).toBe(200);
    expect((await oldSession.call('/pages')).status).toBe(401);
    expect((await second.call('/pages')).status).toBe(200);
    expect((await admin.call('/users')).data.users).toHaveLength(2);
    await second.call('/auth/logout', 'POST');
    expect((await second.call('/pages')).status).toBe(401);
    expect((await admin.call('/pages')).status).toBe(200);
  });

  test('sessions and page drafts survive reopening the database without plaintext passwords or tokens', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'forma-cms-'));
    directories.push(directory);
    const dbPath = join(directory, 'cms.sqlite');
    const first = app(dbPath);
    const { admin, page } = await initialized(first);
    const full = (await admin.call(`/pages/${page.id}`)).data as CmsPage;
    const saved = await admin.call(`/pages/${page.id}`, 'PUT', {
      title: '持久化页面',
      slug: 'persisted',
      spec: full.spec,
      revision: full.revision,
    });
    expect(saved.status).toBe(200);
    const rawUser = first.db
      .query<{ password_hash: string }, []>('SELECT password_hash FROM users')
      .get()!;
    expect(rawUser.password_hash).toStartWith('$argon2id$');
    expect(rawUser.password_hash).not.toContain(password);
    const tokenHash = first.db
      .query<{ token_hash: string }, []>('SELECT token_hash FROM sessions')
      .get()!.token_hash;
    expect(admin.cookie()).not.toContain(tokenHash);
    first.close();
    applications.splice(applications.indexOf(first), 1);
    const reopened = app(dbPath);
    const response = await reopened.fetch(
      new Request(`${ORIGIN}/api/pages`, { headers: { Cookie: admin.cookie() } }),
    );
    expect(response.status).toBe(200);
    const result = (await response.json()) as { pages: CmsPage[] };
    expect(result.pages[0].title).toBe('持久化页面');
    expect(result.pages[0].revision).toBe(2);
  });

  test('write requests reject cross-origin and missing custom headers, and login attempts are limited', async () => {
    const { server, admin, page } = await initialized();
    expect(
      (
        await admin.call(
          `/pages/${page.id}/publish`,
          'POST',
          { revision: 1 },
          { Origin: 'https://other.test' },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await admin.call(
          `/pages/${page.id}/publish`,
          'POST',
          { revision: 1 },
          { 'X-Forma-Request': '' },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await admin.call(
          `/pages/${page.id}/publish`,
          'POST',
          { revision: 1 },
          { 'Content-Type': 'text/plain' },
        )
      ).status,
    ).toBe(403);
    const stranger = client(server);
    for (let n = 0; n < 15; n++)
      expect(
        (
          await stranger.call('/auth/login', 'POST', {
            email: 'admin@example.test',
            password: 'not-the-password',
          })
        ).status,
      ).toBe(401);
    expect(
      (
        await stranger.call('/auth/login', 'POST', {
          email: 'admin@example.test',
          password: 'not-the-password',
        })
      ).status,
    ).toBe(429);
  });
});

describe('DTCG database migration', () => {
  test('migrates legacy draft and published themes independently without publishing or changing content revisions', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'forma-theme-migration-'));
    directories.push(directory);
    const dbPath = join(directory, 'cms.sqlite');
    const first = app(dbPath);
    const { admin, page } = await initialized(first);
    await admin.call(`/pages/${page.id}/publish`, 'POST', { revision: 1 });
    const full = (await admin.call(`/pages/${page.id}`)).data as CmsPage;
    const changed = structuredClone(full.spec);
    changed.elements['hero-heading'].props.text = '尚未发布的内容';
    await admin.call(`/pages/${page.id}`, 'PUT', {
      title: '草稿标题',
      slug: 'home',
      spec: changed,
      revision: 1,
    });
    await admin.call('/pages', 'POST', {
      title: '未发布的新页面',
      slug: 'draft',
      template: 'blank',
    });

    const draftTheme = structuredClone(legacyOrbit.theme);
    draftTheme.tokens.primary = '#123456';
    draftTheme.tokens.radius = '1.25rem';
    const publishedTheme = structuredClone(legacyOrbit.theme);
    publishedTheme.tokens.primary = '#654321';
    const timestamp = '2026-01-02T03:04:05.000Z';
    first.db
      .query(
        'UPDATE site SET theme_json = ?, published_theme_json = ?, theme_revision = 4, published_theme_revision = 2, updated_at = ?',
      )
      .run(JSON.stringify(draftTheme), JSON.stringify(publishedTheme), timestamp);
    first.db.exec('PRAGMA user_version = 1');
    const pagesBefore = first.db.query('SELECT * FROM pages ORDER BY id').all();
    first.close();
    applications.splice(applications.indexOf(first), 1);

    const reopened = app(dbPath);
    expect(
      reopened.db.query<{ user_version: number }, []>('PRAGMA user_version').get()!.user_version,
    ).toBe(2);
    const siteResponse = await reopened.fetch(
      new Request(`${ORIGIN}/api/site`, { headers: { Cookie: admin.cookie() } }),
    );
    expect(siteResponse.status).toBe(200);
    const site = (await siteResponse.json()) as CmsSite;
    expect(site.theme).toEqual(parseTheme(draftTheme));
    expect(site.themeRevision).toBe(4);
    expect(site.publishedThemeRevision).toBe(2);
    expect(site.updatedAt).toBe(timestamp);
    const visitor = client(reopened);
    const published = (await visitor.call('/public/pages/home')).data;
    expect(published.document.version).toBe(2);
    expect(published.document.theme).toEqual(parseTheme(publishedTheme));
    expect(published.document.spec).toEqual(full.spec);
    expect((await visitor.call('/public/pages/draft')).status).toBe(404);
    expect(reopened.db.query('SELECT * FROM pages ORDER BY id').all()).toEqual(pagesBefore);
    const migratedSite = reopened.db.query('SELECT * FROM site').get();
    reopened.close();
    applications.splice(applications.indexOf(reopened), 1);

    const again = app(dbPath);
    expect(again.db.query('SELECT * FROM site').get()).toEqual(migratedSite);
    expect(again.db.query('SELECT * FROM pages ORDER BY id').all()).toEqual(pagesBefore);
  });

  test('a malformed legacy published theme rolls back the entire conversion and database version', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'forma-theme-rollback-'));
    directories.push(directory);
    const dbPath = join(directory, 'cms.sqlite');
    const first = app(dbPath);
    await initialized(first);
    const malformed = structuredClone(legacyOrbit.theme);
    malformed.tokens.primary = 'red; background:url(https://example.test)';
    first.db
      .query('UPDATE site SET theme_json = ?, published_theme_json = ?')
      .run(JSON.stringify(legacyOrbit.theme), JSON.stringify(malformed));
    first.db.exec('PRAGMA user_version = 1');
    const before = first.db.query('SELECT * FROM site').get();
    first.close();
    applications.splice(applications.indexOf(first), 1);
    expect(() => createCmsApp({ dbPath })).toThrow('主题迁移失败');
    const stored = new Database(dbPath, { readonly: true });
    try {
      expect(stored.query('SELECT * FROM site').get()).toEqual(before);
      expect(
        stored.query<{ user_version: number }, []>('PRAGMA user_version').get()!.user_version,
      ).toBe(1);
    } finally {
      stored.close();
    }
  });
});

describe('page and global theme publication boundaries', () => {
  test('theme writes accept only the current DTCG profile and reject legacy, unknown, untyped and executable values', async () => {
    const { admin } = await initialized();
    const source = createTheme();
    const invalidThemes: unknown[] = [legacyOrbit.theme];
    // These fixtures intentionally violate the validated Theme contract.
    type InvalidThemeFixture = {
      tokens: {
        semantic: {
          color: { action: Record<string, unknown> };
          font: { family: Record<string, unknown> };
          radius: { control: Record<string, unknown> };
        };
      };
    };
    for (const mutate of [
      (theme: InvalidThemeFixture) => {
        theme.tokens.semantic.color.action.style = { color: 'red' };
      },
      (theme: InvalidThemeFixture) => {
        theme.tokens.semantic.color.action.$type = 'dimension';
      },
      (theme: InvalidThemeFixture) => {
        theme.tokens.semantic.color.action.$value = '{semantic.color.missing}';
      },
      (theme: InvalidThemeFixture) => {
        theme.tokens.semantic.color.action.$value = { $function: '() => "red"' };
      },
      (theme: InvalidThemeFixture) => {
        theme.tokens.semantic.font.family.$value = 'serif; background:url(https://example.test)';
      },
      (theme: InvalidThemeFixture) => {
        theme.tokens.semantic.radius.control.$value = { value: 99, unit: 'rem' };
      },
    ]) {
      const theme = structuredClone(source) as unknown as InvalidThemeFixture;
      mutate(theme);
      invalidThemes.push(theme);
    }
    for (const theme of invalidThemes) {
      expect((await admin.call('/site/theme', 'PUT', { theme, revision: 1 })).status).toBe(400);
    }
    const unchanged = (await admin.call('/site')).data as CmsSite;
    expect(unchanged.theme).toEqual(source);
    expect(unchanged.themeRevision).toBe(1);
    const saved = await admin.call('/site/theme', 'PUT', {
      theme: createTheme('blue', 'dark'),
      revision: 1,
    });
    expect(saved.status).toBe(200);
    expect(saved.data.theme.version).toBe(2);
    expect(themeSchema.safeParse(saved.data.theme).success).toBe(true);
  });

  test('invalid public paths return a public 404 without requiring an administrator login', async () => {
    const visitor = client(app());
    for (const path of [
      '/public/pages/invalid/slug',
      '/public/pages/INVALID',
      '/public/pages',
      '/public/unknown',
    ]) {
      const result = await visitor.call(path);
      expect(result.status).toBe(404);
      expect(result.data.error).not.toContain('登录');
    }
  });

  test('content is a draft until explicitly published; global theme has its own published snapshot', async () => {
    const { server, admin, page } = await initialized();
    const visitor = client(server);
    const full = (await admin.call(`/pages/${page.id}`)).data as CmsPage;
    expect((await visitor.call('/public/pages/home')).status).toBe(404);
    expect((await admin.call(`/pages/${page.id}/publish`, 'POST', { revision: 1 })).status).toBe(
      200,
    );
    const before = await visitor.call('/public/pages/home');
    expect(before.status).toBe(200);
    expect(before.headers.get('cache-control')).toBe('no-store');
    const spec = structuredClone(full.spec);
    spec.elements['hero-heading'].props.text = '仅草稿可见的标题';
    const saved = await admin.call(`/pages/${page.id}`, 'PUT', {
      title: '新首页',
      slug: 'home',
      spec,
      revision: 1,
    });
    expect(saved.data.revision).toBe(2);
    expect(saved.data.publishedRevision).toBe(1);
    expect(
      (await visitor.call('/public/pages/home')).data.document.spec.elements['hero-heading'].props
        .text,
    ).toBe(before.data.document.spec.elements['hero-heading'].props.text);
    const site = (await admin.call('/site')).data as CmsSite;
    expect(
      (
        await admin.call('/site/theme', 'PUT', {
          theme: createTheme('emerald'),
          revision: site.themeRevision,
        })
      ).status,
    ).toBe(200);
    expect(
      getTokenValue(
        (await visitor.call('/public/pages/home')).data.document.theme,
        'semantic.color.action',
      ),
    ).toEqual(getTokenValue(createTheme(), 'semantic.color.action'));
    expect((await admin.call(`/pages/${page.id}/publish`, 'POST', { revision: 2 })).status).toBe(
      200,
    );
    expect(
      (await visitor.call('/public/pages/home')).data.document.spec.elements['hero-heading'].props
        .text,
    ).toBe('仅草稿可见的标题');
    expect(
      getTokenValue(
        (await visitor.call('/public/pages/home')).data.document.theme,
        'semantic.color.action',
      ),
    ).toEqual(getTokenValue(createTheme(), 'semantic.color.action'));
    expect((await admin.call('/site/theme/publish', 'POST', { revision: 2 })).status).toBe(200);
    expect(
      getTokenValue(
        (await visitor.call('/public/pages/home')).data.document.theme,
        'semantic.color.action',
      ),
    ).toEqual(getTokenValue(createTheme('emerald'), 'semantic.color.action'));
  });

  test('optimistic revisions prevent silent overwrites by another administrator for pages and theme', async () => {
    const { admin, page } = await initialized();
    const full = (await admin.call(`/pages/${page.id}`)).data as CmsPage;
    const payload = { title: '保存 A', slug: 'home', spec: full.spec, revision: 1 };
    expect((await admin.call(`/pages/${page.id}`, 'PUT', payload)).status).toBe(200);
    const stale = await admin.call(`/pages/${page.id}`, 'PUT', { ...payload, title: '保存 B' });
    expect(stale.status).toBe(409);
    expect((await admin.call(`/pages/${page.id}`)).data.title).toBe('保存 A');
    expect((await admin.call(`/pages/${page.id}/publish`, 'POST', { revision: 1 })).status).toBe(
      409,
    );
    expect(
      (await admin.call('/site/theme', 'PUT', { theme: createTheme('blue'), revision: 1 })).status,
    ).toBe(200);
    expect(
      (await admin.call('/site/theme', 'PUT', { theme: createTheme('emerald'), revision: 1 }))
        .status,
    ).toBe(409);
    expect((await admin.call('/site/theme/publish', 'POST', { revision: 1 })).status).toBe(409);
  });

  test('old published URLs stay reserved through a draft rename and move only at publication', async () => {
    const { server, admin, page } = await initialized();
    const visitor = client(server);
    const full = (await admin.call(`/pages/${page.id}`)).data as CmsPage;
    await admin.call(`/pages/${page.id}/publish`, 'POST', { revision: 1 });
    await admin.call(`/pages/${page.id}`, 'PUT', {
      title: '改名',
      slug: 'welcome',
      spec: full.spec,
      revision: 1,
    });
    expect((await visitor.call('/public/pages/home')).status).toBe(200);
    expect((await visitor.call('/public/pages/welcome')).status).toBe(404);
    expect(
      (await admin.call('/pages', 'POST', { title: '抢路径', slug: 'home', template: 'blank' }))
        .status,
    ).toBe(409);
    await admin.call(`/pages/${page.id}/publish`, 'POST', { revision: 2 });
    expect((await visitor.call('/public/pages/home')).status).toBe(404);
    expect((await visitor.call('/public/pages/welcome')).status).toBe(200);
    expect(
      (await admin.call('/pages', 'POST', { title: '新首页', slug: 'home', template: 'blank' }))
        .status,
    ).toBe(201);
  });

  test('duplicate starts unpublished; archive unpublishes and restoration does not publish automatically', async () => {
    const { server, admin, page } = await initialized();
    const visitor = client(server);
    await admin.call(`/pages/${page.id}/publish`, 'POST', { revision: 1 });
    const copy = await admin.call(`/pages/${page.id}/duplicate`, 'POST');
    expect(copy.status).toBe(201);
    expect(copy.data.publishedRevision).toBeNull();
    expect(copy.data.slug).not.toBe('home');
    const archive = await admin.call(`/pages/${page.id}/archive`, 'POST', { revision: 1 });
    expect(archive.data.archived).toBe(true);
    expect((await visitor.call('/public/pages/home')).status).toBe(404);
    expect((await admin.call('/pages')).data.pages).toHaveLength(1);
    expect((await admin.call('/pages?archived=1')).data.pages[0].id).toBe(page.id);
    const restored = await admin.call(`/pages/${page.id}/restore`, 'POST', {
      revision: archive.data.revision,
    });
    expect(restored.data.archived).toBe(false);
    expect(restored.data.publishedRevision).toBeNull();
    expect((await visitor.call('/public/pages/home')).status).toBe(404);
  });

  test('duplicating a long slug preserves a routable public path after truncation', async () => {
    const { server, admin } = await initialized();
    const visitor = client(server);
    const slug = `${'a'.repeat(70)}-suffix`;
    const created = await admin.call('/pages', 'POST', {
      title: '长路径',
      slug,
      template: 'blank',
    });
    expect(created.status).toBe(201);
    const copied = await admin.call(`/pages/${created.data.id}/duplicate`, 'POST');
    expect(copied.status).toBe(201);
    expect(copied.data.slug).not.toContain('--');
    expect(copied.data.slug.length).toBeLessThanOrEqual(80);
    await admin.call(`/pages/${copied.data.id}/publish`, 'POST', { revision: 1 });
    expect((await visitor.call(`/public/pages/${copied.data.slug}`)).status).toBe(200);
  });

  test('server rejects per-instance visual escape hatches and arbitrary theme tokens; imports cannot replace site theme', async () => {
    const { admin, page } = await initialized();
    const full = (await admin.call(`/pages/${page.id}`)).data as CmsPage;
    const spec = structuredClone(full.spec);
    spec.elements['hero-primary'].props.className = 'bg-red-500';
    expect(
      (
        await admin.call(`/pages/${page.id}`, 'PUT', {
          title: 'invalid',
          slug: 'home',
          spec,
          revision: 1,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.call(`/pages/${page.id}`, 'PUT', {
          title: 'invalid',
          slug: 'home',
          spec: full.spec,
          revision: 1,
          theme: createTheme('blue'),
        })
      ).status,
    ).toBe(400);
    const theme = createTheme();
    expect(
      (
        await admin.call('/site/theme', 'PUT', {
          theme: { ...theme, tokens: { ...theme.tokens, arbitrary: '#ffffff' } },
          revision: 1,
        })
      ).status,
    ).toBe(400);
    const imported = createInitialDocument();
    imported.theme = createTheme('blue');
    const created = await admin.call('/pages', 'POST', {
      title: '导入',
      slug: 'imported',
      document: imported,
    });
    expect(created.status).toBe(201);
    expect(created.data.theme).toBeUndefined();
    expect((await admin.call('/site')).data.theme).toEqual(createTheme());
    expect((await admin.call(`/pages/${page.id}`)).data.revision).toBe(1);
    const migratedImport = await admin.call('/pages', 'POST', {
      title: '旧格式导入',
      slug: 'legacy-imported',
      document: legacyOrbit,
    });
    expect(migratedImport.status).toBe(201);
    expect(migratedImport.data.spec).toEqual(legacyOrbit.spec);
    expect((await admin.call('/site')).data.theme).toEqual(createTheme());
  });

  test('oversized JSON bodies are rejected before parsing', async () => {
    const { admin } = await initialized();
    const response = await admin.call('/pages', 'POST', {
      title: 'x'.repeat(2_000_000),
      slug: 'huge',
    });
    expect(response.status).toBe(413);
  });
});

describe('root-level website routes', () => {
  test('root and named pages serve anonymous visitors only after publication, including direct refresh and HEAD', async () => {
    const { server, admin, page } = await initialized(staticApp());
    const get = (path: string, method = 'GET') =>
      server.fetch(new Request(`${ORIGIN}${path}`, { method }));
    const before = await get('/');
    expect(before.status).toBe(404);
    expect(before.headers.get('content-type')).toContain('text/html');
    expect(before.headers.get('location')).toBeNull();
    expect(await before.text()).not.toContain('password');
    await admin.call(`/pages/${page.id}/publish`, 'POST', { revision: 1 });
    const about = await admin.call('/pages', 'POST', {
      title: '关于我们',
      slug: 'about',
      template: 'orbit',
    });
    expect((await get('/about')).status).toBe(404);
    await admin.call(`/pages/${about.data.id}/publish`, 'POST', { revision: 1 });
    for (const path of ['/', '/about', '/about?refresh=1']) {
      const response = await get(path);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(await response.text()).toContain('Public application shell');
      const head = await get(path, 'HEAD');
      expect(head.status).toBe(200);
      expect(await head.text()).toBe('');
    }
    const full = (await admin.call(`/pages/${about.data.id}`)).data as CmsPage;
    const privateSpec = structuredClone(full.spec);
    privateSpec.elements['hero-heading'].props.text = '尚未公开的文字';
    await admin.call(`/pages/${full.id}`, 'PUT', {
      title: '内部草稿标题',
      slug: 'about-new',
      spec: privateSpec,
      revision: full.revision,
    });
    expect((await get('/about')).status).toBe(200);
    expect((await get('/about-new')).status).toBe(404);
    const published = await client(server).call('/public/pages/about');
    expect(published.data.document.name).toBe('关于我们');
    expect(published.data.document.spec.elements['hero-heading'].props.text).not.toBe(
      '尚未公开的文字',
    );
    await admin.call(`/pages/${full.id}/archive`, 'POST', { revision: 2 });
    expect((await get('/about')).status).toBe(404);
    expect((await get('/about', 'HEAD')).status).toBe(404);
    expect((await get('/missing-page')).status).toBe(404);
    expect((await client(server).call('/public/pages/about')).status).toBe(404);
  });

  test('old prefixed URLs, homepage aliases and trailing slashes redirect to one canonical path', async () => {
    const server = staticApp();
    const routes = [
      ['/p/home', '/'],
      ['/home', '/'],
      ['/p/about', '/about'],
      ['/p/about/?source=old', '/about?source=old'],
      ['/about/?preview=1', '/about?preview=1'],
      ['/admin/', '/admin'],
    ];
    for (const [path, expected] of routes) {
      const response = await server.fetch(new Request(`${ORIGIN}${path}`));
      expect(response.status).toBe(308);
      expect(response.headers.get('location')).toBe(expected!);
    }
  });

  test('system paths and build assets never resolve as public page content', async () => {
    const server = staticApp();
    for (const path of ['/admin', '/admin/pages/example', '/local']) {
      const response = await server.fetch(new Request(`${ORIGIN}${path}`));
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
    }
    expect((await client(server).call('/pages')).status).toBe(401);
    const asset = await server.fetch(new Request(`${ORIGIN}/assets/site.js`));
    expect(asset.status).toBe(200);
    expect(await asset.text()).toContain('site asset');
    for (const path of [
      '/api',
      '/api/',
      '/assets',
      '/assets/missing.js',
      '/.env',
      '/p/admin',
      '/invalid/nested',
    ]) {
      const response = await server.fetch(new Request(`${ORIGIN}${path}`));
      expect(response.status).toBe(404);
      expect(response.headers.get('content-type')).not.toContain('text/html');
      expect(await response.text()).not.toContain('Public application shell');
    }
  });

  test('reserved addresses cannot be created, renamed to, or published from older stored drafts', async () => {
    const { server, admin, page } = await initialized();
    const full = (await admin.call(`/pages/${page.id}`)).data as CmsPage;
    for (const slug of RESERVED_PAGE_SLUGS) {
      const created = await admin.call('/pages', 'POST', {
        title: '系统路径',
        slug,
        template: 'blank',
      });
      expect(created.status).toBe(400);
      expect(created.data.error).toContain('系统保留');
      const renamed = await admin.call(`/pages/${page.id}`, 'PUT', {
        title: full.title,
        slug,
        spec: full.spec,
        revision: 1,
      });
      expect(renamed.status).toBe(400);
    }
    // A database from before this routing change may already contain such a slug.
    server.db.query('UPDATE pages SET slug = ? WHERE id = ?').run('admin', page.id);
    const published = await admin.call(`/pages/${page.id}/publish`, 'POST', { revision: 1 });
    expect(published.status).toBe(400);
    expect(published.data.error).toContain('系统保留');
    expect((await client(server).call('/public/pages/admin')).status).toBe(404);
    expect((await admin.call(`/pages/${page.id}`)).data.publishedRevision).toBeNull();
  });
});
