import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/components/AuthContext';
import { getSupportConversation } from '@/components/api';
import { useLocale } from '@/components/LocaleContext';
import { useAppTheme } from '@/components/tema';
import { connectChatSocket } from '@/lib/chatSocket';

export function ChatFab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, isLoggedIn } = useAuth();
  const { t } = useLocale();
  const { ui } = useAppTheme();
  const [unread, setUnread] = useState(0);
  const [focused, setFocused] = useState(false);

  const refresh = useCallback(async () => {
    if (!token || !isLoggedIn) {
      setUnread(0);
      return;
    }
    const result = await getSupportConversation(token);
    if (result.success) setUnread(Math.max(0, Number(result.data.unread_count || 0)));
  }, [isLoggedIn, token]);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      void refresh();
      return () => setFocused(false);
    }, [refresh]),
  );

  useEffect(() => {
    if (!token || !isLoggedIn || !focused) return;
    const session = connectChatSocket({
      token,
      onMessage: (message) => {
        if (message.sender_type !== 'customer') setUnread((count) => count + 1);
      },
      onConversation: (conversation) => {
        if (typeof conversation.unread_count === 'number') {
          setUnread(Math.max(0, conversation.unread_count));
        }
      },
    });
    return session.teardown;
  }, [focused, isLoggedIn, token]);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: Math.max(insets.bottom, 10) + 86 }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('chat.open')}
        onPress={() => router.push('/chat')}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: ui.brand },
          pressed && styles.pressed,
        ]}
      >
        <Ionicons name="chatbubble-ellipses" size={27} color="#FFFFFF" />
        {unread > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 18,
    zIndex: 900,
    elevation: 20,
  },
  button: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 10,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.96 }],
  },
  badge: {
    position: 'absolute',
    right: -5,
    top: -5,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC2626',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
});
