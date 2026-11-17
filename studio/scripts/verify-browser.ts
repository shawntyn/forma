import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { type Browser, chromium, type Page } from 'playwright-core';
import { createCmsApp } from '../server/app';
import type { CmsPage, CmsSite } from '../src/lib/cms';
import { componentDefinitions, createInitialDocument, insertElement } from '../src/lib/document';
import { createTheme, hexToColor, setTokenValue } from '../src/lib/tokens';

// Exercise the production assets against a disposable database. Never connect
// this verifier to an existing CMS or use a real administrator's credentials.
const directory = await mkdtemp(join(tmpdir(), 'forma-browser-'));
const artifacts = resolve(import.meta.dir, '../.reports/browser');
await mkdir(artifacts, { recursive: true });
const app = createCmsApp({
  dbPath: join(directory, 'test.sqlite'),
  staticDir: resolve(import.meta.dir, '../dist'),
});
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch: (request) => app.fetch(request, 'browser-verifier'),
});
const origin = server.url.origin;
let browser: Browser | undefined;
const errors: string[] = [];
const checks: string[] = [];
let cookie = '';
async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${origin}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Forma-Request': '1',
      Origin: origin,
      Cookie: cookie,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const next = response.headers.get('set-cookie');
  if (next) cookie = next.split(';')[0];
  const data = await response.json();
  assert.ok(response.ok, `${method} ${path}: ${JSON.stringify(data)}`);
  return data as T;
}
async function noOverflow(page: Page, label: string) {
  const sizes = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  assert.ok(sizes.content <= sizes.viewport + 1, `${label}: ${JSON.stringify(sizes)}`);
}
async function actionColor(page: Page) {
  return page
    .locator('.ds-button--default')
    .first()
    .evaluate((element) => getComputedStyle(element).backgroundColor);
}
async function capture(page: Page, name: string, fullPage = false) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  await page.screenshot({ path: join(artifacts, name), fullPage, animations: 'disabled' });
}

