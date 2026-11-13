import { z } from 'zod';

/** Forma's controlled DTCG 2025.10 profile. Tokens are global, never element props. */
export const presetNames = ['violet', 'blue', 'emerald', 'orange', 'neutral'] as const;
export type PresetName = typeof presetNames[number];
export type ThemeMode = 'light' | 'dark';
export type TokenLayer = 'primitive' | 'semantic' | 'component';
export type TokenType = 'color' | 'dimension' | 'fontFamily' | 'duration' | 'shadow';
export type DTCGColor = { colorSpace: 'srgb'; components: [number, number, number]; alpha: number };
export type DTCGDimension = { value: number; unit: 'rem' };
export type DTCGDuration = { value: number; unit: 'ms' };
export type DTCGShadow = { color: DTCGColor; offsetX: DTCGDimension; offsetY: DTCGDimension; blur: DTCGDimension; spread: DTCGDimension };
export type DTCGValue = DTCGColor | DTCGDimension | DTCGDuration | DTCGShadow | string | string[];
export type DTCGToken = { $type: TokenType; $value: DTCGValue; $description?: string };
export type DTCGGroup = { [key: string]: DTCGGroup | DTCGToken };
export type Theme = { version: 2; mode: ThemeMode; preset: PresetName; tokens: DTCGGroup };
export interface TokenDefinition {
  path: string;
  label: string;
  group: string;
  layer: TokenLayer;
  type: TokenType;
  min?: number;
  max?: number;
  step?: number;
  unit?: 'rem' | 'ms';
}
export const THEME_PRESETS: { id: PresetName; label: string; color: string }[] = [
  { id: 'violet', label: '鸢尾紫', color: '#7655d9' },
  { id: 'blue', label: '远山蓝', color: '#3268da' },
  { id: 'emerald', label: '森林绿', color: '#188767' },
  { id: 'orange', label: '落日橙', color: '#c95a26' },
  { id: 'neutral', label: '石墨黑', color: '#27272a' },
];
const entries: (TokenDefinition & { value: DTCGValue })[] = [];
const dim = (value: number): DTCGDimension => ({ value, unit: 'rem' });
const ref = (path: string) => `{${path}}`;
export function hexToColor(hex: string): DTCGColor {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error('颜色须为六位十六进制色值');
  return { colorSpace: 'srgb', components: [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255) as [number, number, number], alpha: 1 };
}
export function colorToHex(color: DTCGColor): string {
  return `#${color.components.map(component => Math.round(component * 255).toString(16).padStart(2, '0')).join('')}`;
}
function add(path: string, label: string, group: string, type: TokenType, value: DTCGValue, range: Partial<TokenDefinition> = {}) {
  entries.push({ path, label, group, layer: path.split('.')[0] as TokenLayer, type, value, ...range });
}

