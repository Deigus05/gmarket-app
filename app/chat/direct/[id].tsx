import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Socket } from 'socket.io-client';

import { useAuth } from '@/components/AuthContext';
import {
  API_URL,
  getDirectConversation,
  getDirectMessages,
  markDirectConversationRead,
  sendDirectMessage,
  type DirectConversation,
  type SupportMessage,
} from '@/components/api';
import { ChatTopBar } from '@/components/chat/ChatTopBar';
import { useLocale } from '@/components/LocaleContext';
import { useAppTheme, type AppUI } from '@/components/tema';
import { connectChatSocket, type ChatConnectionState } from '@/lib/chatSocket';
import { compressImagesForUpload } from '@/lib/imageOptimization';

const PAGE_SIZE = 30;

function messageKey(message: SupportMessage) {
  return message.client_message_id || message.id;
}

function mergeMessages(current: SupportMessage[], incoming: SupportMessage[]) {
  const map = new Map<string, SupportMessage>();
  for (const message of current) map.set(messageKey(message), message);
  for (const message of incoming) {
    const key = messageKey(message);
    const previous = map.get(key);
    map.set(key, previous ? { ...previous, ...message } : message);
  }
  return [...map.values()].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

function imageUrls(message: SupportMessage) {
  const values = message.attachment_urls?.length
    ? message.attachment_urls
    : message.images || [];
  return values
    .map((image) => (typeof image === 'string' ? image : image.url))
    .filter(Boolean)
    .map((url) => {
      if (/^(https?:|file:|content:|data:)/i.test(url)) return url;
      return `${API_URL}/${url.replace(/^\/+/, '')}`;
    });
}

function makeClientId() {
  return `direct-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function peerName(conversation: DirectConversation | null) {
  if (!conversation?.peer) return '';
  return `${conversation.peer.nome || ''} ${conversation.peer.apelido || ''}`.trim()
    || conversation.peer.telefone
    || 'GMarket';
}

export default function DirectChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const conversationId = typeof params.id === 'string' ? params.id : '';
  const { token, isLoggedIn, user, loading: authLoading } = useAuth();
  const { t, dateLocale } = useLocale();
  const { ui, colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(ui), [ui]);

  const [conversation, setConversation] = useState<DirectConversation | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [before, setBefore] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [error, setError] = useState('');
  const [connection, setConnection] = useState<ChatConnectionState>('disconnected');
  const [peerTyping, setPeerTyping] = useState(false);

  const conversationIdRef = useRef(conversationId);
  const tokenRef = useRef(token);
  const socketRef = useRef<Socket | null>(null);
  const typingSentRef = useRef(false);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  tokenRef.current = token;
  conversationIdRef.current = conversationId;

  const stopTyping = useCallback(() => {
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = null;
    if (typingSentRef.current && socketRef.current && conversationIdRef.current) {
      socketRef.current.emit('direct:typing', {
        conversation_id: conversationIdRef.current,
        is_typing: false,
      });
    }
    typingSentRef.current = false;
  }, []);

  const handleBodyChange = useCallback((nextBody: string) => {
    setBody(nextBody);
    const isTyping = nextBody.trim().length > 0;
    if (isTyping && !typingSentRef.current && socketRef.current && conversationIdRef.current) {
      socketRef.current.emit('direct:typing', {
        conversation_id: conversationIdRef.current,
        is_typing: true,
      });
      typingSentRef.current = true;
    }
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    if (isTyping) {
      typingStopTimerRef.current = setTimeout(stopTyping, 1400);
    } else {
      stopTyping();
    }
  }, [stopTyping]);

  const markRead = useCallback(async (id: string) => {
    const authToken = tokenRef.current;
    if (!authToken) return;
    const result = await markDirectConversationRead(authToken, id);
    if (result.success) setConversation(result.data);
  }, []);

  const loadLatest = useCallback(async (silent = false) => {
    if (!token || !conversationId) {
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    setError('');
    const conversationResult = await getDirectConversation(token, conversationId);
    if (!conversationResult.success) {
      setError(conversationResult.message);
      setLoading(false);
      return;
    }
    setConversation(conversationResult.data);
    const page = await getDirectMessages(token, conversationId, { limit: PAGE_SIZE });
    if (!page.success) {
      setError(page.message);
      setLoading(false);
      return;
    }
    setMessages(mergeMessages([], page.data.messages));
    setHasMore(page.data.has_more);
    setBefore(page.data.next_before);
    setLoading(false);
    void markRead(conversationId);
  }, [conversationId, markRead, token]);

  const loadOlder = useCallback(async () => {
    if (!token || !conversationId || !hasMore || !before || loadingOlder) return;
    setLoadingOlder(true);
    const page = await getDirectMessages(token, conversationId, {
      before,
      limit: PAGE_SIZE,
    });
    if (page.success) {
      setMessages((current) => mergeMessages(current, page.data.messages));
      setHasMore(page.data.has_more);
      setBefore(page.data.next_before);
    }
    setLoadingOlder(false);
  }, [before, conversationId, hasMore, loadingOlder, token]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopTyping();
    };
  }, [stopTyping]);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  useEffect(() => {
    if (!token || !isLoggedIn || !conversationId) return;
    const session = connectChatSocket({
      token,
      conversationId,
      channel: 'direct',
      onConnectionChange: setConnection,
      onMessage: (message) => {
        if (message.conversation_id !== conversationIdRef.current) return;
        setMessages((current) => mergeMessages(current, [message]));
        if (message.sender_id && message.sender_id !== user?.id) {
          void markRead(conversationIdRef.current);
        }
      },
      onConversation: (next) => {
        if (!('peer' in next) || next.id !== conversationIdRef.current) return;
        setConversation(next);
      },
      onTyping: (event) => {
        if (event.conversation_id !== conversationIdRef.current) return;
        if (event.sender_id && event.sender_id === user?.id) return;
        setPeerTyping(event.is_typing);
        if (peerTypingTimerRef.current) clearTimeout(peerTypingTimerRef.current);
        if (event.is_typing) {
          peerTypingTimerRef.current = setTimeout(() => setPeerTyping(false), 2500);
        }
      },
    });
    socketRef.current = session.socket;
    return () => {
      stopTyping();
      socketRef.current = null;
      session.teardown();
    };
  }, [conversationId, isLoggedIn, markRead, stopTyping, token, user?.id]);

  const pickPhotos = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('chat.photoPermissionTitle'), t('chat.photoPermissionMessage'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 1,
      selectionLimit: Math.max(1, 3 - photos.length),
    });
    if (result.canceled || !result.assets?.length) return;
    setOptimizing(true);
    try {
      const compressed = await compressImagesForUpload(
        result.assets.map((asset) => asset.uri),
      );
      setPhotos((current) => [...current, ...compressed].slice(0, 3));
    } finally {
      setOptimizing(false);
    }
  }, [photos.length, t]);

  const send = useCallback(async () => {
    if (!token || !conversationId || sending) return;
    const text = body.trim();
    if (!text && !photos.length) return;
    setSending(true);
    stopTyping();
    const clientId = makeClientId();
    const optimistic: SupportMessage = {
      id: clientId,
      conversation_id: conversationId,
      client_message_id: clientId,
      body: text || null,
      attachment_urls: photos,
      images: photos,
      sender_id: user?.id || null,
      sender_type: 'customer',
      created_at: new Date().toISOString(),
    };
    setMessages((current) => mergeMessages(current, [optimistic]));
    setBody('');
    const pendingPhotos = photos;
    setPhotos([]);
    const result = await sendDirectMessage(token, conversationId, {
      body: text,
      client_message_id: clientId,
      image_uris: pendingPhotos,
    });
    if (!result.success) {
      setError(result.message);
      setMessages((current) => current.filter((item) => messageKey(item) !== clientId));
      setBody(text);
      setPhotos(pendingPhotos);
    } else {
      setMessages((current) => mergeMessages(current, [result.data]));
    }
    setSending(false);
  }, [body, conversationId, photos, sending, stopTyping, token, user?.id]);

  const reversedMessages = useMemo(() => [...messages].reverse(), [messages]);

  const renderMessage = useCallback(({ item }: ListRenderItemInfo<SupportMessage>) => {
    const mine = item.sender_id === user?.id;
    const images = imageUrls(item);
    const when = new Date(item.created_at);
    return (
      <View style={[styles.bubbleWrap, mine ? styles.bubbleMineWrap : styles.bubblePeerWrap]}>
        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubblePeer]}>
          {images.map((url) => (
            <Image key={url} source={{ uri: url }} style={styles.bubbleImage} contentFit="cover" />
          ))}
          {item.body?.trim() ? (
            <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.body}</Text>
          ) : null}
          <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>
            {Number.isNaN(when.getTime())
              ? ''
              : when.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  }, [dateLocale, styles, user?.id]);

  if (authLoading || loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={ui.brand} />
        <Text style={styles.loadingText}>{t('chat.loading')}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <ImageBackground
          source={require('../../../assets/images/chat-background.png')}
          resizeMode="cover"
          style={styles.backgroundImage}
          imageStyle={{ opacity: isDark ? 0.2 : 0.34 }}
        />
        <View
          style={[
            styles.backgroundTint,
            {
              backgroundColor: isDark ? ui.bg : colors.mist,
              opacity: isDark ? 0.76 : 0.38,
            },
          ]}
        />
      </View>
      <View style={{ height: insets.top }} />
      <ChatTopBar
        title={peerName(conversation) || conversation?.peer.telefone || 'GMarket'}
        status={
          peerTyping
            ? '…'
            : t(`chat.connection.${connection}`)
        }
        online={connection === 'connected'}
        connecting={connection === 'connecting'}
        avatarUri={conversation?.peer.foto_url}
        avatarFallback={conversation?.peer.nome || conversation?.peer.telefone || '?'}
        onBack={() => router.back()}
        ui={ui}
      />

      {error ? (
        <Pressable style={styles.errorBar} onPress={() => void loadLatest()}>
          <Text style={styles.errorText} numberOfLines={2}>{error}</Text>
          <Text style={styles.retryText}>{t('common.retry')}</Text>
        </Pressable>
      ) : null}

      <FlatList
        data={reversedMessages}
        renderItem={renderMessage}
        keyExtractor={(item) => messageKey(item)}
        inverted
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.messageList,
          reversedMessages.length === 0 && styles.emptyList,
        ]}
        onEndReached={() => void loadOlder()}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          loadingOlder ? <ActivityIndicator style={{ marginVertical: 12 }} color={ui.brand} /> : null
        }
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{t('chat.noMessagesYet')}</Text>
          </View>
        }
      />

      {photos.length ? (
        <View style={styles.photoRow}>
          {photos.map((uri) => (
            <View key={uri} style={styles.photoChip}>
              <Image source={{ uri }} style={styles.photoThumb} contentFit="cover" />
              <Pressable
                style={styles.photoRemove}
                onPress={() => setPhotos((current) => current.filter((item) => item !== uri))}
              >
                <Ionicons name="close" size={12} color="#FFFFFF" />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Pressable style={styles.attachBtn} onPress={() => void pickPhotos()} disabled={optimizing}>
          {optimizing ? (
            <ActivityIndicator color={ui.brand} />
          ) : (
            <Ionicons name="image-outline" size={22} color={ui.brand} />
          )}
        </Pressable>
        <TextInput
          style={styles.input}
          value={body}
          onChangeText={handleBodyChange}
          placeholder={t('chat.placeholder')}
          placeholderTextColor={ui.muted}
          multiline
        />
        <Pressable
          style={[styles.sendBtn, (!body.trim() && !photos.length) && styles.sendBtnDisabled]}
          onPress={() => void send()}
          disabled={sending || (!body.trim() && !photos.length)}
        >
          {sending ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Ionicons name="send" size={18} color="#FFFFFF" />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(ui: AppUI) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: ui.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
    backgroundImage: { ...StyleSheet.absoluteFillObject },
    backgroundTint: { ...StyleSheet.absoluteFillObject },
    messageList: { paddingHorizontal: 12, paddingVertical: 10 },
    emptyList: { flexGrow: 1, justifyContent: 'center' },
    emptyCard: { alignItems: 'center', padding: 24 },
    emptyTitle: { color: ui.muted, fontWeight: '700' },
    bubbleWrap: { marginVertical: 4, maxWidth: '82%' },
    bubbleMineWrap: { alignSelf: 'flex-end' },
    bubblePeerWrap: { alignSelf: 'flex-start' },
    bubble: {
      borderRadius: 18,
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 6,
    },
    bubbleMine: { backgroundColor: ui.brand, borderBottomRightRadius: 6 },
    bubblePeer: { backgroundColor: ui.card, borderBottomLeftRadius: 6 },
    bubbleText: { color: ui.text, fontSize: 15, lineHeight: 20 },
    bubbleTextMine: { color: '#FFFFFF' },
    bubbleTime: { fontSize: 10, color: ui.muted, alignSelf: 'flex-end' },
    bubbleTimeMine: { color: 'rgba(255,255,255,0.78)' },
    bubbleImage: { width: 210, height: 210, borderRadius: 12 },
    photoRow: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 12,
      paddingBottom: 8,
    },
    photoChip: { width: 58, height: 58 },
    photoThumb: { width: 58, height: 58, borderRadius: 12 },
    photoRemove: {
      position: 'absolute',
      top: -4,
      right: -4,
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#111827',
    },
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      paddingHorizontal: 12,
      paddingTop: 8,
      backgroundColor: ui.card,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: ui.border,
    },
    attachBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.bg,
    },
    input: {
      flex: 1,
      minHeight: 42,
      maxHeight: 120,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: ui.bg,
      color: ui.text,
      fontSize: 15,
    },
    sendBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.brand,
    },
    sendBtnDisabled: { opacity: 0.45 },
    errorBar: {
      marginHorizontal: 12,
      marginTop: 8,
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
