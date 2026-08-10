import {
  AccountDataKey,
  getAccountItem,
  setAccountItem,
  subscribeAccountScope,
} from '@/lib/accountStorage';
import { getProductById } from '@/components/api';

/** @deprecated use AccountDataKey.favProducts — mantido para imports existentes */
export const FAV_PRODUCTS_KEY = AccountDataKey.favProducts;

export interface FavProduct {
  id: string;
  titulo: string;
  preco: number;
  preco_gpay: number;
  image_url: string | null;
  image_urls?: string[] | null;
  store_id?: string | null;
  category_id?: string | null;
}

type FavListener = (products: FavProduct[]) => void;

const listeners = new Set<FavListener>();

function notify(products: FavProduct[]) {
  listeners.forEach((listener) => listener(products));
}

export function subscribeProductFavorites(listener: FavListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Ao trocar de conta, limpa o estado em memória dos subscritores.
subscribeAccountScope(() => {
  notify([]);
});

export function toFavProduct(product: {
  id: string;
  titulo: string;
  preco: number | string;
  preco_gpay: number | string;
  image_url?: string | null;
  image_urls?: string[] | null;
  store_id?: string | null;
  category?: { id?: string | null } | null;
  store?: { id?: string | null } | null;
}): FavProduct {
  return {
    id: product.id,
    titulo: product.titulo,
    preco: Number(product.preco) || 0,
    preco_gpay: Number(product.preco_gpay) || 0,
    image_url: product.image_url ?? null,
    image_urls: product.image_urls ?? undefined,
    store_id: product.store_id || product.store?.id || null,
    category_id: product.category?.id || null,
  };
}

function isFavProduct(value: unknown): value is FavProduct {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && typeof item.titulo === 'string';
}

async function hydrateIds(ids: string[]): Promise<FavProduct[]> {
  const products: FavProduct[] = [];
  for (const id of ids) {
    const live = await getProductById(id);
    if (live) products.push(toFavProduct(live));
  }
  return products;
}

export async function getFavoriteProducts(): Promise<FavProduct[]> {
  try {
    const raw = await getAccountItem(AccountDataKey.favProducts, { allowGuest: true });
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [];

    if (typeof parsed[0] === 'string') {
      const products = await hydrateIds(parsed.filter((id): id is string => typeof id === 'string'));
      await setAccountItem(AccountDataKey.favProducts, JSON.stringify(products), { allowGuest: true });
      return products;
    }

    return parsed.filter(isFavProduct);
  } catch (error) {
    console.log('Erro ao ler favoritos de produtos:', error);
    return [];
  }
}

export async function getFavoriteProductIds(): Promise<string[]> {
  const products = await getFavoriteProducts();
  return products.map((p) => p.id);
}

export async function isProductFavorite(productId: string): Promise<boolean> {
  const ids = await getFavoriteProductIds();
  return ids.includes(productId);
}

export async function toggleProductFavorite(product: FavProduct): Promise<{
  products: FavProduct[];
  isFavorite: boolean;
}> {
  const current = await getFavoriteProducts();
  const exists = current.some((p) => p.id === product.id);
  const snapshot: FavProduct = {
    id: product.id,
    titulo: product.titulo,
    preco: Number(product.preco) || 0,
    preco_gpay: Number(product.preco_gpay) || 0,
    image_url: product.image_url ?? null,
    image_urls: product.image_urls ?? undefined,
    store_id: product.store_id ?? null,
    category_id: product.category_id ?? null,
  };
  const next = exists
    ? current.filter((p) => p.id !== product.id)
    : [snapshot, ...current.filter((p) => p.id !== product.id)];

  await setAccountItem(AccountDataKey.favProducts, JSON.stringify(next), { allowGuest: true });
  notify(next);
  return { products: next, isFavorite: !exists };
}

export async function removeProductFavorite(productId: string): Promise<FavProduct[]> {
  const current = await getFavoriteProducts();
  const next = current.filter((p) => p.id !== productId);
  await setAccountItem(AccountDataKey.favProducts, JSON.stringify(next), { allowGuest: true });
  notify(next);
  return next;
}