// Raw values have no component identity. Semantic decisions below reference them.
const primitiveColors: Record<string, [string, string]> = {
  white: ['白色', '#ffffff'], black: ['黑色', '#17151b'],
  gray50: ['灰阶 50', '#faf9fc'], gray100: ['灰阶 100', '#f7f6f9'],
  gray200: ['灰阶 200', '#e9e6ef'], gray500: ['灰阶 500', '#77737f'], gray900: ['灰阶 900', '#242329'],
  brand: ['品牌基色', '#7655d9'], brandTint: ['品牌浅色', '#f0edf8'], brandInk: ['品牌深色', '#554582'],
  red: ['红色', '#dc2626'], green: ['绿色', '#188767'], blue: ['蓝色', '#3268da'],
  amber: ['琥珀色', '#c95a26'], pink: ['粉色', '#c63e7d'],
};
for (const [name, [label, value]] of Object.entries(primitiveColors)) add(`primitive.color.${name}`, label, '基础色板', 'color', hexToColor(value));
for (const [name, label, value] of [
  ['unit', '基础间距', 0.25], ['gap', '标准间距', 1], ['inset', '容器内边距', 1.5],
  ['section', '区块纵向间距', 3.5], ['control', '控件高度', 2.25],
  ['radiusSmall', '小圆角', 0.625], ['radiusLarge', '大圆角', 0.75],
] as const) add(`primitive.dimension.${name}`, label, '基础尺寸', 'dimension', dim(value), { min: 0, max: name.startsWith('radius') ? 2 : 8, step: 0.125, unit: 'rem' });
add('primitive.font.family', '字体族', '基础排版', 'fontFamily', ['Inter', 'system-ui', 'sans-serif']);
for (const [name, label, value] of [
  ['body', '正文字号', 0.9375], ['label', '标签字号', 0.75],
  ['heading1', '一级标题字号', 3.5], ['heading2', '二级标题字号', 2.25], ['heading3', '三级标题字号', 1.25],
] as const) add(`primitive.font.${name}`, label, '基础排版', 'dimension', dim(value), { min: 0.5, max: 8, step: 0.0625, unit: 'rem' });
add('primitive.motion.normal', '标准动效时长', '基础动效', 'duration', { value: 160, unit: 'ms' }, { min: 0, max: 1000, step: 10, unit: 'ms' });
add('primitive.shadow.soft', '柔和阴影', '基础阴影', 'shadow', {
  color: { ...hexToColor('#17151b'), alpha: 0.08 }, offsetX: dim(0), offsetY: dim(0.125), blur: dim(0.75), spread: dim(0),
});

const colorRoles: Record<string, [string, string]> = {
  canvas: ['页面背景', 'white'], text: ['正文文字', 'gray900'],
  surface: ['容器背景', 'white'], surfaceText: ['容器文字', 'gray900'],
  raised: ['浮层背景', 'white'], raisedText: ['浮层文字', 'gray900'],
  action: ['主要操作', 'brand'], onAction: ['主要操作文字', 'white'],
  secondary: ['次要操作', 'brandTint'], onSecondary: ['次要操作文字', 'brandInk'],
  subtle: ['柔和背景', 'gray100'], muted: ['辅助文字', 'gray500'],
  selected: ['选中背景', 'brandTint'], onSelected: ['选中文字', 'brandInk'],
  danger: ['危险状态', 'red'], onDanger: ['危险状态文字', 'white'],
  border: ['容器边框', 'gray200'], fieldBorder: ['输入边框', 'gray200'], focus: ['焦点指示', 'brand'],
  success: ['成功状态', 'green'], warning: ['警告状态', 'amber'], info: ['信息状态', 'blue'],
};
for (const [name, [label, primitive]] of Object.entries(colorRoles)) add(`semantic.color.${name}`, label, '语义色彩', 'color', ref(`primitive.color.${primitive}`));
for (const [index, primitive] of ['brand', 'green', 'blue', 'amber', 'pink'].entries()) add(`semantic.color.chart.series${index + 1}`, `数据系列 ${index + 1}`, '数据可视化', 'color', ref(`primitive.color.${primitive}`));
for (const [name, label, target] of [
  ['surface', '导航背景', 'primitive.color.gray50'], ['text', '导航文字', 'semantic.color.text'],
  ['action', '导航主要操作', 'semantic.color.action'], ['onAction', '导航操作文字', 'semantic.color.onAction'],
  ['selected', '导航选中背景', 'semantic.color.selected'], ['onSelected', '导航选中文字', 'semantic.color.onSelected'],
  ['border', '导航边框', 'semantic.color.border'], ['focus', '导航焦点', 'semantic.color.focus'],
] as const) add(`semantic.color.navigation.${name}`, label, '导航', 'color', ref(target));
for (const [path, label, target, min, max] of [
  ['radius.control', '控件圆角', 'dimension.radiusSmall', 0, 2], ['radius.surface', '容器圆角', 'dimension.radiusLarge', 0, 2],
  ['space.unit', '基础间距单位', 'dimension.unit', 0.125, 1], ['space.gap', '内容间距', 'dimension.gap', 0, 4],
  ['space.sectionInline', '容器横向内边距', 'dimension.inset', 0, 6], ['space.sectionBlock', '区块纵向内边距', 'dimension.section', 0, 8],
  ['size.controlHeight', '标准控件高度', 'dimension.control', 1.5, 4],
  ['font.bodySize', '正文字号', 'font.body', 0.75, 1.5], ['font.labelSize', '标签字号', 'font.label', 0.625, 1.25],
  ['font.heading1Size', '一级标题字号', 'font.heading1', 1.5, 6], ['font.heading2Size', '二级标题字号', 'font.heading2', 1.25, 4],
  ['font.heading3Size', '三级标题字号', 'font.heading3', 1, 3],
] as const) add(`semantic.${path}`, label, path.startsWith('font') ? '语义排版' : '语义尺寸', 'dimension', ref(`primitive.${target}`), { min, max, step: 0.0625, unit: 'rem' });
add('semantic.font.family', '全站字体', '语义排版', 'fontFamily', ref('primitive.font.family'));
add('semantic.motion.duration', '交互动效时长', '语义动效', 'duration', ref('primitive.motion.normal'), { min: 0, max: 1000, step: 10, unit: 'ms' });
add('semantic.shadow.surface', '容器阴影', '语义阴影', 'shadow', ref('primitive.shadow.soft'));
for (const [path, label, target, min, max] of [
  ['button.radius', '按钮圆角', 'radius.control', 0, 2], ['button.height', '按钮高度', 'size.controlHeight', 1.5, 4],
  ['input.radius', '输入框圆角', 'radius.control', 0, 2], ['input.height', '输入框高度', 'size.controlHeight', 1.5, 4],
  ['card.radius', '卡片圆角', 'radius.surface', 0, 2], ['card.padding', '卡片内边距', 'space.sectionInline', 0, 6],
] as const) add(`component.${path}`, label, '组件类型', 'dimension', ref(`semantic.${target}`), { min, max, step: 0.0625, unit: 'rem' });

