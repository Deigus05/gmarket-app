import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  InteractionManager,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getMyOrders,
  getMyReviews,
  submitProductReview,
  submitStoreReview,
  type Order,
  type OrderItem,
} from '@/components/api';
import { cacheKeyProduct, cacheKeyStore, invalidateApiCache } from '@/components/apiCache';
import { useAuth } from '@/components/AuthContext';
import { KeyboardFormScrollView } from '@/components/KeyboardFormScrollView';
import { useLocale } from '@/components/LocaleContext';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import { StarRating, STAR_GOLD } from '@/components/StarRating';
import { useAppTheme, type AppUI } from '@/components/tema';
import { compressImagesForUpload } from '@/lib/imageOptimization';
import {
  findLocalProductReview,
  getAllProductReviews,
  getAllStoreReviews,
  saveProductReview,
  saveStoreReview,
  type LocalProductReview,
  type LocalStoreReview,
} from '@/lib/localReviews';

type TabKey = 'products' | 'stores';

type PurchasedProduct = {
  key: string;
  product_id: string;
  order_id: string;
  order_item_id: string;
  title: string;
  image_url: string | null;
  store_id: string | null;
  store_name: string;
  purchased_at: string;
};

type PurchasedStore = {
  key: string;
  store_id: string;
  store_name: string;
  store_logo: string | null;
  order_id: string;
  purchased_at: string;
};

type ReviewDraftTarget =
  | { kind: 'product'; item: PurchasedProduct; existing: LocalProductReview | null }
  | { kind: 'store'; item: PurchasedStore; existing: LocalStoreReview | null };

function collectPurchased(orders: Order[]): {
  products: PurchasedProduct[];
  stores: PurchasedStore[];
} {
  const delivered = orders.filter((o) => o.status === 'delivered');
  const products: PurchasedProduct[] = [];
  const storeMap = new Map<string, PurchasedStore>();

  for (const order of delivered) {
    const storeId = order.store?.id || null;
    const storeName = order.store?.name || 'Loja';

    if (storeId) {
      const prev = storeMap.get(storeId);
      if (!prev || Date.parse(order.created_at) > Date.parse(prev.purchased_at)) {
        storeMap.set(storeId, {
          key: storeId,
          store_id: storeId,
          store_name: storeName,
          store_logo: null,
          order_id: order.id,
          purchased_at: order.created_at,
        });
      }
    }

    for (const item of (order.items || []) as OrderItem[]) {
      if (!item?.product_id) continue;
      const realItemId = typeof item.id === 'string' && item.id && !item.id.includes(':')
        ? item.id
        : '';
      const itemKey = realItemId || `${order.id}:${item.product_id}`;
      products.push({
        key: itemKey,
        product_id: item.product_id,
        order_id: order.id,
        // Só enviar IDs reais ao backend; fallback sintético quebra a API.
        order_item_id: realItemId,
        title: item.title || 'Produto',
        image_url: item.image_url,
        store_id: storeId,
        store_name: storeName,
        purchased_at: order.created_at,
      });
    }
  }

  products.sort((a, b) => Date.parse(b.purchased_at) - Date.parse(a.purchased_at));
  const stores = Array.from(storeMap.values()).sort(
    (a, b) => Date.parse(b.purchased_at) - Date.parse(a.purchased_at),
  );
  return { products, stores };
}

