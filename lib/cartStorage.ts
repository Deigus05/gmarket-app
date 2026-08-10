import {
  AccountDataKey,
  getAccountItem,
  setAccountItem,
  removeAccountItem,
} from '@/lib/accountStorage';

/** Carrinho: guest quando desautenticado; por conta quando autenticado. */
const CART_OPTS = { allowGuest: true } as const;

export async function getCartJson(): Promise<string | null> {
  return getAccountItem(AccountDataKey.cart, CART_OPTS);
}

export async function setCartJson(value: string): Promise<void> {
  await setAccountItem(AccountDataKey.cart, value, CART_OPTS);
}

export async function clearCartStorage(): Promise<void> {
  await removeAccountItem(AccountDataKey.cart, CART_OPTS);
}

export async function getCheckoutDraftJson(): Promise<string | null> {
  return getAccountItem(AccountDataKey.checkoutDraft, CART_OPTS);
}

export async function setCheckoutDraftJson(value: string): Promise<void> {
  await setAccountItem(AccountDataKey.checkoutDraft, value, CART_OPTS);
}

export async function clearCheckoutDraft(): Promise<void> {
  await removeAccountItem(AccountDataKey.checkoutDraft, CART_OPTS);
}
