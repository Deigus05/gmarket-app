import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Clipboard, Platform } from 'react-native';

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
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(code);
    } else {
      Clipboard.setString(code);
    }
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

  const [queue, setQueue] = useState<PromoInterstitial[]>([]);
  const [current, setCurrent] = useState<PromoInterstitial | null>(null);
  const [visible, setVisible] = useState(false);

  const advance = useCallback((rest: PromoInterstitial[]) => {
    if (!rest.length) {
      setCurrent(null);
      setVisible(false);
      setQueue([]);
      return;
    }
    const [next, ...tail] = rest;
    setQueue(tail);
    setCurrent(next);
    setVisible(true);
    void markSeen(next.id);
  }, []);

  useEffect(() => {
    if (!enabled || authLoading || startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;

    (async () => {
      // Pequeno atraso para a home pintar antes do overlay
      await new Promise((r) => setTimeout(r, 450));
      if (cancelled) return;

      const payload = await getPromoInterstitials(token);
      const seen = await readSeenMap();
      if (cancelled) return;

      const candidates: PromoInterstitial[] = [];
      if (
        payload.fullscreen
        && shouldShowByFrequency(
          payload.fullscreen.id,
          payload.fullscreen.frequency || 'once_per_day',
          seen,
        )
      ) {
        candidates.push(payload.fullscreen);
      }
      if (
        payload.sheet
        && shouldShowByFrequency(
          payload.sheet.id,
          payload.sheet.frequency || 'once_per_day',
          seen,
        )
      ) {
        candidates.push(payload.sheet);
      }

      if (!candidates.length) return;
      advance(candidates);
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, authLoading, token, advance]);

  const handleClose = useCallback(() => {
    setVisible(false);
    const rest = queue;
    // Pausa breve entre fullscreen e gaveta
    setTimeout(() => advance(rest), rest.length ? 280 : 40);
  }, [advance, queue]);

  const handleGoToProduct = useCallback(
    (productId: string) => {
      setVisible(false);
      setCurrent(null);
      setQueue([]);
      router.push({ pathname: '/productDetail', params: { id: productId } });
    },
    [router],
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
