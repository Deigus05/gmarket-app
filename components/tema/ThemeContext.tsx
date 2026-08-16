import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { Platform, useColorScheme as useSystemColorScheme } from 'react-native';

import {
  AppearanceMode,
  AppUI,
  ColorScheme,
  DEFAULT_APPEARANCE,
  DEFAULT_PALETTE_ID,
  HomePalette,
  PaletteId,
  resolveAppUI,
  resolvePalette,
  resolveScheme,
} from './themes';

const APPEARANCE_KEY = '@gmarket:appearance_mode';
const PALETTE_KEY = '@gmarket:theme_palette';

type ThemeContextValue = {
  ready: boolean;
  appearance: AppearanceMode;
  paletteId: PaletteId;
  scheme: ColorScheme;
  colors: HomePalette;
  ui: AppUI;
  isDark: boolean;
  setAppearance: (mode: AppearanceMode) => void;
  setPaletteId: (id: PaletteId) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readWebScheme(): ColorScheme | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return null;
  }
}

/**
 * No web, useColorScheme() e o estado SSR ficam muitas vezes em “light”.
 * Lemos matchMedia no render do client para o fundo escuro aplicar de imediato.
 */
function useResolvedSystemScheme(): ColorScheme | null | undefined {
  const rnScheme = useSystemColorScheme();
  const [webScheme, setWebScheme] = useState<ColorScheme | null>(null);

  useLayoutEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => setWebScheme(mq.matches ? 'dark' : 'light');
    sync();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', sync);
      return () => mq.removeEventListener('change', sync);
    }
    mq.addListener(sync);
    return () => mq.removeListener(sync);
  }, []);

  if (Platform.OS === 'web') {
    return webScheme ?? readWebScheme() ?? rnScheme;
  }
  return rnScheme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useResolvedSystemScheme();
  const [ready, setReady] = useState(false);
  const [appearance, setAppearanceState] = useState<AppearanceMode>(DEFAULT_APPEARANCE);
  const [paletteId, setPaletteState] = useState<PaletteId>(DEFAULT_PALETTE_ID);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [storedAppearance, storedPalette] = await Promise.all([
          AsyncStorage.getItem(APPEARANCE_KEY),
          AsyncStorage.getItem(PALETTE_KEY),
        ]);
        if (!active) return;
        if (
          storedAppearance === 'system'
          || storedAppearance === 'light'
          || storedAppearance === 'dark'
        ) {
          setAppearanceState(storedAppearance);
        }
        if (
          storedPalette === 'mint'
          || storedPalette === 'blue'
          || storedPalette === 'pink'
          || storedPalette === 'yellow'
        ) {
          setPaletteState(storedPalette);
        }
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const setAppearance = useCallback((mode: AppearanceMode) => {
    setAppearanceState(mode);
    AsyncStorage.setItem(APPEARANCE_KEY, mode).catch(() => {});
  }, []);

  const setPaletteId = useCallback((id: PaletteId) => {
    setPaletteState(id);
    AsyncStorage.setItem(PALETTE_KEY, id).catch(() => {});
  }, []);

  const scheme = resolveScheme(appearance, systemScheme);
  const colors = useMemo(() => resolvePalette(paletteId, scheme), [paletteId, scheme]);
  const ui = useMemo(() => resolveAppUI(scheme), [scheme]);
  const isDark = scheme === 'dark';

  const value = useMemo(
    () => ({
      ready,
      appearance,
      paletteId,
      scheme,
      colors,
      ui,
      isDark,
      setAppearance,
      setPaletteId,
    }),
    [ready, appearance, paletteId, scheme, colors, ui, isDark, setAppearance, setPaletteId],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useAppTheme must be used within ThemeProvider');
  }
  return ctx;
}
