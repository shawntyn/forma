import { useCallback, useEffect, useRef, useState, type DragEvent, type CSSProperties } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronDown, ChevronRight, CircleHelp, Code2, Copy, Download, FileJson, Frame, GripVertical, Layers3, LayoutGrid, LockKeyhole, Monitor, MousePointer2, Play, Plus, Redo2, Search, Settings2, Smartphone, Sparkles, Square, Tablet, Trash2, Type, Undo2, Upload, X, Braces, Minus, Circle, TextCursorInput, Navigation, AlignLeft, Rows3, WandSparkles } from 'lucide-react';
import { Button } from './components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './components/ui/dialog';
import { CanvasRenderer } from './components/editor/CanvasRenderer';
import { ThemePanel } from './components/editor/ThemePanel';
import { componentDefinitions, createInitialDocument, insertElement, moveElement, removeElement, duplicateElement, updateElementProps, findParent, canHaveChildren, parseDocument, type ComponentType, type DesignDocument } from './lib/document';
import { themeToCSS, themeToStyle } from './lib/tokens';
import { useDocument } from './lib/use-document';
import { cn } from './lib/utils';
import { publicPagePath } from './lib/routes';

const ICONS: Record<string, typeof Square> = { Page: Frame, Section: LayoutGrid, Stack: Rows3, Heading: Type, Text: AlignLeft, Button: MousePointer2, Badge: Circle, Card: Square, Input: TextCursorInput, Separator: Minus, Navigation };
const DEVICE_WIDTHS = { desktop: 1100, tablet: 768, mobile: 390 };
const DRAG_KEY = 'application/x-forma-element';
type DragPayload = { kind: 'new'; type: ComponentType } | { kind: 'move'; id: string };
type ExportTab = 'project' | 'spec' | 'css';

function downloadFile(filename: string, value: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const anchor = window.document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function IconButton({ label, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" className="icon-button" aria-label={label} title={label} {...props}>{children}</button>;
}

function DraftField({ value, onCommit, onError, multiline = false, ariaLabel, maxLength, onDraftChange }: { onDraftChange?: (dirty: boolean) => void; value: string; onCommit: (value: string) => void; onError: (message: string) => void; multiline?: boolean; ariaLabel?: string; maxLength?: number }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const save = () => {
    if (draft === value) { onDraftChange?.(false); return; }
    try { onCommit(draft); } catch (error) { setDraft(value); onError(error instanceof Error ? error.message : '内容无效'); } finally { onDraftChange?.(false); }
  };
  const handleKey = (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (!multiline || event.metaKey || event.ctrlKey)) { event.preventDefault(); event.currentTarget.blur(); }
    if (event.key === 'Escape') { event.stopPropagation(); setDraft(value); onDraftChange?.(false); }
  };
  const props = { value: draft, 'aria-label': ariaLabel, maxLength, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setDraft(event.target.value); onDraftChange?.(event.target.value !== value); }, onBlur: save, onKeyDown: handleKey };
  return multiline ? <textarea {...props} rows={3} /> : <input {...props} />;
}

