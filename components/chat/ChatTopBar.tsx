import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppUI } from '@/components/tema';

type ChatTopBarProps = {
  title: string;
  status: string;
  online?: boolean;
  connecting?: boolean;
  avatarUri?: string | null;
  avatarFallback?: string;
  avatarSource?: number;
  onBack: () => void;
  ui: AppUI;
};

export function ChatTopBar({
  title,
  status,
  online = false,
  connecting = false,
  avatarUri,
  avatarFallback = '?',
  avatarSource,
  onBack,
  ui,
}: ChatTopBarProps) {
  const isDark = ui.statusBar === 'light';
  const glassBg = isDark ? 'rgba(28,28,30,0.38)' : 'rgba(255,255,255,0.62)';
  const glassBorder = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.88)';
  const blurTint = isDark ? 'dark' : 'light';

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        style={[styles.backPill, { backgroundColor: glassBg, borderColor: glassBorder }]}
      >
        {Platform.OS !== 'web' ? (
          <BlurView intensity={32} tint={blurTint} style={StyleSheet.absoluteFill} />
        ) : null}
        <Ionicons name="chevron-back" size={22} color={ui.text} />
      </Pressable>

      <View style={[styles.centerPill, { backgroundColor: glassBg, borderColor: glassBorder }]}>
        {Platform.OS !== 'web' ? (
          <BlurView intensity={32} tint={blurTint} style={StyleSheet.absoluteFill} />
        ) : null}
        <Text style={[styles.title, { color: ui.text }]} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.dot,
              online
                ? styles.dotOnline
                : connecting
                  ? styles.dotConnecting
                  : styles.dotOffline,
            ]}
          />
          <Text style={[styles.status, { color: ui.muted }]} numberOfLines={1}>
            {status}
          </Text>
        </View>
      </View>

      <View style={[styles.avatarRing, { borderColor: '#FFFFFF' }]}>
        {avatarSource ? (
          <Image source={avatarSource} style={styles.avatar} contentFit="cover" />
        ) : avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: ui.brand }]}>
            <Text style={styles.avatarInitial}>
              {(avatarFallback || '?').slice(0, 1).toUpperCase()}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    gap: 10,
    backgroundColor: 'transparent',
  },
  backPill: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  centerPill: {
    flex: 1,
    minHeight: 52,
    borderRadius: 26,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  status: {
    fontSize: 12,
    fontWeight: '600',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotOnline: { backgroundColor: '#22C55E' },
  dotConnecting: { backgroundColor: '#F59E0B' },
  dotOffline: { backgroundColor: '#9CA3AF' },
  avatarRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2.5,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
});
