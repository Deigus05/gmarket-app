import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';

import { getMyOrders } from '@/components/api';
import { useAuth } from '@/components/AuthContext';
import {
  clearAllDeliveryLiveActivities,
  forgetLiveActivityId,
  syncDeliveryLiveActivities,
} from '@/components/deliveryLiveActivity';

const POLL_MS = 8000;

/**
 * Mantém a Dynamic Island / Live Activity alinhada com os pedidos.
 * Só aparece a partir de "Pedido recolhido" (`picked`).
 */
export function DeliveryLiveActivityBootstrap() {
  const { token, isLoggedIn } = useAuth();
  const tokenRef = useRef(token);
  tokenRef.current = token;

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    let subscription: { remove: () => void } | undefined;
    let cancelled = false;

    void (async () => {
      try {
        const LiveActivity = await import('expo-live-activity');
        if (cancelled) return;
        const sub = LiveActivity.addActivityUpdatesListener?.((event) => {
          if (event.activityState === 'dismissed' || event.activityState === 'ended') {
            void forgetLiveActivityId(event.activityID);
          }
        });
        if (sub) subscription = sub;
      } catch {
        // Expo Go / módulo nativo em falta — ignora
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    if (!isLoggedIn || !token) {
      void clearAllDeliveryLiveActivities();
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const sync = async () => {
      const auth = tokenRef.current;
      if (!auth || cancelled) return;
      const result = await getMyOrders(auth);
      if (!result.success || cancelled) return;
      await syncDeliveryLiveActivities(result.data);
    };

    void sync();
    timer = setInterval(() => {
      void sync();
    }, POLL_MS);

    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') void sync();
    };
    const appSub = AppState.addEventListener('change', onAppState);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      appSub.remove();
    };
  }, [isLoggedIn, token]);

  return null;
}
