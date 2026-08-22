import { Platform } from 'react-native';

const MOBILE_MAX = 899;

function isMobileWeb() {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    window.innerWidth <= MOBILE_MAX
  );
}

function setImportant(el: HTMLElement, prop: string, value: string) {
  el.style.setProperty(prop, value, 'important');
}

/** Liberta html/body/#root e a cadeia até ao feed para o documento ser o scroller. */
export function unlockMobileDocumentScroll(fromId = 'gm-home-feed') {
  if (!isMobileWeb()) return;

  document.documentElement.classList.add('gm-mobile-doc-scroll');
  document.body.classList.add('gm-mobile-doc-scroll');

  const root = document.getElementById('root');
  if (root) {
    setImportant(root, 'height', 'auto');
    setImportant(root, 'min-height', '100dvh');
    setImportant(root, 'overflow', 'visible');
  }

  let el = document.getElementById(fromId);
  while (el && el !== document.body) {
    setImportant(el, 'overflow', 'visible');
    setImportant(el, 'height', 'auto');
    setImportant(el, 'max-height', 'none');
    el = el.parentElement;
  }
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
