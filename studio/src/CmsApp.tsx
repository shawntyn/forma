import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, ExternalLink, Globe2, Layers3, LoaderCircle, LockKeyhole, RefreshCw, ShieldCheck, Users, X } from 'lucide-react';
import Editor from './App';
import { Button } from './components/ui/button';
import { Input, Label, TextField } from './components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './components/ui/dialog';
import { CanvasRenderer } from './components/editor/CanvasRenderer';
import { CmsDashboard } from './components/cms/CmsDashboard';
import { ApiError, api, pageDocument, type CmsPage, type CmsPublicPage, type CmsSession, type CmsSite, type CmsUser } from './lib/cms';
import type { DesignDocument } from './lib/document';
import { themeToStyle } from './lib/tokens';
import { HOME_SLUG, publicPagePath, resolveSiteRoute } from './lib/routes';
import './cms.css';
import './cms-shell.css';

function errorMessage(error: unknown) { return error instanceof Error ? error.message : '操作失败，请重试'; }
function Brand() { return <div className="cms-brand"><span><Layers3 size={22} /></span><strong>forma.</strong><small>网站管理</small></div>; }
function Loading({ label = '正在加载工作空间…' }: { label?: string }) { return <div className="cms-loading"><LoaderCircle className="animate-spin" size={24} /><p>{label}</p></div>; }

function AuthScreen({ needsSetup, onSuccess }: { needsSetup: boolean; onSuccess: (user: CmsUser) => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try {
      const result = await api<{ user: CmsUser }>(needsSetup ? '/auth/setup' : '/auth/login', { method: 'POST', body: {
        email: data.get('email'), password: data.get('password'),
        ...(needsSetup ? { name: data.get('name'), siteName: data.get('siteName') } : {}),
      } });
      onSuccess(result.user);
    } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  return <main className="cms-auth"><section className="cms-auth-story"><Brand /><div className="cms-auth-story-content"><span className="cms-eyebrow">ONE WEBSITE. MANY CREATORS.</span><h1>让每一次更新，<br />都轻松发生。</h1><p>共同管理内容，各自发挥创意。<br />从草稿到发布，始终保持一致的品牌表达。</p><div className="cms-auth-features"><span><Users size={18} />共享页面工作空间</span><span><Globe2 size={18} />检查预览，再发布</span><span><LockKeyhole size={18} />全站统一的设计语言</span></div></div><small>Forma · One shared design system</small></section><section className="cms-auth-form"><div><span className="cms-auth-icon"><ShieldCheck size={25} /></span><h2>{needsSetup ? '创建网站工作空间' : '欢迎回来'}</h2><p>{needsSetup ? '设置网站名称和首位管理员，随后可添加同事一起管理。' : '登录管理员账号，继续完善你的网站。'}</p><form onSubmit={submit}>
    {needsSetup && <><TextField name="siteName" isRequired><Label>网站名称</Label><Input placeholder="例如：Orbit 官方网站" maxLength={100} required /></TextField><TextField name="name" isRequired><Label>你的姓名</Label><Input autoComplete="name" maxLength={80} required /></TextField></>}
    <TextField name="email" type="email" isRequired><Label>邮箱</Label><Input autoComplete="username" placeholder="name@example.com" maxLength={254} required /></TextField>
    <TextField name="password" type="password" isRequired><Label>密码</Label><Input autoComplete={needsSetup ? 'new-password' : 'current-password'} minLength={needsSetup ? 12 : 1} maxLength={128} placeholder={needsSetup ? '至少 12 位字符' : '输入登录密码'} required /></TextField>
    {error && <p className="cms-inline-error" role="alert">{error}</p>}<Button type="submit" isDisabled={busy}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : null}{needsSetup ? '创建并进入后台' : '登录工作空间'}<ArrowRight size={16} /></Button></form><div className="cms-auth-note"><LockKeyhole size={14} /><span>{needsSetup ? '创建后，其他管理员由已登录成员添加。' : '账号由网站管理员创建。如需访问，请联系你的管理员。'}</span></div></div></section></main>;
}

