import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../components/AuthContext';
import {
  getStoreById,
  getStoreProducts,
  trackUserActivity,
  LiveStore,
  Product,
} from '../components/api';
import { FollowStoreButton } from '@/components/FollowStoreButton';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import { useLocale } from '@/components/LocaleContext';
import { useAppTheme, type AppUI } from '@/components/tema';
import { listImageUrl, optimizedImageUrl } from '@/lib/imageOptimization';
import { getStoreReviewByStoreId } from '@/lib/localReviews';

const { width } = Dimensions.get('window');
const GRID_PAD = 4;
const GRID_GAP = 4;
const COLUMN_WIDTH = (width - GRID_PAD * 2 - GRID_GAP) / 2;
const PRODUCT_IMAGE_HEIGHT = COLUMN_WIDTH * 1.18;
const COVER_HEIGHT = 200;
const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400';

const DEFAULT_COVER =
  'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200&h=400&fit=crop';
const DEFAULT_LOGO =
  'https://images.unsplash.com/photo-1560179707-f14dd11c87e8?w=200&h=200&fit=crop';

type StoreParams = {
  id?: string;
  name?: string;
  cover?: string;
  logo?: string;
  verified?: string;
  rating?: string;
  reviews?: string;
};

export default function LojaPerfilScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<StoreParams>();
  const { token } = useAuth();
  const { t } = useLocale();
  const { ui, colors } = useAppTheme();
  const styles = useMemo(() => createStyles(ui, colors.accent), [ui, colors.accent]);

  const [store, setStore] = useState<LiveStore | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(Boolean(params.id));
  const [followersCount, setFollowersCount] = useState(0);
  const [search, setSearch] = useState('');
  const [localStoreRating, setLocalStoreRating] = useState<number | null>(null);
  const loadedStoreIdRef = useRef<string | null>(null);
  const loadGenerationRef = useRef(0);
  const focusedRef = useRef(false);

  const loadStoreData = useCallback(async (generation: number, opts?: { silent?: boolean }) => {
    const isCurrent = () => loadGenerationRef.current === generation;
    if (!isCurrent()) return;
    if (!params.id) {
      setLoading(false);
      setProducts([]);
      loadedStoreIdRef.current = null;
      return;
    }

    const storeId = String(params.id);
    const silent = Boolean(opts?.silent);
    if (!silent) setLoading(true);

    const [storeData, storeProducts] = await Promise.all([
      getStoreById(storeId),
      // forceRefresh: produtos “invisíveis” no admin somem já ao reabrir a loja
      getStoreProducts(storeId, { forceRefresh: true }),
    ]);
    if (!isCurrent()) return;
    setStore(storeData);
    setProducts(storeProducts);
    loadedStoreIdRef.current = storeId;

    if (token) {
      void trackUserActivity(token, {
        action: 'visit_store',
        storeId,
      });
    }

    setLoading(false);
  }, [params.id, token]);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      const generation = ++loadGenerationRef.current;
      const storeId = params.id ? String(params.id) : null;
      const silent = Boolean(storeId && loadedStoreIdRef.current === storeId);
      void loadStoreData(generation, { silent });
      if (storeId) {
        void getStoreReviewByStoreId(storeId).then((local) => {
          if (loadGenerationRef.current === generation) {
            setLocalStoreRating(local?.rating ?? null);
          }
        });
      } else {
        setLocalStoreRating(null);
      }
      return () => {
        focusedRef.current = false;
        loadGenerationRef.current += 1;
      };
    }, [loadStoreData, params.id]),
  );

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [router]);

  const storeName = store?.name || params.name || t('store.official');
  const coverUri = optimizedImageUrl(
    (store?.cover_url || params.cover || DEFAULT_COVER) as string,
    'detail',
  );
  const logoUri = optimizedImageUrl(
    (store?.logo_url || params.logo || DEFAULT_LOGO) as string,
    'thumb',
  );
  const logoRecyclingKey = `store-logo-${params.id || 'x'}-${store?.logo_url || params.logo || 'default'}`;
  const coverRecyclingKey = `store-cover-${params.id || 'x'}-${store?.cover_url || params.cover || 'default'}`;
  const verified =
    store?.verified ??
    (params.verified === '1' || params.verified === 'true' || !params.id);
  const remoteRating = Number(store?.rating_avg ?? params.rating ?? 0);
  const remoteCount = Number(store?.review_count ?? params.reviews ?? 0);
  const ratingAvg =
    localStoreRating != null
      ? remoteCount > 0
        ? Math.round(((remoteRating * remoteCount + localStoreRating) / (remoteCount + 1)) * 10) / 10
        : localStoreRating
      : remoteRating;
  const reviewCount = remoteCount + (localStoreRating != null ? 1 : 0);

  const formatCount = (n: number) => {
    if (!n) return '0';
    if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
    return String(n);
  };

  const searchQuery = search.trim().toLowerCase();
  const filteredProducts = products.filter((item) => {
    if (!searchQuery) return true;
    const title = (item.titulo || '').toLowerCase();
    return title.includes(searchQuery);
  });

  if (loading) {
    return (
      <View style={[styles.mainWrapper, styles.centered]}>
        <Stack.Screen options={{ headerShown: false }} />
        <RippleWaveLoader color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.mainWrapper}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        style={{ backgroundColor: ui.bg }}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.headerWrap}>
          <View style={[styles.coverBlock, { height: COVER_HEIGHT + insets.top }]}>
            <Image
              source={{ uri: coverUri }}
              style={StyleSheet.absoluteFillObject}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={coverRecyclingKey}
            />
            <LinearGradient
              colors={['rgba(0,0,0,0.35)', 'transparent', 'rgba(0,0,0,0.55)']}
              locations={[0, 0.4, 1]}
              style={StyleSheet.absoluteFillObject}
            />

            <View style={[styles.navRow, { paddingTop: insets.top + 8 }]}>
              <TouchableOpacity style={styles.navBtn} onPress={goBack} activeOpacity={0.85}>
                <Ionicons name="arrow-back" size={20} color="#111" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.navBtn} activeOpacity={0.85}>
                <Ionicons name="share-social-outline" size={18} color="#111" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.profileCard}>
            <View style={styles.logoRow}>
              <View style={styles.logoRing}>
                <Image
                  source={{ uri: logoUri }}
                  style={styles.logo}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={logoRecyclingKey}
                />
              </View>
              <View style={styles.identityCol}>
                <View style={styles.nameRow}>
                  <Text style={styles.storeName} numberOfLines={1}>
                    {storeName}
                  </Text>
                  {verified ? (
                    <Ionicons name="checkmark-circle" size={18} color={colors.accent} style={{ marginLeft: 4 }} />
                  ) : null}
                </View>
                <Text style={styles.storeHandle}>@{store?.slug || 'gmarket-oficial'}</Text>
                <Text style={styles.fulfillmentBadge}>
                  {store?.fulfillment_mode === 'entrega'
                    ? t('store.fulfillmentDelivery')
                    : store?.fulfillment_mode === 'recolha'
                      ? t('store.fulfillmentPickup')
                      : t('store.fulfillmentBoth')}
                </Text>
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>★ {ratingAvg.toFixed(1)}</Text>
                <Text style={styles.statLabel}>
                  {t('store.ratings', { n: formatCount(reviewCount) })}
                </Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{products.length}</Text>
                <Text style={styles.statLabel}>{t('store.products')}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{formatCount(followersCount)}</Text>
                <Text style={styles.statLabel}>{t('store.followers')}</Text>
              </View>
            </View>

            <FollowStoreButton
              storeId={params.id ? String(params.id) : null}
              style={{ marginTop: 12 }}
              onFollowersCountChange={(count) => {
                if (focusedRef.current) setFollowersCount(count);
              }}
            />
          </View>
        </View>

        <View style={styles.searchSection}>
          <Ionicons name="search-outline" size={16} color={ui.muted} style={styles.searchIcon} />
          <TextInput
            style={styles.input}
            placeholder={t('store.searchPlaceholder')}
            placeholderTextColor={ui.muted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
          {search.length > 0 ? (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={8} activeOpacity={0.7}>
              <Ionicons name="close-circle" size={16} color={ui.muted} />
            </TouchableOpacity>
          ) : null}
        </View>

        <Text style={styles.sectionTitle}>
          {t('store.productsTitle', { count: filteredProducts.length })}
        </Text>

        {filteredProducts.length === 0 ? (
          <Text style={styles.emptyText}>{t('store.empty')}</Text>
        ) : (
          <View style={styles.grid}>
            {filteredProducts.map((item) => {
              const imageUri = listImageUrl(item.image_urls, item.image_url, FALLBACK_IMAGE, 'card');
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.productCard}
                  activeOpacity={0.8}
                  onPress={() =>
                    router.push(`/productDetail?id=${encodeURIComponent(item.id)}`)
                  }
                >
                  <View style={styles.imageContainer}>
                    <Image
                      source={{ uri: imageUri }}
                      style={styles.productImage}
                      contentFit="cover"
                      transition={200}
                      cachePolicy="memory-disk"
                      recyclingKey={item.id}
                    />
                  </View>
                  <Text style={styles.productTitle} numberOfLines={2}>
                    {item.titulo}
                  </Text>
                  <View style={styles.priceContainer}>
                    <Text style={styles.normalPrice}>
                      {Number(item.preco).toLocaleString()} CFA
                    </Text>
                  </View>
                  <View style={styles.gcoinRow}>
                    <Text style={styles.gcoinPrice}>
                      {Number(item.preco_gpay).toLocaleString()} GCoin
                    </Text>
                    <View style={styles.gpayBadge}>
                      <Text style={styles.gpayBadgeText}>GPay</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(ui: AppUI, accent: string) {
  return StyleSheet.create({
    mainWrapper: { flex: 1, backgroundColor: ui.bg },
    centered: { justifyContent: 'center', alignItems: 'center' },
    container: { paddingBottom: 40, backgroundColor: ui.bg, flexGrow: 1 },
    headerWrap: { backgroundColor: ui.bg, marginBottom: 4 },

    coverBlock: {
      width: '100%',
      backgroundColor: ui.input,
      overflow: 'hidden',
    },
    navRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
    },
    navBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: 'rgba(255,255,255,0.92)',
      justifyContent: 'center',
      alignItems: 'center',
    },

    profileCard: {
      marginTop: -36,
      marginHorizontal: 12,
      backgroundColor: ui.card,
      borderRadius: 20,
      padding: 14,
      borderWidth: 1,
      borderColor: ui.border,
    },
    logoRow: { flexDirection: 'row', alignItems: 'center' },
    logoRing: {
      width: 72,
      height: 72,
      borderRadius: 20,
      borderWidth: 3,
      borderColor: ui.card,
      overflow: 'hidden',
      backgroundColor: ui.input,
      marginTop: -40,
    },
    logo: { width: '100%', height: '100%' },
    identityCol: { flex: 1, marginLeft: 12, paddingTop: 4 },
    nameRow: { flexDirection: 'row', alignItems: 'center' },
    storeName: { fontSize: 18, fontWeight: '900', color: ui.text, flexShrink: 1 },
    storeHandle: { fontSize: 12, color: ui.muted, marginTop: 2, fontWeight: '500' },
    fulfillmentBadge: {
      marginTop: 6,
      alignSelf: 'flex-start',
      fontSize: 11,
      fontWeight: '700',
      color: accent,
      backgroundColor: ui.input,
      overflow: 'hidden',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },

    statsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 14,
      backgroundColor: ui.input,
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 8,
    },
    statItem: { flex: 1, alignItems: 'center' },
    statValue: { fontSize: 14, fontWeight: '800', color: ui.text },
    statLabel: { fontSize: 10, color: ui.muted, marginTop: 2 },
    statDivider: { width: 1, height: 28, backgroundColor: ui.border },

    searchSection: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: ui.input,
      borderRadius: 22,
      paddingHorizontal: 12,
      height: 40,
      marginTop: 14,
      marginHorizontal: 12,
    },
    searchIcon: { marginRight: 8 },
    input: { flex: 1, color: ui.text, fontSize: 13, fontWeight: '500', paddingVertical: 0 },

    sectionTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: ui.text,
      marginLeft: 14,
      marginBottom: 10,
      marginTop: 18,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      paddingHorizontal: GRID_PAD,
      gap: GRID_GAP,
    },
    productCard: { width: COLUMN_WIDTH, backgroundColor: ui.bg, marginBottom: GRID_GAP },
    imageContainer: {
      width: COLUMN_WIDTH,
      height: PRODUCT_IMAGE_HEIGHT,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: ui.input,
    },
    productImage: { width: '100%', height: '100%' },
    productTitle: {
      fontSize: 12,
      color: ui.text,
      marginTop: 6,
      minHeight: 34,
      lineHeight: 17,
      fontWeight: '400',
      paddingHorizontal: 2,
    },
    priceContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 4, paddingHorizontal: 2 },
    normalPrice: { fontSize: 15, fontWeight: '900', color: ui.success },
    gcoinRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2, paddingHorizontal: 2 },
    gcoinPrice: { fontSize: 11, fontWeight: '600', color: ui.muted },
    gpayBadge: {
      backgroundColor: ui.successSoft,
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: 4,
      marginLeft: 4,
    },
    gpayBadgeText: { fontSize: 8, color: ui.success, fontWeight: 'bold' },
    emptyText: { textAlign: 'center', color: ui.muted, marginTop: 20, fontSize: 13 },
  });
}
