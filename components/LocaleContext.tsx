import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  AppLocale,
  DATE_LOCALES,
  LOCALE_OVERRIDE_KEY,
  LOCALE_STORAGE_KEY,
  isAppLocale,
  resolveDeviceLocale,
  setI18nLocale,
  t as translate,
} from '@/lib/i18n';

type LocaleContextValue = {
  ready: boolean;
  locale: AppLocale;
  /** true = user picked a language; false = follow device (PT/EN/FR, else PT) */
  followsDevice: boolean;
  dateLocale: string;
  setLocale: (locale: AppLocale) => void;
  useDeviceLocale: () => void;
  t: typeof translate;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function applyLocale(
  next: AppLocale,
  setLocaleState: (l: AppLocale) => void,
  bump: () => void,
) {
  setI18nLocale(next);
  setLocaleState(next);
  bump();
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [locale, setLocaleState] = useState<AppLocale>(() => resolveDeviceLocale());
  const [followsDevice, setFollowsDevice] = useState(true);
  const [version, setVersion] = useState(0);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [stored, overrideFlag] = await Promise.all([
          AsyncStorage.getItem(LOCALE_STORAGE_KEY),
          AsyncStorage.getItem(LOCALE_OVERRIDE_KEY),
        ]);
        if (!active) return;

        // Explicit user choice wins; otherwise always follow the device.
        if (overrideFlag === '1' && isAppLocale(stored)) {
          setFollowsDevice(false);
          applyLocale(stored, setLocaleState, bump);
        } else {
          setFollowsDevice(true);
          applyLocale(resolveDeviceLocale(), setLocaleState, bump);
          // Clear stale saved locale from older builds that always persisted.
          if (stored && overrideFlag !== '1') {
            AsyncStorage.multiRemove([LOCALE_STORAGE_KEY, LOCALE_OVERRIDE_KEY]).catch(() => {});
          }
        }
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [bump]);

  // When following the device, refresh if the OS language changes (esp. Android).
  useEffect(() => {
    if (!followsDevice) return;

    const syncFromDevice = () => {
      const next = resolveDeviceLocale();
      setI18nLocale(next);
      setLocaleState((prev) => {
        if (prev === next) return prev;
        setVersion((v) => v + 1);
        return next;
      });
    };

    const onChange = (state: AppStateStatus) => {
      if (state === 'active') syncFromDevice();
    };

    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [followsDevice]);

  const setLocale = useCallback((next: AppLocale) => {
    setFollowsDevice(false);
    applyLocale(next, setLocaleState, bump);
    AsyncStorage.multiSet([
      [LOCALE_STORAGE_KEY, next],
      [LOCALE_OVERRIDE_KEY, '1'],
    ]).catch(() => {});
  }, [bump]);

  const useDeviceLocale = useCallback(() => {
    setFollowsDevice(true);
    applyLocale(resolveDeviceLocale(), setLocaleState, bump);
    AsyncStorage.multiRemove([LOCALE_STORAGE_KEY, LOCALE_OVERRIDE_KEY]).catch(() => {});
  }, [bump]);

  const t = useCallback(
    (scope: string, options?: Record<string, unknown>) => translate(scope, options),
    [version],
  );

  const value = useMemo(
    () => ({
      ready,
      locale,
      followsDevice,
      dateLocale: DATE_LOCALES[locale],
      setLocale,
      useDeviceLocale,
      t,
    }),
    [ready, locale, followsDevice, setLocale, useDeviceLocale, t],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useLocale must be used within LocaleProvider');
  }
  return ctx;
}

export function useT() {
  return useLocale().t;
}
