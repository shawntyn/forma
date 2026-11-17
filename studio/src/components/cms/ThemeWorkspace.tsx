import { cn } from '@/lib/utils';
import { useEffect, useMemo, useState } from 'react';
import { Globe2, LockKeyhole, Monitor, Save, Sparkles } from 'lucide-react';
import { api, type CmsSite } from '../../lib/cms';
import { createInitialDocument } from '../../lib/document';
import { themeToCSS, themeToStyle, type Theme } from '../../lib/tokens';
import { CanvasRenderer } from '../editor/CanvasRenderer';
import { ThemePanel } from '../editor/ThemePanel';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { CmsNotice, errorMessage } from './shared';

export function ThemeWorkspace({
  site,
  onSiteChange,
  onDirtyChange,
}: {
  site: CmsSite;
  onSiteChange: (site: CmsSite) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  // Keep the revision tied to the snapshot being edited. A session refresh may
  // supply a newer site prop while this tab still contains unsaved changes.
  const [baseline, setBaseline] = useState<CmsSite>(() => structuredClone(site));
  const [theme, setTheme] = useState<Theme>(() => structuredClone(site.theme));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState<'publish' | 'reload' | null>(null);
  const spec = useMemo(() => createInitialDocument().spec, []);
  const dirty = JSON.stringify(theme) !== JSON.stringify(baseline.theme);
  const unpublished = baseline.themeRevision !== baseline.publishedThemeRevision;
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  async function save() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const next = await api<CmsSite>('/site/theme', {
        method: 'PUT',
        body: { theme, revision: baseline.themeRevision },
      });
      setTheme(next.theme);
      setBaseline(next);
      onSiteChange(next);
      setMessage('主题草稿已保存。页面编辑器现在使用这套主题，线上外观将在发布后更新。');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const next = await api<CmsSite>('/site/theme/publish', {
        method: 'POST',
        body: { revision: baseline.themeRevision },
      });
      setBaseline(next);
      onSiteChange(next);
      setConfirm(null);
      setMessage('全站主题已发布，所有线上页面已统一更新。');
    } catch (cause) {
      setConfirm(null);
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function reload() {
    setBusy(true);
    setError('');
    try {
      const next = await api<CmsSite>('/site');
      setTheme(next.theme);
      setBaseline(next);
      onSiteChange(next);
      setConfirm(null);
      setMessage('已载入服务器上的最新主题。');
    } catch (cause) {
      setConfirm(null);
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  function exportCSS() {
    const url = URL.createObjectURL(new Blob([themeToCSS(theme)], { type: 'text/css' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'site-theme.css';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section>
      <div className="cms-section-heading">
        <div>
          <span className="cms-eyebrow">ONE SHARED DESIGN SYSTEM</span>
          <h1>一个网站，一种设计语言。</h1>
          <p>统一调整全站颜色、排版、间距与圆角。每一页、每一个组件，都保持一致。</p>
        </div>
        <div className="cms-heading-actions">
          <Button variant="outline" onPress={() => void save()} isDisabled={!dirty || busy}>
            <Save size={15} />
            {busy ? '处理中…' : '保存主题草稿'}
          </Button>
          <Button onPress={() => setConfirm('publish')} isDisabled={dirty || !unpublished || busy}>
            <Globe2 size={15} />
            发布全站主题
          </Button>
        </div>
      </div>
      <div className="cms-theme-state">
        <span className={cn('cms-page-status', dirty || unpublished ? 'changed' : 'published')}>
          <i />
          {dirty ? '有未保存修改' : unpublished ? '主题草稿待发布' : '全站主题已同步'}
        </span>
        <span>
          {dirty
            ? '先保存主题草稿，再发布到网站。'
            : `草稿版本 ${baseline.themeRevision} · 线上版本 ${baseline.publishedThemeRevision}`}
        </span>
        <Button variant="link" size="sm" onPress={() => setConfirm('reload')} isDisabled={busy}>
          重新载入
        </Button>
      </div>
      {error && (
        <CmsNotice error>
          {error} 请保留当前修改；若其他管理员已更新主题，可重新载入后再编辑。
        </CmsNotice>
      )}
      {message && <CmsNotice>{message}</CmsNotice>}
      <div className="cms-theme-layout">
        <fieldset className="cms-theme-controls" disabled={busy}>
          <legend className="sr-only">全站设计 tokens</legend>
          <ThemePanel
            theme={theme}
            onChange={(next) => {
              setTheme(next);
              setMessage('');
            }}
            onExportCSS={exportCSS}
          />
        </fieldset>
        <div className="cms-theme-example">
          <div className="cms-preview-bar">
            <span>
              <Monitor size={15} />
              主题实时预览
            </span>
            <span>
              <Sparkles size={13} />
              Orbit 示例
            </span>
          </div>
          <div
            className={cn('cms-theme-canvas', theme.mode === 'dark' && 'dark')}
            style={themeToStyle(theme)}
          >
            <CanvasRenderer spec={spec} selectedId={null} preview onSelect={() => {}} />
          </div>
          <p className="cms-theme-footnote">
            <LockKeyhole size={14} />
            所有页面共用全站 tokens，不提供单个组件的样式覆盖。
          </p>
        </div>
      </div>
      <Dialog
        isOpen={confirm !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirm(null);
        }}
      >
        <DialogContent className="cms-dialog">
          <DialogHeader>
            <DialogTitle>
              {confirm === 'publish' ? '将主题应用到整个网站？' : '重新载入最新主题？'}
            </DialogTitle>
            <DialogDescription>
              {confirm === 'publish'
                ? '所有已发布页面的全局视觉主题会统一更新。页面内容和页面草稿不会被发布。'
                : dirty
                  ? '当前未保存的主题修改会被替换为服务器上的最新草稿。'
                  : '载入其他管理员可能刚刚保存的主题草稿。'}
            </DialogDescription>
          </DialogHeader>
          <div className="cms-dialog-actions">
            <Button variant="outline" onPress={() => setConfirm(null)} isDisabled={busy}>
              取消
            </Button>
            <Button
              onPress={() => void (confirm === 'publish' ? publish() : reload())}
              isDisabled={busy}
            >
              {busy ? '处理中…' : confirm === 'publish' ? '发布全站主题' : '载入最新主题'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
