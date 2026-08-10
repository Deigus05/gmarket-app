import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';

import { useAuth } from '@/components/AuthContext';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import {
  followStore,
  getStoreFollowStatus,
  unfollowStore,
} from '@/components/api';
import { useLocale } from '@/components/LocaleContext';
import { useAppTheme } from '@/components/tema';

type Variant = 'full' | 'compact';

type Props = {
  storeId?: string | null;
  variant?: Variant;
  style?: ViewStyle;
  /** Se conhecido (ex.: lista já carregou /api/me/follows). */
  initialFollowing?: boolean;
  onFollowingChange?: (following: boolean) => void;
  onFollowersCountChange?: (count: number) => void;
};

export function FollowStoreButton({
  storeId,
  variant = 'full',
  style,
  initialFollowing,
  onFollowingChange,
  onFollowersCountChange,
}: Props) {
  const router = useRouter();
  const { t } = useLocale();
  const { colors, ui } = useAppTheme();
  const { token, isLoggedIn } = useAuth();
  const [following, setFollowing] = useState(Boolean(initialFollowing));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initialFollowing !== undefined) {
      setFollowing(Boolean(initialFollowing));
    }
  }, [initialFollowing, storeId]);

  const refreshStatus = useCallback(async () => {
    if (!storeId || !token) {
      if (initialFollowing === undefined) setFollowing(false);
      return;
    }
    // Se o pai já passou o estado, evita pedido extra (útil na lista de lojas)
    if (initialFollowing !== undefined && !onFollowersCountChange) return;

    const status = await getStoreFollowStatus(token, storeId);
    if (status.success) {
      setFollowing(status.data.following);
      onFollowingChange?.(status.data.following);
      onFollowersCountChange?.(status.data.followers_count || 0);
    }
  }, [
    storeId,
    token,
    initialFollowing,
    onFollowingChange,
    onFollowersCountChange,
  ]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const handlePress = async () => {
    if (!storeId) return;

    if (!isLoggedIn || !token) {
      Alert.alert(t('store.loginTitle'), t('store.loginMessage'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.login'), onPress: () => router.push('/login') },
      ]);
      return;
    }

    setBusy(true);
    const result = following
      ? await unfollowStore(token, storeId)
      : await followStore(token, storeId);

    if (result.success) {
      const next = result.data.following;
      setFollowing(next);
      onFollowingChange?.(next);
      if (onFollowersCountChange) {
        const status = await getStoreFollowStatus(token, storeId);
        if (status.success) {
          onFollowersCountChange(status.data.followers_count || 0);
        }
      }
      if (next) {
        Alert.alert(t('store.followSuccessTitle'), t('store.followSuccessMessage'));
      }
    } else {
      Alert.alert(t('store.fail'), result.message);
    }
    setBusy(false);
  };

  const compact = variant === 'compact';
  const label = following
    ? compact
      ? t('store.followingShort')
      : t('store.following')
    : compact
      ? t('store.followShort')
      : t('store.follow');

  return (
    <TouchableOpacity
      style={[
        compact ? styles.compactBtn : styles.fullBtn,
        { backgroundColor: following ? ui.successSoft : colors.accent },
        following && compact && { borderWidth: 1, borderColor: colors.accent },
        following && !compact && { borderWidth: 1, borderColor: ui.success },
        style,
      ]}
      onPress={handlePress}
      disabled={busy || !storeId}
      activeOpacity={0.85}
      hitSlop={compact ? { top: 8, bottom: 8, left: 8, right: 8 } : undefined}
    >
      {busy ? (
        <RippleWaveLoader size="small" color={following ? colors.accent : '#FFF'} />
      ) : (
        <Ionicons
          name={following ? 'checkmark' : 'notifications-outline'}
          size={compact ? 14 : 16}
          color={following ? colors.accent : '#FFF'}
        />
      )}
      <Text
        style={[
          compact ? styles.compactText : styles.fullText,
          { color: following ? colors.accent : '#FFF', marginLeft: 4 },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fullBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    borderRadius: 12,
  },
  fullText: {
    fontSize: 13,
    fontWeight: '700',
  },
  compactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    minWidth: 88,
  },
  compactText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
