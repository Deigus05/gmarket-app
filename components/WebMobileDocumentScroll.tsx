import { useEffect } from 'react';
import { Platform } from 'react-native';

import { unlockMobileDocumentScroll } from '@/lib/webDocumentScroll';

/** No telemóvel, o documento faz scroll para o Safari/Chrome esconderem as barras. */
export function WebMobileDocumentScroll() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const apply = () => unlockMobileDocumentScroll();
    apply();
    window.addEventListener('resize', apply);
    const timer = window.setTimeout(apply, 300);
    return () => {
      window.removeEventListener('resize', apply);
      window.clearTimeout(timer);
    };
  }, []);

  return null;
}
