import { getLocales } from 'expo-localization';

import en from './locales/en';
import fr from './locales/fr';
import pt, { type TranslationKeys } from './locales/pt';

export type { TranslationKeys };

export const SUPPORTED_LOCALES = ['pt', 'en', 'fr'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

/** Explicit user choice (only set when user picks PT/EN/FR in settings). */
export const LOCALE_STORAGE_KEY = '@gmarket:locale';
/** When '1', stored locale overrides the device language. */
export const LOCALE_OVERRIDE_KEY = '@gmarket:locale_override';

export const LOCALE_META: Record<
  AppLocale,
  { code: string; nameKey: 'pt' | 'en' | 'fr'; nativeKey: 'ptNative' | 'enNative' | 'frNative' }
> = {
  pt: { code: 'PT', nameKey: 'pt', nativeKey: 'ptNative' },
  en: { code: 'EN', nameKey: 'en', nativeKey: 'enNative' },
  fr: { code: 'FR', nameKey: 'fr', nativeKey: 'frNative' },
};

export const DATE_LOCALES: Record<AppLocale, string> = {
  pt: 'pt-PT',
  en: 'en-GB',
  fr: 'fr-FR',
};

const catalogs: Record<AppLocale, TranslationKeys> = { pt, en, fr };

/**
 * Uses the device language when it is PT, EN or FR.
 * Any other device language falls back to Portuguese.
 * Prefers the first matching locale in the device preference list.
 */
export function resolveDeviceLocale(): AppLocale {
  const locales = getLocales();
  for (const locale of locales) {
    const code = (locale.languageCode ?? locale.languageTag?.split('-')[0] ?? '')
      .toLowerCase()
      .trim();
    if (code === 'pt' || code === 'en' || code === 'fr') {
      return code;
    }
  }
  return 'pt';
}

let currentLocale: AppLocale = resolveDeviceLocale();

export function isAppLocale(value: string | null | undefined): value is AppLocale {
  return value === 'pt' || value === 'en' || value === 'fr';
}

function lookup(dict: unknown, scope: string): string | undefined {
  const parts = scope.split('.');
  let node: unknown = dict;
  for (const part of parts) {
    if (node == null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

export function setI18nLocale(locale: AppLocale) {
  currentLocale = locale;
}

export function getI18nLocale(): AppLocale {
  return currentLocale;
}

export function t(scope: string, options?: Record<string, unknown>) {
  const value =
    lookup(catalogs[currentLocale], scope)
    ?? lookup(catalogs.pt, scope)
    ?? scope;

  if (!options) return value;

  return value.replace(/\{\{(\w+)\}\}|\{(\w+)\}/g, (_, a: string, b: string) => {
    const key = a || b;
    const replacement = options[key];
    return replacement == null ? '' : String(replacement);
  });
}
