import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Check, ChevronDown, Download, Globe2, Link2, Moon, Search, Sun, Upload, RotateCcw } from 'lucide-react';
import {
  TOKEN_DEFINITIONS, THEME_PRESETS, createTheme, resolveTheme, getTokenReference,
  setTokenValue, colorToHex, hexToColor, themeSchema, themeToDTCG, themeToStyle,
  type Theme, type TokenDefinition, type DTCGColor, type DTCGDimension,
  type DTCGDuration, type DTCGShadow, type DTCGValue, type DTCGGroup, type DTCGToken,
} from '../../lib/tokens';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import './theme-editor.css';

interface ThemePanelProps { theme: Theme; onChange: (theme: Theme) => void; onExportCSS: () => void }
const layers = [
  { id: 'semantic', label: '语义', description: '按用途定义全站视觉。引用基础值，或设置统一的自定义值。' },
  { id: 'primitive', label: '基础', description: '调节色板与尺寸刻度。引用它的语义和组件会一起更新。' },
  { id: 'component', label: '组件', description: '作用于全站的同类组件，不是单个页面或实例的样式。' },
] as const;
type Layer = typeof layers[number]['id'];
const ranks: Record<Layer, number> = { primitive: 0, semantic: 1, component: 2 };

function NumericInput({ label, value, min, max, step = 0.125, unit, onCommit }: {
  label: string; value: number; min?: number; max?: number; step?: number; unit: string; onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState('');
  useEffect(() => { setDraft(String(value)); setError(''); }, [value]);
  const commit = () => {
    const number = Number(draft);
    if (!draft.trim() || !Number.isFinite(number) || (min !== undefined && number < min) || (max !== undefined && number > max)) {
      setError(`请输入 ${min ?? '有效数值'} 至 ${max ?? '有效数值'}`); return;
    }
    try { if (number !== value) onCommit(number); setError(''); } catch (cause) { setError(cause instanceof Error ? cause.message : '数值无效'); }
  };
  return <div className="dtcg-number-field"><div><input type="number" aria-label={label} aria-invalid={!!error} value={draft} min={min} max={max} step={step}
    onChange={event => { setDraft(event.target.value); setError(''); }} onBlur={commit}
    onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { setDraft(String(value)); setError(''); } }} /><span>{unit}</span></div>
    {error && <small role="alert">{error}</small>}</div>;
}

function ColorInput({ label, value, onCommit }: { label: string; value: DTCGColor; onCommit: (value: DTCGColor) => void }) {
  const hex = colorToHex(value);
  const [draft, setDraft] = useState(hex);
  const [error, setError] = useState('');
  useEffect(() => { setDraft(hex); setError(''); }, [hex]);
  const commit = () => {
    try {
      if (!/^#[\da-f]{6}$/i.test(draft.trim())) throw new Error('请输入六位颜色，例如 #7655d9');
      if (draft.trim().toLowerCase() !== hex.toLowerCase()) onCommit({ ...hexToColor(draft.trim()), alpha: value.alpha ?? 1 });
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '颜色无效'); }
  };
  return <div className="dtcg-color-editor"><div className="dtcg-color-inputs">
    <input type="color" aria-label={`选择 ${label}`} value={hex} onChange={event => { const color = event.target.value; setDraft(color); setError(''); if (color !== hex) onCommit({ ...hexToColor(color), alpha: value.alpha ?? 1 }); }} />
    <input aria-label={label} value={draft} aria-invalid={!!error} spellCheck={false} onChange={event => { setDraft(event.target.value); setError(''); }} onBlur={commit}
      onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { setDraft(hex); setError(''); } }} />
  </div>{error && <small role="alert">{error}</small>}</div>;
}

