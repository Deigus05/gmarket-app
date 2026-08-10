import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/components/AuthContext';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import {
  AppNotification,
  getMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/components/api';
import { useLocale } from '@/components/LocaleContext';
import { isSupportNotification, resolveNotificationRoute } from '@/components/notifications';
import { useAppTheme, type AppUI } from '@/components/tema';

type FilterKey = 'all' | 'delivery' | 'stores' | 'promos' | 'tickets';

const FILTER_KEYS: FilterKey[] = ['all', 'delivery', 'stores', 'promos', 'tickets'];

function typeMeta(
  type: AppNotification['type'],
  accent: string,
  brand: string,
  muted: string,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  switch (type) {
    case 'delivery_status':
      return { icon: 'bicycle-outline' as const, color: accent, label: t('notifications.typeDelivery') };
    case 'new_product':
      return { icon: 'cube-outline' as const, color: brand, label: t('notifications.typeNewProduct') };
    case 'store_promo':
      return { icon: 'pricetag-outline' as const, color: '#EA580C', label: t('notifications.typeStorePromo') };
    case 'gmarket_promo':
      return { icon: 'sparkles-outline' as const, color: '#7C3AED', label: t('notifications.typeGmarket') };
    case 'ticket_confirmed':
      return { icon: 'ticket-outline' as const, color: '#F5C518', label: t('notifications.typeTicket') };
    default:
      return { icon: 'notifications-outline' as const, color: muted, label: t('notifications.typeAlert') };
  }
}