export const TOKEN_DEFINITIONS: readonly TokenDefinition[] = entries.map(({ value: _value, ...definition }) => Object.freeze(definition));
const definitionMap = new Map(TOKEN_DEFINITIONS.map(definition => [definition.path, definition]));
const layerOrder: Record<TokenLayer, number> = { primitive: 0, semantic: 1, component: 2 };
const referencePattern = /^\{((?:primitive|semantic|component)(?:\.[A-Za-z][A-Za-z0-9]*)+)\}$/;
const fontNames = ['Inter', 'system-ui', 'sans-serif', 'Arial', 'Georgia', 'serif', 'ui-monospace', 'monospace'] as const;
const finiteNumber = z.number().finite();
const colorSchema = z.object({
  colorSpace: z.literal('srgb'), components: z.tuple([finiteNumber.min(0).max(1), finiteNumber.min(0).max(1), finiteNumber.min(0).max(1)]), alpha: finiteNumber.min(0).max(1).default(1),
}).strict();
const dimensionSchema = z.object({ value: finiteNumber.min(0).max(8), unit: z.literal('rem') }).strict();
const signedDimensionSchema = z.object({ value: finiteNumber.min(-8).max(8), unit: z.literal('rem') }).strict();
const durationSchema = z.object({ value: finiteNumber.min(0).max(1000), unit: z.literal('ms') }).strict();
const fontSchema = z.union([z.enum(fontNames), z.array(z.enum(fontNames)).min(1).max(5)]);
const shadowSchema = z.object({ color: colorSchema, offsetX: signedDimensionSchema, offsetY: signedDimensionSchema, blur: dimensionSchema, spread: signedDimensionSchema }).strict();
const valueSchemas: Record<TokenType, z.ZodType> = { color: colorSchema, dimension: dimensionSchema, duration: durationSchema, fontFamily: fontSchema, shadow: shadowSchema };
type SchemaTree = { [key: string]: SchemaTree | z.ZodType };
const schemaTree: SchemaTree = {};
for (const definition of TOKEN_DEFINITIONS) {
  const parts = definition.path.split('.');
  let node = schemaTree;
  for (const part of parts.slice(0, -1)) node = (node[part] ??= {}) as SchemaTree;
  const literal = valueSchemas[definition.type];
  node[parts.at(-1)!] = z.object({
    $type: z.literal(definition.type),
    $value: definition.layer === 'primitive' ? literal : z.union([literal, z.string().regex(referencePattern, '须为已注册 token 的引用')]),
    $description: z.string().max(500).optional(),
  }).strict();
}
function objectSchema(tree: SchemaTree): z.ZodType {
  return z.object(Object.fromEntries(Object.entries(tree).map(([name, child]) => [name, child instanceof z.ZodType ? child : objectSchema(child)]))).strict();
}
function tokenAt(tokens: DTCGGroup, path: string): DTCGToken {
  let current: DTCGGroup | DTCGToken = tokens;
  for (const part of path.split('.')) {
    if (!Object.hasOwn(current, part)) throw new Error(`缺少 token：${path}`);
    current = (current as DTCGGroup)[part];
  }
  if (!Object.hasOwn(current, '$value')) throw new Error(`不是 token：${path}`);
  return current as DTCGToken;
}
function putToken(tokens: DTCGGroup, path: string, token: DTCGToken) {
  const parts = path.split('.');
  let current = tokens;
  for (const part of parts.slice(0, -1)) current = (current[part] ??= {}) as DTCGGroup;
  current[parts.at(-1)!] = token;
}
function resolveTokens(tokens: DTCGGroup): Record<string, DTCGValue> {
  const result: Record<string, DTCGValue> = {};
  const active = new Set<string>();
  function resolve(path: string): DTCGValue {
    if (Object.hasOwn(result, path)) return result[path];
    if (active.has(path)) throw new Error(`Token 引用存在循环：${path}`);
    const definition = definitionMap.get(path);
    if (!definition) throw new Error(`未注册的 token：${path}`);
    active.add(path);
    const token = tokenAt(tokens, path);
    let value = token.$value;
    const reference = typeof value === 'string' ? referencePattern.exec(value)?.[1] : undefined;
    if (reference) {
      const target = definitionMap.get(reference);
      if (!target) throw new Error(`引用不存在的 token：${reference}`);
      if (target.type !== definition.type) throw new Error(`Token 引用类型不匹配：${path}`);
      if (layerOrder[target.layer] > layerOrder[definition.layer]) throw new Error(`Token 不允许反向引用更高层：${path}`);
      value = resolve(reference);
    }
    if (definition.type === 'dimension' || definition.type === 'duration') {
      const amount = (value as DTCGDimension | DTCGDuration).value;
      if (amount < (definition.min ?? 0) || amount > (definition.max ?? Infinity)) throw new Error(`${definition.label}须在 ${definition.min}–${definition.max} ${definition.unit} 之间`);
    }
    result[path] = value;
    active.delete(path);
    return value;
  }
  for (const definition of TOKEN_DEFINITIONS) resolve(definition.path);
  return result;
}
export const themeSchema = z.object({
  version: z.literal(2), mode: z.enum(['light', 'dark']), preset: z.enum(presetNames), tokens: objectSchema(schemaTree),
}).strict().superRefine((theme, context) => {
  try { resolveTokens(theme.tokens as DTCGGroup); }
  catch (error) { context.addIssue({ code: 'custom', path: ['tokens'], message: error instanceof Error ? error.message : 'Token 引用无效' }); }
}) as z.ZodType<Theme>;