function TokenValueInput({ definition: token, value, onCommit }: { definition: TokenDefinition; value: DTCGValue; onCommit: (value: DTCGValue) => void }) {
  const label = `${token.label} ${token.path}`;
  if (token.type === 'color') return <ColorInput label={label} value={value as DTCGColor} onCommit={onCommit} />;
  if (token.type === 'dimension' || token.type === 'duration') {
    const dimension = value as DTCGDimension | DTCGDuration;
    return <NumericInput label={label} value={dimension.value} min={token.min} max={token.max} step={token.step} unit={dimension.unit} onCommit={number => onCommit({ ...dimension, value: number })} />;
  }
  if (token.type === 'fontFamily') {
    const choices = [
      { label: '现代无衬线 · Inter', value: ['Inter', 'system-ui', 'sans-serif'] },
      { label: '系统无衬线', value: ['system-ui', 'sans-serif'] },
      { label: '衬线 · Georgia', value: ['Georgia', 'serif'] },
      { label: '等宽', value: ['ui-monospace', 'monospace'] },
    ];
    const encoded = JSON.stringify(value);
    return <select aria-label={label} value={encoded} onChange={event => onCommit(JSON.parse(event.target.value))}>
      {!choices.some(choice => JSON.stringify(choice.value) === encoded) && <option value={encoded}>{Array.isArray(value) ? value.join(', ') : String(value)}</option>}
      {choices.map(choice => <option key={choice.label} value={JSON.stringify(choice.value)}>{choice.label}</option>)}
    </select>;
  }
  if (token.type === 'shadow') {
    const shadow = value as DTCGShadow;
    return <div className="dtcg-shadow-editor"><ColorInput label={`${label} 颜色`} value={shadow.color} onCommit={color => onCommit({ ...shadow, color })} />
      <NumericInput label={`${label} 透明度`} value={shadow.color.alpha ?? 1} min={0} max={1} step={0.01} unit="α" onCommit={alpha => onCommit({ ...shadow, color: { ...shadow.color, alpha } })} />
      {(['offsetX', 'offsetY', 'blur', 'spread'] as const).map(key => <label key={key}><span>{{ offsetX: '水平', offsetY: '垂直', blur: '模糊', spread: '扩散' }[key]}</span>
        <NumericInput label={`${label} ${key}`} value={shadow[key].value} min={key === 'blur' ? 0 : -8} max={8} step={0.125} unit={shadow[key].unit} onCommit={number => onCommit({ ...shadow, [key]: { ...shadow[key], value: number } })} /></label>)}
    </div>;
  }
  return null;
}

function TokenEditor({ theme, definition: token, value, onChange }: { theme: Theme; definition: TokenDefinition; value: DTCGValue; onChange: (theme: Theme) => void }) {
  const [error, setError] = useState('');
  const reference = getTokenReference(theme, token.path);
  const sources = TOKEN_DEFINITIONS.filter(candidate => candidate.type === token.type && ranks[candidate.layer] <= ranks[token.layer] && candidate.path !== token.path);
  const update = (next: DTCGValue) => {
    try { onChange(setTokenValue(theme, token.path, next)); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '无法更新主题'); }
  };
  return <div className="dtcg-token" data-token-path={token.path}>
    <div className="dtcg-token-heading"><strong>{token.label}</strong><span>{token.type}</span></div><code>{token.path}</code>
    <TokenValueInput definition={token} value={value} onCommit={update} />
    {token.layer !== 'primitive' && <label className="dtcg-reference"><Link2 size={12} /><select aria-label={`${token.label} 引用来源 ${token.path}`} value={reference ?? ''} onChange={event => update(event.target.value ? `{${event.target.value}}` : value)}>
      <option value="">自定义全局值</option>{sources.map(source => <option key={source.path} value={source.path}>{source.path}</option>)}
    </select></label>}
    {error && <p className="dtcg-error" role="alert">{error}</p>}
  </div>;
}