function PublicPage({ slug }: { slug: string }) {
  const [page, setPage] = useState<CmsPublicPage | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); setPage(null); setError(''); setMissing(false);
    api<CmsPublicPage>(`/public/pages/${encodeURIComponent(slug)}`, { signal: controller.signal }).then(setPage).catch(error => { if (!controller.signal.aborted) { setMissing(error instanceof ApiError && error.status === 404); setError(errorMessage(error)); } });
    return () => controller.abort();
  }, [slug, attempt]);
  useEffect(() => { document.title = page ? `${page.document.name}` : 'Forma'; return () => { document.title = 'Forma — 网站管理'; }; }, [page]);
  if (error) return <main className="cms-public-error"><Globe2 size={36} /><h1>{missing ? slug === HOME_SLUG ? '网站即将上线' : '页面不存在或已下线' : '暂时无法访问这个页面'}</h1><p>{missing ? slug === HOME_SLUG ? '首页内容还在准备中，发布后将在这里展示。' : '请检查页面地址，或返回网站首页。' : error}</p>{missing && slug !== HOME_SLUG ? <a href="/">返回网站首页</a> : <Button variant="outline" onPress={() => setAttempt(n => n + 1)}>重新加载</Button>}<a href="/admin">进入管理后台</a></main>;
  if (!page) return <Loading label="正在加载页面…" />;
  return <main className={`cms-published-page ${page.document.theme.mode === 'dark' ? 'dark' : ''}`} style={themeToStyle(page.document.theme) as CSSProperties}><CanvasRenderer spec={page.document.spec} selectedId={null} preview onSelect={() => {}} /></main>;
}

