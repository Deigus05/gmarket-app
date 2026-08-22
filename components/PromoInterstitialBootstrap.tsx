import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, InteractionManager } from 'react-native';

import { useAuth } from '@/components/AuthContext';
import PromoInterstitialModal from '@/components/PromoInterstitialModal';
import {
  getPromoInterstitials,
  type PromoInterstitial,
  type PromoInterstitialFrequency,
} from '@/components/api';
import {
  AccountDataKey,
  getAccountItem,
  setAccountItem,
} from '@/lib/accountStorage';

type SeenMap = Record<string, string>;

/** IDs já mostrados nesta sessão de processo (once_per_session / every_launch). */
const sessionShownIds = new Set<string>();

function sameCalendarDay(iso: string, now = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate()
  );
}

function firstEligible(
  items: PromoInterstitial[],
  seen: SeenMap,
): PromoInterstitial | null {
  return items.find((item) =>
    shouldShowByFrequency(item.id, item.frequency || 'every_launch', seen),
  ) || null;
}

function shouldShowByFrequency(
  id: string,
  frequency: PromoInterstitialFrequency,
  seen: SeenMap,
): boolean {
  const last = seen[id];

  switch (frequency) {
    case 'once':
      return !last;
    case 'once_per_day':
      if (!last) return true;
      return !sameCalendarDay(last);
    case 'once_per_session':
      return !sessionShownIds.has(id);
    case 'every_launch':
      // Uma vez por arranque frio do processo JS
      return !sessionShownIds.has(id);
    default:
      return !last;
  }
}

async function readSeenMap(): Promise<SeenMap> {
  try {
    const raw = await getAccountItem(AccountDataKey.promoInterstitialsSeen, {
      allowGuest: true,
    });
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SeenMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function markSeen(id: string) {
  sessionShownIds.add(id);
  try {
    const seen = await readSeenMap();
    seen[id] = new Date().toISOString();
    await setAccountItem(
      AccountDataKey.promoInterstitialsSeen,
      JSON.stringify(seen),
      { allowGuest: true },
    );
  } catch {
    // ignore storage errors
  }
}

async function copyText(code: string) {
  try {
    await Clipboard.setStringAsync(code);
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // haptics opcional
    }
  } catch {
    Alert.alert('Código', code);
  }
}

type Props = {
  /** Só arranca depois do splash/intro da marca. */
  enabled: boolean;
};

/**
 * Mostra pop-ups promocionais ao entrar:
 * 1) fullscreen (se elegível)
 * 2) depois a gaveta metade de ecrã (se elegível)
 */
export function PromoInterstitialBootstrap({ enabled }: Props) {
  const { token, loading: authLoading } = useAuth();
  const router = useRouter();
  const startedRef = useRef(false);
  const showingRef = useRef(false);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const interactionRef = useRef<ReturnType<typeof InteractionManager.runAfterInteractions> | null>(
    null,
  );
  const navigationPendingRef = useRef(false);

  const [queue, setQueue] = useState<PromoInterstitial[]>([]);
  const [current, setCurrent] = useState<PromoInterstitial | null>(null);
  const [visible, setVisible] = useState(false);

  const schedule = useCallback((callback: () => void, delay: number) => {
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      callback();
    }, delay);
    timersRef.current.add(timer);
    return timer;
  }, []);

  useEffect(
    () => () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current.clear();
      interactionRef.current?.cancel();
      interactionRef.current = null;
    },
    [],
  );

  const advance = useCallback((rest: PromoInterstitial[]) => {
    if (!rest.length) {
      showingRef.current = false;
      setCurrent(null);
      setVisible(false);
      setQueue([]);
      return;
    }
    const [next, ...tail] = rest;
    showingRef.current = true;
    setQueue(tail);
    setCurrent(next);
    setVisible(true);
    void markSeen(next.id);
  }, []);

  const loadCandidates = useCallback(async () => {
    const payload = await getPromoInterstitials(token);
    const seen = await readSeenMap();
    const fullList = payload.fullscreen_items?.length
      ? payload.fullscreen_items
      : (payload.fullscreen ? [payload.fullscreen] : []);
    const sheetList = payload.sheet_items?.length
      ? payload.sheet_items
      : (payload.sheet ? [payload.sheet] : []);
    const candidates: PromoInterstitial[] = [];
    const fullscreen = firstEligible(fullList, seen);
    const sheet = firstEligible(sheetList, seen);
    if (fullscreen) candidates.push(fullscreen);
    if (sheet) candidates.push(sheet);
    return candidates;
  }, [token]);

  useEffect(() => {
    if (!enabled || authLoading) return;

    let cancelled = false;

    const tryShow = async (retries = 2) => {
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        if (cancelled || showingRef.current) return;
        try {
          const candidates = await loadCandidates();
          if (cancelled || showingRef.current) return;
          if (candidates.length) {
            startedRef.current = true;
            advance(candidates);
            return;
          }
        } catch {
          // tenta outra vez
        }
        if (attempt < retries) {
          await new Promise((resolve) => {
            schedule(() => resolve(undefined), 1600);
          });
        }
      }
    };

    const startupTimer = schedule(() => {
      void tryShow();
    }, startedRef.current ? 80 : 450);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !showingRef.current) {
        void tryShow(0);
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(startupTimer);
      timersRef.current.delete(startupTimer);
      sub.remove();
    };
  }, [enabled, authLoading, token, advance, schedule, loadCandidates]);

  const handleClose = useCallback(() => {
    setVisible(false);
    const rest = queue;
    // Pausa breve entre fullscreen e gaveta
    schedule(() => advance(rest), rest.length ? 280 : 40);
  }, [advance, queue, schedule]);

  const handleGoToProduct = useCallback(
    (productId: string) => {
      if (!productId || navigationPendingRef.current) return;
      navigationPendingRef.current = true;
      showingRef.current = false;
      setVisible(false);
      setCurrent(null);
      setQueue([]);
      schedule(() => {
        interactionRef.current = InteractionManager.runAfterInteractions(() => {
          interactionRef.current = null;
          navigationPendingRef.current = false;
          router.push(`/productDetail?id=${encodeURIComponent(productId)}`);
        });
      }, 0);
    },
    [router, schedule],
  );

  const handleCopyPromo = useCallback(async (code: string) => {
    await copyText(code);
  }, []);

  if (!current) return null;

  return (
    <PromoInterstitialModal
      item={current}
      visible={visible}
      onClose={handleClose}
      onGoToProduct={handleGoToProduct}
      onCopyPromo={handleCopyPromo}
    />
  );
}