export function ThemePanel({ theme, onChange, onExportCSS }: ThemePanelProps) {
  const [layer, setLayer] = useState<Layer>('semantic');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const importRef = useRef<HTMLInputElement>(null);
  const resolved = useMemo(() => resolveTheme(theme), [theme]);
  const definitions = TOKEN_DEFINITIONS.filter(token => token.layer === layer && `${token.path} ${token.label} ${token.group}`.toLowerCase().includes(query.toLowerCase()));
  const groups = [...new Set(definitions.map(token => token.group))];
  const applyPalette = (next: Theme) => {
    // A color preset must preserve typography, geometry, motion and their aliases.
    const result = structuredClone(next);
    for (const token of TOKEN_DEFINITIONS) {
      if (token.type === 'color') continue;
      const reference = getTokenReference(theme, token.path);
      const path = token.path.split('.');
      let group = result.tokens;
      for (const segment of path.slice(0, -1)) group = group[segment] as DTCGGroup;
      const key = path.at(-1)!;
      group[key] = { ...(group[key] as DTCGToken), $value: reference ? `{${reference}}` : structuredClone(resolved[token.path]) };
    }
    // Validate the complete graph once: intermediate aliases may have different bounds.
    onChange(themeSchema.parse(result)); setError(''); setMessage('已应用配色，保留排版、间距、圆角与动效设置。');
  };
  function exportTokens() {
    const url = URL.createObjectURL(new Blob([themeToDTCG(theme)], { type: 'application/design-tokens+json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'site-theme.tokens.json'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage('已导出当前主题的 DTCG tokens。');
  }
  async function importTokens(file?: File) {
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error('主题文件须小于 1 MB');
      const next = themeSchema.parse({ ...theme, tokens: JSON.parse(await file.text()) });
      onChange(next); setError(''); setMessage('主题已导入为草稿，可在预览中检查效果。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '无法读取主题文件'); setMessage(''); }
    finally { if (importRef.current) importRef.current.value = ''; }
  }
  return <div className="theme-panel dtcg-panel">
    <div className="theme-global-note"><Globe2 size={14} /><span>全站设计主题 <span className="theme-global-note-detail">· 所有页面共享</span></span></div>
    <section className="panel-section"><div className="section-heading"><h3>外观模式</h3><span>Appearance</span></div>
      <div className="theme-modes" role="group" aria-label="外观模式">
        <button className={`theme-mode ${theme.mode === 'light' ? 'is-active' : ''}`} aria-pressed={theme.mode === 'light'} onClick={() => applyPalette(createTheme(theme.preset, 'light'))}><Sun size={14} />浅色</button>
        <button className={`theme-mode ${theme.mode === 'dark' ? 'is-active' : ''}`} aria-pressed={theme.mode === 'dark'} onClick={() => applyPalette(createTheme(theme.preset, 'dark'))}><Moon size={14} />深色</button>
      </div><p className="dtcg-hint">切换模式或预设会应用对应配色。</p>
    </section>
    <section className="panel-section"><div className="section-heading"><h3>主题预设</h3><span>Presets</span></div>
      <div className="theme-presets">{THEME_PRESETS.map(preset => <button key={preset.id} className={`theme-preset ${theme.preset === preset.id ? 'is-active' : ''}`} aria-label={`应用${preset.label}主题`} aria-pressed={theme.preset === preset.id} onClick={() => applyPalette(createTheme(preset.id, theme.mode))}>
        <span className="preset-swatch" style={{ background: preset.color }}>{theme.preset === preset.id && <Check size={13} />}</span><span className="preset-name">{preset.label}</span>
      </button>)}</div>
    </section>
    <section className="panel-section dtcg-preview-section"><div className="section-heading"><h3>组件预览</h3><span>Live preview</span></div>
      <div className="dtcg-preview" style={themeToStyle(theme) as CSSProperties}>
        <Card><CardHeader><Badge variant="secondary">统一的设计语言</Badge><CardTitle>一个主题，无限可能。</CardTitle><CardDescription>颜色、排版、间距同步更新。</CardDescription></CardHeader><CardContent><Button size="sm">主要操作</Button></CardContent></Card>
      </div>
    </section>
    <section className="panel-section dtcg-controls">
      <div className="dtcg-layers" role="group" aria-label="Token 层级">{layers.map(item => <button key={item.id} aria-pressed={layer === item.id} onClick={() => setLayer(item.id)}>{item.label}</button>)}</div>
      <p className="dtcg-hint">{layers.find(item => item.id === layer)?.description}</p>
      <label className="dtcg-search"><Search size={14} /><input aria-label="搜索主题 tokens" placeholder="搜索颜色、字号、间距…" value={query} onChange={event => setQuery(event.target.value)} /></label>
    </section>
    {error && <p className="dtcg-import-error" role="alert">导入失败：{error}</p>}{message && <p className="dtcg-message" role="status">{message}</p>}
    <div className="theme-token-groups">{groups.map((group, index) => <details className="token-group" key={`${layer}-${group}`} open={!!query || index === 0}>
      <summary className="token-group-heading"><span><strong>{group}</strong><small>{definitions.filter(token => token.group === group).length} tokens</small></span><ChevronDown size={14} /></summary>
      <div className="token-group-body">{definitions.filter(token => token.group === group).map(token => <TokenEditor key={token.path} theme={theme} definition={token} value={resolved[token.path]} onChange={onChange} />)}</div>
    </details>)}</div>
    {!definitions.length && <p className="dtcg-message">没有匹配的主题参数。</p>}
    <div className="theme-footer-actions">
      <input ref={importRef} type="file" accept=".json,.tokens,application/json,application/design-tokens+json" aria-label="导入 DTCG 文件" hidden onChange={event => void importTokens(event.target.files?.[0])} />
      <button className="panel-action" onClick={exportTokens}><Download size={14} />导出 DTCG tokens</button>
      <button className="panel-action panel-action-secondary" onClick={() => importRef.current?.click()}><Upload size={14} />导入 DTCG tokens</button>
      <button className="panel-action panel-action-secondary" onClick={onExportCSS}><Download size={14} />导出主题 CSS</button>
      <button className="panel-action panel-action-secondary" onClick={() => { onChange(createTheme(theme.preset, theme.mode)); setError(''); setMessage('已恢复当前预设的全部主题参数。'); }}><RotateCcw size={13} />重置当前主题</button>
    </div>
  </div>;
}
