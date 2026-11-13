/** `home` stays the stored slug so existing homepage drafts need no migration. */
export const HOME_SLUG = 'home';
export const RESERVED_PAGE_SLUGS = ['admin', 'api', 'local', 'assets', 'p'] as const;
export function isPageSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 80 &&
    !(RESERVED_PAGE_SLUGS as readonly string[]).includes(slug);
}
export function publicPagePath(slug: string): string {
  return slug === HOME_SLUG ? '/' : `/${encodeURIComponent(slug)}`;
}
export type SiteRoute =
  | { kind: 'admin' | 'local' | 'not-found' }
  | { kind: 'page'; slug: string }
  | { kind: 'redirect'; path: string };

export function resolveSiteRoute(pathname: string): SiteRoute {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return { kind: 'page', slug: HOME_SLUG };
  if (path === '/home') return { kind: 'redirect', path: '/' };
  const legacy = path.match(/^\/p\/([^/]+)$/);
  if (legacy && isPageSlug(legacy[1])) return { kind: 'redirect', path: publicPagePath(legacy[1]) };
  if (path !== pathname) {
    const normalized = resolveSiteRoute(path);
    return normalized.kind === 'not-found' ? normalized : { kind: 'redirect', path: normalized.kind === 'redirect' ? normalized.path : path };
  }
  if (path === '/admin' || path.startsWith('/admin/')) return { kind: 'admin' };
  if (path === '/local') return { kind: 'local' };
  const slug = path.slice(1);
  return isPageSlug(slug) ? { kind: 'page', slug } : { kind: 'not-found' };
}
