import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FollowStoreButton } from '@/components/FollowStoreButton';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import { useAuth } from '@/components/AuthContext';
import { getFollowedStores, getLiveStores, LiveStore } from '../components/api';
import { useLocale } from '@/components/LocaleContext';
import { useAppTheme, type AppUI } from '@/components/tema';
import { optimizedImageUrl } from '@/lib/imageOptimization';

const DEFAULT_COVER =
  'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&h=300&fit=crop';
const DEFAULT_LOGO =
  'https://images.unsplash.com/photo-1560179707-f14dd11c87e8?w=200&h=200&fit=crop';

export default function ListaLojasScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const { token, isLoggedIn } = useAuth();
  const { ui, colors } = useAppTheme();
  const styles = useMemo(() => createStyles(ui, colors.accent), [ui, colors.accent]);
  const [search, setSearch] = useState('');
  const [stores, setStores] = useState<LiveStore[]>([]);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const hasLoadedRef = useRef(false);

  const loadStores = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    const data = await getLiveStores();
    setStores(data);
    hasLoadedRef.current = true;

    if (isLoggedIn && token) {
      const followed = await getFollowedStores(token);
      if (followed.success) {
        setFollowedIds(new Set(followed.data.map((item) => item.store.id)));
      }
    } else {
      setFollowedIds(new Set());
    }

    setLoading(false);
  }, [isLoggedIn, token]);

  useFocusEffect(
    useCallback(() => {
      loadStores({ silent: hasLoadedRef.current });
    }, [loadStores]),
  );

  const filtered = stores.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase()),
  );

  const formatReviews = (n: number) => {
    if (!n) return '0';
    if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
    return String(n);
  };

  return (
    <View style={styles.mainWrapper}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.topHeader, { paddingTop: insets.top + 12 }]}>
        <View style={styles.topNavbar}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={colors.accent} />
          </TouchableOpacity>
          <Text style={styles.navbarTitle}>{t('storesList.title')}</Text>
          <View style={styles.navSpacer} />
        </View>

        <View style={styles.searchSection}>
          <Ionicons style={styles.searchIcon} name="search-outline" size={18} color={ui.muted} />
          <TextInput
            style={styles.input}
            placeholder={t('storesList.searchPlaceholder')}
            placeholderTextColor={ui.muted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <RippleWaveLoader color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={styles.sectionTitle}>
              {t('storesList.allActive', { count: filtered.length })}
            </Text>
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>{t('storesList.empty')}</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.merchantCard}>
              <TouchableOpacity
                style={styles.merchantMain}
                activeOpacity={0.75}
                onPress={() =>
                  router.push({
                    pathname: '/loja',
                    params: {
                      id: item.id,
                      name: item.name,
                      cover: item.cover_url || '',
                      logo: item.logo_url || '',
                      verified: item.verified ? '1' : '0',
                      rating: String(item.rating_avg ?? 0),
                      reviews: String(item.review_count ?? 0),
                    },
                  })
                }
              >
                <View style={styles.coverThumbWrap}>
                  <Image
                    source={{
                      uri: optimizedImageUrl(item.cover_url || DEFAULT_COVER, 'card'),
                    }}
                    style={styles.coverThumb}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={`${item.id}-cover-${item.cover_url || 'default'}`}
                  />
                  <View style={styles.logoWrapper}>
                    <Image
                      source={{
                        uri: optimizedImageUrl(item.logo_url || DEFAULT_LOGO, 'thumb'),
                      }}
                      style={styles.merchantLogo}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      recyclingKey={`${item.id}-logo-${item.logo_url || 'default'}`}
                    />
                  </View>
                </View>

                <View style={styles.merchantInfo}>
                  <Text style={styles.merchantCategory}>
                    {item.categoria || (item.verified ? t('storesList.verified') : t('storesList.partner'))}
                  </Text>

                  <View style={styles.nameRow}>
                    <Text style={styles.merchantName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {item.verified ? (
                      <View style={styles.verifiedBadge}>
                        <Ionicons name="checkmark-circle" size={14} color={colors.accent} />
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.metricsRow}>
                    <View style={styles.ratingBox}>
                      <Ionicons name="star" size={11} color="#FF9800" />
                      <Text style={styles.ratingText}>
                        {Number(item.rating_avg || 0).toFixed(1)}
                      </Text>
                      <Text style={styles.reviewsText}>
                        ({formatReviews(item.review_count || 0)})
                      </Text>
                    </View>
                    <Text style={styles.bulletSeparator}>•</Text>
                    <Text style={styles.ordersText}>@{item.slug}</Text>
                  </View>
                </View>

                <View style={styles.arrowBox}>
                  <Ionicons name="chevron-forward" size={16} color={ui.muted} />
                </View>
              </TouchableOpacity>

              <FollowStoreButton
                storeId={item.id}
                variant="compact"
                style={styles.followInline}
                initialFollowing={followedIds.has(item.id)}
                onFollowingChange={(next) => {
                  setFollowedIds((prev) => {
                    const copy = new Set(prev);
                    if (next) copy.add(item.id);
                    else copy.delete(item.id);
                    return copy;
                  });
                }}
              />
            </View>
          )}
        />
      )}
    </View>
  );
}

