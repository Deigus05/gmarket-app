import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useFocusEffect, useRouter, type Href } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/components/AuthContext';
import {
  getDirectConversations,
  getSupportConversation,
  matchPhoneContacts,
  openDirectConversation,
  type ChatPeer,
  type DirectConversation,
  type SupportConversation,
  type SupportMessage,
} from '@/components/api';
import { useLocale } from '@/components/LocaleContext';
import { useAppTheme, type AppUI } from '@/components/tema';
import { connectChatSocket } from '@/lib/chatSocket';
import { loadDeviceContactPhones } from '@/lib/deviceContacts';

type TabKey = 'conversations' | 'contacts';

function peerName(peer: ChatPeer) {
  return `${peer.nome || ''} ${peer.apelido || ''}`.trim() || peer.telefone || 'GMarket';
}

function previewText(message?: SupportMessage | null, fallback = '') {
  if (!message) return fallback;
  if (message.body?.trim()) return message.body.trim();
  if ((message.attachment_urls || message.images || []).length) return '📷';
  return fallback;
}

function formatWhen(
  iso?: string | null,
  locale = 'pt-PT',
) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = Date.now();
  const diff = Math.max(0, now - date.getTime());
  if (diff < 60_000) return 'agora';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) {
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString(locale, { day: '2-digit', month: 'short' });
}

