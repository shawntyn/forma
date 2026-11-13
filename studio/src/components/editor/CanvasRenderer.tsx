import { Children, createContext, useContext, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { defineRegistry, JSONUIProvider, Renderer, type ComponentRegistry, type ComponentRenderProps } from '@json-render/react';
import type { UIElement } from '@json-render/core';
import { ArrowRight, Layers, SlidersHorizontal, Zap } from 'lucide-react';
import { catalog } from '@/lib/catalog';
import type { DesignSpec } from '@/lib/document';
import { ButtonLink } from '@/components/ui/button';
import { Link } from 'react-aria-components/Link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, TextField, Label } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type DropPosition = 'inside' | 'before' | 'after';
export interface CanvasRendererProps {
  spec: DesignSpec;
  selectedId: string | null;
  preview: boolean;
  onSelect: (id: string) => void;
  onDrop?: (event: DragEvent<HTMLDivElement>, id: string, position: DropPosition) => void;
  onDragStart?: (event: DragEvent<HTMLDivElement>, id: string) => void;
}
const EditorContext = createContext<Omit<CanvasRendererProps, 'spec'> | null>(null);
const containers = new Set(['Page', 'Section', 'Stack', 'Card']);

function OrbitMark({ small = false }: { small?: boolean }) {
  return <svg width={small ? 24 : 30} height={small ? 24 : 30} viewBox="0 0 32 32" fill="none" aria-hidden="true"><circle cx="16" cy="16" r="9" stroke="currentColor" strokeWidth="2.8"/><ellipse cx="16" cy="16" rx="15" ry="5.4" transform="rotate(-42 16 16)" stroke="currentColor" strokeWidth="2"/><circle cx="26.7" cy="6.5" r="2.5" fill="currentColor"/></svg>;
}
function EmptyDropZone({ children }: { children: ReactNode }) {
  const editor = useContext(EditorContext);
  if (!editor || editor.preview || Children.count(children) > 0) return children;
  return <div className="empty-drop-zone ds-empty-drop-zone">拖入组件，开始构建</div>;
}
function safeHref(href: string) {
  return /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i.test(href) ? href : '#';
}

// The catalog exposes content and structural choices. Every visual recipe reads
// the site's semantic/component tokens; saved nodes cannot override that theme.
const { registry: componentRegistry } = defineRegistry(catalog, {
  components: {
    Page: ({ children }) => <div className="canvas-page ds-page"><EmptyDropZone>{children}</EmptyDropZone></div>,
    Section: ({ props, children }) => <section id={props.kind === 'content' ? 'features' : props.kind === 'cta' ? 'contact' : undefined} className={cn('canvas-section ds-section', `ds-section--${props.kind}`, `ds-align--${props.align}`)}>
      {props.kind === 'hero' && <div className="ds-hero-decoration" aria-hidden="true"><div/><div/><div/></div>}
      <EmptyDropZone>{children}</EmptyDropZone>
    </section>,
    Stack: ({ props, children }) => <div className={cn('canvas-stack ds-stack', `ds-stack--${props.direction}`, `ds-align--${props.align}`)}><EmptyDropZone>{children}</EmptyDropZone></div>,
    Heading: ({ props }) => {
      const Tag = props.level;
      return <Tag className={cn('ds-heading', `ds-heading--${props.level}`, props.level === 'h1' && 'canvas-heading')}>{props.text}</Tag>;
    },
    Text: ({ props }) => <p className={cn('ds-text', props.tone === 'muted' && 'ds-text--muted')}>{props.text}</p>,
    Button: ({ props }) => <ButtonLink variant={props.variant} size="lg" href={safeHref(props.href)}>{props.label}{props.variant === 'default' && <ArrowRight/>}</ButtonLink>,
    Badge: ({ props }) => <Badge variant={props.variant}><span className="ds-badge-dot"/>{props.label}</Badge>,
    Card: ({ props, children }) => {
      const Icon = props.icon === 'layers' ? Layers : props.icon === 'zap' ? Zap : SlidersHorizontal;
      return <Card className="ds-content-card"><CardHeader>{props.icon !== 'none' && <div className="ds-card-icon"><Icon strokeWidth={1.7}/></div>}<CardTitle>{props.title}</CardTitle><CardDescription>{props.description}</CardDescription></CardHeader>{Children.count(children) > 0 && <CardContent>{children}</CardContent>}</Card>;
    },
    Input: ({ props }) => <TextField type={props.type} className="ds-field"><Label>{props.label}</Label><Input placeholder={props.placeholder}/></TextField>,
    Separator: () => <div role="separator" className="ds-separator"/>,
    Navigation: ({ props }) => <nav aria-label="页面导航" className="canvas-nav ds-navigation"><Link href="#" className="ds-navigation-brand"><OrbitMark small/>{props.brand}</Link><div className="ds-navigation-links">{props.links.split(',').map((item, i) => <Link key={i} href="#features">{item.trim()}</Link>)}</div><ButtonLink size="sm" variant="outline" className="ds-navigation-action" href="#contact">{props.action}<ArrowRight/></ButtonLink></nav>,
  },
});

type EditableElement = UIElement & { __editorId?: string };
function NodeFrame({ id, type, children }: { id: string; type: string; children: ReactNode }) {
  const editor = useContext(EditorContext);
  const [dropPosition, setDropPosition] = useState<DropPosition | null>(null);
  if (!editor || editor.preview) return children;
  const isContainer = containers.has(type);
  function position(event: DragEvent<HTMLDivElement>): DropPosition {
    if (type === 'Page') return 'inside';
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientY - rect.top) / Math.max(rect.height, 1);
    if (isContainer && fraction > 0.23 && fraction < 0.77) return 'inside';
    return fraction < 0.5 ? 'before' : 'after';
  }
  return <div
    className={cn('editable-node', `node-${type}`, editor.selectedId === id && 'is-selected', dropPosition && `drop-${dropPosition}`)}
    data-element-id={id}
    data-element-type={type}
    draggable={type !== 'Page'}
    onClickCapture={(event) => {
      // React Aria handles press events at the control. Select the nearest editor
      // node first so edit mode never activates links or consumes selection.
      if ((event.target as Element).closest('[data-element-id]') !== event.currentTarget) return;
      event.preventDefault(); event.stopPropagation(); editor.onSelect(id);
    }}
    onDragStart={(event) => { event.stopPropagation(); setDropPosition(null); editor.onDragStart?.(event, id); }}
    onDragEnd={() => setDropPosition(null)}
    onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = event.dataTransfer.effectAllowed === 'copy' ? 'copy' : 'move'; setDropPosition(position(event)); }}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropPosition(null); }}
    onDrop={(event) => { event.preventDefault(); event.stopPropagation(); const targetPosition = position(event); setDropPosition(null); editor.onDrop?.(event, id, targetPosition); }}
  >
    {editor.selectedId === id && <span className="node-label" aria-hidden="true">{type}</span>}
    {children}
  </div>;
}

const editorRegistry: ComponentRegistry = Object.fromEntries(Object.entries(componentRegistry).map(([type, Component]) => {
  function EditableComponent(props: ComponentRenderProps) {
    return <NodeFrame id={(props.element as EditableElement).__editorId ?? ''} type={type}><Component {...props}/></NodeFrame>;
  }
  return [type, EditableComponent];
}));

export function CanvasRenderer({ spec, ...editor }: CanvasRendererProps) {
  // Editor identity is runtime metadata, not a component prop or saved style.
  const renderSpec = useMemo(() => ({ ...spec, elements: Object.fromEntries(Object.entries(spec.elements).map(([id, element]) => [id, { ...element, __editorId: id }])) }), [spec]);
  return <EditorContext.Provider value={editor}><JSONUIProvider registry={editorRegistry}><div className="@container min-h-full"><Renderer spec={renderSpec} registry={editorRegistry}/></div></JSONUIProvider></EditorContext.Provider>;
}
