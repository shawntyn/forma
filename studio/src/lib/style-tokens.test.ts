import { describe, expect, test } from 'bun:test';
import postcss from 'postcss';
import { compile } from 'tailwindcss';
import {
  CONTAINER_BREAKPOINTS,
  expandTokenQuery,
  renderStyleTokensCss,
  STYLE_TOKEN_DEFINITIONS,
  STYLE_TOKENS,
  styleTokenQueries,
  TAILWIND_THEME_NAMES,
  VIEWPORT_BREAKPOINTS,
} from './style-tokens';

const reference = /^\{(.+)\}$/;

describe('code-owned design tokens', () => {
  test('layout tracks preserve panel geometry instead of using the spacing scale', async () => {
    function resolve(value: string): string {
      return value.replace(/var\(\s*(--ds-[\w-]+)\s*\)/g, (_, name: string) => {
        const token = STYLE_TOKENS[name];
        if (!token) throw new Error(`Missing style token ${name}`);
        return resolve(token);
      });
    }
    const cms = postcss.parse(await Bun.file(new URL('../cms.css', import.meta.url)).text());
    const editor = postcss.parse(await Bun.file(new URL('../index.css', import.meta.url)).text());
    const cmsTracks: string[] = [];
    const editorTracks: string[] = [];
    cms.walkRules('.cms-theme-layout', (rule) => {
      rule.walkDecls('grid-template-columns', (declaration) => {
        cmsTracks.push(resolve(declaration.value).replace(/\s/g, ''));
      });
    });
    editor.walkRules('.workspace', (rule) => {
      rule.walkDecls('grid-template-columns', (declaration) => {
        editorTracks.push(resolve(declaration.value).replace(/\s/g, ''));
      });
    });
    expect(cmsTracks).toEqual(['290pxminmax(0,1fr)', '1fr']);
    expect(editorTracks).toEqual([
      '236pxminmax(0,1fr)286px',
      '254pxminmax(0,1fr)300px',
      '204pxminmax(0,1fr)256px',
      'minmax(0,1fr)',
    ]);
  });

  test('aliases preserve type and layer boundaries without extending editable themes', () => {
    const layers: Record<string, number> = { primitive: 0, semantic: 1, component: 2 };
    for (const [path, token] of Object.entries(STYLE_TOKEN_DEFINITIONS)) {
      const target =
        typeof token.$value === 'string' ? reference.exec(token.$value)?.[1] : undefined;
      if (!target) {
        expect(path.startsWith('primitive.')).toBe(true);
        continue;
      }
      expect(STYLE_TOKEN_DEFINITIONS[target]?.$type).toBe(token.$type);
      expect(layers[target.split('.')[0]]).toBeLessThan(layers[path.split('.')[0]]);
    }
    expect(Object.keys(STYLE_TOKENS).every((name) => name.startsWith('--ds-'))).toBe(true);
    expect(STYLE_TOKENS).not.toHaveProperty('--ds-semantic-color-action');
    expect(STYLE_TOKENS).not.toHaveProperty('--ds-component-button-radius');
  });

  test('Tailwind exposes semantic names and preserves runtime theme resolution', async () => {
    const defaultTheme = await Bun.file(
      import.meta.resolve('tailwindcss/theme.css').replace('file://', ''),
    ).text();
    const compiler = await compile(
      `${defaultTheme}\n${renderStyleTokensCss()}\n@tailwind utilities;`,
    );
    const css = compiler.build([
      'bg-action',
      'text-body',
      'p-sm',
      'rounded-control',
      'flex',
      'bg-blue-500',
      'p-4',
      'vp-sm:inline',
    ]);
    expect(css).toContain('background-color: var(--ds-semantic-color-action)');
    expect(css).toContain('font-size: var(--ds-semantic-font-bodySize)');
    expect(css).toContain('padding: calc(var(--ds-semantic-space-unit) * 2)');
    expect(css).toContain('.flex');
    expect(css).toContain('640px');
    expect(css).not.toContain('.bg-blue-500');
    expect(css).not.toContain('.p-4');
    expect(css).not.toMatch(/--spacing\s*:/);
    expect(TAILWIND_THEME_NAMES.text).toContain('body');
    expect(TAILWIND_THEME_NAMES.spacing).toEqual(['xs', 'sm', 'md', 'lg', 'xl']);
  });
});

describe('named responsive queries', () => {
  test('viewport and container tokens have separate scopes and thresholds', () => {
    expect(VIEWPORT_BREAKPOINTS.compact.max).toBe(760);
    expect(CONTAINER_BREAKPOINTS.compact.max).toBe(559);
    expect(expandTokenQuery('media', '(--viewport-compact)')).toBe('(max-width: 760px)');
    expect(expandTokenQuery('container', '(--container-content)')).toBe('(min-width: 560px)');
    expect(expandTokenQuery('media', '(prefers-reduced-motion:reduce)')).toBe(
      '(prefers-reduced-motion: reduce)',
    );
  });

  test('unknown, mixed, or raw design breakpoints are rejected', () => {
    for (const query of [
      '(--viewport-fake)',
      '(--container-content)',
      '(max-width: 777px)',
      '(--viewport-phone) and (orientation: landscape)',
    ]) {
      expect(() => expandTokenQuery('media', query)).toThrow();
    }
  });

  test('the build plugin emits real queries and fails unknown names', async () => {
    const output = await postcss([styleTokenQueries()]).process(
      '@media (--viewport-phone) {.test{display:block}} @container (--container-content) {.test{display:grid}}',
      { from: undefined },
    );
    expect(output.css).toContain('@media (max-width: 480px)');
    expect(output.css).toContain('@container (min-width: 560px)');
    await expect(
      postcss([styleTokenQueries()])
        .process('@media (--viewport-typo) {.test{display:block}}', { from: undefined })
        .async(),
    ).rejects.toThrow('Unknown media query token');
  });
});
