import {
  Children,
  createContext,
  useContext,
  useMemo,
  useState,
  type DragEvent,
  type ReactNode,
} from 'react';
import {
  defineRegistry,
  JSONUIProvider,
  Renderer,
  type ComponentRegistry,
  type ComponentRenderProps,
} from '@json-render/react';
import type { UIElement } from '@json-render/core';
import { ArrowRight, Layers, SlidersHorizontal, Zap } from 'lucide-react';
import { catalog } from '@/lib/catalog';
import type { ComponentType, DesignSpec } from '@/lib/document';
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
const sectionClasses = { hero: 'ds-section--hero', content: '', cta: 'ds-section--cta' };
const alignClasses = { start: 'ds-align--start', center: 'ds-align--center' };
const stackClasses = { row: 'ds-stack--row', column: 'ds-stack--column', grid: 'ds-stack--grid' };
const headingClasses = { h1: 'ds-heading--h1', h2: 'ds-heading--h2', h3: 'ds-heading--h3' };
const nodeClasses: Record<ComponentType, string> = {
  Page: 'node-Page',
  Section: 'node-Section',
  Stack: 'node-Stack',
  Heading: '',
  Text: '',
  Button: '',
  Badge: '',
  Card: 'node-Card',
  Input: 'node-Input',
  Separator: 'node-Separator',
  Navigation: 'node-Navigation',
};
const dropClasses = { inside: 'drop-inside', before: 'drop-before', after: 'drop-after' };
const containers = new Set(['Page', 'Section', 'Stack', 'Card']);

function OrbitMark({ small = false }: { small?: boolean }) {
  return (
    <svg
      width={small ? 24 : 30}
      height={small ? 24 : 30}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="9" stroke="currentColor" strokeWidth="2.8" />
      <ellipse
        cx="16"
        cy="16"
        rx="15"
        ry="5.4"
        transform="rotate(-42 16 16)"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="26.7" cy="6.5" r="2.5" fill="currentColor" />
    </svg>
  );
}
function EmptyDropZone({ children }: { children: ReactNode }) {
  const editor = useContext(EditorContext);
  if (!editor || editor.preview || Children.count(children) > 0) return children;
  return <div className="ds-empty-drop-zone">拖入组件，开始构建</div>;
}
function safeHref(href: string) {
  return /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i.test(href) ? href : '#';
}
function navigationLinks(value: string) {
  const occurrences = new Map<string, number>();
  return value.split(',').map((item) => {
    const label = item.trim();
    const occurrence = occurrences.get(label) ?? 0;
    occurrences.set(label, occurrence + 1);
    return { label, key: JSON.stringify([label, occurrence]) };
  });
}

