import { usePathname } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import {
  isHomeWebPath,
  restoreMobileDocumentScroll,
  unlockMobileDocumentScroll,
} from '@/lib/webDocumentScroll';

/** Document-scroll só na home. No checkout o layout volta a ecrã cheio. */
export function WebMobileDocumentScroll() {
  const pathname = usePathname();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const apply = () => {
      if (isHomeWebPath(pathname)) unlockMobileDocumentScroll();
      else restoreMobileDocumentScroll();
    };
    apply();
    window.addEventListener('resize', apply);
    const timer = window.setTimeout(apply, 300);
    return () => {
      window.removeEventListener('resize', apply);
      window.clearTimeout(timer);
    };
  }, [pathname]);

  return null;
}