try {
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ||
      (process.platform === 'darwin'
        ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        : undefined),
  });
  await api('/auth/setup', 'POST', {
    siteName: '样式回归测试',
    name: '测试管理员',
    email: 'browser@example.test',
    password: 'Temporary-Browser-Password-2026',
  });
  let doc = createInitialDocument();
  for (const definition of componentDefinitions) {
    if (!Object.values(doc.spec.elements).some((element) => element.type === definition.type)) {
      doc = insertElement(doc, definition.type, doc.spec.root).document;
    }
  }
  const { pages } = await api<{ pages: CmsPage[] }>('/pages');
  const home = pages[0];
  assert.ok(home);
  const saved = await api<CmsPage>(`/pages/${home.id}`, 'PUT', {
    title: home.title,
    slug: home.slug,
    revision: home.revision,
    spec: doc.spec,
  });
  await api(`/pages/${home.id}/publish`, 'POST', { revision: saved.revision });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(origin);
    await page.locator('.ds-page').waitFor();
    await noOverflow(page, `published ${width}`);
    for (const selector of [
      '.ds-navigation',
      '.ds-section',
      '.ds-stack',
      '.ds-heading',
      '.ds-text',
      '.ds-button',
      '.ds-badge',
      '.ds-card',
      '.ds-input',
      '.ds-separator',
    ]) {
      assert.ok(await page.locator(selector).count(), `${width}: missing ${selector}`);
    }
    const grid = await page
      .locator('.ds-stack--grid')
      .first()
      .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    assert.equal(grid, width < 560 ? 1 : 3);
    await capture(page, `published-${width}.png`, true);
    checks.push(`All catalog components and page overflow at ${width}px`);
  }
  // A narrow component container must adapt even inside a wide viewport.
  const container = page.locator('.cms-published-page .\\@container').first();
  for (const width of [559, 560]) {
    await container.evaluate((element, size) => {
      (element as HTMLElement).style.width = `${size}px`;
    }, width);
    const columns = await page
      .locator('.ds-stack--grid')
      .first()
      .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    assert.equal(columns, width < 560 ? 1 : 3);
  }
  checks.push('Container boundary at 559/560px independently of viewport');
  await page.reload();
  await page.locator('.ds-page').waitFor();
  const initialColor = await actionColor(page);
  let site = await api<CmsSite>('/site');
  const changedTheme = setTokenValue(site.theme, 'semantic.color.action', hexToColor('#188767'));
  site = await api<CmsSite>('/site/theme', 'PUT', {
    theme: changedTheme,
    revision: site.themeRevision,
  });
  await page.reload();
  await page.locator('.ds-page').waitFor();
  assert.equal(
    await actionColor(page),
    initialColor,
    'A theme draft must not leak into the public page',
  );
  site = await api<CmsSite>('/site/theme/publish', 'POST', { revision: site.themeRevision });
  await page.reload();
  await page.locator('.ds-page').waitFor();
  assert.equal(await actionColor(page), 'rgb(24, 135, 103)');
  site = await api<CmsSite>('/site/theme', 'PUT', {
    theme: createTheme('violet', 'dark'),
    revision: site.themeRevision,
  });
  await api('/site/theme/publish', 'POST', { revision: site.themeRevision });
  await page.reload();
  await page.locator('.cms-published-page.dark .ds-page').waitFor();
  await capture(page, 'published-dark.png', true);
  checks.push('Theme draft/published isolation, alias propagation, and dark mode');

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}/local`);
  await page.locator('.artboard .ds-page').waitFor();
  for (const [name, expected] of [
    ['手机视图', 390],
    ['平板视图', 768],
    ['桌面视图', 1100],
  ] as const) {
    await page.getByRole('button', { name, exact: true }).click();
    const width = await page
      .locator('.artboard-transform')
      .evaluate((element) => Number.parseFloat(getComputedStyle(element).width));
    assert.equal(width, expected);
    const transform = await page
      .locator('.artboard-transform')
      .evaluate((element) => getComputedStyle(element).transform);
    assert.ok(transform.startsWith('matrix('), `Missing editor zoom: ${transform}`);
  }
  await page.getByRole('button', { name: '深色', exact: true }).click();
  await page.locator('.artboard.dark').waitFor();
  const rootCanvas = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--ds-semantic-color-canvas'),
  );
  const canvas = await page
    .locator('.artboard')
    .evaluate((element) =>
      getComputedStyle(element).getPropertyValue('--ds-semantic-color-canvas'),
    );
  assert.notEqual(rootCanvas, canvas, 'Editor theme must remain scoped to the canvas');
  await page.getByRole('button', { name: /快捷键与帮助/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  assert.ok(await dialog.evaluate((element) => element.contains(document.activeElement)));
  assert.equal(
    await dialog.evaluate((element) =>
      getComputedStyle(element).getPropertyValue('--ds-semantic-color-canvas'),
    ),
    rootCanvas,
  );
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await capture(page, 'editor-desktop.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page, 'mobile editor');
  assert.equal(await page.locator('.app-header').count(), 1);
  assert.equal((await page.locator('.studio-app').boundingBox())?.height, 844);
  await capture(page, 'editor-mobile.png');
  checks.push('Editor device sizing/zoom, scoped theme, portal focus/Escape, and mobile layout');

  const [name, value] = cookie.split('=');
  await context.addCookies([{ name, value, url: origin }]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}/admin`);
  await page.getByRole('button', { name: '全站主题', exact: true }).click();
  await page.locator('.cms-theme-canvas .ds-page').waitFor();
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await noOverflow(page, `CMS theme ${width}`);
    const controls = await page.locator('.cms-theme-controls').boundingBox();
    assert.ok(
      controls && controls.width >= 250,
      `Theme controls collapsed at ${width}px: ${JSON.stringify(controls)}`,
    );
  }
  await capture(page, 'cms-theme-desktop.png');
  checks.push('CMS theme workspace at 390/768/1440px');
  assert.deepEqual(errors, [], 'Browser runtime errors');
  await writeFile(
    join(artifacts, 'results.json'),
    `${JSON.stringify({ checks, errors }, null, 2)}\n`,
  );
  console.log(`${checks.length} browser scenarios passed. Screenshots: ${artifacts}`);
} finally {
  try {
    await browser?.close();
  } finally {
    await server.stop(true);
    app.close();
    await rm(directory, { recursive: true, force: true });
  }
}
