/** Code-owned DTCG tokens for application chrome and fixed recipe geometry.
 * These do not extend the editable/persisted Theme v2 profile in tokens.ts.
 * Raw values live in primitive tokens; consumers use semantic/component aliases.
 */
import type { Plugin } from 'postcss';

type Alias = `{${string}}`;
type Dimension = { value: number; unit: 'px' | 'rem' };
type Color = { colorSpace: 'srgb'; components: [number, number, number]; alpha: number };
type Shadow = {
  color: Color;
  offsetX: Dimension;
  offsetY: Dimension;
  blur: Dimension;
  spread: Dimension;
  inset?: boolean;
};
type TokenValue = Dimension | Color | Shadow | number | string[] | Alias;
export type StyleToken = {
  $type: 'dimension' | 'color' | 'number' | 'fontFamily' | 'duration' | 'shadow';
  $value: TokenValue | { value: number; unit: 'ms' };
  $extensions?: { 'dev.forma.css': { unit: '%' } };
};
const definitions: Record<string, StyleToken> = {};
const alias = (target: string): Alias => `{${target}}`;
const dimension = (value: number): Dimension => ({ value, unit: 'px' });
const cssName = (path: string) => `--ds-${path.replaceAll('.', '-')}`;
function define(path: string, token: StyleToken) {
  definitions[path] = token;
}
function role(path: string, primitive: string) {
  const token = definitions[primitive];
  if (!token) throw new Error(`Unknown style token: ${primitive}`);
  define(path, {
    $type: token.$type,
    $value: alias(primitive),
    ...(token.$extensions ? { $extensions: token.$extensions } : {}),
  });
}
function color(hex: string, alpha = 1): Color {
  return {
    colorSpace: 'srgb',
    components: [0, 2, 4].map(
      (offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255,
    ) as [number, number, number],
    alpha,
  };
}

// Deliberately compact scales. Adding a new step requires a design decision.
export const CHROME_SPACE = {
  hairline: 1,
  micro: 2,
  tiny: 4,
  '2xs': 6,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
  '5xl': 64,
  '6xl': 80,
} as const;
export const CHROME_FONT = {
  micro: 8,
  caption: 10,
  label: 11,
  control: 12,
  detail: 13,
  body: 14,
  emphasis: 16,
  subtitle: 18,
  title: 20,
  heading: 24,
  display: 28,
  hero: 32,
  'hero-large': 56,
} as const;
export const CHROME_RADIUS = {
  tight: 3,
  small: 4,
  control: 6,
  card: 8,
  panel: 12,
  large: 16,
} as const;
export const CHROME_SIZE = {
  dot: 4,
  'dot-large': 6,
  'icon-tiny': 8,
  'icon-small': 12,
  icon: 16,
  'icon-large': 20,
  'control-tiny': 24,
  'control-small': 28,
  control: 32,
  'control-large': 36,
  'control-wide': 40,
  avatar: 48,
  feature: 56,
  toolbar: 64,
  header: 80,
  label: 96,
  field: 128,
  menu: 144,
  'field-wide': 192,
  search: 224,
  sidebar: 256,
  'sidebar-wide': 288,
  preview: 320,
  form: 384,
  dialog: 512,
  story: 544,
  canvas: 600,
  'canvas-tall': 656,
  'dialog-wide': 720,
  content: 1280,
} as const;
export const CHROME_COLORS = {
  surface: 'ffffff',
  canvas: 'faf9fc',
  panel: 'f4f1f7',
  subtle: 'eee8f4',
  border: 'e7dfec',
  'border-strong': 'd8cce3',
  ink: '302d39',
  text: '66576f',
  muted: '8b7c98',
  faint: 'aa9ab7',
  disabled: 'c1b0ce',
  action: '7655d9',
  'action-text': '644780',
  'action-subtle': 'f0ebfa',
  success: '4d8c6f',
  'success-subtle': 'eef7f2',
  warning: 'a47e43',
  'warning-subtle': 'fcf6e9',
  danger: 'b63e3e',
  'danger-subtle': 'fff0f0',
} as const;
for (const [family, scale] of Object.entries({
  space: CHROME_SPACE,
  fontSize: CHROME_FONT,
  radius: CHROME_RADIUS,
  size: CHROME_SIZE,
})) {
  for (const [name, value] of Object.entries(scale)) {
    const primitive = `primitive.chrome.${family}.${name}`;
    define(primitive, { $type: 'dimension', $value: dimension(value) });
    role(`semantic.chrome.${family}.${name}`, primitive);
  }
}
for (const [name, hex] of Object.entries(CHROME_COLORS)) {
  const primitive = `primitive.chrome.color.${name}`;
  define(primitive, { $type: 'color', $value: color(hex) });
  role(`semantic.chrome.color.${name}`, primitive);
}
for (const [name, value] of Object.entries({
  selected: 2,
  raised: 20,
  menu: 25,
  header: 30,
  floating: 40,
  drag: 45,
  modal: 50,
  tooltip: 60,
  toast: 100,
})) {
  define(`primitive.layer.${name}`, { $type: 'number', $value: value });
  role(`semantic.layer.${name}`, `primitive.layer.${name}`);
}
define('primitive.code.tab-size', { $type: 'number', $value: 2 });
role('semantic.code.tab-size', 'primitive.code.tab-size');
for (const [name, value] of Object.entries({
  regular: 400,
  book: 450,
  medium: 500,
  emphasis: 550,
  semibold: 600,
  brand: 680,
})) {
  define(`primitive.fontWeight.${name}`, { $type: 'number', $value: value });
  role(`semantic.fontWeight.${name}`, `primitive.fontWeight.${name}`);
}
for (const [name, value] of Object.entries({
  tight: 1.15,
  heading: 1.25,
  control: 1.3,
  compact: 1.35,
  title: 1.4,
  normal: 1.5,
  body: 1.6,
  hint: 1.65,
  label: 1.7,
  relaxed: 1.8,
  reading: 1.85,
  spacious: 1.9,
  loose: 2,
})) {
  define(`primitive.lineHeight.${name}`, { $type: 'number', $value: value });
  role(`semantic.lineHeight.${name}`, `primitive.lineHeight.${name}`);
}
for (const [name, value] of Object.entries({
  disabled: 0.45,
  subdued: 0.65,
  quiet: 0.75,
  pending: 0.8,
})) {
  define(`primitive.opacity.${name}`, { $type: 'number', $value: value });
  role(`semantic.opacity.${name}`, `primitive.opacity.${name}`);
}
for (const [name, value] of Object.entries({
  hover: 90,
  decoration: 10,
  overlay: 45,
  section: 40,
  wash: 5,
  tint: 20,
  soft: 35,
  medium: 50,
  strong: 65,
  solid: 80,
})) {
  define(`primitive.mix.${name}`, {
    $type: 'number',
    $value: value,
    $extensions: { 'dev.forma.css': { unit: '%' } },
  });
  role(`semantic.mix.${name}`, `primitive.mix.${name}`);
}
for (const [name, value] of Object.entries({ hairline: 1, emphasis: 2, strong: 3 })) {
  define(`primitive.stroke.${name}`, { $type: 'dimension', $value: dimension(value) });
  role(`semantic.stroke.${name}`, `primitive.stroke.${name}`);
}
for (const [name, value] of Object.entries({
  tight: -0.3,
  heading: -1,
  brand: -1.5,
  subtle: 0.3,
  label: 0.7,
  eyebrow: 1.5,
  wide: 2,
})) {
  define(`primitive.tracking.${name}`, { $type: 'dimension', $value: dimension(value) });
  role(`semantic.tracking.${name}`, `primitive.tracking.${name}`);
}
for (const [name, value] of Object.entries({ fast: 150, enter: 200, spin: 1000 })) {
  define(`primitive.motion.${name}`, { $type: 'duration', $value: { value, unit: 'ms' } });
  role(`semantic.motion.${name}`, `primitive.motion.${name}`);
}
define('primitive.chrome.font.family', {
  $type: 'fontFamily',
  $value: [
    'Inter',
    '-apple-system',
    'BlinkMacSystemFont',
    'Segoe UI',
    'PingFang SC',
    'Hiragino Sans GB',
    'Microsoft YaHei',
    'sans-serif',
  ],
});
role('semantic.chrome.font.family', 'primitive.chrome.font.family');
define('primitive.chrome.font.mono', {
  $type: 'fontFamily',
  $value: ['ui-monospace', 'monospace'],
});
role('semantic.chrome.font.mono', 'primitive.chrome.font.mono');
for (const [name, value] of Object.entries({
  soft: {
    color: color('302040', 0.07),
    offsetX: dimension(0),
    offsetY: dimension(2),
    blur: dimension(8),
    spread: dimension(0),
  },
  elevated: {
    color: color('302040', 0.09),
    offsetX: dimension(0),
    offsetY: dimension(8),
    blur: dimension(28),
    spread: dimension(0),
  },
  ring: {
    color: color('7655d9', 0.5),
    offsetX: dimension(0),
    offsetY: dimension(0),
    blur: dimension(0),
    spread: dimension(1),
    inset: true,
  },
})) {
  define(`primitive.chrome.shadow.${name}`, { $type: 'shadow', $value: value });
  role(`semantic.chrome.shadow.${name}`, `primitive.chrome.shadow.${name}`);
}
// Component geometry is shared across consumers; names encode purpose, not value.
const geometry = {
  'layer.indent-base': 12,
  'layer.indent-step': 15,
  'artboard.frame-gutter': 34,
  'artboard.label-height': 27,
  'editor.header-height': 65,
  'editor.header-mobile-height': 59,
  'editor.mobilebar-height': 34,
  'editor.toolbar-height': 49,
  'editor.statusbar-height': 29,
  'editor.sidebar-left': 236,
  'editor.sidebar-right': 286,
  'editor.sidebar-left-wide': 254,
  'editor.sidebar-right-wide': 300,
  'editor.sidebar-left-compact': 204,
  'editor.sidebar-right-compact': 256,
  'editor.sidebar-mobile': 270,
  'cms.nav-height': 51,
  'cms.nav-compact-height': 49,
  'cms.theme-panel-width': 290,
  'dialog.width': 512,
  'dialog.viewport-inset': 32,
  'button.min-height': 24,
  'focus.offset': 3,
  'tooltip.width': 320,
  'field.min-width': 160,
  'hero.decoration-large': 320,
  'hero.decoration-small': 256,
  'hero.decoration-end-large': -128,
  'hero.decoration-end-small': -96,
  'hero.decoration-start': -112,
  'hero.decoration-top': 32,
  'hero.decoration-top-small': 64,
  'emptyDropZone.min-height': 96,
  'canvas.dot-radius': 0.65,
  'label.line-height': 15,
};
for (const [name, value] of Object.entries(geometry)) {
  define(`primitive.geometry.${name}`, { $type: 'dimension', $value: dimension(value) });
  role(`semantic.geometry.${name}`, `primitive.geometry.${name}`);
  role(`component.${name}`, `semantic.geometry.${name}`);
}
for (const [name, value] of Object.entries({
  'icon.font-ratio': 1.2,
  'badge.dot-ratio': 0.5,
  'link.underline-ratio': 0.2,
  'heading.tracking-ratio': -0.025,
  'text.measure': 38,
  'auth.fluid-font-ratio': 3.8,
  'dialog.viewport-width': 90,
  'code.viewport-height': 45,
})) {
  define(`primitive.ratio.${name}`, { $type: 'number', $value: value });
  role(`semantic.ratio.${name}`, `primitive.ratio.${name}`);
  role(`component.${name}`, `semantic.ratio.${name}`);
}

export const STYLE_TOKEN_DEFINITIONS: Readonly<Record<string, StyleToken>> =
  Object.freeze(definitions);
function renderColor(value: Color): string {
  return `rgb(${value.components.map((component) => Math.round(component * 255)).join(' ')} / ${value.alpha})`;
}
function renderToken(token: StyleToken): string {
  const value = token.$value;
  if (typeof value === 'string') {
    const path = value.slice(1, -1);
    if (!definitions[path] || definitions[path].$type !== token.$type)
      throw new Error(`Invalid style alias: ${value}`);
    return `var(${cssName(path)})`;
  }
  if (typeof value === 'number')
    return `${value}${token.$extensions?.['dev.forma.css'].unit ?? ''}`;
  if (Array.isArray(value))
    return value.map((font) => (font.includes(' ') ? `"${font}"` : font)).join(', ');
  if ('colorSpace' in value) return renderColor(value);
  if ('color' in value)
    return `${value.inset ? 'inset ' : ''}${[value.offsetX, value.offsetY, value.blur, value.spread].map((part) => `${part.value}${part.unit}`).join(' ')} ${renderColor(value.color)}`;
  return `${value.value}${value.unit}`;
}
export const STYLE_TOKENS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    Object.entries(definitions).map(([path, token]) => [cssName(path), renderToken(token)]),
  ),
);

