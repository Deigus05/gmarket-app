import { useEffect, useMemo, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

/** Largura mínima para layout storefront denso (estilo Yandex Market). */
export const DESKTOP_MIN_WIDTH = 900;
export const CONTENT_MAX_WIDTH = 1360;

export type BreakpointLayout = {
  width: number;
  height: number;
  isDesktop: boolean;
  contentMax: number;
  feedColumns: number;
  gridPad: number;
  gridGap: number;
  columnWidth: number;
  heroPageWidth: number;
  feedPageWidth: number;
  contentPad: number;
};

function readBrowserWidth(fallback: number) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return fallback;
  return Math.max(
    fallback || 0,
    window.innerWidth || 0,
    document.documentElement?.clientWidth || 0,
  );
}

/**
 * Métricas de layout responsivas para a home web.
 * Em telemóvel / tablet estreito mantém a grelha de 2 colunas.
 *
 * Importante: no export estático o Dimensions pode vir “estreito”.
 * No browser lemos window.innerWidth para activar o layout desktop.
 */
export function useBreakpoint(): BreakpointLayout {
  const dims = useWindowDimensions();
  const [browserWidth, setBrowserWidth] = useState(() => readBrowserWidth(dims.width));

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const sync = () => setBrowserWidth(readBrowserWidth(dims.width));
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [dims.width]);

  const width =
    Platform.OS === 'web' ? Math.max(dims.width, browserWidth) : dims.width;
  const height = dims.height;

  return useMemo(() => {
    const isDesktop = Platform.OS === 'web' && width >= DESKTOP_MIN_WIDTH;
    const contentMax = CONTENT_MAX_WIDTH;
    const contentPad = isDesktop ? Math.max(16, (width - contentMax) / 2) : 0;
    const usable = isDesktop ? Math.min(width, contentMax) : width;

    const feedColumns = !isDesktop ? 2 : width >= 1440 ? 6 : width >= 1200 ? 5 : 4;
    const gridPad = isDesktop ? 8 : 4;
    const gridGap = isDesktop ? 8 : 4;
    const columnWidth = (usable - gridPad * 2 - gridGap * (feedColumns - 1)) / feedColumns;
    const heroPageWidth = isDesktop ? usable - 32 : width - 28;
    const feedPageWidth = isDesktop ? usable - 32 : width - 24;

    return {
      width,
      height,
      isDesktop,
      contentMax,
      feedColumns,
      gridPad,
      gridGap,
      columnWidth,
      heroPageWidth,
      feedPageWidth,
      contentPad,
    };
  }, [height, width]);
}
