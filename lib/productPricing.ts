export type ProductPaymentMethod = 'entrega' | 'gpay';

export type ProductPrices = {
  regularPrice: number;
  gpayPrice: number;
};

export function parseMoney(value: unknown, fallback = 0): number {
  const parsed =
    typeof value === 'string' && value.trim() === '' ? Number.NaN : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function productPrices(regularPrice: unknown, gpayPrice: unknown): ProductPrices {
  return {
    regularPrice: parseMoney(regularPrice),
    gpayPrice: parseMoney(gpayPrice),
  };
}

/** Products without a dedicated GPay price use the normal 1:1 CFA/GCoin price. */
export function resolveUnitPrice(
  prices: ProductPrices,
  method: ProductPaymentMethod,
): number {
  return method === 'gpay' && prices.gpayPrice > 0
    ? prices.gpayPrice
    : prices.regularPrice;
}

export function hasDedicatedGpayPrice(value: unknown): boolean {
  return parseMoney(value) > 0;
}

export function formatCfa(value: unknown): string {
  return `${parseMoney(value).toLocaleString('pt-PT')} CFA`;
}

export function formatGcoin(value: unknown): string {
  return `${parseMoney(value).toLocaleString('pt-PT')} GCoin`;
}

export function normalizeVariantId(value: unknown): string | undefined {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!id || id.startsWith('legacy-')) return undefined;
  return id;
}

export function cartItemId(productId: string, variantId?: string): string {
  return `${productId}:${normalizeVariantId(variantId) || 'default'}`;
}
