import AsyncStorage from '@react-native-async-storage/async-storage';

export type CacheReadOptions = {
  /** Ignora TTL e tenta rede (ex.: pull-to-refresh). Em falha, devolve cache antigo. */
  forceRefresh?: boolean;
};

type CacheEnvelope<T> = {
  savedAt: number;
  data: T;
};

const PREFIX = '@gmarket:apicache:';

/** TTLs pensados para economizar dados móveis na Guiné-Bissau. */
export const CacheTTL = {
  products: 2 * 60 * 1000,
  productDetail: 3 * 60 * 1000,
  stores: 20 * 60 * 1000,
  storeDetail: 20 * 60 * 1000,
  storeProducts: 15 * 60 * 1000,
  banners: 30 * 60 * 1000,
  recommendations: 10 * 60 * 1000,
  popularSearches: 30 * 60 * 1000,
  search: 15 * 60 * 1000,
  categories: 60 * 60 * 1000,
  properties: 15 * 60 * 1000,
  propertyDetail: 30 * 60 * 1000,
  propertyTypes: 24 * 60 * 60 * 1000,
  locations: 24 * 60 * 60 * 1000,
  agencies: 60 * 60 * 1000,
  contacts: 30 * 60 * 1000,
} as const;

const memory = new Map<string, CacheEnvelope<unknown>>();

function storageKey(key: string) {
  return `${PREFIX}${key}`;
}

async function readEnvelope<T>(key: string): Promise<CacheEnvelope<T> | null> {
  const mem = memory.get(key) as CacheEnvelope<T> | undefined;
  if (mem) return mem;

  try {
    const raw = await AsyncStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || typeof parsed.savedAt !== 'number') return null;
    memory.set(key, parsed as CacheEnvelope<unknown>);
    return parsed;
  } catch {
    return null;
  }
}

async function writeEnvelope<T>(key: string, data: T): Promise<void> {
  const envelope: CacheEnvelope<T> = { savedAt: Date.now(), data };
  memory.set(key, envelope as CacheEnvelope<unknown>);
  try {
    await AsyncStorage.setItem(storageKey(key), JSON.stringify(envelope));
  } catch (error) {
    console.log('Erro ao guardar cache local:', key, error);
  }
}

export async function peekCache<T>(key: string): Promise<T | undefined> {
  const envelope = await readEnvelope<T>(key);
  return envelope?.data;
}

export async function setCacheValue<T>(key: string, data: T): Promise<void> {
  await writeEnvelope(key, data);
}

/** Apaga chaves de cache (ex.: `properties:` após publicar um imóvel). */
export async function invalidateApiCache(prefix: string): Promise<void> {
  for (const key of [...memory.keys()]) {
    if (key === prefix || key.startsWith(prefix)) {
      memory.delete(key);
    }
  }
  try {
    const keys = await AsyncStorage.getAllKeys();
    const toRemove = keys.filter(
      (k) => k === storageKey(prefix) || k.startsWith(storageKey(prefix)),
    );
    if (toRemove.length) {
      await AsyncStorage.multiRemove(toRemove);
    }
  } catch (error) {
    console.log('Erro ao invalidar cache:', prefix, error);
  }
}

/**
 * Cache-first: se fresco, não gasta dados.
 * Se expirado ou forceRefresh, tenta rede; em falha devolve cache antigo.
 */
export async function withApiCache<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<{ ok: boolean; data: T }>,
  emptyFallback: T,
  opts?: CacheReadOptions,
): Promise<T> {
  const existing = await readEnvelope<T>(key);
  const isFresh = existing != null && Date.now() - existing.savedAt < ttlMs;

  if (!opts?.forceRefresh && isFresh && existing) {
    return existing.data;
  }

  try {
    const result = await fetcher();
    if (result.ok) {
      await writeEnvelope(key, result.data);
      return result.data;
    }
  } catch (error) {
    console.log('Falha de rede (a usar cache se existir):', key, error);
  }

  // Pull-to-refresh: não voltar ao cache antigo se a rede falhou.
  if (opts?.forceRefresh) {
    return emptyFallback;
  }

  if (existing) return existing.data;
  return emptyFallback;
}

export function cacheKeyProduct(id: string) {
  return `product:${id}`;
}

export function cacheKeyStore(id: string) {
  return `store:${id}`;
}

export function cacheKeyProperty(id: string) {
  return `property:${id}`;
}

export function cacheKeyStoreProducts(storeId: string) {
  return `store-products:${storeId}`;
}

export function cacheKeyProperties(query: string) {
  return `properties:${query || 'all'}`;
}

export function cacheKeySearch(query: string, limit: number, authScope: string) {
  return `search:${authScope}:${limit}:${query.trim().toLowerCase()}`;
}

export function cacheKeyRecommendations(
  region: string,
  limit: number,
  authScope: string,
  cartSig: string,
) {
  return `reco:${authScope}:${limit}:${region}:${cartSig}`;
}

/** Scope de cache por conta (token) — evita misturar recomendações/pesquisa entre utilizadores. */
export function cacheAuthScope(token?: string | null): string {
  if (!token) return 'g';
  return `u:${token.slice(-16)}`;
}

type WarmableProduct = { id: string } & Record<string, unknown>;

/** Lista/home costuma ter menos campos que o detalhe; não sobrescrever detalhe rico. */
function productDetailScore(p: WarmableProduct): number {
  let score = 0;
  if (Array.isArray(p.specifications)) score += 3;
  if (p.variants != null) score += 3;
  if (p.reviews != null) score += 2;
  if (typeof p.descricao === 'string' && p.descricao.trim()) score += 1;
  if (typeof p.marca === 'string' && p.marca.trim()) score += 1;
  const store = p.store as { logo_url?: string | null } | null | undefined;
  if (store?.logo_url) score += 1;
  return score;
}

/** Guarda produtos individuais para detalhes/favoritos sem novo pedido. */
export async function warmProductCache(products: Array<{ id: string }>) {
  await Promise.all(
    products
      .filter((p) => typeof p?.id === 'string' && p.id.length > 0)
      .map(async (p) => {
        const key = cacheKeyProduct(p.id);
        const existing = await peekCache<WarmableProduct>(key);
        if (existing && productDetailScore(existing) > productDetailScore(p as WarmableProduct)) {
          return;
        }
        await setCacheValue(key, p);
      }),
  );
}

export async function warmPropertyCache(properties: Array<{ id: string }>) {
  await Promise.all(
    properties
      .filter((p) => typeof p?.id === 'string' && p.id.length > 0)
      .map((p) => setCacheValue(cacheKeyProperty(p.id), p)),
  );
}
