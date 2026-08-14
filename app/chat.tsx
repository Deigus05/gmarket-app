import { Ionicons } from '@expo/vector-icons';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
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
  Animated,
  AppState,
  FlatList,
  ImageBackground,
  KeyboardAvoidingView,
  Linking,
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
  getSupportConversation,
  getSupportMessages,
  markSupportConversationRead,
  sendSupportMessage,
  type SupportConversation,
  type SupportMessage,
} from '@/components/api';
import { useLocale } from '@/components/LocaleContext';
import { useAppTheme, type AppUI } from '@/components/tema';
import { connectChatSocket, type ChatConnectionState } from '@/lib/chatSocket';
import { compressImagesForUpload } from '@/lib/imageOptimization';
import { ensureVisitorSupportSession } from '@/lib/visitorSupport';

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
    .filter((url) => !isAudioUrl(url))
    .map((url) => {
      if (/^(https?:|file:|content:|data:)/i.test(url)) return url;
      return `${API_URL}/${url.replace(/^\/+/, '')}`;
    });
}

function isAudioUrl(url: string) {
  return /\.(m4a|aac|mp3|wav|webm|3gp|ogg)(?:[?#]|$)/i.test(url);
}

function audioUrls(message: SupportMessage) {
  const values = message.attachment_urls?.length
    ? message.attachment_urls
    : message.images || [];
  return values
    .map((attachment) => (typeof attachment === 'string' ? attachment : attachment.url))
    .filter((url): url is string => Boolean(url) && isAudioUrl(url))
    .map((url) => {
      if (/^(https?:|file:|content:|data:)/i.test(url)) return url;
      return `${API_URL}/${url.replace(/^\/+/, '')}`;
    });
}

function formatAudioTime(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`;
}

function makeClientId() {
  return `customer-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function ChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, isLoggedIn, loading: authLoading } = useAuth();
  const { t, dateLocale } = useLocale();
  const { ui, colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(ui), [ui]);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder, 200);

  const [visitorToken, setVisitorToken] = useState<string | null>(null);
  const [visitorBooting, setVisitorBooting] = useState(false);
  const accessToken = isLoggedIn && token ? token : visitorToken;
  const isVisitor = Boolean(!isLoggedIn && visitorToken);

  const [conversation, setConversation] = useState<SupportConversation | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [recordedAudio, setRecordedAudio] = useState<string | null>(null);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [before, setBefore] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [error, setError] = useState('');
  const [connection, setConnection] = useState<ChatConnectionState>('disconnected');
  const [supportTyping, setSupportTyping] = useState(false);

  const conversationIdRef = useRef<string | null>(null);
  const tokenRef = useRef(accessToken);
  const socketRef = useRef<Socket | null>(null);
  const typingSentRef = useRef(false);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supportTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  tokenRef.current = accessToken;

  const stopCustomerTyping = useCallback(() => {
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = null;
    if (typingSentRef.current && socketRef.current && conversationIdRef.current) {
      socketRef.current.emit('support:typing', {
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
      socketRef.current.emit('support:typing', {
        conversation_id: conversationIdRef.current,
        is_typing: true,
      });
      typingSentRef.current = true;
    }
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    if (isTyping) {
      typingStopTimerRef.current = setTimeout(stopCustomerTyping, 1400);
    } else {
      stopCustomerTyping();
    }
  }, [stopCustomerTyping]);

  const markRead = useCallback(async (conversationId: string) => {
    const authToken = tokenRef.current;
    if (!authToken) return;
    await markSupportConversationRead(authToken, conversationId);
    setConversation((current) =>
      current?.id === conversationId ? { ...current, unread_count: 0 } : current,
    );
  }, []);

  const loadLatest = useCallback(async (silent = false) => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    setError('');

    let nextConversation: SupportConversation | null = null;
    if (isVisitor) {
      const id = conversationIdRef.current;
      if (id) nextConversation = { id };
    } else {
      const conversationResult = await getSupportConversation(accessToken);
      if (!conversationResult.success) {
        setError(conversationResult.message);
        setLoading(false);
        return;
      }
      nextConversation = conversationResult.data;
    }

    if (!nextConversation?.id) {
      setError('Não foi possível abrir a conversa.');
      setLoading(false);
      return;
    }

    conversationIdRef.current = nextConversation.id;
    setConversation((current) => ({ ...current, ...nextConversation }));

    const messagesResult = await getSupportMessages(accessToken, nextConversation.id, {
      limit: PAGE_SIZE,
    });
    if (!messagesResult.success) {
      setError(messagesResult.message);
      setLoading(false);
      return;
    }
    setMessages((current) => mergeMessages(current, messagesResult.data.messages));
    setHasMore(messagesResult.data.has_more);
    setBefore(messagesResult.data.next_before);
    setLoading(false);
    void markRead(nextConversation.id);
  }, [accessToken, isVisitor, markRead]);

  useEffect(() => {
    let active = true;
    if (authLoading) return;
    if (isLoggedIn && token) {
      setVisitorToken(null);
      return;
    }
    setVisitorBooting(true);
    void ensureVisitorSupportSession().then((result) => {
      if (!active) return;
      setVisitorBooting(false);
      if (!result.ok) {
        setError(result.message);
        setLoading(false);
        return;
      }
      setVisitorToken(result.session.token);
      setConversation(result.session.conversation);
      conversationIdRef.current = result.session.conversation.id;
    });
    return () => {
      active = false;
    };
  }, [authLoading, isLoggedIn, token]);

  useFocusEffect(
    useCallback(() => {
      if (!accessToken) return;
      void loadLatest();
      const id = conversationIdRef.current;
      if (id) void markRead(id);
    }, [accessToken, loadLatest, markRead]),
  );

  useEffect(() => {
    if (!accessToken) {
      setConnection('disconnected');
      return;
    }
    const session = connectChatSocket({
      token: accessToken,
      role: isVisitor ? 'visitor' : 'customer',
      conversationId: conversation?.id,
      onConnectionChange: (state) => {
        setConnection(state);
        if (state === 'connected') void loadLatest(true);
      },
      onMessage: (message) => {
        if (
          conversationIdRef.current
          && message.conversation_id !== conversationIdRef.current
        ) return;
        setMessages((current) => mergeMessages(current, [message]));
        if ((message.sender_type || message.sender) !== 'customer' && conversationIdRef.current) {
          void markRead(conversationIdRef.current);
        }
      },
      onConversation: (nextConversation) => {
        if (
          conversationIdRef.current
          && nextConversation.id !== conversationIdRef.current
        ) return;
        setConversation((current) => ({ ...current, ...nextConversation }));
        void loadLatest(true);
      },
      onTyping: (event) => {
        if (
          event.role !== 'admin'
          || event.conversation_id !== conversationIdRef.current
        ) return;
        if (supportTypingTimerRef.current) clearTimeout(supportTypingTimerRef.current);
        setSupportTyping(event.is_typing);
        if (event.is_typing) {
          supportTypingTimerRef.current = setTimeout(() => setSupportTyping(false), 3500);
        }
      },
    });
    socketRef.current = session.socket;
    return () => {
      stopCustomerTyping();
      if (supportTypingTimerRef.current) clearTimeout(supportTypingTimerRef.current);
      supportTypingTimerRef.current = null;
      socketRef.current = null;
      session.teardown();
    };
  }, [accessToken, conversation?.id, isVisitor, loadLatest, markRead, stopCustomerTyping]);

  useEffect(() => {
    if (!accessToken) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void loadLatest(true);
    });
    return () => subscription.remove();
  }, [accessToken, loadLatest]);

  const loadOlder = useCallback(async () => {
    if (!accessToken || !conversation || !hasMore || !before || loadingOlder) return;
    setLoadingOlder(true);
    const result = await getSupportMessages(accessToken, conversation.id, {
      before,
      limit: PAGE_SIZE,
    });
    if (result.success) {
      setMessages((current) => mergeMessages(current, result.data.messages));
      setHasMore(result.data.has_more);
      setBefore(result.data.next_before);
    }
    setLoadingOlder(false);
  }, [accessToken, before, conversation, hasMore, loadingOlder]);

  const pickPhotos = async () => {
    const remaining = 3 - photos.length;
    if (
      remaining <= 0
      || optimizing
      || sending
      || recordedAudio
      || recorderState.isRecording
    ) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('chat.photoPermissionTitle'), t('chat.photoPermissionMessage'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.85,
    });
    if (result.canceled || !result.assets.length) return;
    setOptimizing(true);
    try {
      const compressed = await compressImagesForUpload(
        result.assets.map((asset) => asset.uri).slice(0, remaining),
      );
      setPhotos((current) => [...current, ...compressed].slice(0, 3));
    } finally {
      setOptimizing(false);
    }
  };

  const startRecording = async () => {
    if (recordingBusy || recorderState.isRecording || photos.length > 0) return;
    setRecordingBusy(true);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permissão do microfone',
          'Permita o acesso ao microfone para enviar mensagens de áudio.',
        );
        return;
      }
      setRecordedAudio(null);
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
    } catch {
      Alert.alert('Áudio', 'Não foi possível iniciar a gravação.');
    } finally {
      setRecordingBusy(false);
    }
  };

  const stopRecording = async (keepRecording = true) => {
    if (recordingBusy || !recorderState.isRecording) return;
    setRecordingBusy(true);
    try {
      await audioRecorder.stop();
      setRecordedAudio(keepRecording ? audioRecorder.uri : null);
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
    } catch {
      setRecordedAudio(null);
      Alert.alert('Áudio', 'Não foi possível concluir a gravação.');
    } finally {
      setRecordingBusy(false);
    }
  };

  const submit = async () => {
    const text = body.trim();
    if (
      !accessToken
      || !conversation
      || sending
      || recorderState.isRecording
      || (!text && photos.length === 0 && !recordedAudio)
    ) return;
    stopCustomerTyping();
    const clientId = makeClientId();
    const selectedPhotos = [...photos];
    const selectedAudio = recordedAudio;
    const optimistic: SupportMessage = {
      id: clientId,
      conversation_id: conversation.id,
      client_message_id: clientId,
      body: text || null,
      images: selectedPhotos,
      attachment_urls: selectedAudio ? [selectedAudio] : [],
      sender_type: 'customer',
      created_at: new Date().toISOString(),
    };

    setMessages((current) => mergeMessages(current, [optimistic]));
    setBody('');
    setPhotos([]);
    setRecordedAudio(null);
    setSending(true);
    setError('');
    const result = await sendSupportMessage(accessToken, conversation.id, {
      body: text,
      client_message_id: clientId,
      image_uris: selectedPhotos,
      audio_uri: selectedAudio,
    });
    if (result.success) {
      setMessages((current) => {
        const withoutOptimistic = current.filter(
          (message) => messageKey(message) !== clientId,
        );
        return mergeMessages(withoutOptimistic, [result.data]);
      });
      void loadLatest(true);
    } else {
      setMessages((current) =>
        current.filter((message) => messageKey(message) !== clientId),
      );
      setBody(text);
      setPhotos(selectedPhotos);
      setRecordedAudio(selectedAudio);
      setError(result.message);
    }
    setSending(false);
  };

  const reversedMessages = useMemo(() => [...messages].reverse(), [messages]);

  const renderMessage = useCallback(
    ({ item }: ListRenderItemInfo<SupportMessage>) => {
      const mine = (item.sender_type || item.sender) === 'customer';
      const urls = imageUrls(item);
      const audios = audioUrls(item);
      const when = new Date(item.created_at);
      const time = Number.isNaN(when.getTime())
        ? ''
        : when.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' });
      const adminReadAt = conversation?.admin_read_at
        ? new Date(conversation.admin_read_at).getTime()
        : 0;
      const read = mine
        && adminReadAt > 0
        && !Number.isNaN(when.getTime())
        && adminReadAt >= when.getTime();
      return (
        <View style={[styles.messageRow, mine ? styles.mineRow : styles.supportRow]}>
          <View style={[styles.bubble, mine ? styles.mineBubble : styles.supportBubble]}>
            {!mine ? <Text style={styles.sender}>{t('chat.supportTeam')}</Text> : null}
            {urls.length ? (
              <View style={styles.messageImages}>
                {urls.map((url, index) => (
                  <Pressable key={`${url}-${index}`} onPress={() => void Linking.openURL(url)}>
                    <Image
                      source={{ uri: url }}
                      style={[
                        styles.messageImage,
                        urls.length === 1 && styles.messageImageSingle,
                      ]}
                      contentFit="cover"
                    />
                  </Pressable>
                ))}
              </View>
            ) : null}
            {audios.map((url) => (
              <AudioMessage
                key={url}
                url={url}
                mine={mine}
                ui={ui}
                styles={styles}
              />
            ))}
            {item.body ? (
              <Text style={[styles.messageText, mine && styles.mineText]}>{item.body}</Text>
            ) : null}
            <View style={styles.messageMeta}>
              <Text style={[styles.messageTime, mine && styles.mineTime]}>{time}</Text>
              {mine ? (
                <Ionicons
                  name={read ? 'checkmark-done' : 'checkmark'}
                  size={15}
                  color={read ? '#7DD3FC' : ui.onBrand}
                />
              ) : null}
            </View>
          </View>
        </View>
      );
    },
    [conversation?.admin_read_at, dateLocale, styles, t, ui],
  );

  if (authLoading || visitorBooting) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={ui.brand} />
      </View>
    );
  }

  if (!accessToken) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ChatHeader
          title={t('chat.title')}
          subtitle={`${t('chat.official')} · ${t('chat.connection.disconnected')}`}
          connection="disconnected"
          onBack={() => router.back()}
          ui={ui}
          styles={styles}
        />
        <View style={styles.guest}>
          <View style={styles.guestIcon}>
            <Ionicons name="chatbubble-ellipses-outline" size={38} color={ui.brand} />
          </View>
          <Text style={styles.guestTitle}>{t('chat.visitorFailTitle')}</Text>
          <Text style={styles.guestText}>{error || t('chat.visitorFailSubtitle')}</Text>
          <Pressable
            style={styles.loginButton}
            onPress={() => {
              setVisitorBooting(true);
              void ensureVisitorSupportSession().then((result) => {
                setVisitorBooting(false);
                if (!result.ok) {
                  setError(result.message);
                  return;
                }
                setVisitorToken(result.session.token);
                setConversation(result.session.conversation);
                conversationIdRef.current = result.session.conversation.id;
                setError('');
              });
            }}
          >
            <Text style={styles.loginButtonText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <ImageBackground
          source={require('../assets/images/chat-background.png')}
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
      <ChatHeader
        title={t('chat.title')}
        subtitle={`${isVisitor ? t('chat.visitorLabel') : t('chat.official')} · ${t(`chat.connection.${connection}`)}`}
        connection={connection}
        onBack={() => router.back()}
        ui={ui}
        styles={styles}
      />

      {error ? (
        <Pressable style={styles.errorBar} onPress={() => void loadLatest()}>
          <Text style={styles.errorText} numberOfLines={2}>{error}</Text>
          <Text style={styles.retryText}>{t('common.retry')}</Text>
        </Pressable>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={ui.brand} />
          <Text style={styles.loadingText}>{t('chat.loading')}</Text>
        </View>
      ) : (
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
            loadingOlder ? <ActivityIndicator style={styles.olderLoader} color={ui.brand} /> : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="shield-checkmark-outline" size={34} color={ui.brand} />
              <Text style={styles.emptyTitle}>{t('chat.emptyTitle')}</Text>
              <Text style={styles.emptyText}>{t('chat.emptySubtitle')}</Text>
            </View>
          }
        />
      )}

      {supportTyping ? <TypingIndicator styles={styles} /> : null}

      {recorderState.isRecording ? (
        <View style={styles.recordingBar}>
          <Pressable
            style={styles.recordingAction}
            onPress={() => void stopRecording(false)}
            disabled={recordingBusy}
          >
            <Ionicons name="trash-outline" size={20} color={ui.danger} />
          </Pressable>
          <View style={styles.recordingStatus}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingTime}>
              {formatAudioTime(recorderState.durationMillis / 1000)}
            </Text>
            <Text style={styles.recordingLabel}>A gravar áudio…</Text>
          </View>
          <Pressable
            style={[styles.recordingStop, recordingBusy && styles.disabled]}
            onPress={() => void stopRecording(true)}
            disabled={recordingBusy}
          >
            {recordingBusy
              ? <ActivityIndicator size="small" color={ui.onBrand} />
              : <Ionicons name="stop" size={18} color={ui.onBrand} />}
          </Pressable>
        </View>
      ) : null}

      {recordedAudio && !recorderState.isRecording ? (
        <View style={styles.audioPreview}>
          <AudioMessage url={recordedAudio} mine={false} ui={ui} styles={styles} />
          <Pressable style={styles.removeAudio} onPress={() => setRecordedAudio(null)}>
            <Ionicons name="close" size={18} color={ui.onBrand} />
          </Pressable>
        </View>
      ) : null}

      {photos.length ? (
        <View style={styles.previews}>
          {photos.map((uri, index) => (
            <View key={uri} style={styles.previewWrap}>
              <Image source={{ uri }} style={styles.previewImage} contentFit="cover" />
              <Pressable
                accessibilityLabel={t('chat.removePhoto')}
                style={styles.removePhoto}
                onPress={() => setPhotos((current) => current.filter((_, i) => i !== index))}
              >
                <Ionicons name="close" size={15} color="#FFFFFF" />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Pressable
          accessibilityLabel={t('chat.addPhoto')}
          style={[
            styles.attachButton,
            (photos.length >= 3 || sending || Boolean(recordedAudio) || recorderState.isRecording)
              && styles.disabled,
          ]}
          onPress={() => void pickPhotos()}
          disabled={
            photos.length >= 3
            || sending
            || optimizing
            || Boolean(recordedAudio)
            || recorderState.isRecording
          }
        >
          {optimizing
            ? <ActivityIndicator size="small" color={ui.brand} />
            : <Ionicons name="image-outline" size={24} color={ui.brand} />}
        </Pressable>
        <TextInput
          value={body}
          onChangeText={handleBodyChange}
          onBlur={stopCustomerTyping}
          placeholder={t('chat.placeholder')}
          placeholderTextColor={ui.muted}
          style={styles.input}
          multiline
          maxLength={2000}
          editable={!sending && !recorderState.isRecording}
        />
        <Pressable
          accessibilityLabel="Gravar mensagem de áudio"
          onPress={() => void startRecording()}
          disabled={
            sending
            || recordingBusy
            || recorderState.isRecording
            || photos.length > 0
            || Boolean(recordedAudio)
          }
          style={[
            styles.microphoneButton,
            (
              sending
              || recordingBusy
              || recorderState.isRecording
              || photos.length > 0
              || Boolean(recordedAudio)
            ) && styles.disabled,
          ]}
        >
          {recordingBusy
            ? <ActivityIndicator size="small" color={ui.brand} />
            : <Ionicons name="mic-outline" size={22} color={ui.brand} />}
        </Pressable>
        <Pressable
          accessibilityLabel={t('chat.send')}
          onPress={() => void submit()}
          disabled={
            sending
            || recorderState.isRecording
            || (!body.trim() && photos.length === 0 && !recordedAudio)
          }
          style={[
            styles.sendButton,
            (
              sending
              || recorderState.isRecording
              || (!body.trim() && photos.length === 0 && !recordedAudio)
            ) && styles.sendDisabled,
          ]}
        >
          {sending
            ? <ActivityIndicator size="small" color={ui.onBrand} />
            : <Ionicons name="send" size={20} color={ui.onBrand} />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function AudioMessage({
  url,
  mine,
  ui,
  styles,
}: {
  url: string;
  mine: boolean;
  ui: AppUI;
  styles: ReturnType<typeof createStyles>;
}) {
  const player = useAudioPlayer(url, { updateInterval: 250, downloadFirst: true });
  const status = useAudioPlayerStatus(player);
  const duration = status.duration || 0;
  const progress = duration > 0 ? Math.min(1, status.currentTime / duration) : 0;

  const togglePlayback = () => {
    if (status.playing) {
      player.pause();
      return;
    }
    if (duration > 0 && status.currentTime >= duration - 0.15) {
      void player.seekTo(0);
    }
    player.play();
  };

  return (
    <View style={styles.audioMessage}>
      <Pressable
        accessibilityLabel={status.playing ? 'Pausar áudio' : 'Reproduzir áudio'}
        style={[styles.audioPlay, mine && styles.audioPlayMine]}
        onPress={togglePlayback}
      >
        <Ionicons
          name={status.playing ? 'pause' : 'play'}
          size={20}
          color={mine ? ui.brand : ui.onBrand}
        />
      </Pressable>
      <View style={styles.audioTrackWrap}>
        <View style={[styles.audioTrack, mine && styles.audioTrackMine]}>
          <View
            style={[
              styles.audioProgress,
              mine && styles.audioProgressMine,
              { width: `${Math.round(progress * 100)}%` },
            ]}
          />
        </View>
        <View style={styles.audioInfo}>
          <Ionicons
            name="mic"
            size={12}
            color={mine ? ui.onBrand : ui.brand}
          />
          <Text style={[styles.audioDuration, mine && styles.mineText]}>
            {formatAudioTime(status.currentTime || duration)}
          </Text>
        </View>
      </View>
    </View>
  );
}

function TypingIndicator({ styles }: {
  styles: ReturnType<typeof createStyles>;
}) {
  const dots = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  useEffect(() => {
    const animations = dots.map((dot, index) => Animated.loop(
      Animated.sequence([
        Animated.delay(index * 140),
        Animated.timing(dot, {
          toValue: -5,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(dot, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.delay((2 - index) * 140),
      ]),
    ));
    animations.forEach((animation) => animation.start());
    return () => animations.forEach((animation) => animation.stop());
  }, [dots]);

  return (
    <View style={styles.typingRow}>
      <View style={styles.typingBubble}>
        {dots.map((dot, index) => (
          <Animated.View
            key={index}
            style={[styles.typingDot, { transform: [{ translateY: dot }] }]}
          />
        ))}
      </View>
    </View>
  );
}

function ChatHeader({
  title,
  subtitle,
  connection,
  onBack,
  ui,
  styles,
}: {
  title: string;
  subtitle: string;
  connection: ChatConnectionState;
  onBack: () => void;
  ui: AppUI;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.backButton} onPress={onBack}>
        <BlurView
          intensity={28}
          tint={ui.statusBar === 'light' ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
        <Ionicons name="arrow-back" size={21} color={ui.text} />
      </Pressable>
      <BlurView
        intensity={28}
        tint={ui.statusBar === 'light' ? 'dark' : 'light'}
        style={styles.headerCard}
      >
        <View style={styles.headerText}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              connection === 'connected'
                ? styles.connectedDot
                : connection === 'connecting'
                  ? styles.connectingDot
                  : styles.disconnectedDot,
            ]}
          />
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        </View>
      </BlurView>
    </View>
  );
}

function createStyles(ui: AppUI) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: ui.bg },
    backgroundImage: { ...StyleSheet.absoluteFillObject },
    backgroundTint: { ...StyleSheet.absoluteFillObject },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
    header: {
      height: 64,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 56,
      backgroundColor: 'transparent',
    },
    backButton: {
      position: 'absolute',
      left: 10,
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      backgroundColor: ui.statusBar === 'light'
        ? 'rgba(28,28,30,0.42)'
        : 'rgba(255,255,255,0.58)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: ui.statusBar === 'light'
        ? 'rgba(255,255,255,0.14)'
        : 'rgba(255,255,255,0.72)',
      zIndex: 2,
    },
    headerCard: {
      minWidth: 218,
      maxWidth: 260,
      height: 52,
      borderRadius: 26,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 22,
      backgroundColor: ui.statusBar === 'light'
        ? 'rgba(28,28,30,0.48)'
        : 'rgba(245,245,247,0.62)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: ui.statusBar === 'light'
        ? 'rgba(255,255,255,0.14)'
        : 'rgba(255,255,255,0.8)',
    },
    headerText: { alignItems: 'center', justifyContent: 'center' },
    title: { color: ui.text, fontSize: 16, fontWeight: '800', textAlign: 'center' },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      marginTop: 1,
    },
    statusDot: { width: 7, height: 7, borderRadius: 4 },
    connectedDot: { backgroundColor: ui.success },
    connectingDot: { backgroundColor: '#F59E0B' },
    disconnectedDot: { backgroundColor: ui.muted },
    subtitle: { color: ui.muted, fontSize: 11, fontWeight: '600' },
    errorBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 9,
      backgroundColor: ui.dangerSoft,
    },
    errorText: { flex: 1, color: ui.danger, fontSize: 12 },
    retryText: { color: ui.danger, fontSize: 12, fontWeight: '800' },
    loadingText: { color: ui.muted, fontSize: 13 },
    messageList: { paddingHorizontal: 12, paddingVertical: 14 },
    emptyList: { flexGrow: 1, justifyContent: 'center' },
    messageRow: { marginVertical: 4, flexDirection: 'row' },
    mineRow: { justifyContent: 'flex-end', paddingLeft: 48 },
    supportRow: { justifyContent: 'flex-start', paddingRight: 48 },
    bubble: {
      maxWidth: '100%',
      borderRadius: 18,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    mineBubble: { backgroundColor: ui.brand, borderBottomRightRadius: 5 },
    supportBubble: {
      backgroundColor: ui.card,
      borderBottomLeftRadius: 5,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: ui.border,
    },
    sender: { color: ui.brand, fontSize: 11, fontWeight: '800', marginBottom: 4 },
    messageText: { color: ui.text, fontSize: 15, lineHeight: 20 },
    mineText: { color: ui.onBrand },
    messageMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 3,
      marginTop: 5,
      alignSelf: 'flex-end',
    },
    messageTime: { color: ui.muted, fontSize: 10 },
    mineTime: { color: ui.onBrand, opacity: 0.72 },
    messageImages: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 7 },
    messageImage: { width: 96, height: 96, borderRadius: 11, backgroundColor: ui.input },
    messageImageSingle: { width: 220, height: 170 },
    audioMessage: {
      minWidth: 218,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 3,
    },
    audioPlay: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.brand,
    },
    audioPlayMine: { backgroundColor: ui.onBrand },
    audioTrackWrap: { flex: 1, gap: 5 },
    audioTrack: {
      height: 4,
      borderRadius: 2,
      overflow: 'hidden',
      backgroundColor: ui.border,
    },
    audioTrackMine: { backgroundColor: 'rgba(255,255,255,0.35)' },
    audioProgress: { height: '100%', borderRadius: 2, backgroundColor: ui.brand },
    audioProgressMine: { backgroundColor: ui.onBrand },
    audioInfo: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    audioDuration: { color: ui.muted, fontSize: 10, fontVariant: ['tabular-nums'] },
    typingRow: {
      flexDirection: 'row',
      justifyContent: 'flex-start',
      paddingHorizontal: 12,
      paddingBottom: 8,
    },
    typingBubble: {
      height: 38,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 15,
      borderRadius: 19,
      borderBottomLeftRadius: 5,
      backgroundColor: ui.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: ui.border,
    },
    typingDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: ui.muted,
    },
    olderLoader: { marginVertical: 14 },
    empty: { alignItems: 'center', paddingHorizontal: 36, gap: 8 },
    emptyTitle: { color: ui.text, fontSize: 17, fontWeight: '800', textAlign: 'center' },
    emptyText: { color: ui.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
    previews: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 12,
      paddingTop: 8,
      backgroundColor: ui.card,
    },
    recordingBar: {
      minHeight: 58,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: ui.card,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: ui.border,
    },
    recordingAction: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    recordingStatus: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    recordingDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: ui.danger },
    recordingTime: {
      minWidth: 38,
      color: ui.danger,
      fontSize: 14,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
    },
    recordingLabel: { color: ui.muted, fontSize: 13 },
    recordingStop: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.danger,
    },
    audioPreview: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: ui.brandSoft,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: ui.border,
    },
    removeAudio: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.danger,
    },
    previewWrap: { position: 'relative' },
    previewImage: { width: 62, height: 62, borderRadius: 10, backgroundColor: ui.input },
    removePhoto: {
      position: 'absolute',
      top: -5,
      right: -5,
      width: 21,
      height: 21,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.danger,
      borderWidth: 2,
      borderColor: ui.card,
    },
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      paddingHorizontal: 10,
      paddingTop: 9,
      backgroundColor: ui.card,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: ui.border,
    },
    attachButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.brandSoft,
    },
    microphoneButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.brandSoft,
    },
    disabled: { opacity: 0.45 },
    input: {
      flex: 1,
      minHeight: 42,
      maxHeight: 116,
      borderRadius: 21,
      paddingHorizontal: 14,
      paddingTop: Platform.OS === 'ios' ? 11 : 8,
      paddingBottom: Platform.OS === 'ios' ? 11 : 8,
      color: ui.text,
      fontSize: 15,
      backgroundColor: ui.input,
    },
    sendButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.brand,
    },
    sendDisabled: { opacity: 0.42 },
    guest: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 34,
      gap: 11,
    },
    guestIcon: {
      width: 76,
      height: 76,
      borderRadius: 38,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.brandSoft,
      marginBottom: 5,
    },
    guestTitle: { color: ui.text, fontSize: 21, fontWeight: '900', textAlign: 'center' },
    guestText: { color: ui.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
    loginButton: {
      minWidth: 170,
      alignItems: 'center',
      marginTop: 8,
      paddingHorizontal: 24,
      paddingVertical: 13,
      borderRadius: 14,
      backgroundColor: ui.brand,
    },
    loginButtonText: { color: ui.onBrand, fontSize: 15, fontWeight: '800' },
  });
}
