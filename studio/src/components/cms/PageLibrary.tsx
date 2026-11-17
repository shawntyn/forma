import { cn } from '@/lib/utils';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Archive,
  ArrowRight,
  Copy,
  ExternalLink,
  FilePlus2,
  FileText,
  FolderOpen,
  Globe2,
  LayoutTemplate,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Upload,
} from 'lucide-react';
import { api, pageStatus, type CmsPage, type CmsPageSummary } from '../../lib/cms';
import { parseDocument, STORAGE_KEY, type DesignDocument } from '../../lib/document';
import { isPageSlug, publicPagePath, RESERVED_PAGE_SLUGS } from '../../lib/routes';
import { Button, ButtonLink } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input, TextField } from '../ui/input';
import { CmsField, CmsLoading, CmsNotice, errorMessage, shortDate } from './shared';

type PageAction = 'publish' | 'unpublish' | 'archive' | 'restore';
const actionLabels: Record<PageAction, string> = {
  publish: '发布页面',
  unpublish: '下线页面',
  archive: '归档页面',
  restore: '恢复页面',
};
const newSlug = () => `page-${crypto.randomUUID().slice(0, 6)}`;
const routeHint = (slug: string) =>
  `发布后访问 ${isPageSlug(slug.trim()) ? publicPagePath(slug.trim()) : '/页面地址'}。home 对应网站首页 /；其他地址直接使用 /地址。请填写小写英文字母、数字和连字符，不加斜杠。`;
function slugError(slug: string): string {
  if ((RESERVED_PAGE_SLUGS as readonly string[]).includes(slug))
    return '这个地址由系统保留，请换一个页面地址（admin、api、local、assets、p 不可使用）。';
  return isPageSlug(slug) ? '' : '页面地址须为 1–80 个小写英文字母、数字和单连字符，不加斜杠。';
}