export const VIEWPORT_BREAKPOINTS = {
  phone: { max: 480 },
  small: { min: 640 },
  compact: { max: 760 },
  editor: { max: 820 },
  'table-wide': { min: 850 },
  medium: { max: 1000 },
  narrow: { max: 1100 },
  wide: { min: 1600 },
} as const;
export const CONTAINER_BREAKPOINTS = { content: { min: 560 }, compact: { max: 559 } } as const;
export function expandTokenQuery(kind: 'media' | 'container', params: string): string {
  if (kind === 'media' && /^\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)$/.test(params))
    return '(prefers-reduced-motion: reduce)';
  const match = /^\(\s*--(viewport|container)-([a-z-]+)\s*\)$/.exec(params);
  if (!match || match[1] !== (kind === 'media' ? 'viewport' : 'container'))
    throw new Error(`Use a registered ${kind} query token: ${params}`);
  const registry: Record<string, { min?: number; max?: number }> =
    kind === 'media' ? VIEWPORT_BREAKPOINTS : CONTAINER_BREAKPOINTS;
  const token = registry[match[2]];
  if (!token) throw new Error(`Unknown ${kind} query token: ${match[2]}`);
  return Object.entries(token)
    .map(([bound, pixels]) => `(${bound}-width: ${pixels}px)`)
    .join(' and ');
}
export function styleTokenQueries(): Plugin {
  return {
    postcssPlugin: 'forma-style-token-queries',
    AtRule: {
      'custom-media'(rule) {
        if (rule.params.startsWith('--viewport-')) rule.remove();
      },
      media(rule) {
        if (rule.params.includes('--')) rule.params = expandTokenQuery('media', rule.params);
      },
      container(rule) {
        if (rule.params.includes('--')) rule.params = expandTokenQuery('container', rule.params);
      },
    },
  };
}

