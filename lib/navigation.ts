import type { Href } from 'expo-router';

type RouteParam = string | number | boolean | null | undefined;

const LEGACY_AUTH_REDIRECTS: Record<string, string> = {
  cart: '/(tabs)/cart',
  checkout: '/checkout',
  entrega: '/entrega',
  avaliacao: '/avaliacao',
  'dados-pessoais': '/dados-pessoais',
  seguranca: '/seguranca',
  chat: '/chat',
  'bilhete-dados': '/bilhete-dados',
};

function isSafeInternalPath(value: string): boolean {
  if (!value.startsWith('/') || value.startsWith('//')) return false;
  if (value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value)) return false;

  const pathname = value.split(/[?#]/, 1)[0];
  return !pathname.split('/').some((segment) => segment === '..' || segment === '.');
}

export function createReturnPath(
  pathname: string,
  params: Record<string, RouteParam>,
): string {
  const query = Object.entries(params)
    .filter(([, value]) => value !== null && value !== undefined && String(value) !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');

  return query ? `${pathname}?${query}` : pathname;
}

export function resolvePostAuthHref(
  redirect: string | string[] | undefined,
  legacyParams: Record<string, RouteParam> = {},
): Href | null {
  const raw = Array.isArray(redirect) ? redirect[0] : redirect;
  if (!raw) return null;

  const mapped = LEGACY_AUTH_REDIRECTS[raw] || raw;
  const withLegacyParams =
    mapped === '/bilhete-dados' && !mapped.includes('?')
      ? createReturnPath(mapped, legacyParams)
      : mapped;

  return isSafeInternalPath(withLegacyParams) ? (withLegacyParams as Href) : null;
}

export type CmsNavigationTarget =
  | { kind: 'internal'; href: Href }
  | { kind: 'external'; url: string }
  | { kind: 'native'; url: string };

export function parseCmsNavigationTarget(raw: string): CmsNavigationTarget | null {
  const value = raw.trim();
  if (!value || /[\u0000-\u001f\u007f]/.test(value)) return null;

  if (isSafeInternalPath(value)) {
    return { kind: 'internal', href: value as Href };
  }

  if (/^(mailto|tel|sms):/i.test(value)) {
    try {
      const parsed = new URL(value);
      return parsed.pathname ? { kind: 'native', url: value } : null;
    } catch {
      return null;
    }
  }

  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) return null;
    return { kind: 'external', url: parsed.toString() };
  } catch {
    return null;
  }
}