function createStyles(ui: AppUI, accent: string) {
  return StyleSheet.create({
    mainWrapper: { flex: 1, backgroundColor: ui.bg },
    topHeader: {
      backgroundColor: ui.card,
      paddingHorizontal: 16,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: ui.border,
    },
    topNavbar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingBottom: 14,
    },
    backButton: {
      width: 36,
      height: 36,
      backgroundColor: ui.card,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: ui.border,
    },
    navbarTitle: { fontSize: 18, fontWeight: '900', color: ui.text },
    navSpacer: { width: 36, height: 36 },
    searchSection: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: ui.input,
      borderRadius: 25,
      paddingHorizontal: 14,
      height: 42,
      borderWidth: 1,
      borderColor: ui.border,
    },
    searchIcon: { marginRight: 8 },
    input: { flex: 1, color: ui.text, fontSize: 14, fontWeight: '500' },
    loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: ui.bg },
    scrollContainer: {
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 30,
      backgroundColor: ui.bg,
      flexGrow: 1,
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: ui.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 12,
      paddingLeft: 2,
    },
    emptyText: { textAlign: 'center', color: ui.muted, marginTop: 28, fontSize: 13 },
    merchantCard: {
      backgroundColor: ui.card,
      padding: 10,
      borderRadius: 20,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: ui.border,
    },
    merchantMain: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    followInline: {
      alignSelf: 'flex-end',
      marginTop: 10,
    },
    coverThumbWrap: {
      width: 72,
      height: 64,
      borderRadius: 14,
      overflow: 'hidden',
      backgroundColor: ui.input,
    },
    coverThumb: { width: '100%', height: '100%' },
    logoWrapper: {
      position: 'absolute',
      left: 4,
      bottom: 4,
      width: 28,
      height: 28,
      borderRadius: 8,
      backgroundColor: ui.card,
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: ui.card,
    },
    merchantLogo: { width: '100%', height: '100%' },
    merchantInfo: { flex: 1, marginLeft: 12, justifyContent: 'center' },
    merchantCategory: {
      fontSize: 10,
      fontWeight: '700',
      color: accent,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    nameRow: { flexDirection: 'row', alignItems: 'center', marginTop: 1 },
    merchantName: { fontSize: 15, fontWeight: '700', color: ui.text, flexShrink: 1 },
    verifiedBadge: { marginLeft: 5, justifyContent: 'center' },
    metricsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    ratingBox: { flexDirection: 'row', alignItems: 'center' },
    ratingText: { fontSize: 12, fontWeight: '700', color: ui.text, marginLeft: 3 },
    reviewsText: { fontSize: 11, color: ui.muted, marginLeft: 2 },
    bulletSeparator: { fontSize: 11, color: ui.muted, marginHorizontal: 6 },
    ordersText: { fontSize: 12, color: ui.muted, fontWeight: '500' },
    arrowBox: { width: 24, height: 24, justifyContent: 'center', alignItems: 'center' },
  });
}
