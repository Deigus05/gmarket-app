import { Linking } from 'react-native';

import { getPlatformContacts } from '@/components/api';

/**
 * Fallback support WhatsApp (digits only, with country code 245).
 * Prefer contacts from admin panel via getSupportWhatsApp().
 * Override with EXPO_PUBLIC_SUPPORT_WHATSAPP in env (e.g. 245955123456).
 */
export const SUPPORT_WHATSAPP = String(
  process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP ?? '245955123456',
).replace(/[^\d]/g, '');

let cachedSupportPhone: string | null = null;
let cachedTransferPhone: string | null = null;
let hydratePromise: Promise<void> | null = null;

async function hydrateFromApi(forceRefresh = false): Promise<void> {
  try {
    const data = await getPlatformContacts(forceRefresh ? { forceRefresh: true } : undefined);
    const supportPhone = String(data.support[0]?.phone || '').replace(/[^\d]/g, '');
    const transferPhone = String(data.transfer[0]?.phone || '').replace(/[^\d]/g, '');
    if (supportPhone) cachedSupportPhone = supportPhone;
    if (transferPhone) cachedTransferPhone = transferPhone;
  } catch {
    // keep previous cache / env fallback
  }
}

function ensureHydrated(): Promise<void> {
  if (!hydratePromise) {
    hydratePromise = hydrateFromApi().finally(() => {
      // allow refresh later
    });
  }
  return hydratePromise;
}

/** Prefetch contacts (call on app start if desired). */
export function prefetchPlatformContacts(): void {
  void ensureHydrated();
}

export async function getSupportWhatsApp(forceRefresh = false): Promise<string> {
  if (forceRefresh) {
    await hydrateFromApi(true);
  } else {
    await ensureHydrated();
  }
  return cachedSupportPhone || SUPPORT_WHATSAPP;
}

/** Global Mobile Money / transfer number from admin (first active). */
export async function getTransferPhone(forceRefresh = false): Promise<string> {
  if (forceRefresh) {
    await hydrateFromApi(true);
  } else {
    await ensureHydrated();
  }
  return cachedTransferPhone || '';
}

export async function openWhatsAppTo(
  phoneDigits: string,
  prefill?: string,
): Promise<boolean> {
  const number = String(phoneDigits || '').replace(/[^\d]/g, '');
  if (!number) return false;
  const query = prefill ? `?text=${encodeURIComponent(prefill)}` : '';
  const url = `https://wa.me/${number}${query}`;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

export async function openSupportWhatsApp(prefill?: string): Promise<boolean> {
  const phone = await getSupportWhatsApp();
  return openWhatsAppTo(phone, prefill);
}
