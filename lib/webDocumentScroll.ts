import { Platform } from 'react-native';

const MOBILE_MAX = 899;
const UNLOCK_CLASS = 'gm-unlock-scroll';

function clearUnlockClasses() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll(`.${UNLOCK_CLASS}`).forEach((el) => {
    el.classList.remove(UNLOCK_CLASS);
  });
}

function isMobileWeb() {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    window.innerWidth <= MOBILE_MAX
  );
}

export function isHomeWebPath(pathname: string) {
  return pathname === '/' || pathname === '/index' || pathname.endsWith('/(tabs)') || pathname.endsWith('/(tabs)/index');
}

/** Só na home: o documento faz scroll (Safari/Chrome escondem as barras). */
export function unlockMobileDocumentScroll(fromId = 'gm-home-feed') {
  if (!isMobileWeb()) {
    restoreMobileDocumentScroll();
    return;
  }

  clearUnlockClasses();
  document.documentElement.classList.add('gm-mobile-doc-scroll');
  document.body.classList.add('gm-mobile-doc-scroll');

  document.getElementById('root')?.classList.add(UNLOCK_CLASS);

  let el = document.getElementById(fromId);
  while (el && el !== document.body) {
    el.classList.add(UNLOCK_CLASS);
    el = el.parentElement;
  }
}

/** Fora da home (checkout, etc.) volta ao layout app a ecrã cheio. */
export function restoreMobileDocumentScroll() {
  if (typeof document === 'undefined') return;
  clearUnlockClasses();
  document.documentElement.classList.remove('gm-mobile-doc-scroll');
  document.body.classList.remove('gm-mobile-doc-scroll');
  document.documentElement.style.removeProperty('overflow');
  document.body.style.removeProperty('overflow');
}

export function lockWindowScroll() {
  if (!isMobileWeb()) return;
  document.documentElement.style.setProperty('overflow', 'hidden', 'important');
  document.body.style.setProperty('overflow', 'hidden', 'important');
}

export function unlockWindowScroll() {
  if (!isMobileWeb()) return;
  document.documentElement.style.setProperty('overflow-y', 'auto', 'important');
  document.body.style.setProperty('overflow-y', 'auto', 'important');
}

export function scrollWindowToTop(animated = true) {
  if (typeof window === 'undefined') return;
  window.scrollTo({ top: 0, behavior: animated ? 'smooth' : 'auto' });
}

export function readWindowScrollY() {
  if (typeof window === 'undefined') return 0;
  return window.scrollY || document.documentElement.scrollTop || 0;
}