export default function ChatInboxScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, isLoggedIn, loading: authLoading } = useAuth();
  const { t, dateLocale } = useLocale();
  const { ui } = useAppTheme();
  const styles = useMemo(() => createStyles(ui), [ui]);

  const [tab, setTab] = useState<TabKey>('conversations');
  const [support, setSupport] = useState<SupportConversation | null>(null);
  const [conversations, setConversations] = useState<DirectConversation[]>([]);
  const [contacts, setContacts] = useState<ChatPeer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [contactsGranted, setContactsGranted] = useState<boolean | null>(null);
  const [openingPeerId, setOpeningPeerId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loadConversations = useCallback(async () => {
    if (!token) return;
    const [supportResult, directResult] = await Promise.all([
      getSupportConversation(token),
      getDirectConversations(token),
    ]);
    if (supportResult.success) setSupport(supportResult.data);
    if (directResult.success) setConversations(directResult.data.conversations || []);
    if (!supportResult.success && !directResult.success) {
      setError(supportResult.message || directResult.message);
    } else {
      setError('');
    }
  }, [token]);

  const loadContacts = useCallback(async () => {
    if (!token) return;
    if (Platform.OS === 'web') {
      setContactsGranted(false);
      setContacts([]);
      return;
    }
    const device = await loadDeviceContactPhones();
    setContactsGranted(device.granted);
    if (!device.granted) {
      setContacts([]);
      return;
    }
    const matched = await matchPhoneContacts(
      token,
      device.contacts.map((item) => item.phone),
    );
    if (matched.success) {
      setContacts(matched.data.contacts || []);
      setError('');
    } else {
      setError(matched.message);
    }
  }, [token]);

  const refresh = useCallback(async (silent = false) => {
    if (!token) {
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      await loadConversations();
      if (tab === 'contacts') await loadContacts();
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  }, [loadContacts, loadConversations, tab, token]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      if (!token || !isLoggedIn) return;
      const supportSession = connectChatSocket({
        token,
        channel: 'support',
        onConversation: (conversation) => {
          if ('peer' in conversation) return;
          setSupport(conversation as SupportConversation);
        },
      });
      const directSession = connectChatSocket({
        token,
        channel: 'direct',
        onConversation: (conversation) => {
          if (!('peer' in conversation)) return;
          setConversations((current) => {
            const next = current.filter((item) => item.id !== conversation.id);
            return [conversation as DirectConversation, ...next];
          });
        },
      });
      return () => {
        supportSession.teardown();
        directSession.teardown();
      };
    }, [isLoggedIn, refresh, token]),
  );

  const openPeer = useCallback(async (peerId: string) => {
    if (!token || openingPeerId) return;
    setOpeningPeerId(peerId);
    try {
      const result = await openDirectConversation(token, peerId);
      if (!result.success) {
        setError(result.message);
        return;
      }
      setConversations((current) => {
        const next = current.filter((item) => item.id !== result.data.id);
        return [result.data, ...next];
      });
      router.push(`/chat/direct/${result.data.id}` as Href);
    } finally {
      setOpeningPeerId(null);
    }
  }, [openingPeerId, router, token]);

  if (authLoading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={ui.brand} />
      </View>
    );
  }

  if (!isLoggedIn || !token) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.header}>
          <Pressable style={styles.iconBtn} onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="arrow-back" size={20} color={ui.text} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('chat.inboxTitle')}</Text>
          <View style={styles.iconBtnSpacer} />
        </View>
        <View style={styles.guest}>
          <View style={styles.guestIcon}>
            <Ionicons name="chatbubbles-outline" size={38} color={ui.brand} />
          </View>
          <Text style={styles.guestTitle}>{t('chat.guestTitle')}</Text>
          <Text style={styles.guestText}>{t('chat.guestSubtitle')}</Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => router.push({ pathname: '/login', params: { redirect: 'chat' } })}
          >
            <Text style={styles.primaryBtnText}>{t('common.login')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={20} color={ui.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('chat.inboxTitle')}</Text>
        <View style={styles.iconBtnSpacer} />
      </View>

      <View style={styles.tabs}>
        {([
          { key: 'conversations' as const, label: t('chat.tabConversations') },
          { key: 'contacts' as const, label: t('chat.tabContacts') },
        ]).map((item) => {
          const active = tab === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => {
                setTab(item.key);
                if (item.key === 'contacts') void loadContacts();
              }}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {error ? (
        <Pressable style={styles.errorBar} onPress={() => void refresh()}>
          <Text style={styles.errorText} numberOfLines={2}>{error}</Text>
          <Text style={styles.retryText}>{t('common.retry')}</Text>
        </Pressable>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={ui.brand} />
          <Text style={styles.loadingText}>{t('chat.loadingInbox')}</Text>
        </View>
      ) : tab === 'conversations' ? (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void refresh(true);
              }}
              tintColor={ui.brand}
            />
          }
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 24 },
            !conversations.length && styles.emptyList,
          ]}
          ListHeaderComponent={
            <Pressable
              style={styles.row}
              onPress={() => router.push('/chat/support' as Href)}
            >
              <View style={[styles.avatar, styles.supportAvatar]}>
                <Ionicons name="headset" size={24} color="#FFFFFF" />
              </View>
              <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{t('chat.supportTeam')}</Text>
                  <Text style={styles.rowTime}>
                    {formatWhen(support?.last_message_at || support?.last_message?.created_at, dateLocale)}
                  </Text>
                </View>
                <View style={styles.rowBottom}>
                  <Text style={styles.rowPreview} numberOfLines={1}>
                    {previewText(support?.last_message, t('chat.supportSubtitle'))}
                  </Text>
                  {(support?.unread_count || 0) > 0 ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>
                        {(support?.unread_count || 0) > 99 ? '99+' : support?.unread_count}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Pressable>
          }
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Ionicons name="chatbubble-ellipses-outline" size={34} color={ui.brand} />
              <Text style={styles.emptyTitle}>{t('chat.emptyConversationsTitle')}</Text>
              <Text style={styles.emptyText}>{t('chat.emptyConversationsSubtitle')}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => router.push(`/chat/direct/${item.id}` as Href)}
            >
              <View style={styles.avatar}>
                {item.peer.foto_url ? (
                  <Image source={{ uri: item.peer.foto_url }} style={styles.avatarImage} contentFit="cover" />
                ) : (
                  <Text style={styles.avatarInitials}>
                    {(item.peer.nome || item.peer.telefone || '?').slice(0, 1).toUpperCase()}
                  </Text>
                )}
              </View>
              <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{peerName(item.peer)}</Text>
                  <Text style={styles.rowTime}>
                    {formatWhen(item.last_message_at || item.last_message?.created_at, dateLocale)}
                  </Text>
                </View>
                <View style={styles.rowBottom}>
                  <Text style={styles.rowPreview} numberOfLines={1}>
                    {previewText(item.last_message, t('chat.noMessagesYet'))}
                  </Text>
                  {(item.unread_count || 0) > 0 ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>
                        {(item.unread_count || 0) > 99 ? '99+' : item.unread_count}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void loadContacts().finally(() => setRefreshing(false));
              }}
              tintColor={ui.brand}
            />
          }
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 24 },
            !contacts.length && styles.emptyList,
          ]}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Ionicons name="people-outline" size={34} color={ui.brand} />
              <Text style={styles.emptyTitle}>
                {contactsGranted === false
                  ? t('chat.contactsPermissionTitle')
                  : t('chat.emptyContactsTitle')}
              </Text>
              <Text style={styles.emptyText}>
                {Platform.OS === 'web'
                  ? t('chat.contactsUnavailable')
                  : contactsGranted === false
                    ? t('chat.contactsPermissionMessage')
                    : t('chat.emptyContactsSubtitle')}
              </Text>
              {Platform.OS !== 'web' && contactsGranted === false ? (
                <Pressable style={styles.primaryBtn} onPress={() => void loadContacts()}>
                  <Text style={styles.primaryBtnText}>{t('chat.contactsPermissionCta')}</Text>
                </Pressable>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              disabled={openingPeerId === item.id}
              onPress={() => void openPeer(item.id)}
            >
              <View style={styles.avatar}>
                {item.foto_url ? (
                  <Image source={{ uri: item.foto_url }} style={styles.avatarImage} contentFit="cover" />
                ) : (
                  <Text style={styles.avatarInitials}>
                    {(item.nome || item.telefone || '?').slice(0, 1).toUpperCase()}
                  </Text>
                )}
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>{peerName(item)}</Text>
                <Text style={styles.rowPreview} numberOfLines={1}>
                  {item.matched_phone || item.telefone}
                </Text>
              </View>
              {openingPeerId === item.id ? (
                <ActivityIndicator color={ui.brand} />
              ) : (
                <Ionicons name="chevron-forward" size={18} color={ui.muted} />
              )}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function createStyles(ui: AppUI) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: ui.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 10,
    },
    iconBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.card,
    },
    iconBtnSpacer: { width: 38 },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: 18,
      fontWeight: '800',
      color: ui.text,
    },
    tabs: {
      flexDirection: 'row',
      marginHorizontal: 16,
      marginBottom: 8,
      padding: 4,
      borderRadius: 14,
      backgroundColor: ui.card,
      gap: 4,
    },
    tab: {
      flex: 1,
      minHeight: 40,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabActive: { backgroundColor: ui.brand },
    tabText: { fontSize: 14, fontWeight: '700', color: ui.muted },
    tabTextActive: { color: '#FFFFFF' },
    listContent: { paddingHorizontal: 12, paddingTop: 4 },
    emptyList: { flexGrow: 1, justifyContent: 'center' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 10,
      paddingVertical: 12,
      borderRadius: 16,
      backgroundColor: ui.card,
      marginBottom: 8,
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.bg,
    },
    supportAvatar: { backgroundColor: ui.brand },
    avatarImage: { width: '100%', height: '100%' },
    avatarInitials: { fontSize: 20, fontWeight: '800', color: ui.brand },
    rowBody: { flex: 1, minWidth: 0, gap: 3 },
    rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rowBottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rowTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: ui.text },
    rowTime: { fontSize: 11, fontWeight: '600', color: ui.muted },
    rowPreview: { flex: 1, fontSize: 13, color: ui.muted },
    badge: {
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      paddingHorizontal: 5,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#DC2626',
    },
    badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
    emptyCard: {
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 24,
      paddingVertical: 36,
    },
    emptyTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: ui.text,
      textAlign: 'center',
    },
    emptyText: {
      fontSize: 14,
      lineHeight: 20,
      color: ui.muted,
      textAlign: 'center',
    },
    guest: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
      gap: 10,
    },
    guestIcon: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.card,
      marginBottom: 6,
    },
    guestTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: ui.text,
      textAlign: 'center',
    },
    guestText: {
      fontSize: 14,
      lineHeight: 21,
      color: ui.muted,
      textAlign: 'center',
      marginBottom: 8,
    },
    primaryBtn: {
      marginTop: 8,
      backgroundColor: ui.brand,
      borderRadius: 14,
      paddingHorizontal: 22,
      paddingVertical: 13,
    },
    primaryBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
    errorBar: {
      marginHorizontal: 16,
      marginBottom: 8,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: 'rgba(220,38,38,0.1)',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    errorText: { flex: 1, color: '#B91C1C', fontSize: 13, fontWeight: '600' },
    retryText: { color: ui.brand, fontWeight: '800', fontSize: 13 },
    loadingText: { color: ui.muted, fontSize: 13, fontWeight: '600' },
  });
}
