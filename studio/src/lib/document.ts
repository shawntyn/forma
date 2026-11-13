import { z } from 'zod';
import { canHaveChildren, componentDefinitionMap, propSchemas, type ComponentType } from './catalog';
import { createTheme, parseTheme, themeSchema, type Theme } from './tokens';
export { canHaveChildren, componentDefinitions, componentDefinitionMap, type ComponentType } from './catalog';

export type DesignElement = { type: ComponentType; props: Record<string, unknown>; children?: string[] };
export type DesignSpec = { root: string; elements: Record<string, DesignElement> };
export type DesignDocument = { version: 2; name: string; spec: DesignSpec; theme: Theme };
export const MAX_ELEMENTS = 500;
export const MAX_DEPTH = 32;
export const MAX_DOCUMENT_BYTES = 2_000_000;
export const STORAGE_KEY = 'forma-studio-document-v1';
const idSchema = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/).refine(value => !['constructor', 'prototype', '__proto__'].includes(value), '不支持的节点 ID');
const elementSchema = z.object({ type: z.enum(Object.keys(propSchemas) as [ComponentType, ...ComponentType[]]), props: z.record(z.string(), z.unknown()), children: z.array(idSchema).max(MAX_ELEMENTS).optional() }).strict();
const documentSchema = z.object({ version: z.union([z.literal(1), z.literal(2)]), name: z.string().trim().min(1).max(100), theme: z.unknown(), spec: z.object({ root: idSchema, elements: z.record(idSchema, elementSchema) }).strict() }).strict();

