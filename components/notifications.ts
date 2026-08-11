import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { AppNotification, registerPushToken, unregisterPushToken } from '@/components/api';
import {
  AccountDataKey,
  getAccountItem,
  getActiveAccountId,
  setAccountItem,
} from '@/lib/accountStorage';

const PUSH_TOKEN_DEVICE_KEY = AccountDataKey.lastPushToken;
const REMOTE_PUSH_ACTIVE_KEY = '@gmarket:remote_push_active';


Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function resolveProjectId(): string | undefined {
  return (
    Constants.easConfig?.projectId
    || Constants.expoConfig?.extra?.eas?.projectId
    || Constants.expoConfig?.extra?.projectId
    || undefined
  );
}

export async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('gmarket-default', {
    name: 'GMarket',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#0D47A1',
    sound: 'default',
  });
}

/** Limpa banners/lista do SO ao trocar ou sair da conta. */
export async function clearPresentedNotifications() {
  try {
    await Notifications.dismissAllNotificationsAsync();
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (Platform.OS === 'ios') {
      await Notifications.setBadgeCountAsync(0);
    }
  } catch (error) {
    console.log('Erro ao limpar notificações locais:', error);
  }
}

/** Remove o push token da conta atual no servidor e limpa alertas locais. */
export async function unregisterPushForCurrentSession(
  authToken: string | null | undefined,
): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(PUSH_TOKEN_DEVICE_KEY);
    if (authToken && stored) {
      await unregisterPushToken(authToken, stored);
    }
  } catch (error) {
    console.log('Erro ao remover push token:', error);
  } finally {
    try {
      await AsyncStorage.multiRemove([PUSH_TOKEN_DEVICE_KEY, REMOTE_PUSH_ACTIVE_KEY]);
    } catch {
      // ignore
    }
    await clearPresentedNotifications();
  }
}

/** Pede permissão e, se possível, regista Expo Push Token. */
export async function registerForPushNotificationsAsync(
  authToken: string | null | undefined,
): Promise<{ permission: boolean; pushToken: string | null }> {
  if (!authToken) return { permission: false, pushToken: null };

  try {
    await ensureAndroidChannel();

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      return { permission: false, pushToken: null };
    }

    const projectId = resolveProjectId();
    if (!projectId) {
      console.log(
        'Push remoto indisponível: falta projectId EAS. Alertas locais do sininho continuam ativos.',
      );
      return { permission: true, pushToken: null };
    }

    if (!Device.isDevice && Platform.OS === 'android') {
      console.log('Push remoto precisa de dispositivo físico / emulador com Google Play.');
      return { permission: true, pushToken: null };
    }

    const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoToken = tokenResult.data;
    if (!expoToken) return { permission: true, pushToken: null };

    await registerPushToken(authToken, expoToken, Platform.OS);
    await AsyncStorage.setItem(PUSH_TOKEN_DEVICE_KEY, expoToken);
    await AsyncStorage.setItem(REMOTE_PUSH_ACTIVE_KEY, '1');
    console.log('Expo push token registado.');
    return { permission: true, pushToken: expoToken };
  } catch (error) {
    console.log('Push registration skipped:', error);
    return { permission: true, pushToken: null };
  }
}

export async function isRemotePushActive(): Promise<boolean> {
  try {
    const flag = await AsyncStorage.getItem(REMOTE_PUSH_ACTIVE_KEY);
    const token = await AsyncStorage.getItem(PUSH_TOKEN_DEVICE_KEY);
    return flag === '1' && Boolean(token);
  } catch {
    return false;
  }
}

/** Mensagens de suporte ficam só no chat — nunca na inbox/sininho. */
export function isChatNotification(
  item: Pick<AppNotification, 'type'> | { type?: unknown; data?: Record<string, unknown> | null } | null | undefined,
): boolean {
  if (!item || typeof item !== 'object') return false;
  const type = typeof item.type === 'string' ? item.type : null;
  if (type === 'support_message' || type === 'direct_message') return true;
  const data = 'data' in item && item.data && typeof item.data === 'object' ? item.data : null;
  if (!data) return false;
  const screen = typeof data.screen === 'string' ? data.screen : null;
  const dataType = typeof data.type === 'string' ? data.type : null;
  return (
    dataType === 'support_message'
    || dataType === 'direct_message'
    || screen === 'chat'
    || screen === 'support'
    || screen === 'direct_chat'
  );
}

/** @deprecated use isChatNotification */
export function isSupportNotification(
  item: Pick<AppNotification, 'type'> | { type?: unknown; data?: Record<string, unknown> | null } | null | undefined,
): boolean {
  return isChatNotification(item);
}

export async function presentLocalNotification(item: AppNotification) {
  await ensureAndroidChannel();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: item.title,
      body: item.body,
      data: {
        type: item.type,
        screen: item.type === 'support_message'
          ? 'support'
          : item.type === 'direct_message'
            ? 'direct_chat'
            : undefined,
        ...(item.data || {}),
      },
      sound: 'default',
      ...(Platform.OS === 'android' ? { channelId: 'gmarket-default' } : null),
    },
    trigger: null,
  });
}

