import { describe, expect, test } from 'bun:test';
import legacyProject from '../../tests/fixtures/orbit-v1.forma.json';
import {
  TOKEN_DEFINITIONS,
  colorToHex,
  createTheme,
  getTokenReference,
  getTokenValue,
  hexToColor,
  parseTheme,
  presetNames,
  resolveTheme,
  setTokenValue,
  themeSchema,
  themeToCSS,
  themeToDTCG,
  themeToStyle,
  type DTCGColor,
  type DTCGGroup,
  type DTCGToken,
  type Theme,
} from './tokens';

function leaf(theme: Theme, path: string): DTCGToken {
  return path
    .split('.')
    .reduce(
      (node, part) => (node as DTCGGroup)[part],
      theme.tokens as DTCGGroup | DTCGToken,
    ) as DTCGToken;
}

describe('controlled DTCG theme profile', () => {
  test('every preset and mode is a complete typed document with all three layers', () => {
    for (const preset of presetNames)
      for (const mode of ['light', 'dark'] as const) {
        const theme = createTheme(preset, mode);
        expect(themeSchema.parse(theme)).toEqual(theme);
        expect(Object.keys(theme.tokens)).toEqual(['primitive', 'semantic', 'component']);
        expect(Object.keys(resolveTheme(theme))).toHaveLength(TOKEN_DEFINITIONS.length);
        expect(leaf(theme, 'primitive.color.brand').$type).toBe('color');
        expect(leaf(theme, 'primitive.dimension.unit').$value).toEqual({
          value: 0.25,
          unit: 'rem',
        });
      }
  });

  test('global primitive changes propagate through semantic and component aliases without mutation', () => {
    const original = createTheme();
    const next = setTokenValue(original, 'primitive.dimension.radiusSmall', {
      value: 1.25,
      unit: 'rem',
    });
    expect(getTokenReference(next, 'semantic.radius.control')).toBe(
      'primitive.dimension.radiusSmall',
    );
    expect(getTokenReference(next, 'component.button.radius')).toBe('semantic.radius.control');
    expect(getTokenValue(next, 'component.button.radius')).toEqual({ value: 1.25, unit: 'rem' });
    expect(getTokenValue(next, 'component.input.radius')).toEqual({ value: 1.25, unit: 'rem' });
    expect(getTokenValue(original, 'component.button.radius')).toEqual({
      value: 0.625,
      unit: 'rem',
    });
    const recolored = setTokenValue(next, 'primitive.color.brand', hexToColor('#1280ab'));
    for (const path of [
      'semantic.color.action',
      'semantic.color.focus',
      'semantic.color.navigation.action',
      'semantic.color.chart.series1',
    ]) {
      expect(colorToHex(getTokenValue(recolored, path) as DTCGColor)).toBe('#1280ab');
    }
  });

  test('global semantic override and same-type alias both work', () => {
    let theme = setTokenValue(createTheme(), 'semantic.color.action', hexToColor('#123456'));
    expect(getTokenReference(theme, 'semantic.color.action')).toBeNull();
    expect(themeToStyle(theme)['--ds-semantic-color-action']).toBe('#123456');
    theme = setTokenValue(theme, 'semantic.color.action', '{primitive.color.blue}');
    expect(getTokenReference(theme, 'semantic.color.action')).toBe('primitive.color.blue');
    expect(getTokenValue(theme, 'semantic.color.action')).toEqual(
      getTokenValue(theme, 'primitive.color.blue'),
    );
  });

  test('rejects missing, unknown, cross-type, higher-layer and cyclic references', () => {
    const theme = createTheme();
    expect(() =>
      setTokenValue(theme, 'semantic.color.action', '{primitive.color.missing}'),
    ).toThrow(/不存在/);
    expect(() =>
      setTokenValue(theme, 'semantic.color.action', '{primitive.dimension.unit}'),
    ).toThrow(/类型/);
    expect(() =>
      setTokenValue(theme, 'semantic.radius.control', '{component.button.radius}'),
    ).toThrow(/更高层/);
    expect(() =>
      setTokenValue(theme, 'primitive.color.brand', '{semantic.color.action}'),
    ).toThrow();
    expect(() => setTokenValue(theme, 'semantic.color.action', '{semantic.color.action}')).toThrow(
      /循环/,
    );
    const cycle = structuredClone(theme);
    leaf(cycle, 'semantic.color.action').$value = '{semantic.color.focus}';
    leaf(cycle, 'semantic.color.focus').$value = '{semantic.color.action}';
    expect(() => themeSchema.parse(cycle)).toThrow(/循环/);
    const missing = structuredClone(theme);
    delete (missing.tokens.primitive as DTCGGroup).color;
    expect(() => themeSchema.parse(missing)).toThrow();
  });

  test('rejects unknown token paths and metadata at every boundary', () => {
    const cases = [
      (theme: Theme) => {
        theme.tokens.custom = { $type: 'color', $value: hexToColor('#ffffff') };
      },
      (theme: Theme) => {
        (theme.tokens.semantic as DTCGGroup).extra = {
          $type: 'dimension',
          $value: { value: 1, unit: 'rem' },
        };
      },
      (theme: Theme) => {
        Object.assign(leaf(theme, 'semantic.color.action'), {
          $extensions: { style: 'color:red' },
        });
      },
      (theme: Theme) => {
        Object.assign(theme, { style: 'color:red' });
      },
      (theme: Theme) => {
        Object.assign(leaf(theme, 'semantic.color.action'), { className: 'text-red-500' });
      },
    ];
    for (const inject of cases) {
      const theme = createTheme();
      inject(theme);
      expect(themeSchema.safeParse(theme).success).toBe(false);
    }
    expect(() => setTokenValue(createTheme(), '__proto__.polluted', 'true')).toThrow(/未注册/);
    expect(() => getTokenValue(createTheme(), 'constructor')).toThrow(/未注册/);
  });

  test('does not accept CSS, numeric injection, wrong types or invalid colors', () => {
    const theme = createTheme();
    for (const value of [
      'red',
      'red; background:url(https://example.com)',
      '#123456',
      'var(--primary)',
    ]) {
      expect(() => setTokenValue(theme, 'semantic.color.action', value)).toThrow();
    }
    for (const value of [NaN, Infinity, -1, 8]) {
      expect(() =>
        setTokenValue(theme, 'semantic.radius.control', { value, unit: 'rem' }),
      ).toThrow();
    }
    expect(() =>
      setTokenValue(theme, 'semantic.color.action', {
        colorSpace: 'srgb',
        components: [1.01, 0, 0],
        alpha: 1,
      }),
    ).toThrow();
    expect(() =>
      setTokenValue(theme, 'semantic.color.action', {
        colorSpace: 'srgb',
        components: [0, 0, 0],
        alpha: -1,
      }),
    ).toThrow();
    const wrongType = structuredClone(theme);
    leaf(wrongType, 'semantic.color.action').$type = 'fontFamily';
    expect(themeSchema.safeParse(wrongType).success).toBe(false);
    expect(() => hexToColor('#fff')).toThrow();
    expect(() => setTokenValue(theme, 'semantic.font.family', 'Arial; background:red')).toThrow();
  });

  test('checks destination ranges even when values arrive through aliases', () => {
    const theme = createTheme();
    expect(() => setTokenValue(theme, 'primitive.font.body', { value: 5, unit: 'rem' })).toThrow(
      /正文字号/,
    );
    expect(() =>
      setTokenValue(theme, 'primitive.dimension.unit', { value: 0, unit: 'rem' }),
    ).toThrow(/基础间距单位/);
  });

  test('typed global typography, dimensions, duration and shadow reach CSS', () => {
    let theme = setTokenValue(createTheme(), 'semantic.font.family', ['Georgia', 'serif']);
    theme = setTokenValue(theme, 'semantic.font.bodySize', { value: 1.125, unit: 'rem' });
    theme = setTokenValue(theme, 'semantic.space.gap', { value: 2, unit: 'rem' });
    theme = setTokenValue(theme, 'semantic.motion.duration', { value: 0, unit: 'ms' });
    theme = setTokenValue(theme, 'semantic.shadow.surface', {
      color: { ...hexToColor('#123456'), alpha: 0.25 },
      offsetX: { value: 0, unit: 'rem' },
      offsetY: { value: 0.25, unit: 'rem' },
      blur: { value: 1, unit: 'rem' },
      spread: { value: -0.125, unit: 'rem' },
    });
    const css = themeToStyle(theme);
    expect(css['--ds-semantic-font-family']).toBe('Georgia, serif');
    expect(css['--ds-semantic-font-bodySize']).toBe('1.125rem');
    expect(css['--ds-semantic-space-gap']).toBe('2rem');
    expect(css['--ds-semantic-motion-duration']).toBe('0ms');
    expect(css['--ds-semantic-shadow-surface']).toBe(
      '0rem 0.25rem 1rem -0.125rem rgb(18 52 86 / 0.25)',
    );
  });

  test('exports a standalone DTCG token tree and imports it without losing aliases', () => {
    const theme = createTheme('blue', 'dark');
    const tokens = JSON.parse(themeToDTCG(theme));
    expect(tokens.version).toBeUndefined();
    expect(tokens.mode).toBeUndefined();
    expect(tokens.semantic.color.action).toMatchObject({
      $type: 'color',
      $value: '{primitive.color.brand}',
    });
    expect(themeSchema.parse({ ...theme, tokens })).toEqual(theme);
    const css = themeToCSS(theme);
    expect(css.startsWith('.dark {')).toBe(true);
    expect(css).toContain('--ds-semantic-color-action:');
    expect(css).not.toContain('--primary:');
    expect(css).not.toContain('--background:');
    expect(css).not.toContain('--radius:');
    expect(Object.keys(themeToStyle(theme)).every((name) => name.startsWith('--ds-'))).toBe(true);
  });

  test('migrates legacy custom values independently and preserves radius scale', () => {
    const legacy = structuredClone(legacyProject.theme);
    legacy.tokens.primary = '#123456';
    legacy.tokens['sidebar-primary'] = '#7655d9';
    legacy.tokens.radius = '1.25rem';
    const theme = parseTheme(legacy);
    expect(theme.version).toBe(2);
    expect(colorToHex(getTokenValue(theme, 'semantic.color.action') as DTCGColor)).toBe('#123456');
    expect(colorToHex(getTokenValue(theme, 'semantic.color.navigation.action') as DTCGColor)).toBe(
      '#7655d9',
    );
    expect(getTokenValue(theme, 'semantic.radius.surface')).toEqual({ value: 1.25, unit: 'rem' });
    expect(getTokenValue(theme, 'component.button.radius')).toEqual({ value: 1.125, unit: 'rem' });
    expect(parseTheme(theme)).toEqual(theme);
    expect(themeSchema.safeParse(legacy).success).toBe(false);
    expect(themeToCSS(theme)).not.toContain('--primary:');
  });

  test('legacy migration cannot smuggle unknown tokens or style data into v2', () => {
    expect(() => parseTheme({ ...legacyProject.theme, style: 'color:red' })).toThrow();
    expect(() =>
      parseTheme({
        ...legacyProject.theme,
        tokens: { ...legacyProject.theme.tokens, custom: '#fff000' },
      }),
    ).toThrow();
    expect(() =>
      parseTheme({
        ...legacyProject.theme,
        tokens: { ...legacyProject.theme.tokens, primary: 'red;display:none' },
      }),
    ).toThrow();
    expect(() =>
      parseTheme({
        ...legacyProject.theme,
        tokens: { ...legacyProject.theme.tokens, radius: 'Infinityrem' },
      }),
    ).toThrow();
    expect(() => parseTheme({ ...legacyProject.theme, version: 1 })).toThrow();
  });
});