// The catalog exposes content and structural choices. Every visual recipe reads
// the site's semantic/component tokens; saved nodes cannot override that theme.
const { registry: componentRegistry } = defineRegistry(catalog, {
  components: {
    Page: ({ children }) => (
      <div className="canvas-page ds-page">
        <EmptyDropZone>{children}</EmptyDropZone>
      </div>
    ),
    Section: ({ props, children }) => (
      <section
        id={props.kind === 'content' ? 'features' : props.kind === 'cta' ? 'contact' : undefined}
        className={cn(
          'canvas-section ds-section',
          sectionClasses[props.kind],
          alignClasses[props.align],
        )}
      >
        {props.kind === 'hero' && (
          <div className="ds-hero-decoration" aria-hidden="true">
            <div />
            <div />
            <div />
          </div>
        )}
        <EmptyDropZone>{children}</EmptyDropZone>
      </section>
    ),
    Stack: ({ props, children }) => (
      <div className={cn('ds-stack', stackClasses[props.direction], alignClasses[props.align])}>
        <EmptyDropZone>{children}</EmptyDropZone>
      </div>
    ),
    Heading: ({ props }) => {
      const Tag = props.level;
      return <Tag className={cn('ds-heading', headingClasses[props.level])}>{props.text}</Tag>;
    },
    Text: ({ props }) => (
      <p className={cn('ds-text', props.tone === 'muted' && 'ds-text--muted')}>{props.text}</p>
    ),
    Button: ({ props }) => (
      <ButtonLink variant={props.variant} size="lg" href={safeHref(props.href)}>
        {props.label}
        {props.variant === 'default' && <ArrowRight />}
      </ButtonLink>
    ),
    Badge: ({ props }) => (
      <Badge variant={props.variant}>
        <span className="ds-badge-dot" />
        {props.label}
      </Badge>
    ),
    Card: ({ props, children }) => {
      const Icon =
        props.icon === 'layers' ? Layers : props.icon === 'zap' ? Zap : SlidersHorizontal;
      return (
        <Card className="ds-content-card">
          <CardHeader>
            {props.icon !== 'none' && (
              <div className="ds-card-icon">
                <Icon strokeWidth={1.7} />
              </div>
            )}
            <CardTitle>{props.title}</CardTitle>
            <CardDescription>{props.description}</CardDescription>
          </CardHeader>
          {Children.count(children) > 0 && <CardContent>{children}</CardContent>}
        </Card>
      );
    },
    Input: ({ props }) => (
      <TextField type={props.type} className="ds-field">
        <Label>{props.label}</Label>
        <Input placeholder={props.placeholder} />
      </TextField>
    ),
    Separator: () => <hr className="ds-separator" />,
    Navigation: ({ props }) => (
      <nav aria-label="页面导航" className="ds-navigation">
        <Link href="#" className="ds-navigation-brand">
          <OrbitMark small />
          {props.brand}
        </Link>
        <div className="ds-navigation-links">
          {navigationLinks(props.links).map((item) => (
            <Link key={item.key} href="#features">
              {item.label}
            </Link>
          ))}
        </div>
        <ButtonLink size="sm" variant="outline" className="ds-navigation-action" href="#contact">
          {props.action}
          <ArrowRight />
        </ButtonLink>
      </nav>
    ),
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
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: This editor wrapper delegates selection and drag events; keyboard users select and move nodes through the layer buttons and property controls.
    <div
      role="presentation"
      className={cn(
        'editable-node',
        nodeClasses[type as ComponentType],
        editor.selectedId === id && 'is-selected',
        dropPosition && dropClasses[dropPosition],
      )}
      data-element-id={id}
      data-element-type={type}
      draggable={type !== 'Page'}
      onClickCapture={(event) => {
        // React Aria handles press events at the control. Select the nearest editor
        // node first so edit mode never activates links or consumes selection.
        if ((event.target as Element).closest('[data-element-id]') !== event.currentTarget) return;
        event.preventDefault();
        event.stopPropagation();
        editor.onSelect(id);
      }}
      onDragStart={(event) => {
        event.stopPropagation();
        setDropPosition(null);
        editor.onDragStart?.(event, id);
      }}
      onDragEnd={() => setDropPosition(null)}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect =
          event.dataTransfer.effectAllowed === 'copy' ? 'copy' : 'move';
        setDropPosition(position(event));
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setDropPosition(null);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const targetPosition = position(event);
        setDropPosition(null);
        editor.onDrop?.(event, id, targetPosition);
      }}
    >
      {editor.selectedId === id && (
        <span className="node-label" aria-hidden="true">
          {type}
        </span>
      )}
      {children}
    </div>
  );
}

const editorRegistry: ComponentRegistry = Object.fromEntries(
  Object.entries(componentRegistry).map(([type, Component]) => {
    // biome-ignore lint/correctness/noComponentHookFactories: The registry is built once at module initialization, so component identities remain stable across renders.
    function EditableComponent(props: ComponentRenderProps) {
      return (
        <NodeFrame id={(props.element as EditableElement).__editorId ?? ''} type={type}>
          <Component {...props} />
        </NodeFrame>
      );
    }
    return [type, EditableComponent];
  }),
);

export function CanvasRenderer({ spec, ...editor }: CanvasRendererProps) {
  // Editor identity is runtime metadata, not a component prop or saved style.
  const renderSpec = useMemo(
    () => ({
      ...spec,
      elements: Object.fromEntries(
        Object.entries(spec.elements).map(([id, element]) => [id, { ...element, __editorId: id }]),
      ),
    }),
    [spec],
  );
  return (
    <EditorContext.Provider value={editor}>
      <JSONUIProvider registry={editorRegistry}>
        <div className="@container min-h-full">
          <Renderer spec={renderSpec} registry={editorRegistry} />
        </div>
      </JSONUIProvider>
    </EditorContext.Provider>
  );
}