export async function loadSeenNotificationIds(): Promise<Set<string>> {
  try {
    const userId = await getActiveAccountId();
    if (!userId) return new Set();
    const raw = await getAccountItem(AccountDataKey.seenNotifications);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

export async function saveSeenNotificationIds(ids: Set<string>) {
  const userId = await getActiveAccountId();
  if (!userId) return;
  const list = [...ids].slice(-200);
  await setAccountItem(AccountDataKey.seenNotifications, JSON.stringify(list));
}

/**
 * Mostra no telemóvel alertas locais para notificações novas da inbox.
 * Se push remoto estiver ativo, só marca como vistas (evita alerta duplicado).
 */
export async function announceNewInboxNotifications(
  items: AppNotification[],
  options?: { bootstrap?: boolean; appInForeground?: boolean },
) {
  const userId = await getActiveAccountId();
  if (!userId) return 0;

  const unread = items.filter((item) => !item.read_at);
  const seen = await loadSeenNotificationIds();

  if (options?.bootstrap) {
    for (const item of unread) seen.add(item.id);
    await saveSeenNotificationIds(seen);
    await markTicketConfirmedAnnounced(unread);
    return 0;
  }

  const toShow: AppNotification[] = [];
  for (const item of unread) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    // Suporte: marca como visto sem banner local (badge do chat cuida disso).
    if (isSupportNotification(item)) continue;
    toShow.push(item);
  }

  // Grava antes de alertar — evita corrida / duplicados
  if (toShow.length || unread.some((item) => isSupportNotification(item))) {
    await saveSeenNotificationIds(seen);
    await markTicketConfirmedAnnounced(toShow);
  }

  // Alertas locais quando o app está aberto (push remoto cobre background).
  if (!options?.appInForeground) return 0;

  let shown = 0;
  for (const item of toShow) {
    await presentLocalNotification(item);
    shown += 1;
  }
  return shown;
}

async function markTicketConfirmedAnnounced(items: AppNotification[]) {
  const ticketIds = items
    .filter((i) => i.type === 'ticket_confirmed')
    .map((item) => (typeof item.data?.ticketId === 'string' ? item.data.ticketId : null))
    .filter((id): id is string => Boolean(id));
  if (!ticketIds.length) return;
  try {
    const raw = await getAccountItem(AccountDataKey.announcedTickets);
    const parsed = raw ? JSON.parse(raw) : [];
    const prev = Array.isArray(parsed) ? parsed.map(String) : [];
    const set = new Set(prev);
    for (const id of ticketIds) set.add(id);
    await setAccountItem(
      AccountDataKey.announcedTickets,
      JSON.stringify([...set].slice(-100)),
    );
  } catch {
    // ignore
  }
}

export type NotificationRouteTarget =
  | { pathname: '/productDetail'; params: { id: string } }
  | { pathname: '/entrega'; params: { orderId: string } }
  | { pathname: '/loja'; params: { id: string } }
  | { pathname: '/chat'; params?: undefined }
  | { pathname: '/chat/support'; params?: undefined }
  | { pathname: `/chat/direct/${string}`; params?: undefined }
  | { pathname: '/(tabs)'; params?: undefined }
  | null;

export function resolveNotificationRoute(data: Record<string, unknown> | undefined | null): NotificationRouteTarget {
  if (!data || typeof data !== 'object') return null;

  const productId = typeof data.productId === 'string' ? data.productId : null;
  const orderId = typeof data.orderId === 'string' ? data.orderId : null;
  const storeId = typeof data.storeId === 'string' ? data.storeId : null;
  const screen = typeof data.screen === 'string' ? data.screen : null;
  const type = typeof data.type === 'string' ? data.type : null;
  const conversationId = typeof data.conversationId === 'string'
    ? data.conversationId
    : typeof data.conversation_id === 'string'
      ? data.conversation_id
      : null;

  if (type === 'direct_message' || screen === 'direct_chat') {
    if (conversationId) return { pathname: `/chat/direct/${conversationId}` };
    return { pathname: '/chat' };
  }
  if (
    isChatNotification({ type, data })
    || type === 'support_message'
    || screen === 'chat'
    || screen === 'support'
  ) {
    return { pathname: '/chat/support' };
  }
  if (productId || screen === 'productDetail') {
    if (productId) return { pathname: '/productDetail', params: { id: productId } };
  }
  if (orderId || screen === 'entrega') {
    if (orderId) return { pathname: '/entrega', params: { orderId } };
  }
  if (storeId || screen === 'loja') {
    if (storeId) return { pathname: '/loja', params: { id: storeId } };
  }
  if (screen === 'home' || data.ticketId) {
    return { pathname: '/(tabs)' };
  }
  return { pathname: '/(tabs)' };
}