const palettes: Record<PresetName, { light: string; dark: string; tint: string; ink: string }> = {
  violet: { light: '#7655d9', dark: '#b59aef', tint: '#f0edf8', ink: '#554582' },
  blue: { light: '#3268da', dark: '#82a7f5', tint: '#edf2fc', ink: '#355992' },
  emerald: { light: '#188767', dark: '#62c9a5', tint: '#eaf6f0', ink: '#28644e' },
  orange: { light: '#c95a26', dark: '#f4a07d', tint: '#fdf0e9', ink: '#8a4d31' },
  neutral: { light: '#27272a', dark: '#e4e4e7', tint: '#f4f4f5', ink: '#3f3f46' },
};
export function createTheme(preset: PresetName = 'violet', mode: ThemeMode = 'light'): Theme {
  const tokens: DTCGGroup = {};
  for (const entry of entries) putToken(tokens, entry.path, { $type: entry.type, $value: structuredClone(entry.value), $description: entry.label });
  const palette = palettes[preset];
  const colors: Record<string, string> = { brand: palette[mode], brandTint: mode === 'light' ? palette.tint : '#302a3b', brandInk: mode === 'light' ? palette.ink : '#eee7fc' };
  if (mode === 'dark') Object.assign(colors, { gray50: '#1d1b22', gray100: '#26232c', gray200: '#39343f', gray500: '#aaa4b4', gray900: '#f5f3fa', red: '#ef7777', green: '#62c9a5', blue: '#82a7f5', amber: '#f4a07d', pink: '#ee8fbd' });
  for (const [key, value] of Object.entries(colors)) tokenAt(tokens, `primitive.color.${key}`).$value = hexToColor(value);
  if (mode === 'dark') {
    tokenAt(tokens, 'semantic.color.canvas').$value = ref('primitive.color.black');
    tokenAt(tokens, 'semantic.color.surface').$value = hexToColor('#211f27');
    tokenAt(tokens, 'semantic.color.raised').$value = ref('semantic.color.surface');
    tokenAt(tokens, 'semantic.color.onAction').$value = ref('primitive.color.black');
    tokenAt(tokens, 'semantic.color.onDanger').$value = ref('primitive.color.black');
  }
  return themeSchema.parse({ version: 2, mode, preset, tokens });
}
export function resolveTheme(theme: Theme): Record<string, DTCGValue> { return resolveTokens(themeSchema.parse(theme).tokens); }
export function getTokenValue(theme: Theme, path: string): DTCGValue {
  const values = resolveTheme(theme);
  if (!Object.hasOwn(values, path)) throw new Error(`未注册的 token：${path}`);
  return structuredClone(values[path]);
}
export function getTokenReference(theme: Theme, path: string): string | null {
  if (!definitionMap.has(path)) throw new Error(`未注册的 token：${path}`);
  const value = tokenAt(theme.tokens, path).$value;
  return typeof value === 'string' ? referencePattern.exec(value)?.[1] ?? null : null;
}
export function setTokenValue(theme: Theme, path: string, value: DTCGValue): Theme {
  if (!definitionMap.has(path)) throw new Error(`未注册的 token：${path}`);
  const next = structuredClone(theme);
  tokenAt(next.tokens, path).$value = structuredClone(value);
  return themeSchema.parse(next);
}
export function tokenCSSName(path: string): string {
  if (!definitionMap.has(path)) throw new Error(`未注册的 token：${path}`);
  return `--ds-${path.replaceAll('.', '-')}`;
}
function colorCSS(color: DTCGColor): string {
  if (color.alpha === 1) return colorToHex(color);
  return `rgb(${color.components.map(value => Math.round(value * 255)).join(' ')} / ${color.alpha})`;
}
function toCSS(type: TokenType, value: DTCGValue): string {
  if (type === 'color') return colorCSS(value as DTCGColor);
  if (type === 'dimension' || type === 'duration') { const measure = value as DTCGDimension | DTCGDuration; return `${measure.value}${measure.unit}`; }
  if (type === 'fontFamily') return (Array.isArray(value) ? value : [value]).map(String).join(', ');
  const shadow = value as DTCGShadow;
  return `${shadow.offsetX.value}rem ${shadow.offsetY.value}rem ${shadow.blur.value}rem ${shadow.spread.value}rem ${colorCSS(shadow.color)}`;
}
export function themeToStyle(theme: Theme): Record<string, string> {
  const values = resolveTheme(theme);
  return Object.fromEntries(TOKEN_DEFINITIONS.map(definition => [tokenCSSName(definition.path), toCSS(definition.type, values[definition.path])]));
}
export function themeToCSS(theme: Theme): string {
  return `${theme.mode === 'dark' ? '.dark' : ':root'} {\n${Object.entries(themeToStyle(theme)).map(([name, value]) => `  ${name}: ${value};`).join('\n')}\n}\n`;
}
/** The app envelope (mode, preset, version) is not part of the DTCG token document. */
export function themeToDTCG(theme: Theme): string { return JSON.stringify(themeSchema.parse(theme).tokens, null, 2); }