/** Parse the complete format; no style overrides or unregistered component props survive. */
export function parseDocument(input: unknown): DesignDocument {
  if (typeof input === 'string') {
    if (new TextEncoder().encode(input).byteLength > MAX_DOCUMENT_BYTES) throw new Error('文件过大，请导入小于 2 MB 的设计文件');
    try { input = JSON.parse(input); } catch { throw new Error('无法读取 JSON，请检查文件格式'); }
  }
  const result = documentSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`设计文件格式无效：${issue.path.join('.')} ${issue.message}`);
  }
  let theme: Theme;
  try {
    // Legacy conversion is an import boundary, never a runtime CSS compatibility layer.
    // New documents must already obey the current DTCG theme contract.
    theme = result.data.version === 1 ? parseTheme(result.data.theme) : themeSchema.parse(result.data.theme);
  } catch (error) {
    throw new Error(`设计文件格式无效：theme ${error instanceof Error ? error.message : '主题无效'}`);
  }
  const doc: DesignDocument = { ...result.data, version: 2, theme };
  const { spec } = doc;
  const ids = Object.keys(spec.elements);
  if (ids.length < 1 || ids.length > MAX_ELEMENTS) throw new Error(`页面须包含 1–${MAX_ELEMENTS} 个组件`);
  if (!Object.hasOwn(spec.elements, spec.root) || spec.elements[spec.root].type !== 'Page') throw new Error('根节点须为 Page 组件');
  for (const [id, element] of Object.entries(spec.elements)) {
    if (id !== spec.root && element.type === 'Page') throw new Error('页面只能有一个 Page 根节点');
    const props = propSchemas[element.type].safeParse(element.props);
    if (!props.success) throw new Error(`${componentDefinitionMap[element.type].label}属性无效：${props.error.issues[0].message}。组件外观只能通过全局 tokens 调整`);
    element.props = props.data;
    if (!canHaveChildren(element.type) && element.children?.length) throw new Error(`${componentDefinitionMap[element.type].label}不能包含子组件`);
  }
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const walk = (id: string, depth: number) => {
    if (depth > MAX_DEPTH) throw new Error(`组件嵌套不能超过 ${MAX_DEPTH} 层`);
    if (!Object.hasOwn(spec.elements, id)) throw new Error(`找不到子组件：${id}`);
    if (visiting.has(id)) throw new Error('页面结构存在循环引用');
    if (visited.has(id)) throw new Error('一个组件只能出现在一个位置');
    visiting.add(id);
    for (const child of spec.elements[id].children ?? []) walk(child, depth + 1);
    visiting.delete(id);
    visited.add(id);
  };
  walk(spec.root, 0);
  if (visited.size !== ids.length) throw new Error('设计文件包含未连接到页面的组件');
  return doc;
}
export function serializeDocument(document: DesignDocument): string { return JSON.stringify(parseDocument(document), null, 2); }
export function findParent(spec: DesignSpec, id: string): string | null {
  for (const [parentId, element] of Object.entries(spec.elements)) if (element.children?.includes(id)) return parentId;
  return null;
}
export function getDescendants(spec: DesignSpec, id: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  const walk = (parent: string) => { for (const child of spec.elements[parent]?.children ?? []) { if (seen.has(child)) continue; seen.add(child); result.push(child); walk(child); } };
  walk(id);
  return result;
}
export function getElementLabel(element: DesignElement): string {
  const content = element.props.text ?? element.props.title ?? element.props.label ?? element.props.brand;
  return typeof content === 'string' && content.trim() ? content.trim().split('\n')[0].slice(0, 24) : componentDefinitionMap[element.type].label;
}
function newId(type: ComponentType): string { return `${type.toLowerCase()}_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`; }
function requireElement(spec: DesignSpec, id: string): DesignElement {
  if (!Object.hasOwn(spec.elements, id)) throw new Error('找不到选中的组件');
  return spec.elements[id];
}
function requireContainer(spec: DesignSpec, id: string): DesignElement {
  const element = requireElement(spec, id);
  if (!canHaveChildren(element.type)) throw new Error('请选择一个布局容器来放置组件');
  return element;
}
function clampIndex(index: number | undefined, length: number): number { return index === undefined ? length : Math.max(0, Math.min(length, Math.trunc(index))); }
export function insertElement(document: DesignDocument, type: ComponentType, parentId: string, index?: number): { document: DesignDocument; id: string } {
  if (type === 'Page') throw new Error('不能插入第二个页面根节点');
  const definition = componentDefinitionMap[type];
  if (!definition) throw new Error('不支持的组件类型');
  const next = structuredClone(document);
  const parent = requireContainer(next.spec, parentId);
  const id = newId(type);
  next.spec.elements[id] = { type, props: structuredClone(definition.defaultProps), ...(definition.container ? { children: [] } : {}) };
  parent.children ??= [];
  parent.children.splice(clampIndex(index, parent.children.length), 0, id);
  return { document: parseDocument(next), id };
}
/** index describes a gap in the target's current children, before the source is removed. */
export function moveElement(document: DesignDocument, id: string, parentId: string, index?: number): DesignDocument {
  if (id === document.spec.root) throw new Error('不能移动页面根节点');
  requireElement(document.spec, id);
  requireContainer(document.spec, parentId);
  if (id === parentId || getDescendants(document.spec, id).includes(parentId)) throw new Error('不能将组件移入自己或自己的子组件');
  const oldParentId = findParent(document.spec, id);
  if (!oldParentId) throw new Error('找不到组件的父容器');
  const next = structuredClone(document);
  const oldChildren = next.spec.elements[oldParentId].children!;
  const oldIndex = oldChildren.indexOf(id);
  const target = next.spec.elements[parentId];
  target.children ??= [];
  let insertionIndex = clampIndex(index, target.children.length);
  if (oldParentId === parentId && oldIndex < insertionIndex) insertionIndex--;
  oldChildren.splice(oldIndex, 1);
  target.children.splice(insertionIndex, 0, id);
  return parseDocument(next);
}
export function removeElement(document: DesignDocument, id: string): DesignDocument {
  if (id === document.spec.root) throw new Error('不能删除页面根节点');
  requireElement(document.spec, id);
  const next = structuredClone(document);
  const parentId = findParent(next.spec, id);
  if (!parentId) throw new Error('找不到组件的父容器');
  next.spec.elements[parentId].children = next.spec.elements[parentId].children!.filter(child => child !== id);
  for (const child of [id, ...getDescendants(next.spec, id)]) delete next.spec.elements[child];
  return parseDocument(next);
}
export function duplicateElement(document: DesignDocument, id: string): { document: DesignDocument; id: string } {
  if (id === document.spec.root) throw new Error('不能复制页面根节点');
  requireElement(document.spec, id);
  const next = structuredClone(document);
  const parentId = findParent(next.spec, id);
  if (!parentId) throw new Error('找不到组件的父容器');
  const cloneTree = (sourceId: string): string => {
    const source = next.spec.elements[sourceId];
    const clonedId = newId(source.type);
    next.spec.elements[clonedId] = { type: source.type, props: structuredClone(source.props), ...(source.children ? { children: source.children.map(cloneTree) } : {}) };
    return clonedId;
  };
  const clonedId = cloneTree(id);
  const siblings = next.spec.elements[parentId].children!;
  siblings.splice(siblings.indexOf(id) + 1, 0, clonedId);
  return { document: parseDocument(next), id: clonedId };
}
export function updateElementProps(document: DesignDocument, id: string, patch: Record<string, unknown>): DesignDocument {
  const next = structuredClone(document);
  const element = requireElement(next.spec, id);
  element.props = { ...element.props, ...patch };
  return parseDocument(next);
}
export function createInitialDocument(): DesignDocument {
  return parseDocument({
    version: 2,
    name: 'Orbit · 产品展示页',
    theme: createTheme('violet', 'light'),
    spec: {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['navigation', 'hero', 'features', 'footer'] },
        navigation: { type: 'Navigation', props: { brand: 'Orbit', links: '产品,灵感,关于我们', action: '开始探索' } },
        hero: { type: 'Section', props: { kind: 'hero', align: 'center' }, children: ['hero-badge', 'hero-heading', 'hero-description', 'hero-actions', 'hero-caption'] },
        'hero-badge': { type: 'Badge', props: { label: '✦  为每一个好想法而造', variant: 'secondary' } },
        'hero-heading': { type: 'Heading', props: { text: '把想法，变成\n下一件作品。', level: 'h1' } },
        'hero-description': { type: 'Text', props: { text: '一个让创意自然发生的空间。\n从第一个灵感，到每一个精心打磨的细节。', tone: 'muted' } },
        'hero-actions': { type: 'Stack', props: { direction: 'row', align: 'center' }, children: ['hero-primary', 'hero-secondary'] },
        'hero-primary': { type: 'Button', props: { label: '开始你的创作  ↗', variant: 'default', href: '#features' } },
        'hero-secondary': { type: 'Button', props: { label: '探索更多可能', variant: 'outline', href: '#features' } },
        'hero-caption': { type: 'Text', props: { text: '自由组合 · 一致设计 · 即刻呈现', tone: 'muted' } },
        features: { type: 'Section', props: { kind: 'content', align: 'center' }, children: ['features-heading', 'features-description', 'feature-grid'] },
        'features-heading': { type: 'Heading', props: { text: '少一点繁琐，多一点创造。', level: 'h2' } },
        'features-description': { type: 'Text', props: { text: '把注意力留给真正重要的事，其他的交给 Orbit。', tone: 'muted' } },
        'feature-grid': { type: 'Stack', props: { direction: 'grid', align: 'start' }, children: ['feature-compose', 'feature-theme', 'feature-ship'] },
        'feature-compose': { type: 'Card', props: { title: '从组合开始', description: '像搭积木一样组织页面，让灵感顺着你的节奏落地。', icon: 'layers' }, children: [] },
        'feature-theme': { type: 'Card', props: { title: '每一处，都恰到好处', description: '一套设计语言贯穿始终，让细节自然保持一致。', icon: 'sliders' }, children: [] },
        'feature-ship': { type: 'Card', props: { title: '好作品，不必等待', description: '所见即所得。从想法到呈现，让创造更进一步。', icon: 'zap' }, children: [] },
        footer: { type: 'Section', props: { kind: 'cta', align: 'center' }, children: ['footer-separator', 'footer-text'] },
        'footer-separator': { type: 'Separator', props: {} },
        'footer-text': { type: 'Text', props: { text: 'Orbit®   ·   为创造而生。', tone: 'muted' } },
      },
    },
  });
}