export default function AvaliacaoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ orderId?: string; productId?: string }>();
  const orderIdParam = useMemo(() => {
    const raw = Array.isArray(params.orderId) ? params.orderId[0] : params.orderId;
    return typeof raw === 'string' && raw.trim() ? raw.trim() : '';
  }, [params.orderId]);
  const productIdParam = useMemo(() => {
    const raw = Array.isArray(params.productId) ? params.productId[0] : params.productId;
    return typeof raw === 'string' && raw.trim() ? raw.trim() : '';
  }, [params.productId]);
  const { token, isLoggedIn, user, loading: authLoading } = useAuth();
  const { t } = useLocale();
  const { ui } = useAppTheme();
  const styles = useMemo(() => createStyles(ui), [ui]);

  const [tab, setTab] = useState<TabKey>('products');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<PurchasedProduct[]>([]);
  const [stores, setStores] = useState<PurchasedStore[]>([]);
  const [productReviews, setProductReviews] = useState<LocalProductReview[]>([]);
  const [storeReviews, setStoreReviews] = useState<LocalStoreReview[]>([]);

  const [draft, setDraft] = useState<ReviewDraftTarget | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const autoOpenedKey = useRef<string>('');

  const userName = useMemo(() => {
    if (!user) return 'Cliente';
    return `${user.nome || ''} ${user.apelido || ''}`.trim() || 'Cliente';
  }, [user]);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!token) {
        setLoading(false);
        return;
      }
      if (!opts?.silent) setLoading(true);
      setError(null);
      try {
        const [ordersRes, localProducts, localStores, remoteReviews] = await Promise.all([
          getMyOrders(token),
          getAllProductReviews(),
          getAllStoreReviews(),
          getMyReviews(token),
        ]);
        if (!ordersRes.success) {
          setError(ordersRes.message || t('review.loadError'));
          setProducts([]);
          setStores([]);
        } else {
          const collected = collectPurchased(ordersRes.data || []);
          setProducts(collected.products);
          setStores(collected.stores);
        }

        let mergedProducts = localProducts;
        let mergedStores = localStores;
        if (remoteReviews.success && remoteReviews.data) {
          for (const remote of remoteReviews.data.products || []) {
            if (!remote?.product_id) continue;
            await saveProductReview({
              id: remote.id,
              product_id: remote.product_id,
              order_id: remote.order_id || '',
              order_item_id: remote.order_item_id || '',
              store_id: remote.store_id || null,
              store_name: remote.store_name || 'Loja',
              product_title: remote.product_title || 'Produto',
              product_image: remote.product_image || null,
              user_name: remote.user_name || userName,
              user_avatar: remote.user_avatar || null,
              rating: remote.rating,
              comment: remote.comment ?? null,
              photo_uris: remote.photo_urls || [],
            });
          }
          for (const remote of remoteReviews.data.stores || []) {
            if (!remote?.store_id) continue;
            await saveStoreReview({
              id: remote.id,
              store_id: remote.store_id,
              store_name: remote.store_name || 'Loja',
              store_logo: remote.store_logo || null,
              order_id: remote.order_id || '',
              user_name: remote.user_name || userName,
              rating: remote.rating,
              comment: remote.comment ?? null,
              photo_uris: remote.photo_urls || [],
            });
          }
          mergedProducts = await getAllProductReviews();
          mergedStores = await getAllStoreReviews();
        }

        setProductReviews(mergedProducts);
        setStoreReviews(mergedStores);
      } catch {
        setError(t('review.loadError'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, t, userName],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const openProductDraft = useCallback((item: PurchasedProduct, reviews = productReviews) => {
    const existing = findLocalProductReview(reviews, item);
    setTab('products');
    setDraft({ kind: 'product', item, existing });
    setRating(existing?.rating || 0);
    setComment(existing?.comment || '');
    setPhotos(existing?.photo_uris || []);
  }, [productReviews]);

  useEffect(() => {
    if (loading || !products.length) return;
    if (!orderIdParam && !productIdParam) return;
    const key = `${orderIdParam}:${productIdParam}`;
    if (autoOpenedKey.current === key) return;

    const match =
      products.find(
        (p) =>
          (!!orderIdParam && !!productIdParam && p.order_id === orderIdParam && p.product_id === productIdParam)
          || (!!orderIdParam && !productIdParam && p.order_id === orderIdParam)
          || (!orderIdParam && !!productIdParam && p.product_id === productIdParam),
      ) || null;
    if (!match) return;
    autoOpenedKey.current = key;
    // Abrir o Modal só após a transição do stack — evita conflito de gestos no native-stack.
    const task = InteractionManager.runAfterInteractions(() => {
      openProductDraft(match);
    });
    return () => task.cancel();
  }, [loading, products, orderIdParam, productIdParam, openProductDraft]);

  const openStoreDraft = (item: PurchasedStore) => {
    const existing = storeReviews.find((r) => r.store_id === item.store_id) ?? null;
    setDraft({ kind: 'store', item, existing });
    setRating(existing?.rating || 0);
    setComment(existing?.comment || '');
    setPhotos(existing?.photo_uris || []);
  };

  const closeDraft = () => {
    setDraft(null);
    setRating(0);
    setComment('');
    setPhotos([]);
  };

  const pickPhotos = async () => {
    const remaining = 3 - photos.length;
    if (remaining <= 0) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('review.permPhotosTitle'), t('review.permPhotos'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;
    const compressed = await compressImagesForUpload(
      result.assets.map((a) => a.uri).slice(0, remaining),
    );
    setPhotos((prev) => [...prev, ...compressed].slice(0, 3));
  };

  const removePhoto = (uri: string) => {
    setPhotos((prev) => prev.filter((p) => p !== uri));
  };

  const submit = async () => {
    if (!draft || rating < 1) {
      Alert.alert(t('review.needStarsTitle'), t('review.needStars'));
      return;
    }
    if (!token) {
      Alert.alert(t('review.guestTitle'), t('review.guestSubtitle'));
      return;
    }
    setSaving(true);
    try {
      if (draft.kind === 'product') {
        const remote = await submitProductReview(token, {
          product_id: draft.item.product_id,
          order_id: draft.item.order_id,
          order_item_id: draft.item.order_item_id || undefined,
          rating,
          comment,
          user_avatar: user?.foto_url || null,
          photo_uris: photos,
        });
        if (!remote.success || !remote.data) {
          Alert.alert(t('review.saveFailTitle'), remote.message || t('review.saveFail'));
          return;
        }
        const saved = remote.data;
        const photoUrls = saved.photo_urls?.length ? saved.photo_urls : photos;
        await saveProductReview({
          id: saved.id,
          product_id: draft.item.product_id,
          order_id: draft.item.order_id,
          order_item_id: draft.item.order_item_id || saved.order_item_id || '',
          store_id: draft.item.store_id,
          store_name: draft.item.store_name,
          product_title: draft.item.title,
          product_image: draft.item.image_url,
          user_name: userName,
          user_avatar: user?.foto_url || null,
          rating: saved.rating || rating,
          comment: saved.comment ?? comment,
          photo_uris: photoUrls,
        });
        await invalidateApiCache(cacheKeyProduct(draft.item.product_id));
        await invalidateApiCache('live-products');
      } else {
        const remote = await submitStoreReview(token, {
          store_id: draft.item.store_id,
          order_id: draft.item.order_id,
          rating,
          comment,
          user_avatar: user?.foto_url || null,
          photo_uris: photos,
        });
        if (!remote.success || !remote.data) {
          Alert.alert(t('review.saveFailTitle'), remote.message || t('review.saveFail'));
          return;
        }
        const saved = remote.data;
        const photoUrls = saved.photo_urls?.length ? saved.photo_urls : photos;
        await saveStoreReview({
          id: saved.id,
          store_id: draft.item.store_id,
          store_name: draft.item.store_name,
          store_logo: draft.item.store_logo,
          order_id: draft.item.order_id,
          user_name: userName,
          rating: saved.rating || rating,
          comment: saved.comment ?? comment,
          photo_uris: photoUrls,
        });
        await invalidateApiCache(cacheKeyStore(draft.item.store_id));
        await invalidateApiCache('live-stores');
      }
      closeDraft();
      await load({ silent: true });
      Alert.alert(t('review.savedTitle'), t('review.savedMessage'));
    } catch {
      Alert.alert(t('review.saveFailTitle'), t('review.saveFail'));
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || (loading && isLoggedIn)) {
    return (
      <View style={[styles.root, styles.centered]}>
        <Stack.Screen options={{ headerShown: false }} />
        <RippleWaveLoader color={ui.brand} />
        <Text style={styles.muted}>{t('review.loading')}</Text>
      </View>
    );
  }

  if (!isLoggedIn || !token) {
    return (
      <View style={[styles.root, styles.centered, { paddingHorizontal: 28 }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Ionicons name="star-outline" size={48} color={STAR_GOLD} />
        <Text style={styles.emptyTitle}>{t('review.guestTitle')}</Text>
        <Text style={styles.muted}>{t('review.guestSubtitle')}</Text>
        <Pressable
          style={styles.primaryBtn}
          onPress={() => router.push({ pathname: '/login', params: { redirect: 'avaliacao' } })}
        >
          <Text style={styles.primaryBtnText}>{t('common.login')}</Text>
        </Pressable>
        <Pressable style={styles.ghostBtn} onPress={() => router.back()}>
          <Text style={styles.ghostBtnText}>{t('common.back')}</Text>
        </Pressable>
      </View>
    );
  }

  const isReavaliar = Boolean(draft?.existing);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={20} color={ui.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t('review.title')}</Text>
          <Text style={styles.headerSub}>{t('review.subtitle')}</Text>
        </View>
        <View style={styles.iconBtnSpacer} />
      </View>

      <View style={styles.tabs}>
        {([
          { key: 'products' as const, label: t('review.tabProducts') },
          { key: 'stores' as const, label: t('review.tabStores') },
        ]).map((item) => {
          const active = tab === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => setTab(item.key)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 28 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load({ silent: true });
            }}
            tintColor={ui.brand}
          />
        }
      >
        {error ? (
          <View style={styles.emptyCard}>
            <Ionicons name="cloud-offline-outline" size={36} color={ui.brand} />
            <Text style={styles.emptyTitle}>{t('review.loadError')}</Text>
            <Text style={styles.muted}>{error}</Text>
            <Pressable style={styles.primaryBtn} onPress={() => void load()}>
              <Text style={styles.primaryBtnText}>{t('common.tryAgain')}</Text>
            </Pressable>
          </View>
        ) : null}

        {!error && tab === 'products' && products.length === 0 ? (
          <Animated.View entering={FadeIn} style={styles.emptyCard}>
            <Ionicons name="cube-outline" size={40} color={STAR_GOLD} />
            <Text style={styles.emptyTitle}>{t('review.emptyProductsTitle')}</Text>
            <Text style={styles.muted}>{t('review.emptyProductsSubtitle')}</Text>
          </Animated.View>
        ) : null}

        {!error && tab === 'stores' && stores.length === 0 ? (
          <Animated.View entering={FadeIn} style={styles.emptyCard}>
            <Ionicons name="storefront-outline" size={40} color={STAR_GOLD} />
            <Text style={styles.emptyTitle}>{t('review.emptyStoresTitle')}</Text>
            <Text style={styles.muted}>{t('review.emptyStoresSubtitle')}</Text>
          </Animated.View>
        ) : null}

        {tab === 'products'
          ? products.map((item, index) => {
              const existing = findLocalProductReview(productReviews, item);
              return (
                <Animated.View
                  key={item.key}
                  entering={FadeInDown.delay(Math.min(index, 8) * 40)}
                >
                  <Pressable
                    style={styles.card}
                    onPress={() => openProductDraft(item)}
                  >
                    <Image
                      source={{
                        uri:
                          item.image_url
                          || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=200',
                      }}
                      style={styles.thumb}
                      contentFit="cover"
                    />
                    <View style={styles.cardBody}>
                      <Text style={styles.cardTitle} numberOfLines={2}>
                        {item.title}
                      </Text>
                      <Text style={styles.cardMeta} numberOfLines={1}>
                        {item.store_name}
                      </Text>
                      {existing ? (
                        <View style={styles.ratedRow}>
                          <StarRating value={existing.rating} size={14} gap={2} />
                          <Text style={styles.ratedLabel}>{t('review.rated')}</Text>
                        </View>
                      ) : (
                        <Text style={styles.pendingLabel}>{t('review.pending')}</Text>
                      )}
                    </View>
                    <View style={styles.ctaCol}>
                      <Text style={styles.ctaText}>
                        {existing ? t('review.reavaliar') : t('review.avaliar')}
                      </Text>
                      <Ionicons name="chevron-forward" size={16} color={STAR_GOLD} />
                    </View>
                  </Pressable>
                </Animated.View>
              );
            })
          : null}

        {tab === 'stores'
          ? stores.map((item, index) => {
              const existing = storeReviews.find((r) => r.store_id === item.store_id);
              return (
                <Animated.View
                  key={item.key}
                  entering={FadeInDown.delay(Math.min(index, 8) * 40)}
                >
                  <Pressable style={styles.card} onPress={() => openStoreDraft(item)}>
                    <View style={styles.storeThumb}>
                      <Ionicons name="storefront" size={22} color={STAR_GOLD} />
                    </View>
                    <View style={styles.cardBody}>
                      <Text style={styles.cardTitle} numberOfLines={2}>
                        {item.store_name}
                      </Text>
                      <Text style={styles.cardMeta}>{t('review.storeHint')}</Text>
                      {existing ? (
                        <View style={styles.ratedRow}>
                          <StarRating value={existing.rating} size={14} gap={2} />
                          <Text style={styles.ratedLabel}>{t('review.rated')}</Text>
                        </View>
                      ) : (
                        <Text style={styles.pendingLabel}>{t('review.pending')}</Text>
                      )}
                    </View>
                    <View style={styles.ctaCol}>
                      <Text style={styles.ctaText}>
                        {existing ? t('review.reavaliar') : t('review.avaliar')}
                      </Text>
                      <Ionicons name="chevron-forward" size={16} color={STAR_GOLD} />
                    </View>
                  </Pressable>
                </Animated.View>
              );
            })
          : null}
      </ScrollView>

      <Modal
        visible={Boolean(draft)}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => {
          if (!saving) closeDraft();
        }}
      >
        <View style={[styles.modalRoot, { paddingTop: insets.top + 8 }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => { if (!saving) closeDraft(); }} hitSlop={10}>
              <Text style={styles.modalCancel}>{t('common.cancel')}</Text>
            </Pressable>
            <Text style={styles.modalTitle}>
              {isReavaliar ? t('review.reavaliar') : t('review.avaliar')}
            </Text>
            <Pressable onPress={() => void submit()} disabled={saving} hitSlop={10}>
              <Text style={[styles.modalSave, saving && { opacity: 0.5 }]}>
                {saving ? t('review.saving') : t('review.publish')}
              </Text>
            </Pressable>
          </View>

          <KeyboardFormScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 40 }}
          >
            {draft?.kind === 'product' ? (
              <View style={styles.modalSubject}>
                <Image
                  source={{
                    uri:
                      draft.item.image_url
                      || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=200',
                  }}
                  style={styles.modalThumb}
                  contentFit="cover"
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalSubjectTitle} numberOfLines={2}>
                    {draft.item.title}
                  </Text>
                  <Text style={styles.cardMeta}>{draft.item.store_name}</Text>
                </View>
              </View>
            ) : draft?.kind === 'store' ? (
              <View style={styles.modalSubject}>
                <View style={styles.storeThumbLarge}>
                  <Ionicons name="storefront" size={28} color={STAR_GOLD} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalSubjectTitle} numberOfLines={2}>
                    {draft.item.store_name}
                  </Text>
                  <Text style={styles.cardMeta}>{t('review.storeHint')}</Text>
                </View>
              </View>
            ) : null}

            <Text style={styles.fieldLabel}>{t('review.yourRating')}</Text>
            <View style={styles.starsWrap}>
              <StarRating
                value={rating}
                size={36}
                gap={10}
                interactive
                onChange={setRating}
              />
              {rating > 0 ? (
                <Text style={styles.ratingHint}>
                  {rating}/5
                </Text>
              ) : (
                <Text style={styles.ratingHint}>{t('review.tapStars')}</Text>
              )}
            </View>

            <Text style={styles.fieldLabel}>
              {t('review.comment')}{' '}
              <Text style={styles.optional}>{t('review.optional')}</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={comment}
              onChangeText={setComment}
              placeholder={t('review.commentPlaceholder')}
              placeholderTextColor={ui.muted}
              multiline
              maxLength={800}
              textAlignVertical="top"
            />

            <Text style={styles.fieldLabel}>
              {t('review.photos')}{' '}
              <Text style={styles.optional}>{t('review.optional')} · {photos.length}/3</Text>
            </Text>
            <View style={styles.photosRow}>
              {photos.map((uri) => (
                <View key={uri} style={styles.photoSlot}>
                  <Image source={{ uri }} style={styles.photo} contentFit="cover" />
                  <Pressable style={styles.photoRemove} onPress={() => removePhoto(uri)}>
                    <Ionicons name="close" size={14} color="#fff" />
                  </Pressable>
                </View>
              ))}
              {photos.length < 3 ? (
                <Pressable style={styles.photoAdd} onPress={() => void pickPhotos()}>
                  <Ionicons name="camera-outline" size={22} color={STAR_GOLD} />
                  <Text style={styles.photoAddText}>{t('review.addPhoto')}</Text>
                </Pressable>
              ) : null}
            </View>
          </KeyboardFormScrollView>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(ui: AppUI) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: ui.bg },
    centered: { alignItems: 'center', justifyContent: 'center', gap: 10 },
    muted: { fontSize: 13, color: ui.muted, textAlign: 'center', lineHeight: 19 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingBottom: 10,
      gap: 8,
    },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: ui.elevated,
      borderWidth: 1,
      borderColor: ui.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconBtnSpacer: { width: 40 },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '800', color: ui.text, letterSpacing: 0.2 },
    headerSub: { fontSize: 11, color: ui.muted, marginTop: 2 },
    tabs: {
      flexDirection: 'row',
      marginHorizontal: 16,
      marginBottom: 14,
      padding: 4,
      borderRadius: 14,
      backgroundColor: ui.elevated,
      borderWidth: 1,
      borderColor: ui.border,
    },
    tab: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 11,
      alignItems: 'center',
    },
    tabActive: { backgroundColor: ui.card },
    tabText: { fontSize: 13, fontWeight: '600', color: ui.muted },
    tabTextActive: { color: ui.text, fontWeight: '800' },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      marginBottom: 10,
      borderRadius: 16,
      backgroundColor: ui.card,
      borderWidth: 1,
      borderColor: ui.border,
    },
    thumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: ui.input },
    storeThumb: {
      width: 64,
      height: 64,
      borderRadius: 12,
      backgroundColor: ui.input,
      alignItems: 'center',
      justifyContent: 'center',
    },
    storeThumbLarge: {
      width: 56,
      height: 56,
      borderRadius: 14,
      backgroundColor: ui.input,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardBody: { flex: 1, gap: 3 },
    cardTitle: { fontSize: 14, fontWeight: '700', color: ui.text, lineHeight: 19 },
    cardMeta: { fontSize: 12, color: ui.muted },
    ratedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    ratedLabel: { fontSize: 11, color: STAR_GOLD, fontWeight: '700' },
    pendingLabel: { fontSize: 11, color: ui.brand, fontWeight: '700', marginTop: 4 },
    ctaCol: { alignItems: 'flex-end', gap: 4 },
    ctaText: { fontSize: 12, fontWeight: '800', color: STAR_GOLD },
    emptyCard: {
      alignItems: 'center',
      gap: 8,
      paddingVertical: 40,
      paddingHorizontal: 20,
      marginTop: 24,
      borderRadius: 18,
      backgroundColor: ui.card,
      borderWidth: 1,
      borderColor: ui.border,
    },
    emptyTitle: { fontSize: 16, fontWeight: '800', color: ui.text, textAlign: 'center' },
    primaryBtn: {
      marginTop: 10,
      paddingHorizontal: 22,
      paddingVertical: 12,
      borderRadius: 999,
      backgroundColor: ui.brand,
    },
    primaryBtnText: { color: ui.onBrand, fontWeight: '800', fontSize: 14 },
    ghostBtn: { marginTop: 6, padding: 10 },
    ghostBtnText: { color: ui.muted, fontWeight: '600' },
    modalRoot: { flex: 1, backgroundColor: ui.bg },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: ui.border,
    },
    modalCancel: { fontSize: 15, color: ui.muted, fontWeight: '600', minWidth: 70 },
    modalTitle: { fontSize: 16, fontWeight: '800', color: ui.text },
    modalSave: { fontSize: 15, color: STAR_GOLD, fontWeight: '800', minWidth: 70, textAlign: 'right' },
    modalSubject: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'center',
      marginBottom: 22,
      padding: 12,
      borderRadius: 16,
      backgroundColor: ui.card,
      borderWidth: 1,
      borderColor: ui.border,
    },
    modalThumb: { width: 56, height: 56, borderRadius: 12, backgroundColor: ui.input },
    modalSubjectTitle: { fontSize: 15, fontWeight: '800', color: ui.text, marginBottom: 4 },
    fieldLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: ui.text,
      marginBottom: 10,
      marginTop: 6,
    },
    optional: { fontWeight: '500', color: ui.muted },
    starsWrap: {
      alignItems: 'center',
      gap: 12,
      paddingVertical: 18,
      marginBottom: 12,
      borderRadius: 18,
      backgroundColor: ui.elevated,
      borderWidth: 1,
      borderColor: ui.border,
    },
    ratingHint: { fontSize: 13, color: ui.muted, fontWeight: '600' },
    input: {
      minHeight: 110,
      borderRadius: 14,
      padding: 14,
      backgroundColor: ui.input,
      borderWidth: 1,
      borderColor: ui.border,
      color: ui.text,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 16,
    },
    photosRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    photoSlot: {
      width: 88,
      height: 88,
      borderRadius: 14,
      overflow: 'hidden',
      backgroundColor: ui.input,
    },
    photo: { width: '100%', height: '100%' },
    photoRemove: {
      position: 'absolute',
      top: 6,
      right: 6,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    photoAdd: {
      width: 88,
      height: 88,
      borderRadius: 14,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: STAR_GOLD,
      backgroundColor: ui.input,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    photoAddText: { fontSize: 10, color: STAR_GOLD, fontWeight: '700' },
  });
}