function formatWhen(
  iso: string,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = Date.now();
  const diff = Math.max(0, now - date.getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('notifications.now');
  if (mins < 60) return t('notifications.minutes', { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('notifications.hours', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t('notifications.days', { n: days });
  return date.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
}

function matchesFilter(item: AppNotification, filter: FilterKey) {
  // Ignora notificações de suporte — aparecem apenas no ícone/página de chat.
  if (isSupportNotification(item)) return false;
  if (filter === 'all') return true;
  if (filter === 'delivery') return item.type === 'delivery_status';
  if (filter === 'stores') return item.type === 'new_product' || item.type === 'store_promo';
  if (filter === 'tickets') return item.type === 'ticket_confirmed';
  return item.type === 'gmarket_promo' || item.type === 'store_promo';
}

function filterLabel(
  key: FilterKey,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  switch (key) {
    case 'all':
      return t('notifications.filterAll');
    case 'delivery':
      return t('notifications.filterDeliveries');
    case 'stores':
      return t('notifications.filterStores');
    case 'promos':
      return t('notifications.filterPromos');
    case 'tickets':
      return t('notifications.filterTickets');
  }
}

export default function NotificacoesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const { ui, colors } = useAppTheme();
  const styles = useMemo(() => createStyles(ui), [ui]);
  const { token, isLoggedIn, loading: authLoading } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!token) {
      setItems([]);
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    const result = await getMyNotifications(token);
    if (result.success) {
      setItems(result.data.filter((item) => !isSupportNotification(item)));
    }
    setLoading(false);
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const filtered = useMemo(
    () => items.filter((item) => matchesFilter(item, filter)),
    [items, filter],
  );

  const unreadCount = useMemo(
    () => items.filter((item) => !item.read_at).length,
    [items],
  );

  const openNotification = async (item: AppNotification) => {
    if (token && !item.read_at) {
      setItems((prev) =>
        prev.map((row) =>
          row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row,
        ),
      );
      void markNotificationRead(token, item.id);
    }

    const target = resolveNotificationRoute({ ...item.data, type: item.type });
    if (!target) return;
    if (target.pathname === '/(tabs)') {
      router.push('/(tabs)');
      return;
    }
    router.push(target as never);
  };

  const handleMarkAll = async () => {
    if (!token || unreadCount === 0) return;
    setMarkingAll(true);
    await markAllNotificationsRead(token);
    setItems((prev) =>
      prev.map((row) => ({ ...row, read_at: row.read_at || new Date().toISOString() })),
    );
    setMarkingAll(false);
  };

  if (authLoading) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Stack.Screen options={{ headerShown: false }} />
        <RippleWaveLoader color={ui.brand} />
      </View>
    );
  }

  if (!isLoggedIn || !token) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.85}>
            <Ionicons name="arrow-back" size={20} color={ui.text} />
          </TouchableOpacity>
          <Text style={styles.title}>{t('notifications.title')}</Text>
          <View style={styles.iconBtnPlaceholder} />
        </View>
        <View style={styles.guestBox}>
          <View style={styles.guestIcon}>
            <Ionicons name="notifications-outline" size={32} color={ui.brand} />
          </View>
          <Text style={styles.guestTitle}>{t('notifications.guestTitle')}</Text>
          <Text style={styles.guestText}>
            {t('notifications.guestSubtitle')}
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.push('/login')}
            activeOpacity={0.9}
          >
            <Text style={styles.primaryBtnText}>{t('common.login')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.85}>
          <Ionicons name="arrow-back" size={20} color={ui.text} />
        </TouchableOpacity>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>{t('notifications.title')}</Text>
          {unreadCount > 0 ? (
            <Text style={styles.subtitle}>{t('notifications.unread', { n: unreadCount })}</Text>
          ) : (
            <Text style={styles.subtitle}>{t('notifications.upToDate')}</Text>
          )}
        </View>
        <TouchableOpacity
          style={[styles.markAllBtn, unreadCount === 0 && styles.markAllDisabled]}
          onPress={handleMarkAll}
          disabled={unreadCount === 0 || markingAll}
          activeOpacity={0.85}
        >
          <Text style={styles.markAllText}>{markingAll ? '…' : t('notifications.readAll')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filters}>
        {FILTER_KEYS.map((key) => {
          const active = filter === key;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setFilter(key)}
              activeOpacity={0.85}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {filterLabel(key, t)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <RippleWaveLoader color={ui.brand} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.list,
            filtered.length === 0 && styles.listEmpty,
            { paddingBottom: insets.bottom + 24 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load(true);
                setRefreshing(false);
              }}
              tintColor={ui.brand}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="notifications-off-outline" size={36} color={ui.muted} />
              <Text style={styles.emptyTitle}>{t('notifications.emptyTitle')}</Text>
              <Text style={styles.emptyText}>
                {t('notifications.emptySubtitle')}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const meta = typeMeta(item.type, colors.accent, ui.brand, ui.muted, t);
            const unread = !item.read_at;
            return (
              <TouchableOpacity
                style={[styles.card, unread && styles.cardUnread]}
                onPress={() => openNotification(item)}
                activeOpacity={0.88}
              >
                <View style={[styles.typeIcon, { backgroundColor: `${meta.color}18` }]}>
                  {item.image_url ? (
                    <Image source={{ uri: item.image_url }} style={styles.thumb} contentFit="cover" />
                  ) : (
                    <Ionicons name={meta.icon} size={20} color={meta.color} />
                  )}
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.cardTop}>
                    <Text style={styles.typeLabel}>{meta.label}</Text>
                    <Text style={styles.when}>{formatWhen(item.created_at, t)}</Text>
                  </View>
                  <Text style={[styles.cardTitle, unread && styles.cardTitleUnread]} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={styles.cardBodyText} numberOfLines={2}>
                    {item.body}
                  </Text>
                </View>
                {unread ? <View style={styles.dot} /> : null}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

function createStyles(ui: AppUI) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: ui.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 10,
    },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: ui.card,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: ui.border,
    },
    iconBtnPlaceholder: { width: 40, height: 40 },
    titleWrap: { flex: 1 },
    title: { fontSize: 20, fontWeight: '800', color: ui.text, letterSpacing: -0.3 },
    subtitle: { fontSize: 12, color: ui.muted, marginTop: 2, fontWeight: '600' },
    markAllBtn: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: ui.brandSoft,
    },
    markAllDisabled: { opacity: 0.45 },
    markAllText: { color: ui.brand, fontWeight: '700', fontSize: 12 },
    filters: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 16,
      marginBottom: 8,
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: ui.card,
      borderWidth: 1,
      borderColor: ui.border,
    },
    chipActive: { backgroundColor: ui.brand, borderColor: ui.brand },
    chipText: { fontSize: 12, fontWeight: '700', color: ui.muted },
    chipTextActive: { color: '#FFF' },
    list: { paddingHorizontal: 16, paddingTop: 8, gap: 10 },
    listEmpty: { flexGrow: 1, justifyContent: 'center' },
    card: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      backgroundColor: ui.card,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: ui.border,
    },
    cardUnread: {
      backgroundColor: ui.brandSoft,
      borderColor: ui.brand,
    },
    typeIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    thumb: { width: 44, height: 44 },
    cardBody: { flex: 1 },
    cardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    typeLabel: {
      fontSize: 11,
      fontWeight: '800',
      color: ui.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    when: { fontSize: 11, color: ui.muted, fontWeight: '600' },
    cardTitle: { fontSize: 15, fontWeight: '700', color: ui.text, marginBottom: 2 },
    cardTitleUnread: { fontWeight: '800' },
    cardBodyText: { fontSize: 13, color: ui.muted, lineHeight: 18 },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: ui.brand,
      marginTop: 6,
    },
    emptyBox: { alignItems: 'center', paddingHorizontal: 32 },
    emptyTitle: { marginTop: 12, fontSize: 17, fontWeight: '800', color: ui.text },
    emptyText: {
      marginTop: 6,
      fontSize: 13,
      color: ui.muted,
      textAlign: 'center',
      lineHeight: 19,
    },
    guestBox: {
      margin: 24,
      backgroundColor: ui.card,
      borderRadius: 20,
      padding: 28,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: ui.border,
    },
    guestIcon: {
      width: 64,
      height: 64,
      borderRadius: 20,
      backgroundColor: ui.brandSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    guestTitle: { fontSize: 18, fontWeight: '800', color: ui.text },
    guestText: {
      marginTop: 8,
      fontSize: 13,
      color: ui.muted,
      textAlign: 'center',
      lineHeight: 19,
      marginBottom: 18,
    },
    primaryBtn: {
      backgroundColor: ui.brand,
      paddingHorizontal: 28,
      paddingVertical: 12,
      borderRadius: 12,
    },
    primaryBtnText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  });
}