function PageEditor({ id, user, onBack, onTheme, onDirtyChange, onSiteChange }: { id: string; user: CmsUser; onBack: () => void; onTheme: () => void; onDirtyChange: (dirty: boolean) => void; onSiteChange: (site: CmsSite) => void }) {
  const [loaded, setLoaded] = useState<{ page: CmsPage; initial: DesignDocument } | null>(null);
  const [saved, setSaved] = useState('');
  const [pendingField, setPendingField] = useState(false);
  const [current, setCurrent] = useState<DesignDocument | null>(null);
  const currentRef = useRef<DesignDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState('');
  const [publishOpen, setPublishOpen] = useState(false);
  const [reloadOpen, setReloadOpen] = useState(false);
  const [generation, setGeneration] = useState(0);
  const dirty = pendingField || (!!current && JSON.stringify(current) !== saved);
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  useEffect(() => {
    const controller = new AbortController(); setError(''); setConflict(false); setLoaded(null); setCurrent(null); currentRef.current = null;
    Promise.all([api<CmsPage>(`/pages/${id}`, { signal: controller.signal }), api<CmsSite>('/site', { signal: controller.signal })]).then(([page, site]) => {
      if (controller.signal.aborted) return;
      if (page.archived) { setError('这个页面已归档，请先在页面管理中恢复。'); return; }
      const initial = pageDocument(page, site); setLoaded({ page, initial }); setCurrent(initial); currentRef.current = initial; setSaved(JSON.stringify(initial)); onSiteChange(site);
    }).catch(error => { if (!controller.signal.aborted) setError(errorMessage(error)); });
    return () => controller.abort();
  }, [id, generation, onSiteChange]);
  const changeDocument = useCallback((doc: DesignDocument) => { currentRef.current = doc; setCurrent(doc); setNotice(''); }, []);
  async function saveAndMaybePublish(publish = false) {
    if (!loaded || !currentRef.current || busyRef.current || conflict) return;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    (document.activeElement as HTMLElement)?.blur();
    const snapshot = currentRef.current;
    try {
      let nextPage = loaded.page;
      if (JSON.stringify(snapshot) !== saved) {
        nextPage = await api<CmsPage>(`/pages/${id}`, { method: 'PUT', body: { title: snapshot.name, slug: loaded.page.slug, spec: snapshot.spec, revision: loaded.page.revision } });
        // Preserve edits made while this request was in flight. Only the saved
        // snapshot becomes the clean baseline; currentRef remains authoritative.
        setSaved(JSON.stringify(snapshot)); setLoaded(previous => previous ? { ...previous, page: nextPage } : previous);
      }
      if (publish) {
        nextPage = await api<CmsPage>(`/pages/${id}/publish`, { method: 'POST', body: { revision: nextPage.revision } });
        setLoaded(previous => previous ? { ...previous, page: nextPage } : previous);
        setNotice(JSON.stringify(currentRef.current) === JSON.stringify(snapshot) ? '页面已发布，访客现在可以看到这个版本。' : '刚才的版本已发布；保存期间的新编辑仍待保存。');
      } else setNotice('草稿已保存到服务器。');
    } catch (error) { setError(errorMessage(error)); setConflict(error instanceof ApiError && error.status === 409); }
    finally { busyRef.current = false; setBusy(false); setPublishOpen(false); }
  }
  if (!loaded) return <div className="cms-editor-loading"><Button variant="ghost" onPress={onBack}><ArrowLeft size={16} />返回页面管理</Button>{error ? <div className="cms-load-error" role="alert"><h2>无法打开页面</h2><p>{error}</p><Button onPress={() => setGeneration(n => n + 1)}>重试</Button></div> : <Loading label="正在打开编辑器…" />}</div>;
  return <div className="cms-editor"><Editor key={`${id}-${generation}`} workspace={{ initialDocument: loaded.initial, onDocumentChange: changeDocument, onPendingChange: setPendingField, onBack, onSave: () => void saveAndMaybePublish(), onPublish: () => setPublishOpen(true), onTheme, dirty, saving: busy, slug: loaded.page.slug, userName: user.name }} />
    {(error || notice) && <div className={`cms-editor-message ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}><span>{error || <><CheckCircle2 size={16} />{notice}</>}</span>{conflict && <><small>本地编辑仍保留。可先导出 JSON，再加载其他管理员保存的版本。</small><Button variant="outline" size="sm" onPress={() => setReloadOpen(true)}><RefreshCw size={14} />加载最新版本</Button></>}{!error && loaded.page.publishedSlug && <a href={publicPagePath(loaded.page.publishedSlug)} target="_blank" rel="noreferrer">查看线上页面<ExternalLink size={14} /></a>}<button aria-label="关闭保存提示" onClick={() => { if (!conflict) setError(''); setNotice(''); }}><X size={16} /></button></div>}
    <Dialog isOpen={publishOpen} onOpenChange={open => !busy && setPublishOpen(open)}><DialogContent><DialogHeader><DialogTitle>发布这个页面？</DialogTitle><DialogDescription>将保存当前内容，并发布到 {publicPagePath(loaded.page.slug)}。访客会看到这次更新；全站主题需要在主题管理中单独发布。</DialogDescription></DialogHeader><div className="cms-dialog-actions"><Button variant="outline" isDisabled={busy} onPress={() => setPublishOpen(false)}>继续编辑</Button><Button isDisabled={busy || conflict} onPress={() => void saveAndMaybePublish(true)}>{busy ? '正在发布…' : '确认发布'}</Button></div></DialogContent></Dialog>
    <Dialog isOpen={reloadOpen} onOpenChange={setReloadOpen}><DialogContent><DialogHeader><DialogTitle>加载服务器上的最新版本？</DialogTitle><DialogDescription>这会替换当前未保存的内容。请先使用编辑器的导出功能保留需要的修改。</DialogDescription></DialogHeader><div className="cms-dialog-actions"><Button variant="outline" onPress={() => setReloadOpen(false)}>取消</Button><Button onPress={() => { setReloadOpen(false); setGeneration(n => n + 1); }}>加载最新版本</Button></div></DialogContent></Dialog>
  </div>;
}

export default function CmsApp() {
  const [route, setRoute] = useState(window.location.pathname);
  const routeRef = useRef(route); routeRef.current = route;
  const [session, setSession] = useState<CmsSession | null>(null);
  const [site, setSite] = useState<CmsSite | null>(null);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthError, setReauthError] = useState('');
  const [reauthBusy, setReauthBusy] = useState(false);
  const [section, setSection] = useState<'pages' | 'theme' | 'team'>('pages');
  const routeInfo = resolveSiteRoute(route);
  const isAdmin = routeInfo.kind === 'admin';
  const loadSession = useCallback(() => {
    setError('');
    api<CmsSession>('/auth/session').then(setSession).catch(error => setError(errorMessage(error)));
  }, []);
  useEffect(() => { if (isAdmin) loadSession(); }, [isAdmin, loadSession]);
  useEffect(() => {
    const target = resolveSiteRoute(route);
    if (target.kind !== 'redirect') return;
    window.history.replaceState({}, '', `${target.path}${window.location.search}${window.location.hash}`);
    setRoute(target.path);
  }, [route]);
  useEffect(() => {
    if (!isAdmin || !session?.user) { setSite(null); return; }
    const controller = new AbortController();
    api<CmsSite>('/site', { signal: controller.signal }).then(setSite).catch(error => { if (!controller.signal.aborted && !(error instanceof ApiError && error.status === 401)) setError(errorMessage(error)); });
    return () => controller.abort();
  }, [session, isAdmin]);
  useEffect(() => {
    const expired = () => { setReauthOpen(true); setReauthError(''); };
    window.addEventListener('forma:unauthorized', expired);
    return () => window.removeEventListener('forma:unauthorized', expired);
  }, []);
  const navigate = useCallback((path: string, force = false) => {
    if (dirtyRef.current && !force) { setPendingRoute(path); return; }
    window.history.pushState({}, '', path); setRoute(path); setDirty(false); setPendingRoute(null);
  }, []);
  useEffect(() => {
    const pop = () => {
      const target = window.location.pathname;
      if (dirtyRef.current) { window.history.pushState({}, '', routeRef.current); setPendingRoute(target); }
      else setRoute(target);
    };
    const unload = (event: BeforeUnloadEvent) => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('popstate', pop); window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('popstate', pop); window.removeEventListener('beforeunload', unload); };
  }, []);
  const siteChanged = useCallback((value: CmsSite) => setSite(value), []);
  const reauthDialog = <Dialog isOpen={reauthOpen} onOpenChange={setReauthOpen}><DialogContent><DialogHeader><DialogTitle>重新登录，继续编辑</DialogTitle><DialogDescription>登录会话已过期。当前未保存的页面和主题仍保留，登录后请再次保存。</DialogDescription></DialogHeader><form className="cms-reauth-form" onSubmit={event => {
    event.preventDefault(); const data = new FormData(event.currentTarget); setReauthBusy(true); setReauthError('');
    void api<{user: CmsUser}>('/auth/login', {method:'POST', body:{email:session?.user?.email, password:data.get('password')}}).then(({user}) => {setSession({user,needsSetup:false});setReauthOpen(false);}).catch(error=>setReauthError(errorMessage(error))).finally(()=>setReauthBusy(false));
  }}><p>{session?.user?.email}</p><TextField name="password" type="password" isRequired><Label>密码</Label><Input autoComplete="current-password" required /></TextField>{reauthError && <p className="cms-inline-error" role="alert">{reauthError}</p>}<div className="cms-dialog-actions"><Button variant="outline" onPress={()=>setReauthOpen(false)}>暂不登录</Button><Button type="submit" isDisabled={reauthBusy}>{reauthBusy?'正在登录…':'重新登录'}</Button></div></form></DialogContent></Dialog>;
  if (routeInfo.kind === 'redirect') return <Loading label="正在打开页面…" />;
  if (routeInfo.kind === 'page') return <PublicPage key={routeInfo.slug} slug={routeInfo.slug} />;
  if (routeInfo.kind === 'local') return <Editor />;
  if (routeInfo.kind === 'not-found') return <main className="cms-public-error"><Globe2 size={36} /><h1>页面不存在或已下线</h1><p>请检查页面地址，或返回网站首页。</p><a href="/">返回网站首页</a></main>;
  if (error) return <main className="cms-load-error"><Brand /><h1>暂时无法连接网站服务</h1><p role="alert">{error}</p><Button onPress={loadSession}>重新连接</Button></main>;
  if (!session) return <Loading />;
  if (!session.user) return <AuthScreen key={String(session.needsSetup)} needsSetup={session.needsSetup} onSuccess={user => { setSession({ user, needsSetup: false }); }} />;
  if (!site) return <><Loading />{reauthDialog}</>;
  const match = route.match(/^\/admin\/pages\/([a-zA-Z0-9_-]+)$/);
  return <>{reauthDialog}{match ? <PageEditor key={match[1]} id={match[1]} user={session.user} onBack={() => { setSection('pages'); navigate('/admin'); }} onTheme={() => { setSection('theme'); navigate('/admin'); }} onDirtyChange={setDirty} onSiteChange={siteChanged} /> : <CmsDashboard key={section} user={session.user} site={site} initialSection={section} onSiteChange={siteChanged} onEdit={id => navigate(`/admin/pages/${id}`)} onLogout={() => { void api('/auth/logout', { method: 'POST', body: {} }).then(() => { setSession({ user: null, needsSetup: false }); setSite(null); setSection('pages'); navigate('/admin', true); }).catch(error => setError(errorMessage(error))); }} />}
    <Dialog isOpen={pendingRoute !== null} onOpenChange={open => !open && setPendingRoute(null)}><DialogContent><DialogHeader><DialogTitle>还有未保存的修改</DialogTitle><DialogDescription>返回编辑器保存草稿，或放弃这次修改再离开。线上已发布的页面不会改变。</DialogDescription></DialogHeader><div className="cms-dialog-actions"><Button variant="outline" onPress={() => setPendingRoute(null)}>返回编辑器</Button><Button onPress={() => pendingRoute && navigate(pendingRoute, true)}>放弃修改并离开</Button></div></DialogContent></Dialog>
  </>;
}
