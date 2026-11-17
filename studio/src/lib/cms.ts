import type { DesignDocument, DesignSpec } from './document';
import type { Theme } from './tokens';

export interface CmsUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}
export interface CmsSession {
  user: CmsUser | null;
  needsSetup: boolean;
}
export interface CmsSite {
  name: string;
  theme: Theme;
  themeRevision: number;
  publishedThemeRevision: number;
  updatedAt: string;
}
export interface CmsPageSummary {
  id: string;
  title: string;
  slug: string;
  revision: number;
  publishedRevision: number | null;
  publishedSlug: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  updatedBy: string;
  archived: boolean;
}
export interface CmsPage extends CmsPageSummary {
  spec: DesignSpec;
}
export interface CmsPublicPage {
  document: DesignDocument;
  publishedAt: string;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    signal: options.signal,
    headers: { 'Content-Type': 'application/json', 'X-Forma-Request': '1' },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/'))
      window.dispatchEvent(new Event('forma:unauthorized'));
    throw new ApiError(data?.error ?? `请求失败（${response.status}）`, response.status);
  }
  return data as T;
}
export function pageDocument(page: CmsPage, site: CmsSite): DesignDocument {
  return { version: 2, name: page.title, spec: page.spec, theme: site.theme };
}
export function pageStatus(page: CmsPageSummary): '草稿' | '已发布' | '有未发布修改' | '已归档' {
  if (page.archived) return '已归档';
  if (page.publishedRevision === null) return '草稿';
  return page.revision === page.publishedRevision ? '已发布' : '有未发布修改';
}
