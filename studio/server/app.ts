import { Database } from 'bun:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, statSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { z } from 'zod';
import { createInitialDocument, parseDocument, type DesignSpec } from '../src/lib/document';
import { parseTheme, themeSchema, type Theme } from '../src/lib/tokens';
import type { CmsPage, CmsPageSummary, CmsSite, CmsUser } from '../src/lib/cms';
import { isPageSlug, resolveSiteRoute } from '../src/lib/routes';

const BODY_LIMIT = 2_000_000;
const SESSION_SECONDS = 60 * 60 * 24 * 7;
const COOKIE_NAME = 'forma_session';
const nameSchema = z.string().trim().min(1, '名称不能为空').max(100);
const emailSchema = z.string().trim().toLowerCase().email('请输入有效邮箱').max(254);
const passwordSchema = z.string().min(12, '密码至少 12 个字符').max(128, '密码不能超过 128 个字符');
const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, '路径只能使用小写字母、数字和连字符')
  .max(80)
  .refine(isPageSlug, '这个地址由系统保留，请使用其他页面地址');
const revisionSchema = z.number().int().positive();
const credentialsSchema = z
  .object({ email: emailSchema, password: z.string().min(1).max(128) })
  .strict();
const userSchema = z
  .object({ name: nameSchema, email: emailSchema, password: passwordSchema })
  .strict();
const revisionBody = z.object({ revision: revisionSchema }).strict();
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
type UserRow = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  created_at: string;
};
type SiteRow = {
  name: string;
  theme_json: string;
  theme_revision: number;
  published_theme_json: string;
  published_theme_revision: number;
  updated_at: string;
};
type PageRow = {
  id: string;
  title: string;
  slug: string;
  spec_json: string;
  revision: number;
  published_revision: number | null;
  published_slug: string | null;
  published_title: string | null;
  published_spec_json: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  updated_by: string;
  author_name?: string;
  archived: number;
};
export interface CmsAppOptions {
  dbPath?: string;
  origin?: string;
  staticDir?: string;
  secureCookies?: boolean;
}

function userView(row: UserRow): CmsUser {
  return { id: row.id, name: row.name, email: row.email, createdAt: row.created_at };
}
function siteView(row: SiteRow): CmsSite {
  return {
    name: row.name,
    theme: JSON.parse(row.theme_json),
    themeRevision: row.theme_revision,
    publishedThemeRevision: row.published_theme_revision,
    updatedAt: row.updated_at,
  };
}
function pageView(row: PageRow): CmsPage {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    spec: JSON.parse(row.spec_json),
    revision: row.revision,
    publishedRevision: row.published_revision,
    publishedSlug: row.published_slug,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.author_name ?? '',
    archived: Boolean(row.archived),
  };
}
function pageSummary(row: PageRow): CmsPageSummary {
  const { spec: _spec, ...summary } = pageView(row);
  return summary;
}
function digest(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
function json(data: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
  });
}
async function body(request: Request): Promise<unknown> {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > BODY_LIMIT) throw new HttpError(413, '请求内容不能超过 2 MB');
  if (!request.body) return {};
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > BODY_LIMIT) {
      await reader.cancel();
      throw new HttpError(413, '请求内容不能超过 2 MB');
    }
    chunks.push(value);
  }
  if (!size) return {};
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, '请求不是有效 JSON');
  }
}

