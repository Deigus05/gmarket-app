import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useAuth } from '@/components/AuthContext';
import { getMyNotifications, getMyOrders } from '@/components/api';
import { syncDeliveryLiveActivities } from '@/components/deliveryLiveActivity';
import {
  announceNewInboxNotifications,
  clearPresentedNotifications,
  ensureAndroidChannel,
  registerForPushNotificationsAsync,
  resolveNotificationRoute,
} from '@/components/notifications';

const PUSH_PREF_KEY = '@gmarket:push_notifications';
const POLL_MS = 8000;

/** Regista permissões/push, faz poll da inbox e mostra alertas no telemóvel. */
export function NotificationBootstrap() {
  const { token, isLoggedIn, user } = useAuth();
  const router = useRouter();
  const handledInitial = useRef(false);
  const bootstrappedInbox = useRef(false);
  const sessionKeyRef = useRef<string | null>(null);
  const appInForeground = useRef(AppState.currentState === 'active');

  useEffect(() => {
    const sessionKey = isLoggedIn && token && user?.id ? `${user.id}:${token}` : null;

    const authToken = token;
    if (!sessionKey || !authToken) {
      bootstrappedInbox.current = false;
      sessionKeyRef.current = null;
      return;
    }

    // Nova conta / novo token → recomeça bootstrap e limpa banners da conta anterior.
    if (sessionKeyRef.current !== sessionKey) {
      sessionKeyRef.current = sessionKey;
      bootstrappedInbox.current = false;
      void clearPresentedNotifications();
    }

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const syncInbox = async (bootstrap = false) => {
      const pref = await AsyncStorage.getItem(PUSH_PREF_KEY);
      if (pref === '0' || cancelled) return;

      const result = await getMyNotifications(authToken, 30);
      if (!result.success || cancelled) return;

      await announceNewInboxNotifications(result.data, {
        bootstrap: bootstrap || !bootstrappedInbox.current,
        appInForeground: appInForeground.current,
      });
      bootstrappedInbox.current = true;

      const hasDeliveryUpdate = result.data.some((item) => item.type === 'delivery_status');
      if (hasDeliveryUpdate || bootstrap) {
        const orders = await getMyOrders(authToken);
        if (orders.success) await syncDeliveryLiveActivities(orders.data);
      }
    };

    void (async () => {
      const pref = await AsyncStorage.getItem(PUSH_PREF_KEY);
      if (pref === '0') return;

      await ensureAndroidChannel();
      await registerForPushNotificationsAsync(authToken);
      if (cancelled) return;

      await syncInbox(true);

      timer = setInterval(() => {
        void syncInbox(false);
      }, POLL_MS);
    })();

    const onAppState = (state: AppStateStatus) => {
      appInForeground.current = state === 'active';
      if (state === 'active') {
        // Re-regista token (pode ter mudado) e anuncia o que chegou com o app fechado.
        void (async () => {
          const pref = await AsyncStorage.getItem(PUSH_PREF_KEY);
          if (pref === '0' || cancelled) return;
          await registerForPushNotificationsAsync(authToken);
          if (cancelled) return;
          await syncInbox(false);
        })();
      }
    };
    const appSub = AppState.addEventListener('change', onAppState);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      appSub.remove();
    };
  }, [isLoggedIn, token, user?.id]);

  useEffect(() => {
    const openFromData = (data: Record<string, unknown> | undefined) => {
      // Chat (suporte / direto) nunca abre a página de notificações.
      const target = resolveNotificationRoute(data);
      if (!target) return;
      if (target.pathname === '/(tabs)') {
        router.push('/(tabs)');
        return;
      }
      router.push(target as never);
    };

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      openFromData(response.notification.request.content.data as Record<string, unknown>);
    });

    if (!handledInitial.current) {
      handledInitial.current = true;
      void Notifications.getLastNotificationResponseAsync().then((response) => {
        if (response) {
          openFromData(response.notification.request.content.data as Record<string, unknown>);
        }
      });
    }

    return () => {
      responseSub.remove();
    };
  }, [router]);

  return null;
}