// A one-way import boundary for saved v1 data. The live model and CSS have no legacy aliases.
const legacyColorMap: Record<string, string> = {
  background: 'canvas', foreground: 'text', card: 'surface', 'card-foreground': 'surfaceText',
  popover: 'raised', 'popover-foreground': 'raisedText', primary: 'action', 'primary-foreground': 'onAction',
  secondary: 'secondary', 'secondary-foreground': 'onSecondary', muted: 'subtle', 'muted-foreground': 'muted',
  accent: 'selected', 'accent-foreground': 'onSelected', destructive: 'danger', border: 'border', input: 'fieldBorder', ring: 'focus',
  'chart-1': 'chart.series1', 'chart-2': 'chart.series2', 'chart-3': 'chart.series3', 'chart-4': 'chart.series4', 'chart-5': 'chart.series5',
  sidebar: 'navigation.surface', 'sidebar-foreground': 'navigation.text', 'sidebar-primary': 'navigation.action',
  'sidebar-primary-foreground': 'navigation.onAction', 'sidebar-accent': 'navigation.selected', 'sidebar-accent-foreground': 'navigation.onSelected',
  'sidebar-border': 'navigation.border', 'sidebar-ring': 'navigation.focus',
};
const legacyColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const legacyRadiusSchema = z.string().regex(/^(?:0|[0-9]+(?:\.[0-9]+)?)rem$/).refine(value => Number.parseFloat(value) <= 2);
const legacyThemeSchema = z.object({
  mode: z.enum(['light', 'dark']), preset: z.enum(presetNames),
  tokens: z.object({ ...Object.fromEntries(Object.keys(legacyColorMap).map(key => [key, legacyColorSchema])), radius: legacyRadiusSchema }).strict(),
}).strict();
export function parseTheme(input: unknown): Theme {
  if (typeof input === 'object' && input !== null && Object.hasOwn(input, 'version')) return themeSchema.parse(input);
  const legacy = legacyThemeSchema.parse(input);
  const next = createTheme(legacy.preset, legacy.mode);
  for (const [oldName, target] of Object.entries(legacyColorMap)) {
    const value = hexToColor((legacy.tokens as Record<string, string>)[oldName]);
    const path = `semantic.color.${target}`;
    if (colorToHex(resolveTokens(next.tokens)[path] as DTCGColor) !== colorToHex(value)) tokenAt(next.tokens, path).$value = value;
  }
  const radius = Number.parseFloat(legacy.tokens.radius);
  tokenAt(next.tokens, 'primitive.dimension.radiusSmall').$value = dim(Math.max(0, radius - 0.125));
  tokenAt(next.tokens, 'primitive.dimension.radiusLarge').$value = dim(radius);
  return themeSchema.parse(next);
}