export function PageLibrary({ onEdit }: { onEdit: (id: string) => void }) {
  const [pages, setPages] = useState<CmsPageSummary[]>([]);
  const [archived, setArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('未命名页面');
  const [slug, setSlug] = useState(newSlug);
  const [template, setTemplate] = useState<'blank' | 'orbit'>('blank');
  const [imported, setImported] = useState<DesignDocument | null>(null);
  const [formError, setFormError] = useState('');
  const [renamePage, setRenamePage] = useState<CmsPage | null>(null);
  const [confirm, setConfirm] = useState<{ action: PageAction; page: CmsPageSummary } | null>(null);
  const [hasLocalDraft] = useState(() => {
    try {
      return !!localStorage.getItem(STORAGE_KEY);
    } catch {
      return false;
    }
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const result = await api<{ pages: CmsPageSummary[] }>(
        `/pages${archived ? '?archived=1' : ''}`,
      );
      if (id === requestId.current) setPages(result.pages);
    } catch (cause) {
      if (id === requestId.current) setError(errorMessage(cause));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [archived]);
  useEffect(() => {
    void refresh();
    return () => {
      requestId.current++;
    };
  }, [refresh]);

  function openCreate(document: DesignDocument | null = null) {
    setImported(document);
    setTitle(document?.name ?? '未命名页面');
    setSlug(newSlug());
    setTemplate('blank');
    setFormError('');
    setCreateOpen(true);
  }
  async function readFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('请选择 2 MB 以内的项目 JSON。');
      openCreate(parseDocument(await file.text()));
    } catch (cause) {
      setError(errorMessage(cause));
    }
    if (fileRef.current) fileRef.current.value = '';
  }
  async function createPage(event: FormEvent) {
    event.preventDefault();
    const invalid = slugError(slug.trim());
    if (invalid) {
      setFormError(invalid);
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      const page = await api<CmsPage>('/pages', {
        method: 'POST',
        body: {
          title: title.trim(),
          slug: slug.trim(),
          template,
          ...(imported ? { document: imported } : {}),
        },
      });
      setCreateOpen(false);
      onEdit(page.id);
    } catch (cause) {
      setFormError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function openRename(page: CmsPageSummary) {
    setBusy(true);
    setError('');
    try {
      const full = await api<CmsPage>(`/pages/${page.id}`);
      setRenamePage(full);
      setTitle(full.title);
      setSlug(full.slug);
      setFormError('');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function rename(event: FormEvent) {
    event.preventDefault();
    if (!renamePage) return;
    const invalid = slugError(slug.trim());
    if (invalid) {
      setFormError(invalid);
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      await api<CmsPage>(`/pages/${renamePage.id}`, {
        method: 'PUT',
        body: {
          title: title.trim(),
          slug: slug.trim(),
          spec: renamePage.spec,
          revision: renamePage.revision,
        },
      });
      setRenamePage(null);
      setMessage('页面信息已保存。发布后，线上标题与地址才会更新。');
      await refresh();
    } catch (cause) {
      setFormError(
        `${errorMessage(cause)}${cause instanceof Error && 'status' in cause && cause.status === 409 ? ' 请关闭对话框，刷新后重新编辑。' : ''}`,
      );
    } finally {
      setBusy(false);
    }
  }
  async function duplicate(page: CmsPageSummary) {
    setBusy(true);
    setError('');
    try {
      await api<CmsPage>(`/pages/${page.id}/duplicate`, { method: 'POST' });
      setMessage('已创建页面副本，副本以草稿保存。');
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function performAction() {
    if (!confirm) return;
    setBusy(true);
    setFormError('');
    try {
      await api<CmsPage>(`/pages/${confirm.page.id}/${confirm.action}`, {
        method: 'POST',
        body: { revision: confirm.page.revision },
      });
      setMessage(
        {
          publish: '页面已发布，访客现在可以访问。',
          unpublish: '页面已下线，内容仍保留在草稿中。',
          archive: '页面已归档，可在归档中恢复。',
          restore: '页面已恢复为草稿，可继续编辑并发布。',
        }[confirm.action],
      );
      setConfirm(null);
      await refresh();
    } catch (cause) {
      setFormError(
        `${errorMessage(cause)}${cause instanceof Error && 'status' in cause && cause.status === 409 ? ' 请取消操作并刷新页面列表。' : ''}`,
      );
    } finally {
      setBusy(false);
    }
  }
  function askAction(action: PageAction, page: CmsPageSummary) {
    setFormError('');
    setConfirm({ action, page });
  }
  const visiblePages = pages.filter((page) => {
    const matchesSearch = `${page.title} ${page.slug} ${page.updatedBy}`
      .toLowerCase()
      .includes(search.toLowerCase());
    const status = pageStatus(page);
    return matchesSearch && (filter === 'all' || status === filter);
  });
  const published = pages.filter((page) => page.publishedRevision !== null).length;
  const changed = pages.filter(
    (page) => page.publishedRevision !== null && page.revision !== page.publishedRevision,
  ).length;

  return (
    <section data-ui="cms-page-library">
      <div className="cms-section-heading">
        <div>
          <span className="cms-eyebrow">CONTENT WORKSPACE</span>
          <h1>把每一页，交给好想法。</h1>
          <p>在这里创建、编辑和发布网站页面。所有管理员共享同一个工作空间。</p>
        </div>
        <div className="cms-heading-actions">
          <Button variant="outline" onPress={() => fileRef.current?.click()}>
            <Upload size={15} />
            导入页面
          </Button>
          <Button onPress={() => openCreate()}>
            <Plus size={16} />
            新建页面
          </Button>
        </div>
      </div>
      <div className="cms-stats">
        <div>
          <span className="cms-stat-icon">
            <FileText size={19} />
          </span>
          <span>
            <strong>{pages.length.toString().padStart(2, '0')}</strong>
            <small>{archived ? '已归档页面' : '全部页面'}</small>
          </span>
        </div>
        <div>
          <span className="cms-stat-icon green">
            <Globe2 size={19} />
          </span>
          <span>
            <strong>{published.toString().padStart(2, '0')}</strong>
            <small>正在展示</small>
          </span>
        </div>
        <div>
          <span className="cms-stat-icon amber">
            <Pencil size={19} />
          </span>
          <span>
            <strong>{changed.toString().padStart(2, '0')}</strong>
            <small>等待更新发布</small>
          </span>
        </div>
        <div className="cms-stat-note">
          <span className="cms-shared-dot" />
          <p>
            同一个网站，共同创造。<small>草稿保存后，点击发布才会对访客可见。</small>
          </p>
        </div>
      </div>
      {error && (
        <CmsNotice error>
          {error}{' '}
          <Button variant="link" size="sm" onPress={() => void refresh()}>
            重试
          </Button>
        </CmsNotice>
      )}
      {message && <CmsNotice>{message}</CmsNotice>}
      <div className="cms-page-box">
        <div className="cms-list-toolbar">
          <fieldset className="cms-segmented" aria-label="页面范围">
            <Button
              variant="ghost"
              aria-pressed={!archived}
              onPress={() => {
                setArchived(false);
                setFilter('all');
                setMessage('');
              }}
            >
              所有页面
            </Button>
            <Button
              variant="ghost"
              aria-pressed={archived}
              onPress={() => {
                setArchived(true);
                setFilter('all');
                setMessage('');
              }}
            >
              <Archive size={14} />
              已归档
            </Button>
          </fieldset>
          <div className="cms-list-filters">
            <TextField
              aria-label="搜索页面"
              value={search}
              onChange={setSearch}
              className="cms-search"
            >
              <Search size={15} />
              <Input placeholder="搜索页面名称或地址…" />
            </TextField>
            {!archived && (
              <select
                aria-label="页面状态"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">全部状态</option>
                <option value="草稿">草稿</option>
                <option value="已发布">已发布</option>
                <option value="有未发布修改">有未发布修改</option>
              </select>
            )}
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="刷新页面列表"
              onPress={() => void refresh()}
              isDisabled={loading}
            >
              <RefreshCw size={15} />
            </Button>
          </div>
        </div>
        {loading ? (
          <CmsLoading />
        ) : visiblePages.length ? (
          <div className="cms-table-scroll">
            <table className="cms-table">
              <thead>
                <tr>
                  <th>页面</th>
                  <th>状态</th>
                  <th>最近更新</th>
                  <th>
                    <span className="sr-only">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visiblePages.map((page) => (
                  <tr key={page.id}>
                    <td>
                      <div className="cms-page-identity">
                        <span className="cms-page-icon">
                          <FileText size={20} />
                        </span>
                        <div>
                          <button
                            type="button"
                            className="cms-page-title"
                            onClick={() => !page.archived && onEdit(page.id)}
                            disabled={page.archived}
                          >
                            {page.title}
                          </button>
                          <span className="cms-page-path">{publicPagePath(page.slug)}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span
                        className={cn(
                          'cms-page-status',
                          page.archived
                            ? 'archived'
                            : page.publishedRevision === null
                              ? 'draft'
                              : page.revision === page.publishedRevision
                                ? 'published'
                                : 'changed',
                        )}
                      >
                        <i />
                        {pageStatus(page)}
                      </span>
                    </td>
                    <td>
                      <div className="cms-updated">
                        <span>{shortDate(page.updatedAt)}</span>
                        <small>{page.updatedBy || '管理员'}</small>
                      </div>
                    </td>
                    <td>
                      <div className="cms-row-actions">
                        {page.archived ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onPress={() => askAction('restore', page)}
                            isDisabled={busy}
                          >
                            恢复
                          </Button>
                        ) : (
                          <>
                            <Button size="sm" variant="ghost" onPress={() => onEdit(page.id)}>
                              编辑
                              <ArrowRight size={13} />
                            </Button>
                            {page.publishedSlug && (
                              <ButtonLink
                                size="icon-sm"
                                variant="ghost"
                                href={publicPagePath(page.publishedSlug)}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`查看 ${page.title} 的线上页面`}
                              >
                                <ExternalLink size={15} />
                              </ButtonLink>
                            )}
                            <details className="cms-row-menu">
                              <summary aria-label={`更多操作：${page.title}`}>
                                <MoreHorizontal size={19} />
                              </summary>
                              <div className="cms-menu-content">
                                <Button
                                  variant="ghost"
                                  onPress={() => void openRename(page)}
                                  isDisabled={busy}
                                >
                                  <Pencil size={14} />
                                  页面信息
                                </Button>
                                <Button
                                  variant="ghost"
                                  onPress={() => void duplicate(page)}
                                  isDisabled={busy}
                                >
                                  <Copy size={14} />
                                  复制页面
                                </Button>
                                <Button
                                  variant="ghost"
                                  onPress={() => askAction('publish', page)}
                                  isDisabled={busy || page.revision === page.publishedRevision}
                                >
                                  <Globe2 size={14} />
                                  发布页面
                                </Button>
                                {page.publishedRevision !== null && (
                                  <Button
                                    variant="ghost"
                                    onPress={() => askAction('unpublish', page)}
                                    isDisabled={busy}
                                  >
                                    下线页面
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  onPress={() => askAction('archive', page)}
                                  isDisabled={busy}
                                >
                                  <Archive size={14} />
                                  归档页面
                                </Button>
                              </div>
                            </details>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="cms-empty">
            <FolderOpen size={35} strokeWidth={1.25} />
            <h2>
              {search || filter !== 'all'
                ? '没有找到匹配页面'
                : archived
                  ? '这里还没有归档页面'
                  : '从你的第一个页面开始'}
            </h2>
            <p>
              {search || filter !== 'all'
                ? '尝试换个关键词，或查看全部状态。'
                : archived
                  ? '归档的页面会保留在这里，随时可以恢复。'
                  : '选择一个空白画布，或从 Orbit 模板开始。'}
            </p>
            {!archived && !search && (
              <Button onPress={() => openCreate()}>
                <Plus size={15} />
                新建页面
              </Button>
            )}
          </div>
        )}
        <div className="cms-table-footer">
          <span>{visiblePages.length} 个页面</span>
          <span>页面结构由 json-render 驱动 · 全站共享 Design Tokens</span>
        </div>
      </div>
      {hasLocalDraft && !archived && (
        <div className="cms-import-local">
          <span>
            <Upload size={16} />
            浏览器中有以前的本地设计草稿
          </span>
          <Button
            variant="link"
            size="sm"
            onPress={() => {
              try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (!raw) throw new Error('没有找到本地草稿。');
                openCreate(parseDocument(raw));
              } catch (cause) {
                setError(errorMessage(cause));
              }
            }}
          >
            导入到共享页面库
            <ArrowRight size={13} />
          </Button>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        aria-label="导入页面 JSON"
        className="sr-only"
        onChange={(event) => void readFile(event.target.files?.[0])}
      />
      <Dialog
        isOpen={createOpen}
        onOpenChange={(open) => {
          if (!busy) setCreateOpen(open);
        }}
      >
        <DialogContent className="cms-dialog">
          <DialogHeader>
            <DialogTitle>{imported ? '导入为新页面' : '创建一个新页面'}</DialogTitle>
            <DialogDescription>
              {imported
                ? '导入结构与内容。页面外观将统一使用当前网站主题，原文件不会被修改。'
                : '先为页面取个名字，再开始自由组织内容。新页面以草稿保存。'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void createPage(event)} className="cms-form">
            <CmsField label="页面名称" value={title} onChange={setTitle} maxLength={100} />
            <CmsField
              label="页面地址"
              value={slug}
              onChange={setSlug}
              maxLength={80}
              hint={routeHint(slug)}
            />
            {!imported && (
              <fieldset className="cms-template-options">
                <legend>从哪里开始</legend>
                <button
                  type="button"
                  aria-pressed={template === 'blank'}
                  onClick={() => setTemplate('blank')}
                >
                  <FilePlus2 size={25} />
                  <strong>空白页面</strong>
                  <span>为你的想法留白</span>
                </button>
                <button
                  type="button"
                  aria-pressed={template === 'orbit'}
                  onClick={() => setTemplate('orbit')}
                >
                  <LayoutTemplate size={25} />
                  <strong>Orbit 示例</strong>
                  <span>从完整展示页开始</span>
                </button>
              </fieldset>
            )}
            {formError && <CmsNotice error>{formError}</CmsNotice>}
            <div className="cms-dialog-actions">
              <Button variant="outline" onPress={() => setCreateOpen(false)} isDisabled={busy}>
                取消
              </Button>
              <Button type="submit" isDisabled={busy}>
                {busy ? '创建中…' : '创建并编辑'}
                <ArrowRight size={14} />
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        isOpen={!!renamePage}
        onOpenChange={(open) => {
          if (!open && !busy) setRenamePage(null);
        }}
      >
        <DialogContent className="cms-dialog">
          <DialogHeader>
            <DialogTitle>页面信息</DialogTitle>
            <DialogDescription>
              修改名称或地址会保存为草稿，重新发布后才会更新线上页面。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void rename(event)} className="cms-form">
            <CmsField label="页面名称" value={title} onChange={setTitle} maxLength={100} />
            <CmsField
              label="页面地址"
              value={slug}
              onChange={setSlug}
              maxLength={80}
              hint={routeHint(slug)}
            />
            {formError && <CmsNotice error>{formError}</CmsNotice>}
            <div className="cms-dialog-actions">
              <Button variant="outline" onPress={() => setRenamePage(null)} isDisabled={busy}>
                取消
              </Button>
              <Button type="submit" isDisabled={busy}>
                {busy ? '保存中…' : '保存信息'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        isOpen={!!confirm}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirm(null);
        }}
      >
        <DialogContent className="cms-dialog">
          <DialogHeader>
            <DialogTitle>
              {confirm && actionLabels[confirm.action]}
              {confirm ? `「${confirm.page.title}」？` : ''}
            </DialogTitle>
            <DialogDescription>
              {confirm?.action === 'publish'
                ? `当前保存的草稿将发布到 ${publicPagePath(confirm.page.slug)}，访客可以立即看到内容。页面使用已发布的全站主题。`
                : confirm?.action === 'archive'
                  ? '页面将从网站下线并移入归档。内容会保留，可以随时恢复。'
                  : confirm?.action === 'restore'
                    ? '页面将移回页面库，以草稿状态恢复。编辑完成后可以重新发布。'
                    : '访客将无法访问此页面。页面内容与草稿仍会保留。'}
            </DialogDescription>
          </DialogHeader>
          {formError && <CmsNotice error>{formError}</CmsNotice>}
          <div className="cms-dialog-actions">
            <Button variant="outline" onPress={() => setConfirm(null)} isDisabled={busy}>
              取消
            </Button>
            <Button onPress={() => void performAction()} isDisabled={busy}>
              {busy ? '处理中…' : confirm && actionLabels[confirm.action]}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
