import {
  cartItemId,
  normalizeVariantId,
  parseMoney,
  type ProductPrices,
} from '@/lib/productPricing';

export interface CartItem extends ProductPrices {
  id: string;
  title: string;
  /** Legacy alias; always mirrors regularPrice. */
  price: number;
  image: string;
  quantity: number;
  selected: boolean;
  productId?: string;
  variantId?: string;
  variantLabel?: string;
  maxStock?: number;
  storeId?: string;
  storeName?: string;
  storeLogo?: string;
  storeCover?: string;
  storeVerified?: boolean;
}

type UnknownRecord = Record<string, unknown>;

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function normalizeCartItem(value: unknown): CartItem | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as UnknownRecord;
  const rawId = optionalString(item.id);
  const productId = optionalString(item.productId) || rawId?.split(':')[0];
  const title = optionalString(item.title);
  if (!productId || !title) return null;

  const variantId = normalizeVariantId(item.variantId);
  const regularPrice = parseMoney(item.regularPrice, parseMoney(item.price));
  const gpayPrice = parseMoney(item.gpayPrice);
  const maxStock = parseMoney(item.maxStock, Number.NaN);

  return {
    id: cartItemId(productId, variantId),
    productId,
    variantId,
    title,
    regularPrice,
    gpayPrice,
    price: regularPrice,
    image: optionalString(item.image) || '',
    quantity: Math.max(1, Math.floor(parseMoney(item.quantity, 1))),
    selected: item.selected !== false,
    variantLabel: optionalString(item.variantLabel),
    maxStock: Number.isFinite(maxStock) ? maxStock : undefined,
    storeId: optionalString(item.storeId),
    storeName: optionalString(item.storeName),
    storeLogo: optionalString(item.storeLogo),
    storeCover: optionalString(item.storeCover),
    storeVerified:
      typeof item.storeVerified === 'boolean' ? item.storeVerified : undefined,
  };
}

export function parseCartItems(raw: string | null): CartItem[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeCartItem)
      .filter((item): item is CartItem => item !== null);
  } catch {
    return [];
  }
}
