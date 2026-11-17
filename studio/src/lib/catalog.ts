import { defineCatalog } from '@json-render/core';
import { schema } from '@json-render/react/schema';
import { z } from 'zod';

const shortText = z.string().max(500);
const bodyText = z.string().max(5000);
export const propSchemas = {
  Page: z.object({}).strict(),
  Section: z
    .object({ kind: z.enum(['hero', 'content', 'cta']), align: z.enum(['start', 'center']) })
    .strict(),
  Stack: z
    .object({ direction: z.enum(['row', 'column', 'grid']), align: z.enum(['start', 'center']) })
    .strict(),
  Heading: z.object({ text: shortText, level: z.enum(['h1', 'h2', 'h3']) }).strict(),
  Text: z.object({ text: bodyText, tone: z.enum(['default', 'muted']) }).strict(),
  Button: z
    .object({
      label: shortText,
      variant: z.enum(['default', 'secondary', 'outline', 'ghost']),
      href: z
        .string()
        .max(2048)
        .refine(
          (value) => value === '' || /^(https?:\/\/|mailto:|tel:|#|\/(?!\/))/.test(value),
          '链接须为 http(s)、mailto、tel、锚点或站内路径',
        ),
    })
    .strict(),
  Badge: z
    .object({ label: shortText, variant: z.enum(['default', 'secondary', 'outline']) })
    .strict(),
  Card: z
    .object({
      title: shortText,
      description: bodyText,
      icon: z.enum(['layers', 'zap', 'sliders', 'none']),
    })
    .strict(),
  Input: z
    .object({ label: shortText, placeholder: shortText, type: z.enum(['text', 'email']) })
    .strict(),
  Separator: z.object({}).strict(),
  Navigation: z.object({ brand: shortText, links: shortText, action: shortText }).strict(),
};
export type ComponentType = keyof typeof propSchemas;
export type PropertyField = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  options?: string[];
};
export type ComponentDefinition = {
  type: ComponentType;
  label: string;
  description: string;
  category: 'layout' | 'basic' | 'content';
  container: boolean;
  defaultProps: Record<string, unknown>;
  fields: PropertyField[];
};
export const componentDefinitions: ComponentDefinition[] = [
  {
    type: 'Page',
    label: '页面',
    description: '页面根节点',
    category: 'layout',
    container: true,
    defaultProps: {},
    fields: [],
  },
  {
    type: 'Section',
    label: '区块',
    description: '组织页面的内容分区',
    category: 'layout',
    container: true,
    defaultProps: { kind: 'content', align: 'start' },
    fields: [
      { key: 'kind', label: '区块类型', type: 'select', options: ['hero', 'content', 'cta'] },
      { key: 'align', label: '内容对齐', type: 'select', options: ['start', 'center'] },
    ],
  },
  {
    type: 'Stack',
    label: '布局容器',
    description: '水平、垂直或网格排列',
    category: 'layout',
    container: true,
    defaultProps: { direction: 'row', align: 'start' },
    fields: [
      { key: 'direction', label: '排列方式', type: 'select', options: ['row', 'column', 'grid'] },
      { key: 'align', label: '内容对齐', type: 'select', options: ['start', 'center'] },
    ],
  },
  {
    type: 'Heading',
    label: '标题',
    description: '清晰的内容层级',
    category: 'basic',
    container: false,
    defaultProps: { text: '一个新的好想法', level: 'h2' },
    fields: [
      { key: 'text', label: '标题文字', type: 'textarea' },
      { key: 'level', label: '标题层级', type: 'select', options: ['h1', 'h2', 'h3'] },
    ],
  },
  {
    type: 'Text',
    label: '文本',
    description: '讲述你的故事',
    category: 'basic',
    container: false,
    defaultProps: { text: '从这里开始，写下你想分享的内容。', tone: 'muted' },
    fields: [
      { key: 'text', label: '正文内容', type: 'textarea' },
      { key: 'tone', label: '语义层级', type: 'select', options: ['default', 'muted'] },
    ],
  },
  {
    type: 'Button',
    label: '按钮',
    description: '引导下一步行动',
    category: 'basic',
    container: false,
    defaultProps: { label: '立即开始', variant: 'default', href: '' },
    fields: [
      { key: 'label', label: '按钮文字', type: 'text' },
      {
        key: 'variant',
        label: '组件变体',
        type: 'select',
        options: ['default', 'secondary', 'outline', 'ghost'],
      },
      { key: 'href', label: '跳转链接', type: 'text' },
    ],
  },
  {
    type: 'Badge',
    label: '徽章',
    description: '轻量的标签与状态',
    category: 'basic',
    container: false,
    defaultProps: { label: 'NEW · 新鲜上线', variant: 'secondary' },
    fields: [
      { key: 'label', label: '徽章文字', type: 'text' },
      {
        key: 'variant',
        label: '组件变体',
        type: 'select',
        options: ['default', 'secondary', 'outline'],
      },
    ],
  },
  {
    type: 'Input',
    label: '输入框',
    description: '收集简单的用户输入',
    category: 'basic',
    container: false,
    defaultProps: { label: '邮箱地址', placeholder: 'hello@example.com', type: 'email' },
    fields: [
      { key: 'label', label: '字段标签', type: 'text' },
      { key: 'placeholder', label: '占位文字', type: 'text' },
      { key: 'type', label: '输入类型', type: 'select', options: ['text', 'email'] },
    ],
  },
  {
    type: 'Separator',
    label: '分隔线',
    description: '划分内容的边界',
    category: 'basic',
    container: false,
    defaultProps: {},
    fields: [],
  },
  {
    type: 'Card',
    label: '卡片',
    description: '聚焦一个功能或观点',
    category: 'content',
    container: true,
    defaultProps: {
      title: '为好想法留个位置',
      description: '每个细节都值得被认真对待。',
      icon: 'layers',
    },
    fields: [
      { key: 'title', label: '卡片标题', type: 'text' },
      { key: 'description', label: '卡片描述', type: 'textarea' },
      { key: 'icon', label: '图标', type: 'select', options: ['layers', 'zap', 'sliders', 'none'] },
    ],
  },
  {
    type: 'Navigation',
    label: '导航栏',
    description: '品牌与页面入口',
    category: 'content',
    container: false,
    defaultProps: { brand: 'Orbit', links: '产品,资源,关于', action: '开始探索' },
    fields: [
      { key: 'brand', label: '品牌名称', type: 'text' },
      { key: 'links', label: '导航项（逗号分隔）', type: 'text' },
      { key: 'action', label: '行动按钮', type: 'text' },
    ],
  },
];
export const componentDefinitionMap = Object.fromEntries(
  componentDefinitions.map((definition) => [definition.type, definition]),
) as Record<ComponentType, ComponentDefinition>;
export function canHaveChildren(type: string): boolean {
  return !!componentDefinitionMap[type as ComponentType]?.container;
}
export const catalog = defineCatalog(schema, {
  actions: {},
  components: {
    Page: {
      props: propSchemas.Page,
      slots: ['default'],
      description:
        'Root page. Visual appearance is controlled only by shared semantic design tokens.',
    },
    Section: {
      props: propSchemas.Section,
      slots: ['default'],
      description: 'Semantic content section with a fixed layout preset.',
    },
    Stack: {
      props: propSchemas.Stack,
      slots: ['default'],
      description: 'A horizontal, vertical, or responsive grid layout.',
    },
    Heading: { props: propSchemas.Heading, description: 'Semantic heading.' },
    Text: { props: propSchemas.Text, description: 'Paragraph text with a semantic tone.' },
    Button: {
      props: propSchemas.Button,
      description: 'Accessible button with an optional safe link.',
    },
    Badge: { props: propSchemas.Badge, description: 'Semantic badge.' },
    Card: {
      props: propSchemas.Card,
      slots: ['default'],
      description: 'Content card with title and supporting text.',
    },
    Input: { props: propSchemas.Input, description: 'Accessible text or email input.' },
    Separator: { props: propSchemas.Separator, description: 'Content separator.' },
    Navigation: {
      props: propSchemas.Navigation,
      description: 'Navigation block with a brand and comma-separated labels.',
    },
  },
});