/** A single-site CMS. The factory owns its SQLite handle; importing it never starts a listener. */
export function createCmsApp(options: CmsAppOptions = {}) {
  const dbPath = options.dbPath ?? resolve('data/forma.sqlite');
  if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true, mode: 0o700 });
  const db = new Database(dbPath, { create: true });
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS site (
      id INTEGER PRIMARY KEY CHECK (id = 1), name TEXT NOT NULL, theme_json TEXT NOT NULL, theme_revision INTEGER NOT NULL,
      published_theme_json TEXT NOT NULL, published_theme_revision INTEGER NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, spec_json TEXT NOT NULL, revision INTEGER NOT NULL,
      published_revision INTEGER, published_slug TEXT UNIQUE, published_title TEXT, published_spec_json TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT,
      updated_by TEXT NOT NULL REFERENCES users(id), archived INTEGER NOT NULL DEFAULT 0
    );
  `);
  // Convert both theme snapshots together. Revisions, timestamps, page data and
  // publication state remain untouched: a schema migration is not a publish.
  try {
    db.transaction(() => {
      const version = db
        .query<{ user_version: number }, []>('PRAGMA user_version')
        .get()!.user_version;
      if (version > 2) throw new Error('数据库版本较新，请使用匹配的应用版本');
      const site = db.query<SiteRow, []>('SELECT * FROM site WHERE id = 1').get();
      if (site) {
        const draft = JSON.stringify(parseTheme(JSON.parse(site.theme_json)));
        const published = JSON.stringify(parseTheme(JSON.parse(site.published_theme_json)));
        if (draft !== site.theme_json || published !== site.published_theme_json) {
          db.query('UPDATE site SET theme_json = ?, published_theme_json = ? WHERE id = 1').run(
            draft,
            published,
          );
        }
      }
      db.exec('PRAGMA user_version = 2');
    }).immediate();
  } catch (error) {
    db.close();
    throw new Error(
      `全站主题迁移失败：${error instanceof Error ? error.message : '主题格式无效'}`,
      { cause: error },
    );
  }
  const configuredOrigin = options.origin ? new URL(options.origin).origin : null;
  const staticRoot = options.staticDir ? resolve(options.staticDir) : null;
  const rates = new Map<string, { count: number; expires: number }>();
  function rateLimit(key: string, max: number) {
    const now = Date.now();
    for (const [entry, record] of rates) if (record.expires <= now) rates.delete(entry);
    if (rates.size >= 10_000 && !rates.has(key))
      throw new HttpError(429, '请求过于频繁，请稍后重试');
    const record = rates.get(key) ?? { count: 0, expires: now + 15 * 60_000 };
    record.count += 1;
    rates.set(key, record);
    if (record.count > max) throw new HttpError(429, '尝试次数过多，请在 15 分钟后重试');
  }
  function needsSetup() {
    return !db.query('SELECT id FROM users LIMIT 1').get();
  }
  function siteRow() {
    const row = db.query<SiteRow, []>('SELECT * FROM site WHERE id = 1').get();
    if (!row) throw new HttpError(409, '请先完成网站初始化');
    return row;
  }
  function sessionToken(request: Request) {
    return (
      request.headers
        .get('cookie')
        ?.split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${COOKIE_NAME}=`))
        ?.slice(COOKIE_NAME.length + 1) ?? ''
    );
  }
  function currentUser(request: Request) {
    const token = sessionToken(request);
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    return db
      .query<UserRow, [string, number]>(
        'SELECT u.* FROM users u JOIN sessions s ON s.user_id = u.id WHERE s.token_hash = ? AND s.expires_at > ?',
      )
      .get(digest(token), Date.now());
  }
  function requireUser(request: Request) {
    const user = currentUser(request);
    if (!user) throw new HttpError(401, '请先登录');
    return user;
  }
  function cookie(request: Request, token: string, maxAge = SESSION_SECONDS) {
    const secure =
      options.secureCookies ??
      (configuredOrigin
        ? configuredOrigin.startsWith('https:')
        : new URL(request.url).protocol === 'https:');
    return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  }
  function issueSession(request: Request, userId: string) {
    const token = randomBytes(32).toString('hex');
    db.query('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    db.query('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').run(
      digest(token),
      userId,
      Date.now() + SESSION_SECONDS * 1000,
    );
    return cookie(request, token);
  }
  function writeGuard(request: Request) {
    if (
      request.headers.get('x-forma-request') !== '1' ||
      request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json'
    ) {
      throw new HttpError(403, '请求来源校验失败');
    }
    const origin = request.headers.get('origin');
    const expected = configuredOrigin ?? new URL(request.url).origin;
    // Cross-origin browsers cannot send the custom header without a preflight; no CORS is enabled.
    if (origin && origin !== expected) throw new HttpError(403, '不允许跨站修改内容');
    const fetchSite = request.headers.get('sec-fetch-site');
    if (fetchSite === 'cross-site') throw new HttpError(403, '不允许跨站修改内容');
  }
  function pageRow(id: string) {
    const row = db
      .query<PageRow, [string]>(
        'SELECT p.*, u.name AS author_name FROM pages p JOIN users u ON p.updated_by = u.id WHERE p.id = ?',
      )
      .get(id);
    if (!row) throw new HttpError(404, '页面不存在');
    return row;
  }
  function availableSlug(slug: string, exceptId = '') {
    const existing = db
      .query<{ id: string }, [string, string, string]>(
        'SELECT id FROM pages WHERE id != ? AND (slug = ? OR published_slug = ?) LIMIT 1',
      )
      .get(exceptId, slug, slug);
    if (existing) throw new HttpError(409, '页面路径已被使用，请换一个路径');
  }
  function assertRevision(row: PageRow, revision: number) {
    if (row.revision !== revision)
      throw new HttpError(409, '页面已被其他管理员修改。请先重新载入，再合并你的修改');
  }
  function createPage(title: string, slug: string, spec: DesignSpec, userId: string) {
    nameSchema.parse(title);
    slugSchema.parse(slug);
    availableSlug(slug);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.query(
      'INSERT INTO pages (id,title,slug,spec_json,revision,created_at,updated_at,updated_by) VALUES (?,?,?,?,1,?,?,?)',
    ).run(id, title, slug, JSON.stringify(spec), now, now, userId);
    return pageView(pageRow(id));
  }
  async function handleApi(request: Request, url: URL, clientId: string) {
    const path = url.pathname.slice(4).replace(/\/$/, '') || '/';
    const method = request.method;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) writeGuard(request);
    if (path === '/') throw new HttpError(404, '接口不存在');
    if (method === 'GET' && path === '/auth/session') {
      const user = currentUser(request);
      return json({ user: user ? userView(user) : null, needsSetup: needsSetup() });
    }
    if (method === 'POST' && path === '/auth/setup') {
      if (!needsSetup()) throw new HttpError(409, '网站已初始化，请登录');
      rateLimit(`setup:${clientId}`, 5);
      const input = userSchema.extend({ siteName: nameSchema }).parse(await body(request));
      const hash = await Bun.password.hash(input.password, {
        algorithm: 'argon2id',
        memoryCost: 19_456,
        timeCost: 2,
      });
      const user = db
        .transaction(() => {
          if (!needsSetup()) throw new HttpError(409, '网站已初始化，请登录');
          const id = crypto.randomUUID();
          const now = new Date().toISOString();
          db.query('INSERT INTO users VALUES (?,?,?,?,?)').run(
            id,
            input.name,
            input.email,
            hash,
            now,
          );
          const document = createInitialDocument();
          const theme = JSON.stringify(document.theme);
          db.query('INSERT INTO site VALUES (1,?,?,1,?,1,?)').run(
            input.siteName,
            theme,
            theme,
            now,
          );
          createPage('首页', 'home', document.spec, id);
          return db.query<UserRow, [string]>('SELECT * FROM users WHERE id = ?').get(id)!;
        })
        .immediate();
      return json({ user: userView(user) }, 201, { 'Set-Cookie': issueSession(request, user.id) });
    }
    if (method === 'POST' && path === '/auth/login') {
      rateLimit(`login-ip:${clientId}`, 40);
      const input = credentialsSchema.parse(await body(request));
      rateLimit(`login-email:${input.email}`, 15);
      const user = db
        .query<UserRow, [string]>('SELECT * FROM users WHERE email = ?')
        .get(input.email);
      // Unknown accounts still perform a password hash, avoiding an immediate timing distinction.
      let valid = false;
      if (user) valid = await Bun.password.verify(input.password, user.password_hash);
      else
        await Bun.password.hash(input.password, {
          algorithm: 'argon2id',
          memoryCost: 19_456,
          timeCost: 2,
        });
      if (!user || !valid) throw new HttpError(401, '邮箱或密码不正确');
      // A password change may have completed while the asynchronous hash was verified.
      const latestUser = db
        .query<UserRow, [string]>('SELECT * FROM users WHERE id = ?')
        .get(user.id);
      if (latestUser?.password_hash !== user.password_hash)
        throw new HttpError(401, '邮箱或密码不正确');
      rates.delete(`login-email:${input.email}`);
      return json({ user: userView(user) }, 200, { 'Set-Cookie': issueSession(request, user.id) });
    }
    if (method === 'POST' && path === '/auth/logout') {
      const token = sessionToken(request);
      if (token) db.query('DELETE FROM sessions WHERE token_hash = ?').run(digest(token));
      return json({ ok: true }, 200, { 'Set-Cookie': cookie(request, '', 0) });
    }
    const publicMatch = path.match(/^\/public\/pages\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
    if (method === 'GET' && publicMatch && isPageSlug(publicMatch[1])) {
      const page = db
        .query<PageRow, [string]>(
          'SELECT * FROM pages WHERE published_slug = ? AND archived = 0 AND published_revision IS NOT NULL',
        )
        .get(publicMatch[1]);
      if (!page) throw new HttpError(404, '这个页面尚未发布或已经下线');
      const site = siteRow();
      return json({
        document: {
          version: 2,
          name: page.published_title,
          spec: JSON.parse(page.published_spec_json!),
          theme: JSON.parse(site.published_theme_json),
        },
        publishedAt: page.published_at,
      });
    }
    if (path === '/public' || path.startsWith('/public/'))
      throw new HttpError(404, '这个页面尚未发布或已经下线');
    const user = requireUser(request);
    if (method === 'POST' && path === '/auth/password') {
      const input = z
        .object({ currentPassword: z.string().min(1).max(128), password: passwordSchema })
        .strict()
        .parse(await body(request));
      rateLimit(`password:${user.id}`, 10);
      if (!(await Bun.password.verify(input.currentPassword, user.password_hash)))
        throw new HttpError(400, '当前密码不正确');
      const hash = await Bun.password.hash(input.password, {
        algorithm: 'argon2id',
        memoryCost: 19_456,
        timeCost: 2,
      });
      db.transaction(() => {
        const latestUser = db
          .query<UserRow, [string]>('SELECT * FROM users WHERE id = ?')
          .get(user.id);
        if (latestUser?.password_hash !== user.password_hash)
          throw new HttpError(409, '密码已在其他会话中修改，请重新登录');
        db.query('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
        db.query('DELETE FROM sessions WHERE user_id = ?').run(user.id);
      }).immediate();
      return json({ ok: true }, 200, { 'Set-Cookie': issueSession(request, user.id) });
    }
    if (method === 'GET' && path === '/site') return json(siteView(siteRow()));
    if (method === 'PUT' && path === '/site/theme') {
      const input = z
        .object({ theme: themeSchema, revision: revisionSchema })
        .strict()
        .parse(await body(request));
      return json(
        db
          .transaction(() => {
            const site = siteRow();
            if (site.theme_revision !== input.revision)
              throw new HttpError(409, '全站主题已被其他管理员修改，请先重新载入');
            db.query(
              'UPDATE site SET theme_json = ?, theme_revision = theme_revision + 1, updated_at = ? WHERE id = 1',
            ).run(JSON.stringify(input.theme), new Date().toISOString());
            return siteView(siteRow());
          })
          .immediate(),
      );
    }
    if (method === 'POST' && path === '/site/theme/publish') {
      const input = revisionBody.parse(await body(request));
      return json(
        db
          .transaction(() => {
            const site = siteRow();
            if (site.theme_revision !== input.revision)
              throw new HttpError(409, '全站主题已被其他管理员修改，请先重新载入');
            db.query(
              'UPDATE site SET published_theme_json = theme_json, published_theme_revision = theme_revision, updated_at = ? WHERE id = 1',
            ).run(new Date().toISOString());
            return siteView(siteRow());
          })
          .immediate(),
      );
    }
    if (method === 'GET' && path === '/users')
      return json({
        users: db.query<UserRow, []>('SELECT * FROM users ORDER BY created_at').all().map(userView),
      });
    if (method === 'POST' && path === '/users') {
      const input = userSchema.parse(await body(request));
      const hash = await Bun.password.hash(input.password, {
        algorithm: 'argon2id',
        memoryCost: 19_456,
        timeCost: 2,
      });
      if (db.query('SELECT id FROM users WHERE email = ?').get(input.email))
        throw new HttpError(409, '此邮箱已经是管理员');
      const id = crypto.randomUUID();
      db.query('INSERT INTO users VALUES (?,?,?,?,?)').run(
        id,
        input.name,
        input.email,
        hash,
        new Date().toISOString(),
      );
      return json(
        {
          user: userView(db.query<UserRow, [string]>('SELECT * FROM users WHERE id = ?').get(id)!),
        },
        201,
      );
    }
    if (method === 'GET' && path === '/pages') {
      const archived = url.searchParams.get('archived') === '1' ? 1 : 0;
      const rows = db
        .query<PageRow, [number]>(
          'SELECT p.*, u.name AS author_name FROM pages p JOIN users u ON p.updated_by = u.id WHERE p.archived = ? ORDER BY p.updated_at DESC, p.id',
        )
        .all(archived);
      return json({ pages: rows.map(pageSummary) });
    }
    if (method === 'POST' && path === '/pages') {
      const input = z
        .object({
          title: nameSchema,
          slug: slugSchema,
          template: z.enum(['blank', 'orbit']).default('blank'),
          document: z.unknown().optional(),
        })
        .strict()
        .parse(await body(request));
      const spec =
        input.document !== undefined
          ? parseDocument(input.document).spec
          : input.template === 'orbit'
            ? createInitialDocument().spec
            : {
                root: 'page',
                elements: { page: { type: 'Page' as const, props: {}, children: [] } },
              };
      return json(
        db.transaction(() => createPage(input.title, input.slug, spec, user.id)).immediate(),
        201,
      );
    }
    const pageMatch = path.match(
      /^\/pages\/([a-f0-9-]+)(?:\/(publish|unpublish|duplicate|archive|restore))?$/,
    );
    if (pageMatch) {
      const [, id, action] = pageMatch;
      if (method === 'GET' && !action) return json(pageView(pageRow(id)));
      if (method === 'PUT' && !action) {
        const input = z
          .object({
            title: nameSchema,
            slug: slugSchema,
            spec: z.unknown(),
            revision: revisionSchema,
          })
          .strict()
          .parse(await body(request));
        const parsed = parseDocument({
          version: 2,
          name: input.title,
          theme: JSON.parse(siteRow().theme_json) as Theme,
          spec: input.spec,
        });
        return json(
          db
            .transaction(() => {
              const page = pageRow(id);
              assertRevision(page, input.revision);
              if (page.archived) throw new HttpError(409, '请先恢复归档页面');
              availableSlug(input.slug, id);
              db.query(
                'UPDATE pages SET title = ?, slug = ?, spec_json = ?, revision = revision + 1, updated_at = ?, updated_by = ? WHERE id = ?',
              ).run(
                input.title,
                input.slug,
                JSON.stringify(parsed.spec),
                new Date().toISOString(),
                user.id,
                id,
              );
              return pageView(pageRow(id));
            })
            .immediate(),
        );
      }
      if (method === 'POST' && action === 'duplicate') {
        return json(
          db
            .transaction(() => {
              const page = pageRow(id);
              let n = 2;
              let slug = `${page.slug.slice(0, 71).replace(/-+$/, '')}-copy`;
              while (
                db
                  .query('SELECT id FROM pages WHERE slug = ? OR published_slug = ?')
                  .get(slug, slug)
              )
                slug = `${page.slug.slice(0, 65).replace(/-+$/, '')}-copy-${n++}`;
              return createPage(
                `${page.title.slice(0, 95)} 副本`,
                slug,
                JSON.parse(page.spec_json),
                user.id,
              );
            })
            .immediate(),
          201,
        );
      }
      if (method === 'POST' && action) {
        const input = revisionBody.parse(await body(request));
        return json(
          db
            .transaction(() => {
              const page = pageRow(id);
              assertRevision(page, input.revision);
              const now = new Date().toISOString();
              if (action === 'publish') {
                if (page.archived) throw new HttpError(409, '请先恢复归档页面');
                slugSchema.parse(page.slug);
                availableSlug(page.slug, id);
                db.query(
                  'UPDATE pages SET published_revision = revision, published_slug = slug, published_title = title, published_spec_json = spec_json, published_at = ?, updated_at = ?, updated_by = ? WHERE id = ?',
                ).run(now, now, user.id, id);
              } else if (action === 'unpublish') {
                db.query(
                  'UPDATE pages SET published_revision = NULL, published_slug = NULL, published_title = NULL, published_spec_json = NULL, published_at = NULL, revision = revision + 1, updated_at = ?, updated_by = ? WHERE id = ?',
                ).run(now, user.id, id);
              } else if (action === 'archive') {
                db.query(
                  'UPDATE pages SET archived = 1, published_revision = NULL, published_slug = NULL, published_title = NULL, published_spec_json = NULL, published_at = NULL, revision = revision + 1, updated_at = ?, updated_by = ? WHERE id = ?',
                ).run(now, user.id, id);
              } else if (action === 'restore') {
                db.query(
                  'UPDATE pages SET archived = 0, revision = revision + 1, updated_at = ?, updated_by = ? WHERE id = ?',
                ).run(now, user.id, id);
              }
              return pageView(pageRow(id));
            })
            .immediate(),
        );
      }
    }
    throw new HttpError(404, '接口不存在');
  }
  async function fetch(request: Request, clientId = 'local') {
    try {
      const url = new URL(request.url);
      if (url.pathname === '/api' || url.pathname.startsWith('/api/'))
        return await handleApi(request, url, clientId);
      if (staticRoot && (request.method === 'GET' || request.method === 'HEAD')) {
        let path: string;
        try {
          path = decodeURIComponent(url.pathname);
        } catch {
          throw new HttpError(404, '页面不存在');
        }
        const filePath = resolve(staticRoot, `.${path}`);
        if (filePath !== staticRoot && !filePath.startsWith(`${staticRoot}${sep}`))
          throw new HttpError(404, '文件不存在');
        // Only public build output is served; data/, source files and dotfiles cannot escape this root.
        if (path.split('/').some((segment) => segment.startsWith('.')))
          throw new HttpError(404, '文件不存在');
        const file = Bun.file(filePath);
        if (!path.endsWith('/') && statSync(filePath, { throwIfNoEntry: false })?.isFile())
          return new Response(request.method === 'HEAD' ? null : file, {
            headers: { 'Content-Type': file.type, 'X-Content-Type-Options': 'nosniff' },
          });
        const route = resolveSiteRoute(url.pathname);
        if (route.kind === 'redirect')
          return new Response(null, {
            status: 308,
            headers: { Location: `${route.path}${url.search}`, 'Cache-Control': 'no-cache' },
          });
        if (route.kind === 'page' || route.kind === 'admin' || route.kind === 'local') {
          const index = Bun.file(resolve(staticRoot, 'index.html'));
          const published =
            route.kind !== 'page' ||
            db
              .query(
                'SELECT id FROM pages WHERE published_slug = ? AND archived = 0 AND published_revision IS NOT NULL',
              )
              .get(route.slug);
          if (await index.exists())
            return new Response(request.method === 'HEAD' ? null : index, {
              status: published ? 200 : 404,
              headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-cache',
                'X-Content-Type-Options': 'nosniff',
              },
            });
        }
      }
      throw new HttpError(404, '页面不存在');
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      if (error instanceof z.ZodError)
        return json({ error: error.issues[0]?.message ?? '数据格式无效' }, 400);
      if (error instanceof Error && error.message.includes('UNIQUE constraint'))
        return json({ error: '邮箱或页面路径已经被使用' }, 409);
      if (
        error instanceof Error &&
        /设计|组件|页面须|根节点|循环引用|子组件|节点|文件过大|JSON/.test(error.message)
      )
        return json({ error: error.message }, 400);
      console.error('CMS request failed', error instanceof Error ? error.message : 'unknown');
      return json({ error: '服务器暂时无法完成请求，请稍后重试' }, 500);
    }
  }
  return { fetch, close: () => db.close(), db };
}
