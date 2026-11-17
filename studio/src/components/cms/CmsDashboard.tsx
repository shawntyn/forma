import { useCallback, useState } from 'react';
import { Files, Globe2, Layers3, LogOut, Sparkles, UsersRound } from 'lucide-react';
import type { CmsSite, CmsUser } from '../../lib/cms';
import { Button, ButtonLink } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { PageLibrary } from './PageLibrary';
import { TeamManagement } from './TeamManagement';
import { ThemeWorkspace } from './ThemeWorkspace';

type Section = 'pages' | 'theme' | 'team';
export interface CmsDashboardProps {
  user: CmsUser;
  site: CmsSite;
  onEdit: (id: string) => void;
  onLogout: () => void;
  onSiteChange: (site: CmsSite) => void;
  initialSection?: Section;
}
export function CmsDashboard({
  user,
  site,
  onEdit,
  onLogout,
  onSiteChange,
  initialSection = 'pages',
}: CmsDashboardProps) {
  const [section, setSection] = useState<Section>(initialSection);
  const [themeDirty, setThemeDirty] = useState(false);
  const [pending, setPending] = useState<{ run: () => void } | null>(null);
  const onDirtyChange = useCallback((dirty: boolean) => setThemeDirty(dirty), []);
  function leave(run: () => void) {
    if (themeDirty) setPending({ run });
    else run();
  }
  return (
    <div className="cms-app">
      <header className="cms-header">
        <div className="cms-header-inner">
          <div className="brand">
            <span className="brand-symbol">
              <Layers3 size={20} strokeWidth={2.5} />
            </span>
            <span>
              forma<span className="brand-dot">.</span>
            </span>
          </div>
          <span className="cms-brand-divider" />
          <div className="cms-site-label">
            <Globe2 size={15} />
            <strong>{site.name}</strong>
            <span>网站后台</span>
          </div>
          <div className="cms-account">
            <span className="cms-account-avatar">{user.name.slice(0, 1).toUpperCase()}</span>
            <span>
              {user.name}
              <small>管理员</small>
            </span>
            <ButtonLink
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              variant="ghost"
              size="sm"
              className="px-sm"
              aria-label="访问主站"
            >
              <Globe2 size={16} />
              <span className="hidden vp-sm:inline">访问主站</span>
            </ButtonLink>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="退出登录"
              onPress={() => leave(onLogout)}
            >
              <LogOut size={16} />
            </Button>
          </div>
        </div>
        <nav className="cms-nav" aria-label="后台导航">
          <Button
            variant="ghost"
            className={section === 'pages' ? 'active' : ''}
            aria-current={section === 'pages' ? 'page' : undefined}
            onPress={() => section !== 'pages' && leave(() => setSection('pages'))}
          >
            <Files size={16} />
            页面管理
          </Button>
          <Button
            variant="ghost"
            className={section === 'theme' ? 'active' : ''}
            aria-current={section === 'theme' ? 'page' : undefined}
            onPress={() => section !== 'theme' && leave(() => setSection('theme'))}
          >
            <Sparkles size={16} />
            全站主题
          </Button>
          <Button
            variant="ghost"
            className={section === 'team' ? 'active' : ''}
            aria-current={section === 'team' ? 'page' : undefined}
            onPress={() => section !== 'team' && leave(() => setSection('team'))}
          >
            <UsersRound size={16} />
            管理员
          </Button>
          <span className="cms-nav-caption">
            <span className="cms-shared-dot" />
            共享工作空间
          </span>
        </nav>
      </header>
      <main className="cms-main">
        {section === 'pages' ? (
          <PageLibrary onEdit={onEdit} />
        ) : section === 'theme' ? (
          <ThemeWorkspace site={site} onSiteChange={onSiteChange} onDirtyChange={onDirtyChange} />
        ) : (
          <TeamManagement user={user} />
        )}
      </main>
      <footer className="cms-footer">
        <span>FORMA / CONTENT STUDIO</span>
        <span>让创作更自由，让设计更一致。</span>
      </footer>
      <Dialog
        isOpen={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <DialogContent className="cms-dialog">
          <DialogHeader>
            <DialogTitle>主题修改还没有保存</DialogTitle>
            <DialogDescription>
              离开后将丢弃当前未保存的主题修改。你可以留在这里，先保存主题草稿。
            </DialogDescription>
          </DialogHeader>
          <div className="cms-dialog-actions">
            <Button variant="outline" onPress={() => setPending(null)}>
              继续编辑
            </Button>
            <Button
              onPress={() => {
                const action = pending;
                setPending(null);
                setThemeDirty(false);
                action?.run();
              }}
            >
              放弃修改并离开
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
export default CmsDashboard;