/** Only approved semantic aliases become Tailwind utilities. Never add --spacing. */
export const TAILWIND_THEME = {
  '--color-canvas': 'var(--ds-semantic-color-canvas)',
  '--color-surface': 'var(--ds-semantic-color-surface)',
  '--color-content': 'var(--ds-semantic-color-text)',
  '--color-muted': 'var(--ds-semantic-color-muted)',
  '--color-action': 'var(--ds-semantic-color-action)',
  '--color-on-action': 'var(--ds-semantic-color-onAction)',
  '--color-danger': 'var(--ds-semantic-color-danger)',
  '--color-border': 'var(--ds-semantic-color-border)',
  '--color-focus': 'var(--ds-semantic-color-focus)',
  '--spacing-xs': 'var(--ds-semantic-space-unit)',
  '--spacing-sm': 'calc(var(--ds-semantic-space-unit) * 2)',
  '--spacing-md': 'var(--ds-semantic-space-gap)',
  '--spacing-lg': 'var(--ds-semantic-space-sectionInline)',
  '--spacing-xl': 'var(--ds-semantic-space-sectionBlock)',
  '--font-body': 'var(--ds-semantic-font-family)',
  '--font-sans': 'var(--ds-semantic-font-family)',
  '--text-body': 'var(--ds-semantic-font-bodySize)',
  '--text-label': 'var(--ds-semantic-font-labelSize)',
  '--text-heading': 'var(--ds-semantic-font-heading2Size)',
  '--radius-control': 'var(--ds-semantic-radius-control)',
  '--radius-surface': 'var(--ds-semantic-radius-surface)',
  '--shadow-surface': 'var(--ds-semantic-shadow-surface)',
} as const;
export const TAILWIND_THEME_NAMES = Object.freeze({
  spacing: Object.keys(TAILWIND_THEME)
    .filter((name) => name.startsWith('--spacing-'))
    .map((name) => name.slice(10)),
  text: Object.keys(TAILWIND_THEME)
    .filter((name) => name.startsWith('--text-'))
    .map((name) => name.slice(7)),
  radius: Object.keys(TAILWIND_THEME)
    .filter((name) => name.startsWith('--radius-'))
    .map((name) => name.slice(9)),
  shadow: Object.keys(TAILWIND_THEME)
    .filter((name) => name.startsWith('--shadow-'))
    .map((name) => name.slice(9)),
  font: Object.keys(TAILWIND_THEME)
    .filter((name) => name.startsWith('--font-'))
    .map((name) => name.slice(7)),
});
export function renderStyleTokensCss(): string {
  const lines = Object.entries(STYLE_TOKENS).map(([name, value]) => `  ${name}: ${value};`);
  const queries = Object.keys(VIEWPORT_BREAKPOINTS)
    .map(
      (name) =>
        `@custom-media --viewport-${name} ${expandTokenQuery('media', `(--viewport-${name})`)};`,
    )
    .join('\n');
  return `/* Generated by scripts/generate-style-tokens.ts. Edit src/lib/style-tokens.ts. */\n${queries}\n\n:root {\n${lines.join('\n')}\n}\n\n@theme {\n  --*: initial;\n  --breakpoint-vp-sm: ${VIEWPORT_BREAKPOINTS.small.min}px;\n  --container-content: ${CONTAINER_BREAKPOINTS.content.min}px;\n}\n\n@theme inline {\n${Object.entries(
    TAILWIND_THEME,
  )
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n')}\n}\n`;
}