export interface WorkspaceEditorProps {
  initialDocument: DesignDocument;
  onDocumentChange: (document: DesignDocument) => void;
  onPendingChange: (dirty: boolean) => void;
  onBack: () => void;
  onSave: () => void;
  onPublish: () => void;
  onTheme: () => void;
  dirty: boolean;
  saving: boolean;
  slug: string;
  userName: string;
}
export default function App({ workspace }: { workspace?: WorkspaceEditorProps } = {}) {
  const { document: doc, commit, undo, redo, canUndo, canRedo, saveStatus, warning } = useDocument({ initialDocument: workspace?.initialDocument, persist: !workspace, onChange: workspace?.onDocumentChange });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [leftTab, setLeftTab] = useState<'components' | 'layers'>('components');
  const [rightTab, setRightTab] = useState<'theme' | 'properties'>('theme');
  const [search, setSearch] = useState('');
  const [device, setDevice] = useState<keyof typeof DEVICE_WIDTHS>('desktop');
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [viewportWidth, setViewportWidth] = useState(800);
  const [pageHeight, setPageHeight] = useState(1050);
  const [preview, setPreview] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportTab, setExportTab] = useState<ExportTab>('project');
  const [helpOpen, setHelpOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [copied, setCopied] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'left' | 'right' | null>(null);
  const [dragging, setDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const selected = selectedId ? doc.spec.elements[selectedId] : undefined;
  const selectedMeta = componentDefinitions.find(c => c.type === selected?.type);
  const width = DEVICE_WIDTHS[device];
  const scale = zoom === 'fit' ? Math.min(1, Math.max(.15, viewportWidth / width)) : zoom;
  const root = doc.spec.elements[doc.spec.root];

  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3600); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { if (warning) notify(warning); }, [warning, notify]);
  useEffect(() => {
    const observer = new ResizeObserver(entries => setViewportWidth(entries[0].contentRect.width));
    if (viewportRef.current) observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, [preview]);
  useEffect(() => {
    const observer = new ResizeObserver(entries => setPageHeight(entries[0].contentRect.height));
    if (pageRef.current) observer.observe(pageRef.current);
    return () => observer.disconnect();
  }, [preview]);
  useEffect(() => { if (selectedId && !doc.spec.elements[selectedId]) setSelectedId(null); }, [doc, selectedId]);
  const select = useCallback((id: string) => { setSelectedId(id); setRightTab('properties'); }, []);
  const safe = useCallback((action: () => void) => { try { action(); } catch (e) { notify(e instanceof Error ? e.message : '操作失败，请重试'); } }, [notify]);
  const deleteSelected = useCallback(() => {
    if (!selectedId || selectedId === doc.spec.root) return;
    safe(() => { commit(removeElement(doc, selectedId)); setSelectedId(null); notify('组件已删除 · 可撤销'); });
  }, [selectedId, doc, commit, safe, notify]);
  const duplicateSelected = useCallback(() => {
    if (!selectedId || selectedId === doc.spec.root) return;
    safe(() => { const result = duplicateElement(doc, selectedId); commit(result.document); select(result.id); notify('已复制组件'); });
  }, [selectedId, doc, commit, select, safe, notify]);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const editing = (event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"]');
      if (event.key === 'Escape') { setPreview(false); setMobilePanel(null); if (!exportOpen && !helpOpen) setSelectedId(null); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's' && workspace && !exportOpen && !helpOpen && !resetOpen) {
        event.preventDefault(); (window.document.activeElement as HTMLElement)?.blur(); workspace.onSave(); return;
      }
      if (editing || exportOpen || helpOpen || resetOpen || preview) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateSelected(); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if (workspace) workspace.onSave(); else { setExportTab('project'); setExportOpen(true); } }
      if (event.key === 'Backspace' || event.key === 'Delete') { event.preventDefault(); deleteSelected(); }
    };
    window.addEventListener('keydown', handle); return () => window.removeEventListener('keydown', handle);
  }, [undo, redo, deleteSelected, duplicateSelected, exportOpen, helpOpen, resetOpen, preview, workspace]);
  const insertionTarget = () => {
    if (selectedId && selected) {
      if (canHaveChildren(selected.type)) return { parent: selectedId, index: undefined };
      const parent = findParent(doc.spec, selectedId);
      if (parent) return { parent, index: (doc.spec.elements[parent].children ?? []).indexOf(selectedId) + 1 };
    }
    return { parent: doc.spec.root, index: undefined };
  };
  const add = (type: ComponentType) => safe(() => {
    const { parent, index } = insertionTarget(); const result = insertElement(doc, type, parent, index);
    commit(result.document); select(result.id); notify(`已添加 ${componentDefinitions.find(c => c.type === type)?.label ?? type}`);
  });
  const dragStart = (event: DragEvent, payload: DragPayload) => {
    event.stopPropagation(); event.dataTransfer.setData(DRAG_KEY, JSON.stringify(payload)); event.dataTransfer.effectAllowed = payload.kind === 'new' ? 'copy' : 'move'; setDragging(true);
  };
  const drop = (event: DragEvent, targetId: string, position: 'inside' | 'before' | 'after') => {
    event.preventDefault(); event.stopPropagation(); setDragging(false);
    const raw = event.dataTransfer.getData(DRAG_KEY); if (!raw) return;
    safe(() => {
      const payload = JSON.parse(raw) as DragPayload;
      let parent = targetId; let index: number | undefined;
      if (position !== 'inside' || !canHaveChildren(doc.spec.elements[targetId].type)) {
        parent = findParent(doc.spec, targetId) ?? doc.spec.root;
        index = (doc.spec.elements[parent].children ?? []).indexOf(targetId) + (position === 'after' ? 1 : 0);
      }
      if (payload.kind === 'new') { const result = insertElement(doc, payload.type, parent, index); commit(result.document); select(result.id); notify('组件已放入画布'); }
      else if (payload.kind === 'move') { commit(moveElement(doc, payload.id, parent, index)); select(payload.id); }
    });
  };
  const moveSelected = (offset: number) => safe(() => {
    if (!selectedId) return;
    const parent = findParent(doc.spec, selectedId); if (!parent) return;
    const siblings = doc.spec.elements[parent].children ?? []; const index = siblings.indexOf(selectedId);
    if (index + offset < 0 || index + offset >= siblings.length) return;
    commit(moveElement(doc, selectedId, parent, offset > 0 ? index + 2 : index - 1));
  });
  const importFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 1_000_000) { notify('文件过大，请选择 1 MB 以内的项目 JSON'); return; }
    try { const next = parseDocument(JSON.parse(await file.text())); commit(workspace ? { ...next, theme: doc.theme } : next); setSelectedId(null); notify(workspace ? '页面内容已导入，保留全站主题' : '项目已导入'); }
    catch (e) { notify(`导入失败：${e instanceof Error ? e.message : '无效 JSON'}`); }
    if (importRef.current) importRef.current.value = '';
  };
  const exported = exportTab === 'css' ? themeToCSS(doc.theme) : JSON.stringify(exportTab === 'spec' ? doc.spec : doc, null, 2);
  const copyExport = async () => { try { await navigator.clipboard.writeText(exported); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { notify('无法访问剪贴板，请下载文件'); } };
  const selectedParent = selectedId ? findParent(doc.spec, selectedId) : null;
  const selectedIndex = selectedParent ? (doc.spec.elements[selectedParent].children ?? []).indexOf(selectedId!) : -1;

  const renderLayer = (id: string, depth = 0): React.ReactNode => {
    const element = doc.spec.elements[id]; if (!element) return null;
    const Icon = ICONS[element.type] ?? Square;
    const text = String(element.props.text ?? element.props.label ?? element.props.title ?? element.props.brand ?? '');
    return <div key={id}>
      <button className={cn('layer-row', selectedId === id && 'active')} style={{ paddingLeft: 12 + depth * 15 }} onClick={() => select(id)} draggable={id !== doc.spec.root} onDragStart={e => dragStart(e, { kind: 'move', id })} onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('layer-over'); }} onDragLeave={e => e.currentTarget.classList.remove('layer-over')} onDrop={e => { e.currentTarget.classList.remove('layer-over'); const rect = e.currentTarget.getBoundingClientRect(); const y = (e.clientY - rect.top) / rect.height; drop(e, id, canHaveChildren(element.type) && y > .25 && y < .75 ? 'inside' : y < .5 ? 'before' : 'after'); }}>
        {element.children?.length ? <ChevronDown size={11} /> : <span className="layer-indent" />}<Icon size={14} /><span>{text || componentDefinitions.find(c => c.type === element.type)?.label || element.type}</span>{id !== doc.spec.root && <GripVertical size={12} className="layer-grip" />}
      </button>
      {element.children?.map(child => renderLayer(child, depth + 1))}
    </div>;
  };

  return <div className={cn('studio-app', preview && 'is-preview')} onDragEnd={() => setDragging(false)}>
    <header className="app-header">
      {workspace && <IconButton label="返回页面管理" onClick={workspace.onBack}><ArrowLeft size={17} /></IconButton>}
      <div className="brand"><span className="brand-symbol"><Layers3 size={20} strokeWidth={2.5} /></span><span>forma<span className="brand-dot">.</span></span></div>
      <span className="header-divider" />
      <div className="project-name"><DraftField onDraftChange={workspace?.onPendingChange} ariaLabel="项目名称" value={doc.name} maxLength={80} onCommit={value => { if (!value.trim()) throw new Error("项目名称不能为空"); commit({ ...doc, name: value.trim() }); }} onError={notify} /><ChevronDown size={13} /></div>
      <span className={cn('save-status', saveStatus === 'error' && 'error')}><span />{workspace ? workspace.saving ? '保存中…' : workspace.dirty ? '有未保存修改' : '草稿已保存' : saveStatus === 'saving' ? '保存中…' : saveStatus === 'error' ? '保存失败，请导出' : '已保存到本机'}</span>
      <div className="header-actions">
        {!preview && <><div className="history-actions"><IconButton label="撤销 ⌘Z" onClick={undo} disabled={!canUndo}><Undo2 size={16} /></IconButton><IconButton label="重做 ⇧⌘Z" onClick={redo} disabled={!canRedo}><Redo2 size={16} /></IconButton></div><span className="header-divider" /><button className="quiet-button export-button" onClick={() => { setExportTab('project'); setExportOpen(true); }}><Code2 size={16} /><span>导出</span></button></>}
        <Button size="sm" className="preview-button" onPress={() => setPreview(!preview)}>{preview ? <ArrowLeft size={14} /> : <Play size={13} fill="currentColor" />}{preview ? '返回编辑器' : '预览'}{!preview && <span className="keycap">↗</span>}</Button>
        {workspace && !preview && <><Button size="sm" variant="outline" onPress={workspace.onSave} isDisabled={workspace.saving || !workspace.dirty}>保存草稿</Button><Button size="sm" onPress={workspace.onPublish} isDisabled={workspace.saving}>发布页面</Button></>}
        <span className="user-avatar" title={workspace?.userName ?? '本地工作空间'}>{workspace?.userName.slice(0, 1) ?? 'F'}</span>
      </div>
    </header>
    <div className="mobile-panel-bar"><button onClick={() => setMobilePanel(mobilePanel === 'left' ? null : 'left')}><Layers3 size={15} />组件与图层</button><span>设计工作台</span><button onClick={() => setMobilePanel(mobilePanel === 'right' ? null : 'right')}><Settings2 size={15} />样式与属性</button></div>
    <div className="workspace">
      {!preview && <aside className={cn('left-sidebar', mobilePanel === 'left' && 'mobile-open')}>
        <div className="sidebar-tabs"><button className={leftTab === 'components' ? 'active' : ''} onClick={() => setLeftTab('components')}><Plus size={15} />组件</button><button className={leftTab === 'layers' ? 'active' : ''} onClick={() => setLeftTab('layers')}><Layers3 size={15} />图层<span className="tab-count">{Object.keys(doc.spec.elements).length}</span></button></div>
        <div className="sidebar-scroll">
          {leftTab === 'components' ? <>
            <div className="search-field"><Search size={14} /><input placeholder="搜索组件…" aria-label="搜索组件" value={search} onChange={e => setSearch(e.target.value)} />{search && <button aria-label="清空搜索" onClick={() => setSearch('')}><X size={12} /></button>}</div>
            <div className="library-heading"><span>SHADCN / UI</span><span className="small-tag">组件库</span></div>
            {(['layout', 'basic', 'content'] as const).map(category => {
              const items = componentDefinitions.filter(c => c.type !== 'Page' && c.category === category && `${c.label} ${c.type}`.toLowerCase().includes(search.toLowerCase()));
              if (!items.length) return null;
              return <section className="component-group" key={category}><h3>{({ layout: '布局', basic: '基础组件', content: '内容区块' })[category]}<span>{items.length}</span></h3><div className="component-grid">{items.map(item => {
                const Icon = ICONS[item.type] ?? Square;
                return <button className="component-tile" key={item.type} draggable onDragStart={e => dragStart(e, { kind: 'new', type: item.type })} onClick={() => add(item.type)} title={`${item.description} · 点击添加或拖入画布`} aria-label={`添加${item.label}`}><span className={`component-illustration illustration-${item.type}`}><Icon size={23} strokeWidth={1.5} />{item.type === 'Button' && <span className="mini-button-line" />}</span><span className="component-label">{item.label}<Plus size={11} /></span></button>;
              })}</div></section>;
            })}
            {search && !componentDefinitions.some(c => c.type !== 'Page' && `${c.label} ${c.type}`.toLowerCase().includes(search.toLowerCase())) && <div className="empty-state"><Search size={24} /><p>没有匹配的组件</p><button className="text-link" onClick={() => setSearch('')}>查看全部</button></div>}
            <div className="drag-hint"><MousePointer2 size={15} /><p>将组件拖入画布<br /><span>也可以点击，添加到选中容器</span></p></div>
          </> : <><div className="layers-heading"><span><Frame size={13} />主页</span><span className="small-tag">/</span></div><div className="layer-tree">{renderLayer(doc.spec.root)}</div><div className="drag-hint"><GripVertical size={15} /><p>拖动图层调整结构<br /><span>拖到容器中间可嵌套组件</span></p></div></>}
        </div>
        <div className="sidebar-bottom"><button className="workspace-badge" onClick={() => setHelpOpen(true)}><span className="workspace-icon"><Braces size={16} /></span><span>你的设计，由你掌控<small>json-render 驱动</small></span><CircleHelp size={15} /></button></div>
      </aside>}
      <main className="canvas-area">
        <div className="canvas-toolbar"><div className="canvas-breadcrumb"><Frame size={14} /><span>{preview ? '交互预览' : workspace ? publicPagePath(workspace.slug) : '主页'}</span><ChevronRight size={12} /><span className="muted">{({ desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile' })[device]}</span></div><div className="device-switch" aria-label="预览设备">{(['desktop', 'tablet', 'mobile'] as const).map(d => { const Icon = d === 'desktop' ? Monitor : d === 'tablet' ? Tablet : Smartphone; return <button key={d} className={device === d ? 'active' : ''} aria-label={d === 'desktop' ? '桌面视图' : d === 'tablet' ? '平板视图' : '手机视图'} aria-pressed={device === d} onClick={() => { setDevice(d); setZoom('fit'); }}><Icon size={16} /></button>; })}</div><div className="zoom-control"><select aria-label="画布缩放" value={zoom} onChange={e => setZoom(e.target.value === 'fit' ? 'fit' : Number(e.target.value))}><option value="fit">适应 {Math.round(scale * 100)}%</option><option value="0.5">50%</option><option value="0.75">75%</option><option value="1">100%</option><option value="1.25">125%</option></select><ChevronDown size={11} /></div></div>
        <div className={cn('canvas-viewport', dragging && 'is-dragging')} ref={viewportRef} onClick={() => setSelectedId(null)}>
          <div className="artboard-wrap" style={{ width: width * scale, minHeight: pageHeight * scale + 34 }}>
            <div className="artboard-label"><span><Monitor size={12} />{({ desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile' })[device]}<span className="artboard-dimensions">{width} × {Math.round(pageHeight)}</span></span><span className="breakpoint-tag">{preview ? 'LIVE PREVIEW' : '默认断点'}</span></div>
            <div className="artboard-transform" style={{ width, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
              <div className={cn('artboard', doc.theme.mode === 'dark' && 'dark')} ref={pageRef} style={themeToStyle(doc.theme) as CSSProperties}>
                <CanvasRenderer spec={doc.spec} selectedId={selectedId} preview={preview} onSelect={select} onDrop={drop} onDragStart={(e, id) => dragStart(e, { kind: 'move', id })} />
                {!root.children?.length && !preview && <button className="empty-canvas" onClick={e => { e.stopPropagation(); add('Section'); }} onDragOver={e => e.preventDefault()} onDrop={e => drop(e, doc.spec.root, 'inside')}><Plus size={28} /><strong>从第一个区块开始</strong><span>拖入组件，或点击添加区块</span></button>}
              </div>
            </div>
          </div>
          <div className="canvas-end-note">{preview ? '所有组件共享同一套设计语言' : <><LockKeyhole size={11} />视觉样式由全局 Design Tokens 统一管理</>}</div>
        </div>
        <div className="canvas-statusbar"><span><span className="status-dot" />{preview ? '预览模式' : '设计模式'}<span className="status-separator">/</span>{Object.keys(doc.spec.elements).length} 个组件</span><button onClick={() => setHelpOpen(true)}><CircleHelp size={12} />快捷键与帮助<span>?</span></button></div>
      </main>
      {!preview && <aside className={cn('right-sidebar', mobilePanel === 'right' && 'mobile-open')}>
        <div className="sidebar-tabs right-tabs"><button className={rightTab === 'theme' ? 'active' : ''} onClick={() => setRightTab('theme')}><Sparkles size={14} />全局主题</button><button className={rightTab === 'properties' ? 'active' : ''} onClick={() => setRightTab('properties')}><Settings2 size={14} />组件属性</button></div>
        <div className="sidebar-scroll">
          {rightTab === 'theme' ? workspace ? <div className="editor-site-theme"><Sparkles size={28} /><h3>一个网站，一套设计语言</h3><p>当前页面使用全站主题。颜色、排版和间距等视觉参数在网站后台统一调整，主题发布后对所有线上页面生效。</p><Button variant="outline" onPress={workspace.onTheme}>管理全站主题<ArrowRight size={14} /></Button><span>页面只保存内容与结构</span></div> : <ThemePanel theme={doc.theme} onChange={theme => commit({ ...doc, theme })} onExportCSS={() => { setExportTab('css'); setExportOpen(true); }} /> : selected && selectedMeta ? <div className="properties-panel"><div className="property-component"><span className="property-component-icon">{(() => { const Icon = ICONS[selected.type] ?? Square; return <Icon size={22} />; })()}</span><div><strong>{selectedMeta.label}</strong><small>{selected.type}</small></div><span className="small-tag">Forma UI</span></div><div className="property-section"><h3>内容与结构</h3>{selectedMeta.fields.length === 0 && <p className="property-note">这个组件没有可编辑内容。可从左侧添加子组件。</p>}{selectedMeta.fields.map(field => <label className="property-field" key={`${selectedId}-${field.key}`}><span>{field.label}</span>{field.type === 'select' ? <select value={String(selected.props[field.key] ?? '')} onChange={e => safe(() => commit(updateElementProps(doc, selectedId!, { [field.key]: e.target.value })))}>{field.options?.map(option => <option key={option} value={option}>{option}</option>)}</select> : <DraftField onDraftChange={workspace?.onPendingChange} multiline={field.type === 'textarea'} value={String(selected.props[field.key] ?? '')} onCommit={value => commit(updateElementProps(doc, selectedId!, { [field.key]: value }))} onError={notify} />}</label>)}</div><div className="style-lock"><LockKeyhole size={16} /><div><strong>样式与全局主题同步</strong><p>视觉参数统一来自全站语义 tokens，不开放组件样式覆盖。</p><button onClick={() => setRightTab('theme')}>编辑全局主题<ArrowRight size={12} /></button></div></div>{selectedId !== doc.spec.root && <div className="property-section"><h3>排列与操作</h3><div className="arrange-actions"><button onClick={() => moveSelected(-1)} disabled={selectedIndex <= 0}><ArrowUp size={14} />上移</button><button onClick={() => moveSelected(1)} disabled={!selectedParent || selectedIndex >= (doc.spec.elements[selectedParent].children?.length ?? 0) - 1}><ArrowDown size={14} />下移</button></div><button className="property-action" onClick={duplicateSelected}><Copy size={14} />复制组件<span>⌘D</span></button><button className="property-action destructive" onClick={deleteSelected}><Trash2 size={14} />删除组件<span>⌫</span></button></div>}<div className="element-id">ELEMENT ID<span>{selectedId}</span></div></div> : <div className="empty-properties"><span><MousePointer2 size={30} strokeWidth={1.2} /></span><h3>让想法，落在画布上</h3><p>选择画布中的组件，<br />编辑内容、层级与排列。</p><button className="text-link" onClick={() => setRightTab('theme')}>先调整全局主题<ArrowRight size={13} /></button></div>}
        </div>
        <div className="right-sidebar-footer"><span><span className="status-dot" />统一的设计语言</span><LockKeyhole size={12} /></div>
      </aside>}
    </div>
    {mobilePanel && <button className="panel-scrim" aria-label="关闭侧栏" onClick={() => setMobilePanel(null)} />}
    {toast && <div className="toast" role="status"><Check size={15} /><span>{toast}</span><button onClick={() => setToast('')} aria-label="关闭提示"><X size={13} /></button></div>}
    <input className="sr-only" ref={importRef} type="file" accept="application/json,.json" aria-label="导入项目 JSON" onChange={e => void importFile(e.target.files?.[0])} />
    <Dialog isOpen={exportOpen} onOpenChange={setExportOpen}><DialogContent className="export-dialog"><DialogHeader><DialogTitle><Braces size={21} />把设计带到下一步</DialogTitle><DialogDescription>导出页面结构与主题。项目 JSON 可随时重新导入继续编辑。</DialogDescription></DialogHeader><div className="export-tabs">{(['project', 'spec', 'css'] as const).map(tab => <button key={tab} className={exportTab === tab ? 'active' : ''} onClick={() => setExportTab(tab)}>{tab === 'project' ? <FileJson size={14} /> : tab === 'spec' ? <Code2 size={14} /> : <Sparkles size={14} />}{({ project: '完整项目', spec: 'json-render spec', css: '主题 CSS' })[tab]}</button>)}</div><div className="code-preview"><div><span>{exportTab === 'css' ? 'theme.css' : exportTab === 'spec' ? 'page.spec.json' : 'project.forma.json'}</span><button onClick={copyExport}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? '已复制' : '复制'}</button></div><pre><code>{exported}</code></pre></div><div className="export-footer"><button className="quiet-button" onClick={() => importRef.current?.click()}><Upload size={15} />导入项目</button><Button onPress={() => downloadFile(exportTab === 'css' ? 'theme.css' : exportTab === 'spec' ? 'page.spec.json' : 'project.forma.json', exported, exportTab === 'css' ? 'text/css' : 'application/json')}><Download size={15} />下载{exportTab === 'css' ? ' CSS' : ' JSON'}</Button></div>{exportTab === 'spec' && <p className="export-note">Spec 使用项目内的受控 catalog 渲染；视觉主题请同时导出 CSS。</p>}</DialogContent></Dialog>
    <Dialog isOpen={helpOpen} onOpenChange={setHelpOpen}><DialogContent className="help-dialog"><DialogHeader><DialogTitle>为想法留出空间。</DialogTitle><DialogDescription>通过组件搭建页面，使用全站设计主题统一视觉，再发布给访客。</DialogDescription></DialogHeader><div className="help-steps"><p><span>01</span><strong>搭建页面</strong>拖入组件，或点击添加到当前选中的容器。</p><p><span>02</span><strong>组织内容</strong>点击画布编辑内容，在图层中拖动调整嵌套。</p><p><span>03</span><strong>统一风格</strong>全局主题统一控制颜色、圆角、排版与间距。</p></div><div className="keyboard-list"><span>撤销 / 重做<kbd>⌘ Z / ⇧ ⌘ Z</kbd></span><span>复制组件<kbd>⌘ D</kbd></span><span>删除组件<kbd>Delete</kbd></span><span>{workspace ? '保存草稿' : '导出项目'}<kbd>⌘ S</kbd></span><span>退出预览 / 取消选择<kbd>Esc</kbd></span></div><p className="property-note">Windows / Linux 使用 Ctrl 代替 ⌘。{workspace ? '使用保存草稿同步到服务器；发布后访客才能看到更新。' : '草稿自动保存在当前浏览器；导出 JSON 可跨设备保存。'}</p><div className="help-footer"><button className="quiet-button" onClick={() => { setHelpOpen(false); importRef.current?.click(); }}><Upload size={14} />导入项目</button><button className="quiet-button" onClick={() => { setHelpOpen(false); setResetOpen(true); }}><WandSparkles size={14} />重新开始</button></div></DialogContent></Dialog>
    <Dialog isOpen={resetOpen} onOpenChange={setResetOpen}><DialogContent><DialogHeader><DialogTitle>载入示例，重新开始？</DialogTitle><DialogDescription>当前页面将替换为 Orbit 示例。你可以撤销此操作，也可以先导出备份。</DialogDescription></DialogHeader><div className="export-footer"><Button variant="outline" onPress={() => setResetOpen(false)}>取消</Button><Button onPress={() => { commit(workspace ? { ...createInitialDocument(), name: doc.name, theme: doc.theme } : createInitialDocument()); setSelectedId(null); setResetOpen(false); notify('已载入示例，可撤销'); }}>载入示例</Button></div></DialogContent></Dialog>
  </div>;
}
