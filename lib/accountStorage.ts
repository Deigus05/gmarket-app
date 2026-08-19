import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Isolamento de dados locais por conta.
 * Chaves sensíveis usam o sufixo `:u:<userId>` para nunca misturar contas no mesmo telemóvel.
 */

export const ACTIVE_ACCOUNT_KEY = '@gmarket:active_account_id';

/** Bases de chaves privadas (sempre com scope de utilizador quando autenticado). */
export const AccountDataKey = {
  favProducts: '@gmarket:fav_products',
  favProperties: '@gmarket:favorites',
  favStores: '@gmarket:fav_stores',
  localTickets: '@gmarket:local_tickets',
  announcedTickets: '@gmarket:announced_ticket_confirmed',
  seenNotifications: '@gmarket:seen_notification_ids',
  hiddenNotifications: '@gmarket:hidden_notification_ids',
  deliveryCatchUpDone: '@gmarket:delivery_catchup_done',
  cart: '@gmarket:cart',
  checkoutDraft: '@gmarket:checkout_draft',
  savedAddresses: '@gmarket:saved_addresses',
  profilePhoto: '@gmarket:profile_photo',
  deliveryLiveActivities: '@gmarket:delivery_live_activities',
  lastPushToken: '@gmarket:last_push_token',
  productReviews: '@gmarket:product_reviews',
  storeReviews: '@gmarket:store_reviews',
  homeAddress: '@gmarket:home_address',
  hiddenSearchHistory: '@gmarket:hidden_search_history',
  /** Estado de pop-ups promocionais vistos (JSON: { [id]: ISO timestamp }) */
  promoInterstitialsSeen: '@gmarket:promo_interstitials_seen',
} as const;

export type AccountDataBase = (typeof AccountDataKey)[keyof typeof AccountDataKey];

/** Chaves legadas sem userId — apagar para parar fugas entre contas. */
const LEGACY_UNSCOPED_KEYS = [
  AccountDataKey.favProducts,
  AccountDataKey.favProperties,
  AccountDataKey.favStores,
  AccountDataKey.localTickets,
  AccountDataKey.announcedTickets,
  AccountDataKey.seenNotifications,
  AccountDataKey.hiddenNotifications,
  AccountDataKey.deliveryCatchUpDone,
  AccountDataKey.cart,
  AccountDataKey.checkoutDraft,
  AccountDataKey.savedAddresses,
  AccountDataKey.profilePhoto,
  AccountDataKey.deliveryLiveActivities,
  AccountDataKey.productReviews,
  AccountDataKey.storeReviews,
  AccountDataKey.homeAddress,
  AccountDataKey.hiddenSearchHistory,
];

const GUEST_SCOPE = 'guest';

let memoryAccountId: string | null | undefined;

type AccountListener = (userId: string | null) => void;
const listeners = new Set<AccountListener>();

function notifyAccountChange(userId: string | null) {
  listeners.forEach((listener) => {
    try {
      listener(userId);
    } catch {
      // ignore listener errors
    }
  });
}

/** Subscreve mudanças de conta ativa (login / logout / troca). */
export function subscribeAccountScope(listener: AccountListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function scopedKey(base: string, userId: string): string {
  return `${base}:u:${userId}`;
}

export async function getActiveAccountId(): Promise<string | null> {
  if (memoryAccountId !== undefined) return memoryAccountId;
  try {
    const stored = await AsyncStorage.getItem(ACTIVE_ACCOUNT_KEY);
    memoryAccountId = stored || null;
    return memoryAccountId;
  } catch {
    memoryAccountId = null;
    return null;
  }
}

/** Resolve a chave de storage da conta ativa (ou guest se desautenticado). */
export async function resolveAccountKey(
  base: string,
  options?: { allowGuest?: boolean },
): Promise<string | null> {
  const userId = await getActiveAccountId();
  if (userId) return scopedKey(base, userId);
  if (options?.allowGuest) return scopedKey(base, GUEST_SCOPE);
  return null;
}

export async function getAccountItem(
  base: string,
  options?: { allowGuest?: boolean },
): Promise<string | null> {
  const key = await resolveAccountKey(base, options);
  if (!key) return null;
  return AsyncStorage.getItem(key);
}

export async function setAccountItem(
  base: string,
  value: string,
  options?: { allowGuest?: boolean },
): Promise<void> {
  const key = await resolveAccountKey(base, options);
  if (!key) return;
  await AsyncStorage.setItem(key, value);
}

export async function removeAccountItem(
  base: string,
  options?: { allowGuest?: boolean },
): Promise<void> {
  const key = await resolveAccountKey(base, options);
  if (!key) return;
  await AsyncStorage.removeItem(key);
}

async function purgeLegacyUnscopedKeys() {
  try {
    await AsyncStorage.multiRemove(LEGACY_UNSCOPED_KEYS);
  } catch {
    // ignore
  }
}

/**
 * Associa o telemóvel à conta `userId`.
 * Limpa chaves legadas partilhadas para não vazar dados da conta anterior.
 */
export async function bindAccount(userId: string): Promise<void> {
  const previous = await getActiveAccountId();
  memoryAccountId = userId;
  await AsyncStorage.setItem(ACTIVE_ACCOUNT_KEY, userId);
  await purgeLegacyUnscopedKeys();
  if (previous !== userId) {
    notifyAccountChange(userId);
  }
}

/**
 * Remove a associação à conta ativa sem apagar dados scoped
 * (para a mesma conta os recuperar no próximo login).
 */
export async function unbindAccount(): Promise<void> {
  const previous = await getActiveAccountId();
  memoryAccountId = null;
  await AsyncStorage.removeItem(ACTIVE_ACCOUNT_KEY);
  await purgeLegacyUnscopedKeys();
  if (previous !== null) {
    notifyAccountChange(null);
  }
}
