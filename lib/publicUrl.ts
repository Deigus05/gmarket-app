/**
 * Public web origin for shareable https links (WhatsApp, browser, Universal Links).
 * Override with EXPO_PUBLIC_WEB_URL if needed.
 */
export const PUBLIC_WEB_ORIGIN = (
  process.env.EXPO_PUBLIC_WEB_URL?.trim() || 'https://www.gmarketbissau.com'
).replace(/\/$/, '');

type QueryParams = Record<string, string | number | null | undefined>;

/** Build a public https URL, e.g. https://www.gmarketbissau.com/productDetail?id=123 */
export function createPublicUrl(path: string, queryParams?: QueryParams): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(normalizedPath, `${PUBLIC_WEB_ORIGIN}/`);

  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      if (value == null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}
