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
  const channel = {
    name: 'GMarket',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#0D47A1',
    sound: 'default' as const,
    enableVibrate: true,
    showBadge: true,
  };
  // Canal usado pelo app + default do plugin (servidor envia channelId: gmarket-default)
  await Notifications.setNotificationChannelAsync('gmarket-default', channel);
  await Notifications.setNotificationChannelAsync('default', channel);
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
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowDisplayInCarPlay: false,
        },
      });
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      await AsyncStorage.multiRemove([REMOTE_PUSH_ACTIVE_KEY]).catch(() => undefined);
      return { permission: false, pushToken: null };
    }

    const projectId = resolveProjectId();
    if (!projectId) {
      console.log(
        'Push remoto indisponível: falta projectId EAS. Alertas locais do sininho continuam ativos.',
      );
      await AsyncStorage.removeItem(REMOTE_PUSH_ACTIVE_KEY).catch(() => undefined);
      return { permission: true, pushToken: null };
    }

    if (!Device.isDevice && Platform.OS === 'android') {
      console.log('Push remoto precisa de dispositivo físico / emulador com Google Play.');
      await AsyncStorage.removeItem(REMOTE_PUSH_ACTIVE_KEY).catch(() => undefined);
      return { permission: true, pushToken: null };
    }

    const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoToken = tokenResult.data;
    if (!expoToken) {
      await AsyncStorage.removeItem(REMOTE_PUSH_ACTIVE_KEY).catch(() => undefined);
      return { permission: true, pushToken: null };
    }

    const registered = await registerPushToken(authToken, expoToken, Platform.OS);
    if (!registered.success) {
      console.log('Falha ao registar push token no servidor:', registered.message);
      await AsyncStorage.removeItem(REMOTE_PUSH_ACTIVE_KEY).catch(() => undefined);
      return { permission: true, pushToken: null };
    }

    await AsyncStorage.setItem(PUSH_TOKEN_DEVICE_KEY, expoToken);
    await AsyncStorage.setItem(REMOTE_PUSH_ACTIVE_KEY, '1');
    console.log('Expo push token registado:', expoToken.slice(0, 28) + '…');
    return { permission: true, pushToken: expoToken };
  } catch (error) {
    console.log('Push registration skipped:', error);
    try {
      await AsyncStorage.removeItem(REMOTE_PUSH_ACTIVE_KEY);
    } catch {
      // ignore
    }
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
  if (type === 'support_message') return true;
  const data = 'data' in item && item.data && typeof item.data === 'object' ? item.data : null;
  if (!data) return false;
  const screen = typeof data.screen === 'string' ? data.screen : null;
  const dataType = typeof data.type === 'string' ? data.type : null;
  return (
    dataType === 'support_message'
    || screen === 'chat'
    || screen === 'support'
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
    identifier: `inbox-${item.id}`,
    content: {
      title: item.title,
      body: item.body,
      data: {
        type: item.type,
        notificationId: item.id,
        screen: item.type === 'support_message' ? 'support' : undefined,
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
 * Nunca depende só do push remoto: em Sideloadly / builds sem APNs o push falha
 * e o utilizador ficava sem banner. Em foreground mostramos sempre o que ainda
 * não foi anunciado; identifier estável evita duplicar o mesmo id.
 */
export async function announceNewInboxNotifications(
  items: AppNotification[],
  options?: { bootstrap?: boolean; appInForeground?: boolean },
) {
  const userId = await getActiveAccountId();
  if (!userId) return 0;

  const unread = items.filter((item) => !item.read_at);
  const seen = await loadSeenNotificationIds();

  // Seed inicial: utilizador novo / sem histórico local — não spammar o histórico.
  if (options?.bootstrap && seen.size === 0) {
    for (const item of unread) seen.add(item.id);
    await saveSeenNotificationIds(seen);
    await markTicketConfirmedAnnounced(unread);
    return 0;
  }

  const toShow: AppNotification[] = [];
  const supportOnly: AppNotification[] = [];
  for (const item of unread) {
    if (seen.has(item.id)) continue;
    if (isSupportNotification(item)) {
      supportOnly.push(item);
      continue;
    }
    toShow.push(item);
  }

  if (supportOnly.length) {
    for (const item of supportOnly) seen.add(item.id);
    await saveSeenNotificationIds(seen);
  }

  if (!toShow.length) return 0;

  // Em background: não marcar como vista — o push remoto (se existir) mostra;
  // se falhar, o banner local aparece ao voltar ao app.
  if (!options?.appInForeground) return 0;

  for (const item of toShow) seen.add(item.id);
  await saveSeenNotificationIds(seen);
  await markTicketConfirmedAnnounced(toShow);

  let shown = 0;
  for (const item of toShow) {
    await presentLocalNotification(item);
    shown += 1;
  }
  return shown;
}

/** Marca ids já mostrados pelo SO (push remoto recebido) para não repetir local. */
export async function markNotificationsAnnounced(ids: string[]) {
  if (!ids.length) return;
  const seen = await loadSeenNotificationIds();
  let changed = false;
  for (const id of ids) {
    const key = String(id || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    changed = true;
  }
  if (changed) await saveSeenNotificationIds(seen);
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
  | { pathname: '/(tabs)'; params?: undefined }
  | null;

export function resolveNotificationRoute(data: Record<string, unknown> | undefined | null): NotificationRouteTarget {
  if (!data || typeof data !== 'object') return null;

  const productId = typeof data.productId === 'string' ? data.productId : null;
  const orderId = typeof data.orderId === 'string' ? data.orderId : null;
  const storeId = typeof data.storeId === 'string' ? data.storeId : null;
  const screen = typeof data.screen === 'string' ? data.screen : null;
  const type = typeof data.type === 'string' ? data.type : null;

  if (
    isChatNotification({ type, data })
    || type === 'support_message'
    || screen === 'chat'
    || screen === 'support'
  ) {
    return { pathname: '/chat' };
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
