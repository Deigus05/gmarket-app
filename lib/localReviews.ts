import type { ProductReview, ProductReviews } from '@/components/api';
import {
  AccountDataKey,
  getAccountItem,
  setAccountItem,
} from '@/lib/accountStorage';

export type LocalProductReview = {
  id: string;
  product_id: string;
  order_id: string;
  order_item_id: string;
  store_id: string | null;
  store_name: string;
  product_title: string;
  product_image: string | null;
  user_name: string;
  user_avatar?: string | null;
  rating: number;
  comment: string | null;
  photo_uris: string[];
  created_at: string;
  updated_at: string;
};

export type LocalStoreReview = {
  id: string;
  store_id: string;
  store_name: string;
  store_logo: string | null;
  order_id: string;
  user_name: string;
  rating: number;
  comment: string | null;
  photo_uris: string[];
  created_at: string;
  updated_at: string;
};

async function readList<T>(base: string): Promise<T[]> {
  try {
    const raw = await getAccountItem(base);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

async function writeList<T>(base: string, list: T[]): Promise<void> {
  await setAccountItem(base, JSON.stringify(list));
}

export async function getAllProductReviews(): Promise<LocalProductReview[]> {
  return readList<LocalProductReview>(AccountDataKey.productReviews);
}

export async function getAllStoreReviews(): Promise<LocalStoreReview[]> {
  return readList<LocalStoreReview>(AccountDataKey.storeReviews);
}

export async function getProductReviewByProductId(
  productId: string,
): Promise<LocalProductReview | null> {
  const list = await getAllProductReviews();
  return list.find((r) => r.product_id === productId) ?? null;
}

export async function getProductReviewByOrderItemId(
  orderItemId: string,
): Promise<LocalProductReview | null> {
  if (!orderItemId) return null;
  const list = await getAllProductReviews();
  return list.find((r) => r.order_item_id === orderItemId) ?? null;
}

export function reviewKey(review: Pick<LocalProductReview, 'order_item_id' | 'order_id' | 'product_id'>) {
  const itemId = (review.order_item_id || '').trim();
  // IDs sintéticos `orderId:productId` não são chave de item real.
  if (itemId && !itemId.includes(':')) return `item:${itemId}`;
  return `order:${review.order_id}:${review.product_id}`;
}

/** Encontra review local mesmo quando order_item_id diverge entre lista e cache. */
export function findLocalProductReview(
  list: LocalProductReview[],
  item: Pick<LocalProductReview, 'order_item_id' | 'order_id' | 'product_id'>,
): LocalProductReview | null {
  const byKey = list.find((r) => reviewKey(r) === reviewKey(item));
  if (byKey) return byKey;
  const itemId = (item.order_item_id || '').trim();
  if (itemId && !itemId.includes(':')) {
    const byItem = list.find((r) => r.order_item_id === itemId);
    if (byItem) return byItem;
  }
  if (item.order_id && item.product_id) {
    const byOrderProduct = list.find(
      (r) => r.order_id === item.order_id && r.product_id === item.product_id,
    );
    if (byOrderProduct) return byOrderProduct;
  }
  if (item.product_id) {
    return list.find((r) => r.product_id === item.product_id) ?? null;
  }
  return null;
}

export async function saveProductReview(
  input: Omit<LocalProductReview, 'id' | 'created_at' | 'updated_at'> & {
    id?: string;
  },
): Promise<LocalProductReview> {
  const list = await getAllProductReviews();
  const existing = findLocalProductReview(list, input) ?? undefined;
  const now = new Date().toISOString();
  const orderItemId = (input.order_item_id || existing?.order_item_id || '').trim();
  const next: LocalProductReview = {
    id: existing?.id || input.id || `prv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    product_id: input.product_id,
    order_id: input.order_id,
    order_item_id: orderItemId.includes(':') ? '' : orderItemId,
    store_id: input.store_id,
    store_name: input.store_name,
    product_title: input.product_title,
    product_image: input.product_image,
    user_name: input.user_name,
    user_avatar: input.user_avatar ?? existing?.user_avatar ?? null,
    rating: Math.max(1, Math.min(5, Math.round(input.rating))),
    comment: input.comment?.trim() || null,
    photo_uris: (input.photo_uris || []).slice(0, 3),
    created_at: existing?.created_at || now,
    updated_at: now,
  };
  const nextKey = reviewKey(next);
  const updated = [
    next,
    ...list.filter((r) => reviewKey(r) !== nextKey && r.id !== next.id && !(
      r.product_id === next.product_id && r.order_id === next.order_id
    )),
  ];
  await writeList(AccountDataKey.productReviews, updated);
  return next;
}

export async function getStoreReviewByStoreId(
  storeId: string,
): Promise<LocalStoreReview | null> {
  const list = await getAllStoreReviews();
  return list.find((r) => r.store_id === storeId) ?? null;
}

export async function saveStoreReview(
  input: Omit<LocalStoreReview, 'id' | 'created_at' | 'updated_at'> & {
    id?: string;
  },
): Promise<LocalStoreReview> {
  const list = await getAllStoreReviews();
  const existing = list.find((r) => r.store_id === input.store_id);
  const now = new Date().toISOString();
  const next: LocalStoreReview = {
    id: existing?.id || input.id || `srv-${Date.now()}`,
    store_id: input.store_id,
    store_name: input.store_name,
    store_logo: input.store_logo,
    order_id: input.order_id,
    user_name: input.user_name,
    rating: Math.max(1, Math.min(5, Math.round(input.rating))),
    comment: input.comment?.trim() || null,
    photo_uris: (input.photo_uris || []).slice(0, 3),
    created_at: existing?.created_at || now,
    updated_at: now,
  };
  const updated = [next, ...list.filter((r) => r.store_id !== input.store_id)];
  await writeList(AccountDataKey.storeReviews, updated);
  return next;
}

function toApiReview(local: LocalProductReview): ProductReview {
  return {
    id: local.id,
    product_id: local.product_id,
    user_name: local.user_name,
    user_avatar: local.user_avatar ?? null,
    rating: local.rating,
    comment: local.comment,
    // Só URIs remotas são partilháveis no detalhe; ficheiros locais ficam só para o autor.
    photo_urls: (local.photo_uris || []).filter((uri) => /^https?:\/\//i.test(uri)),
    created_at: local.updated_at || local.created_at,
  };
}

/**
 * Junta avaliações públicas da API com as da conta ativa (cache local).
 * Reviews de outras contas no mesmo telemóvel não entram (storage scoped).
 * No detalhe do produto, a fonte de verdade pública é a API; o local só
 * completa a avaliação recente desta conta até o cache remoto atualizar.
 */
export async function mergeProductReviews(
  productId: string,
  remote?: ProductReviews | null,
): Promise<ProductReviews> {
  const locals = (await getAllProductReviews()).filter((r) => r.product_id === productId);
  const remoteItems = remote?.items ?? [];
  const byId = new Map<string, ProductReview>();

  for (const item of remoteItems) {
    byId.set(String(item.id), {
      ...item,
      user_name: (item.user_name || '').trim() || 'Cliente GMarket',
      photo_urls: item.photo_urls ?? [],
    });
  }
  for (const local of locals) {
    const api = toApiReview(local);
    const key = String(local.id);
    const existing = byId.get(key);
    if (!existing) {
      byId.set(key, {
        ...api,
        user_name: (api.user_name || '').trim() || 'Cliente GMarket',
      });
    } else if (!(existing.user_name || '').trim() || existing.user_name === 'Cliente GMarket') {
      const localName = (api.user_name || '').trim();
      if (localName) {
        byId.set(key, { ...existing, user_name: localName, user_avatar: existing.user_avatar || api.user_avatar });
      }
    }
  }

  const items = Array.from(byId.values()).sort((a, b) => {
    const ta = a.created_at ? Date.parse(a.created_at) : 0;
    const tb = b.created_at ? Date.parse(b.created_at) : 0;
    return tb - ta;
  });
  const count = items.length;
  const average =
    count === 0 ? 0 : items.reduce((sum, r) => sum + (r.rating || 0), 0) / count;

  return {
    items,
    average: Math.round(average * 10) / 10,
    count,
  };
}

export async function getStoreRatingOverlay(storeId: string): Promise<{
  rating_avg: number;
  review_count: number;
} | null> {
  const local = await getStoreReviewByStoreId(storeId);
  if (!local) return null;
  return { rating_avg: local.rating, review_count: 1 };
}
