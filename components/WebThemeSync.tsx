import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useAppTheme } from '@/components/tema';

/**
 * Sincroniza o fundo do documento com o tema do app (system / claro / escuro),
 * alinhado ao Chrome: claro → branco; escuro → cinza escuro.
 */
export function WebThemeSync() {
  const { ui, isDark, ready } = useAppTheme();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || !ready) return;

    const root = document.documentElement;
    const body = document.body;
    root.style.colorScheme = isDark ? 'dark' : 'light';
    root.style.backgroundColor = ui.bg;
    body.style.backgroundColor = ui.bg;
    body.style.color = ui.text;

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', ui.bg);
    } else {
      const el = document.createElement('meta');
      el.name = 'theme-color';
      el.content = ui.bg;
      document.head.appendChild(el);
    }
  }, [isDark, ready, ui.bg, ui.text]);

  return null;
}
