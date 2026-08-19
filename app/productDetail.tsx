import { cacheKeyProduct, invalidateApiCache, peekCache, setCacheValue } from '@/components/apiCache';
import { useAuth } from '@/components/AuthContext';
import { FollowStoreButton } from '@/components/FollowStoreButton';
import { useLocale } from '@/components/LocaleContext';
import { PulsatingDots } from '@/components/PulsatingDots';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import { StarRating } from '@/components/StarRating';
import { useAppTheme } from '@/components/tema';
import { HomeDesktopHeader } from '@/components/home/HomeDesktopHeader';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { getCartJson, setCartJson, setCheckoutDraftJson } from '@/lib/cartStorage';
import { optimizedImageUrl } from '@/lib/imageOptimization';
import { mergeProductReviews } from '@/lib/localReviews';
import {
    isProductFavorite,
    subscribeProductFavorites,
    toFavProduct,
    toggleProductFavorite,
} from '@/lib/productFavorites';
import { createPublicUrl } from '@/lib/publicUrl';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    Dimensions,
    FlatList,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    Share,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import {
    Gesture,
    GestureDetector,
    GestureHandlerRootView,
    FlatList as GHFlatList,
} from 'react-native-gesture-handler';
import Reanimated, {
    Extrapolation,
    interpolate,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    getProductById,
    getStoreById,
    Product,
    ProductVariantCombination,
    syncCartToServer,
    trackUserActivity,
} from '../components/api';

const { width: WINDOW_WIDTH_FALLBACK, height: SCREEN_HEIGHT_FALLBACK } = Dimensions.get('window');
const REVIEW_CARD_WIDTH_FALLBACK = Math.min(280, WINDOW_WIDTH_FALLBACK * 0.72);
const IMAGE_PAD = 12;
const THUMB_SIZE = 58;
const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800';

/** iOS: zoom nativo via ScrollView (fluido + não bloqueia o pager). */
function IOSZoomImage({
  uri,
  boxWidth,
  boxHeight,
  onZoomActiveChange,
}: {
  uri: string;
  boxWidth: number;
  boxHeight: number;
  onZoomActiveChange?: (active: boolean) => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  const lastZoomed = useRef(false);

  const reportZoom = (zoomScale: number) => {
    const active = zoomScale > 1.01;
    if (active === lastZoomed.current) return;
    lastZoomed.current = active;
    setZoomed(active);
    onZoomActiveChange?.(active);
  };

  return (
    <ScrollView
      style={{ width: boxWidth, height: boxHeight }}
      contentContainerStyle={{
        width: boxWidth,
        height: boxHeight,
        justifyContent: 'center',
        alignItems: 'center',
      }}
      maximumZoomScale={4}
      minimumZoomScale={1}
      // Com zoomScale=1 o scroll interno fica off → o pager horizontal recebe o swipe.
      scrollEnabled={zoomed}
      centerContent
      bouncesZoom
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={(e) => {
        reportZoom(e.nativeEvent.zoomScale ?? 1);
      }}
      onScrollEndDrag={(e) => {
        reportZoom(e.nativeEvent.zoomScale ?? 1);
      }}
      onMomentumScrollEnd={(e) => {
        reportZoom(e.nativeEvent.zoomScale ?? 1);
      }}
    >
      <Image
        source={{ uri }}
        style={{ width: boxWidth, height: boxHeight }}
        contentFit="contain"
        cachePolicy="memory-disk"
      />
    </ScrollView>
  );
}

/**
 * Android: pinça + duplo toque.
 * Pan só ativa com zoom — senão o gesto falha e o pager horizontal recebe o swipe.
 */
function AndroidZoomImage({
  uri,
  boxWidth,
  boxHeight,
  onZoomActiveChange,
  pagerGesture,
}: {
  uri: string;
  boxWidth: number;
  boxHeight: number;
  onZoomActiveChange?: (active: boolean) => void;
  pagerGesture?: ReturnType<typeof Gesture.Native>;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const startScale = useSharedValue(1);

  const notifyZoom = (active: boolean) => {
    onZoomActiveChange?.(active);
  };

  const clampTranslation = (nextScale: number, x: number, y: number) => {
    'worklet';
    const maxX = Math.max(0, ((nextScale - 1) * boxWidth) / 2);
    const maxY = Math.max(0, ((nextScale - 1) * boxHeight) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
  };

  const snapToScale = (nextScale: number) => {
    'worklet';
    const clamped = Math.min(4, Math.max(1, nextScale));
    const pan = clampTranslation(clamped, translateX.value, translateY.value);
    scale.value = withTiming(clamped, { duration: 160 });
    translateX.value = withTiming(pan.x, { duration: 160 });
    translateY.value = withTiming(pan.y, { duration: 160 });
    savedScale.value = clamped;
    savedX.value = pan.x;
    savedY.value = pan.y;
    runOnJS(notifyZoom)(clamped > 1.02);
  };

  const pinch = Gesture.Pinch()
    .onBegin(() => {
      startScale.value = savedScale.value;
    })
    .onUpdate((event) => {
      const next = Math.min(4, Math.max(1, startScale.value * event.scale));
      const focalX = event.focalX - boxWidth / 2;
      const focalY = event.focalY - boxHeight / 2;
      const ratio = next / startScale.value;
      const dx = (focalX - savedX.value) * (1 - ratio);
      const dy = (focalY - savedY.value) * (1 - ratio);
      const pan = clampTranslation(next, savedX.value + dx, savedY.value + dy);
      scale.value = next;
      translateX.value = pan.x;
      translateY.value = pan.y;
    })
    .onEnd(() => {
      if (scale.value < 1.05) {
        snapToScale(1);
      } else {
        savedScale.value = scale.value;
        const pan = clampTranslation(scale.value, translateX.value, translateY.value);
        translateX.value = pan.x;
        translateY.value = pan.y;
        savedX.value = pan.x;
        savedY.value = pan.y;
        runOnJS(notifyZoom)(true);
      }
    });

  const panZoom = Gesture.Pan()
    .maxPointers(1)
    .manualActivation(true)
    .onTouchesMove((_, state) => {
      if (savedScale.value > 1.02) {
        state.activate();
      } else {
        state.fail();
      }
    })
    .onUpdate((event) => {
      const pan = clampTranslation(
        scale.value,
        savedX.value + event.translationX,
        savedY.value + event.translationY,
      );
      translateX.value = pan.x;
      translateY.value = pan.y;
    })
    .onEnd(() => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(280)
    .maxDistance(12)
    .onEnd((event) => {
      if (savedScale.value > 1.05) {
        snapToScale(1);
        return;
      }
      const target = 2.5;
      const fx = event.x - boxWidth / 2;
      const fy = event.y - boxHeight / 2;
      translateX.value = -fx * (target - 1);
      translateY.value = -fy * (target - 1);
      snapToScale(target);
    });

  if (pagerGesture) {
    pinch.simultaneousWithExternalGesture(pagerGesture);
    panZoom.simultaneousWithExternalGesture(pagerGesture);
    doubleTap.simultaneousWithExternalGesture(pagerGesture);
  }

  // Sem pan de dismiss aqui — liberta o swipe horizontal para o pager.
  const composed = Gesture.Simultaneous(pinch, panZoom, doubleTap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Reanimated.View
        collapsable={false}
        style={[
          { width: boxWidth, height: boxHeight, justifyContent: 'center', alignItems: 'center' },
          animatedStyle,
        ]}
      >
        <Image
          source={{ uri }}
          style={{ width: boxWidth, height: boxHeight }}
          contentFit="contain"
          cachePolicy="memory-disk"
        />
      </Reanimated.View>
    </GestureDetector>
  );
}

function ZoomableImage({
  pagerGesture,
  ...props
}: {
  uri: string;
  boxWidth: number;
  boxHeight: number;
  onZoomActiveChange?: (active: boolean) => void;
  pagerGesture?: ReturnType<typeof Gesture.Native>;
}) {
  if (Platform.OS === 'ios') {
    return <IOSZoomImage {...props} />;
  }
  return <AndroidZoomImage {...props} pagerGesture={pagerGesture} />;
}

type DetailPalette = {
  mist: string;
  soft: string;
  white: string;
  ink: string;
  muted: string;
  accent: string;
  accentDeep: string;
  gold: string;
  goldLite: string;
  goldBright: string;
  goldDeep: string;
  buyGreen: string;
  graySoft: string;
  line: string;
};

interface CartItem {
  id: string;
  title: string;
  price: number;
  image: string;
  quantity: number;
  selected: boolean;
  productId?: string;
  variantId?: string;
  variantLabel?: string;
  maxStock?: number;
  storeId?: string;
  storeName?: string;
  storeLogo?: string;
  storeCover?: string;
  storeVerified?: boolean;
}

function parseCartItems(raw: string | null): CartItem[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? (value as CartItem[]) : [];
  } catch {
    return [];
  }
}

function BuyNowButton({
  disabled,
  loading,
  label,
  onPress,
  styles,
  ink,
  isDark,
}: {
  disabled: boolean;
  loading: boolean;
  label: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  ink: string;
  isDark: boolean;
}) {
  const textColor = isDark ? '#000000' : ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.buyBtn,
        (disabled || loading) && styles.buyBtnDisabled,
        pressed && !disabled && styles.buyBtnPressed,
      ]}
    >
      {loading ? (
        <RippleWaveLoader size="small" color={textColor} />
      ) : (
        <Text style={styles.buyBtnText}>{label}</Text>
      )}
    </Pressable>
  );
}

export default function ProductDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const { ui, colors, isDark } = useAppTheme();
  const layout = useBreakpoint();
  const { isDesktop, width: rawWinWidth, height: winHeight, contentMax } = layout;
  // No web o width pode começar a 0 antes do layout — largura negativa rebenta a galeria.
  const winWidth = Math.max(rawWinWidth || 0, WINDOW_WIDTH_FALLBACK || 390);
  const SCREEN_HEIGHT = Math.max(winHeight || 0, SCREEN_HEIGHT_FALLBACK || 700);
  const imageWidth = isDesktop
    ? Math.min(440, Math.round(Math.min(winWidth, contentMax) * 0.4))
    : Math.round((winWidth - IMAGE_PAD * 2) * 0.95);
  const imageHeight = isDesktop
    ? Math.round(imageWidth * 1.12)
    : Math.round(imageWidth * 1.35);
  const REVIEW_CARD_WIDTH = Math.min(280, winWidth * 0.72);
  const C = useMemo<DetailPalette>(() => ({
    mist: ui.bg,
    soft: ui.bg,
    white: ui.card,
    ink: ui.text,
    muted: ui.muted,
    accent: colors.accent,
    accentDeep: colors.accent,
    gold: '#D4A017',
    goldLite: '#FFE8A3',
    goldBright: '#FFD700',
    goldDeep: '#B8860B',
    buyGreen: '#7DDB8A',
    graySoft: ui.input,
    line: ui.border,
  }), [ui, colors.accent]);
  const styles = useMemo(
    () => createStyles(C, isDark, {
      imageWidth,
      imageHeight,
      isDesktop,
      screenHeight: SCREEN_HEIGHT,
      screenWidth: winWidth || WINDOW_WIDTH_FALLBACK,
      reviewCardWidth: REVIEW_CARD_WIDTH,
    }),
    [C, isDark, imageWidth, imageHeight, isDesktop, SCREEN_HEIGHT, winWidth, REVIEW_CARD_WIDTH],
  );
  const { isLoggedIn, token } = useAuth();
  const params = useLocalSearchParams();
  const [adding, setAdding] = useState(false);
  const [buying, setBuying] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryZoomed, setGalleryZoomed] = useState(false);
  const [reviewPhotoViewer, setReviewPhotoViewer] = useState<{
    uris: string[];
    index: number;
  } | null>(null);
  const gallerySheetY = useSharedValue(SCREEN_HEIGHT);
  const galleryZoomedSV = useSharedValue(false);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [isFavorite, setIsFavorite] = useState(false);
  const [cartQuantity, setCartQuantity] = useState(0);
  const productId = (() => {
    const raw = params.id ?? params.productId;
    if (Array.isArray(raw)) return raw[0];
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        return new URLSearchParams(window.location.search).get('id') || undefined;
      } catch {
        return undefined;
      }
    }
    return undefined;
  })();

  const mainGalleryRef = useRef<FlatList<string>>(null);
  const modalGalleryRef = useRef<any>(null);
  const thumbListRef = useRef<FlatList<string>>(null);
  const viewedRef = useRef<string | null>(null);
  const suppressParamLoadRef = useRef(false);
  const switchTokenRef = useRef(0);
  const contentOpacity = useRef(new Animated.Value(1)).current;

  // Lista/home aquece o cache sem specifications/variants/reviews/group.
  // Só consideramos completo o payload enriquecido do GET /api/products/:id.
  const isProductDetailComplete = (p: Product) =>
    Array.isArray(p.specifications)
    && p.variants != null
    && p.reviews != null
    && Object.prototype.hasOwnProperty.call(p, 'group');

  const syncGroupIntoSiblingCaches = async (liveProduct: Product) => {
    const group = liveProduct.group;
    if (!group?.members || group.members.length < 2) return;

    await Promise.all(
      group.members.map(async (member) => {
        const key = cacheKeyProduct(member.id);
        const existing = await peekCache<Product>(key);
        if (!existing) {
          // Guarda um stub mínimo para a miniatura não abrir “sem grupo”.
          await setCacheValue(key, {
            id: member.id,
            titulo: member.titulo,
            preco: member.preco,
            preco_gpay: member.preco,
            image_url: member.image_url,
            stock: member.stock,
            group_id: group.id,
            group_label: member.group_label,
            group,
            specifications: [],
            variants: { dimensions: [], combinations: [] },
            reviews: { items: [], average: 0, count: 0 },
          } as Product);
          return;
        }
        await setCacheValue(key, {
          ...existing,
          group_id: group.id,
          group,
        });
      }),
    );
  };

  const mergeStoreLogo = async (liveProduct: Product): Promise<Product> => {
    const storeId = liveProduct.store_id || liveProduct.store?.id;
    if (!storeId || liveProduct.store?.logo_url) return liveProduct;
    const store = await getStoreById(storeId);
    if (!store) return liveProduct;
    return {
      ...liveProduct,
      store: {
        id: store.id,
        name: liveProduct.store?.name || store.name,
        slug: liveProduct.store?.slug || store.slug,
        logo_url: store.logo_url,
        cover_url: store.cover_url || liveProduct.store?.cover_url,
        rating_avg: liveProduct.store?.rating_avg ?? store.rating_avg,
        review_count: liveProduct.store?.review_count ?? store.review_count,
        verified: liveProduct.store?.verified ?? store.verified,
      },
    };
  };

  const applyProduct = (next: Product, previousGroup?: Product['group']) => {
    const withGroup =
      next.group?.members && next.group.members.length > 1
        ? next
        : previousGroup?.members && previousGroup.members.length > 1
          ? { ...next, group: previousGroup }
          : next;
    setProduct(withGroup);
    setSelectedOptions({});
    setActiveImage(0);
    requestAnimationFrame(() => {
      try {
        mainGalleryRef.current?.scrollToOffset({ offset: 0, animated: false });
      } catch {
        // layout may not be ready
      }
    });
    void mergeProductReviews(withGroup.id, withGroup.reviews).then((reviews) => {
      setProduct((prev) => (prev?.id === withGroup.id ? { ...prev, reviews } : prev));
    });
  };

  const loadProduct = async (
    opts?: { forceNetwork?: boolean; silent?: boolean; targetId?: string },
  ) => {
    const targetId = opts?.targetId || (typeof productId === 'string' ? productId : undefined);
    if (!targetId) {
      setLoadError(true);
      setLoading(false);
      return;
    }

    setLoadError(false);

    const forceNetwork = Boolean(opts?.forceNetwork);
    const cached = forceNetwork ? undefined : await peekCache<Product>(cacheKeyProduct(targetId));
    if (cached) {
      applyProduct(cached, product?.group);
      setLoading(false);
    } else if (!opts?.silent) {
      setLoading(true);
    }

    const incomplete = Boolean(
      cached
      && (
        !isProductDetailComplete(cached)
        || (Boolean(cached.group_id) && !(cached.group?.members && cached.group.members.length > 1))
      ),
    );
    let liveProduct = await getProductById(targetId, {
      forceRefresh: Boolean(forceNetwork || incomplete || !cached),
    });

    if (liveProduct) {
      liveProduct = await mergeStoreLogo(liveProduct);
      applyProduct(liveProduct, product?.group);
      void syncGroupIntoSiblingCaches(liveProduct);
    } else if (!cached) {
      setProduct(null);
    }

    setLoadError(!liveProduct && !cached);
    setLoading(false);

    if (liveProduct && viewedRef.current !== targetId) {
      viewedRef.current = targetId;
      const fromRaw = params.from;
      const source = Array.isArray(fromRaw) ? fromRaw[0] : typeof fromRaw === 'string' ? fromRaw : 'direct';
      void import('@/lib/analytics').then(({ trackAnalytics }) => {
        trackAnalytics('product_view', {
          productId: targetId,
          categoryId: liveProduct?.category?.id,
          sellerId: liveProduct?.store_id || liveProduct?.store?.id,
          source,
        });
      });
      void trackUserActivity(token, {
        action: 'view_product',
        productId: targetId,
        categoryId: liveProduct.category?.id,
        storeId: liveProduct.store_id || liveProduct.store?.id,
      });
    }
  };

  const switchGroupMember = async (nextId: string) => {
    if (!nextId || nextId === product?.id) return;

    const switchToken = ++switchTokenRef.current;
    const previousGroup = product?.group;
    suppressParamLoadRef.current = true;
    router.setParams({ id: nextId });

    const cached = await peekCache<Product>(cacheKeyProduct(nextId));
    if (switchToken !== switchTokenRef.current) return;

    // Troca imediata com cache — sem “piscar” de página.
    if (cached) {
      const ready = isProductDetailComplete(cached)
        ? await mergeStoreLogo(cached)
        : cached;
      if (switchToken !== switchTokenRef.current) return;
      applyProduct(ready, previousGroup);
      contentOpacity.setValue(1);
    } else {
      Animated.timing(contentOpacity, {
        toValue: 0.88,
        duration: 50,
        useNativeDriver: true,
      }).start();
    }

    const incomplete = Boolean(cached && !isProductDetailComplete(cached));
    let liveProduct = await getProductById(nextId, {
      forceRefresh: !cached || incomplete,
    });
    if (switchToken !== switchTokenRef.current) return;

    if (liveProduct) {
      liveProduct = await mergeStoreLogo(liveProduct);
      applyProduct(liveProduct, previousGroup);
      void syncGroupIntoSiblingCaches(liveProduct);
      if (viewedRef.current !== nextId) {
        viewedRef.current = nextId;
        void trackUserActivity(token, {
          action: 'view_product',
          productId: nextId,
          categoryId: liveProduct.category?.id,
          storeId: liveProduct.store_id || liveProduct.store?.id,
        });
        void import('@/lib/analytics').then(({ trackAnalytics }) => {
          trackAnalytics('product_view', {
            productId: nextId,
            categoryId: liveProduct?.category?.id,
            sellerId: liveProduct?.store_id || liveProduct?.store?.id,
            source: 'related',
          });
        });
      }
    }

    void isProductFavorite(nextId).then((fav) => {
      if (switchToken === switchTokenRef.current) setIsFavorite(fav);
    }).catch(() => {});

    Animated.timing(contentOpacity, {
      toValue: 1,
      duration: 110,
      useNativeDriver: true,
    }).start();
  };

  const productRef = useRef(product);
  productRef.current = product;

  const onRefresh = useCallback(async () => {
    const targetId = typeof productId === 'string' ? productId : undefined;
    if (!targetId) return;

    setRefreshing(true);
    const started = Date.now();
    try {
      await invalidateApiCache(cacheKeyProduct(targetId));
      await invalidateApiCache('live-products');
      await loadProduct({ forceNetwork: true, silent: true, targetId });
    } finally {
      const elapsed = Date.now() - started;
      if (elapsed < 600) {
        await new Promise((resolve) => setTimeout(resolve, 600 - elapsed));
      }
      setRefreshing(false);
    }
  }, [productId]);

  useEffect(() => {
    if (suppressParamLoadRef.current) {
      suppressParamLoadRef.current = false;
      return;
    }
    // Sempre revalida na abertura para não ficar com cache antigo sem grupo.
    void loadProduct({ forceNetwork: true });
  }, [productId]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const id = typeof productId === 'string' ? productId : undefined;
      if (!id) return;

      void (async () => {
        await invalidateApiCache(cacheKeyProduct(id));
        const live = await getProductById(id, { forceRefresh: true });
        if (cancelled || !live) return;
        const withLogo = await mergeStoreLogo(live);
        if (cancelled) return;
        const reviews = await mergeProductReviews(id, withLogo.reviews);
        if (cancelled) return;
        setProduct((prev) => (
          prev?.id === id
            ? { ...withLogo, reviews }
            : prev
        ));
      })();

      return () => {
        cancelled = true;
      };
    }, [productId]),
  );

  // Pré-carrega os irmãos do grupo para troca instantânea nas miniaturas.
  useEffect(() => {
    const members = product?.group?.members;
    if (!members || members.length < 2) return;
    members.forEach((member) => {
      if (member.id === product.id) return;
      void getProductById(member.id);
    });
  }, [product?.group?.id, product?.id]);

  useEffect(() => {
    if (!productId) return;
    void isProductFavorite(String(productId)).then(setIsFavorite).catch(() => setIsFavorite(false));
  }, [productId]);

  useEffect(() => {
    if (!productId) return;
    return subscribeProductFavorites((products) => {
      setIsFavorite(products.some((p) => p.id === productId));
    });
  }, [productId]);

  const toggleFavorite = async () => {
    if (!productId || !product) return;
    try {
      const removing = isFavorite;
      setIsFavorite(!removing);
      const result = await toggleProductFavorite(toFavProduct(product));
      setIsFavorite(result.isFavorite);
      void trackUserActivity(token, {
        action: removing ? 'remove_favorite' : 'add_favorite',
        productId: product.id,
        categoryId: product.category?.id,
        storeId: product.store_id || product.store?.id,
      });
      void import('@/lib/analytics').then(({ trackAnalytics }) => {
        trackAnalytics(removing ? 'product_unfavorite' : 'product_favorite', {
          productId: product.id,
          categoryId: product.category?.id,
          sellerId: product.store_id || product.store?.id,
          source: 'product',
        });
      });
    } catch (error) {
      console.log('Erro ao atualizar favorito:', error);
      setIsFavorite((prev) => !prev);
    }
  };

  const handleShareProduct = async () => {
    if (!product || !productId) return;
    const url = createPublicUrl('/productDetail', { id: productId });
    try {
      await Share.share({
        title: product.titulo,
        // https:// is required for WhatsApp/SMS to show a tappable link
        message: `${product.titulo}\n${url}`,
        url,
      });
      void trackUserActivity(token, {
        action: 'share',
        productId,
        categoryId: product.category?.id,
        storeId: product.store_id || product.store?.id,
      });
      void import('@/lib/analytics').then(({ trackAnalytics }) => {
        trackAnalytics('share', {
          productId,
          categoryId: product.category?.id,
          sellerId: product.store_id || product.store?.id,
          source: 'product',
        });
      });
    } catch (error) {
      console.log('Erro ao partilhar produto:', error);
    }
  };

  const dimensions = product?.variants?.dimensions || [];
  const apiCombinations = product?.variants?.combinations || [];
  const combinations: ProductVariantCombination[] =
    apiCombinations.length > 0
      ? apiCombinations
      : product
        ? [
            {
              id: `legacy-${product.id}`,
              product_id: product.id,
              sku: product.id,
              option_values: {},
              preco: product.preco,
              preco_gpay: product.preco_gpay,
              stock: product.stock,
              image_url: product.image_url,
              is_default: true,
              legacy: true,
            },
          ]
        : [];
  const isVirtualProduct = dimensions.length === 0 && combinations.length === 1;
  const selectionComplete = dimensions.every((dimension) => Boolean(selectedOptions[dimension.key]));
  const selectedCombination = isVirtualProduct
    ? combinations[0]
    : selectionComplete
      ? combinations.find((combination) =>
          dimensions.every(
            (dimension) => combination.option_values[dimension.key] === selectedOptions[dimension.key]
          )
        )
      : undefined;

  const galleryImages = product
    ? [
        ...(product.image_urls?.filter((image) => typeof image === 'string' && image.trim().length > 0) || []),
        ...(product.images?.filter((image) => typeof image === 'string' && image.trim().length > 0) || []),
        ...(!product.image_urls?.length && product.image_url ? [product.image_url] : []),
      ]
    : [];
  const displayImages = Array.from(
    new Set([...(selectedCombination?.image_url ? [selectedCombination.image_url] : []), ...galleryImages])
  );
  if (displayImages.length === 0) displayImages.push(FALLBACK_IMAGE);
  const coverImage = displayImages[0];
  const displayRegularPrice = selectedCombination?.preco ?? product?.preco ?? 0;
  const displayGpayPrice = selectedCombination?.preco_gpay ?? product?.preco_gpay ?? 0;
  const displayStock = selectedCombination?.stock ?? product?.stock ?? 0;
  const canAddToCart = Boolean(selectedCombination && selectionComplete && selectedCombination.stock > 0);
  const dockHeight = 88 + Math.max(insets.bottom, 10);

  useEffect(() => {
    setActiveImage(0);
  }, [selectedCombination?.image_url]);

  const scrollThumbTo = (index: number) => {
    if (displayImages.length <= 1) return;
    try {
      thumbListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    } catch {
      // ignore until layout is ready
    }
  };

  const goToImage = (index: number, animate = true) => {
    const safeIndex = Math.max(0, Math.min(index, displayImages.length - 1));
    setActiveImage(safeIndex);
    mainGalleryRef.current?.scrollToOffset({
      offset: safeIndex * imageWidth,
      animated: animate,
    });
    modalGalleryRef.current?.scrollToOffset({
      offset: safeIndex * winWidth,
      animated: animate,
    });
    scrollThumbTo(safeIndex);
  };

  const finishCloseGallery = () => {
    setGalleryZoomed(false);
    galleryZoomedSV.value = false;
    setGalleryOpen(false);
    gallerySheetY.value = SCREEN_HEIGHT;
  };

  const closeGallery = () => {
    galleryZoomedSV.value = false;
    setGalleryZoomed(false);
    gallerySheetY.value = withTiming(SCREEN_HEIGHT, { duration: 280 }, (finished) => {
      if (finished) runOnJS(finishCloseGallery)();
    });
  };

  const setGalleryZoomState = (active: boolean) => {
    setGalleryZoomed(active);
    galleryZoomedSV.value = active;
  };

  const onGalleryDismissDrag = (translationY: number) => {
    if (galleryZoomedSV.value) return;
    gallerySheetY.value = Math.max(0, translationY);
  };

  const onGalleryDismissEnd = (translationY: number, velocityY: number) => {
    if (galleryZoomedSV.value) {
      gallerySheetY.value = withSpring(0, { damping: 22, stiffness: 240 });
      return;
    }
    if (translationY > 100 || velocityY > 850) {
      gallerySheetY.value = withTiming(SCREEN_HEIGHT, { duration: 260 }, (finished) => {
        if (finished) runOnJS(finishCloseGallery)();
      });
    } else {
      gallerySheetY.value = withSpring(0, { damping: 22, stiffness: 240 });
    }
  };

  const galleryHeaderDismiss = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(14)
        .failOffsetX([-20, 20])
        .onUpdate((event) => {
          if (galleryZoomedSV.value) return;
          runOnJS(onGalleryDismissDrag)(Math.max(0, event.translationY));
        })
        .onEnd((event) => {
          runOnJS(onGalleryDismissEnd)(event.translationY, event.velocityY);
        }),
    [],
  );

  const galleryPagerGesture = useMemo(() => Gesture.Native(), []);

  const gallerySheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: gallerySheetY.value }],
  }));

  const galleryBackdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      gallerySheetY.value,
      [0, SCREEN_HEIGHT],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const openGallery = (index?: number) => {
    const next = typeof index === 'number' ? index : activeImage;
    setActiveImage(next);
    setGalleryZoomState(false);
    gallerySheetY.value = SCREEN_HEIGHT;
    setGalleryOpen(true);
  };

  useEffect(() => {
    if (!galleryOpen) return;
    gallerySheetY.value = SCREEN_HEIGHT;
    const timer = setTimeout(() => {
      modalGalleryRef.current?.scrollToOffset({
        offset: activeImage * winWidth,
        animated: false,
      });
      scrollThumbTo(activeImage);
      gallerySheetY.value = withSpring(0, {
        damping: 24,
        stiffness: 210,
        mass: 0.9,
      });
    }, 16);
    return () => clearTimeout(timer);
  }, [galleryOpen]);

  const optionCanLeadToStock = (dimensionKey: string, option: string) =>
    combinations.some((combination) => {
      if (combination.stock <= 0 || combination.option_values[dimensionKey] !== option) return false;
      return dimensions.every((dimension) => {
        if (dimension.key === dimensionKey) return true;
        const selected = selectedOptions[dimension.key];
        return !selected || combination.option_values[dimension.key] === selected;
      });
    });

  const variantLabel =
    selectedCombination && !isVirtualProduct
      ? dimensions
          .map((dimension) => `${dimension.label}: ${selectedCombination.option_values[dimension.key]}`)
          .join(' · ')
      : undefined;

  const findCartIndex = (cartList: CartItem[]) => {
    if (!product || !selectedCombination) return -1;
    return cartList.findIndex((item) => {
      const storedProductId = item.productId || item.id;
      const sameProduct = storedProductId === product.id;
      const sameVariant = item.variantId === selectedCombination.id;
      const legacyMatch = isVirtualProduct && !item.variantId && item.id === product.id;
      return sameProduct && (sameVariant || legacyMatch);
    });
  };

  const syncCartQuantity = async (nextQty: number): Promise<boolean> => {
    if (!product || !selectedCombination) {
      alert(selectionComplete ? t('product.noStockCombo') : t('product.selectAllOptions'));
      return false;
    }
    if (!selectionComplete && !isVirtualProduct) {
      alert(t('product.selectAllOptions'));
      return false;
    }
    if (selectedCombination.stock <= 0) {
      alert(t('product.noStockCombo'));
      return false;
    }

    const max = selectedCombination.stock;
    const qty = Math.max(0, Math.min(nextQty, max));
    const existingCart = await getCartJson();
    let cartList = parseCartItems(existingCart);
    const productIndex = findCartIndex(cartList);

    if (qty <= 0) {
      if (productIndex > -1) {
        cartList = cartList.filter((_, index) => index !== productIndex);
        void trackUserActivity(token, {
          action: 'remove_cart',
          productId: product.id,
          categoryId: product.category?.id,
          storeId: product.store_id || product.store?.id,
        });
      }
      await setCartJson(JSON.stringify(cartList));
      setCartQuantity(0);
      if (token) void syncCartToServer(token, cartList);
      return true;
    }

    const storeId = product.store_id || product.store?.id || undefined;
    let storeName = product.store?.name || undefined;
    let storeLogo = product.store?.logo_url || undefined;
    let storeCover = product.store?.cover_url || undefined;
    let storeVerified = product.store?.verified ?? undefined;

    // Completar logo/capa da loja a partir da API (fotos do painel admin)
    if (storeId && (!storeLogo || !storeName || !storeCover)) {
      const store = await getStoreById(storeId, { forceRefresh: !storeLogo });
      if (store) {
        storeName = storeName || store.name;
        storeLogo = storeLogo || store.logo_url || undefined;
        storeCover = storeCover || store.cover_url || undefined;
        storeVerified = storeVerified ?? store.verified;
      }
    }

    const wasInCart = productIndex > -1;
    if (wasInCart) {
      cartList[productIndex].quantity = qty;
      cartList[productIndex].maxStock = max;
      cartList[productIndex].image = coverImage;
      cartList[productIndex].price =
        selectedCombination.preco_gpay > 0 ? selectedCombination.preco_gpay : selectedCombination.preco;
      cartList[productIndex].variantLabel = variantLabel;
      cartList[productIndex].storeId = storeId;
      cartList[productIndex].storeName = storeName;
      cartList[productIndex].storeLogo = storeLogo;
      cartList[productIndex].storeCover = storeCover;
      cartList[productIndex].storeVerified = storeVerified;
    } else {
      cartList.push({
        id: `${product.id}:${selectedCombination.id}`,
        title: product.titulo,
        price: selectedCombination.preco_gpay > 0 ? selectedCombination.preco_gpay : selectedCombination.preco,
        image: coverImage,
        quantity: qty,
        selected: true,
        productId: product.id,
        variantId: selectedCombination.id,
        variantLabel,
        maxStock: max,
        storeId,
        storeName,
        storeLogo,
        storeCover,
        storeVerified,
      });
      void trackUserActivity(token, {
        action: 'add_cart',
        productId: product.id,
        categoryId: product.category?.id,
        storeId,
      });
      void import('@/lib/analytics').then(({ trackAnalytics }) => {
        trackAnalytics('add_to_cart', {
          productId: product.id,
          categoryId: product.category?.id,
          sellerId: storeId,
          source: 'product',
        });
      });
    }

    await setCartJson(JSON.stringify(cartList));
    if (token) void syncCartToServer(token, cartList);
    setCartQuantity(qty);
    return true;
  };

  useEffect(() => {
    async function loadCartQuantity() {
      if (!product || !selectedCombination) {
        setCartQuantity(0);
        return;
      }
      try {
        const existingCart = await getCartJson();
        const cartList = parseCartItems(existingCart);
        const index = findCartIndex(cartList);
        setCartQuantity(index > -1 ? cartList[index].quantity : 0);
      } catch {
        setCartQuantity(0);
      }
    }
    loadCartQuantity();
  }, [product?.id, selectedCombination?.id]);

  const handleAddToCart = async () => {
    setAdding(true);
    try {
      await syncCartQuantity(cartQuantity > 0 ? cartQuantity : 1);
    } catch (error) {
      console.log('Erro ao salvar no carrinho:', error);
      alert(t('product.saveFail'));
    } finally {
      setAdding(false);
    }
  };

  const handleQuantityChange = async (type: 'plus' | 'minus') => {
    if (!selectedCombination) return;
    const next = type === 'plus' ? cartQuantity + 1 : cartQuantity - 1;
    if (type === 'plus' && cartQuantity >= selectedCombination.stock) {
      alert(t('product.maxQty', { n: selectedCombination.stock }));
      return;
    }
    try {
      await syncCartQuantity(next);
    } catch (error) {
      console.log('Erro ao atualizar quantidade:', error);
    }
  };

  const handleBuyNow = async () => {
    if (!product || !selectedCombination || !canAddToCart) {
      alert(selectionComplete ? t('product.noStockCombo') : t('product.selectAllOptions'));
      return;
    }

    setBuying(true);
    try {
      const qty = cartQuantity > 0 ? cartQuantity : 1;
      if (cartQuantity <= 0) {
        await syncCartQuantity(1);
      }

      const checkoutParams = {
        productId: product.id,
        variantId: selectedCombination.legacy ? undefined : selectedCombination.id,
        title: product.titulo,
        image: coverImage,
        price: String(
          selectedCombination.preco_gpay > 0 ? selectedCombination.preco_gpay : selectedCombination.preco
        ),
        quantity: String(qty),
        variantLabel: variantLabel || '',
        maxStock: String(selectedCombination.stock),
      };

      await setCheckoutDraftJson(JSON.stringify(checkoutParams));

      if (!isLoggedIn) {
        router.push({ pathname: '/login', params: { redirect: 'checkout' } });
        return;
      }

      router.push({ pathname: '/checkout', params: checkoutParams });
    } catch (error) {
      console.log('Erro ao comprar:', error);
      alert(t('product.buyFail'));
    } finally {
      setBuying(false);
    }
  };

  const actionLabel = !selectionComplete && !isVirtualProduct
    ? t('product.selectOptions')
    : displayStock <= 0
      ? t('product.outOfStock')
      : null;

  if (loading) {
    return (
      <View style={[styles.centeredState, { paddingTop: insets.top }]}>
        <RippleWaveLoader color={C.accent} />
        <Text style={styles.stateText}>{t('product.loading')}</Text>
      </View>
    );
  }

  if (loadError || !product) {
    return (
      <View style={[styles.centeredState, { paddingTop: insets.top }]}>
        <Ionicons name="cloud-offline-outline" size={42} color="#8E8E93" />
        <Text style={styles.stateText}>{t('product.loadError')}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => loadProduct({ forceNetwork: true })}>
          <Text style={styles.retryButtonText}>{t('common.tryAgain')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.mainWrapper, { backgroundColor: isDark ? '#0E0E0E' : ui.bg }]}>
      {isDesktop || isDark ? null : (
        <LinearGradient colors={[C.soft, C.mist, C.white]} style={StyleSheet.absoluteFill} />
      )}
      {isDesktop ? <HomeDesktopHeader /> : null}

      <Animated.View style={{ opacity: contentOpacity, flex: 1 }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          { paddingBottom: dockHeight + 24 },
          isDesktop && styles.desktopScrollContent,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="transparent"
            colors={['transparent']}
            progressBackgroundColor="transparent"
            progressViewOffset={Platform.OS === 'android' ? insets.top : 0}
          />
        }
      >
        <View style={isDesktop ? styles.desktopTopRow : undefined}>
        <View style={[styles.imageSection, isDesktop && styles.imageSectionDesktop, !isDesktop && { paddingTop: Math.max(insets.top - 2, 8) }]}>
          <View style={[styles.imageCard, isDesktop && styles.imageCardDesktop]}>
            <FlatList
              ref={mainGalleryRef}
              key={`${product.id}-${selectedCombination?.image_url || 'product-gallery'}`}
              data={displayImages}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              keyExtractor={(image, index) => `${image}-${index}`}
              getItemLayout={(_, index) => ({
                length: imageWidth,
                offset: imageWidth * index,
                index,
              })}
              onMomentumScrollEnd={({ nativeEvent }) => {
                const index = Math.round(nativeEvent.contentOffset.x / imageWidth);
                setActiveImage(index);
              }}
              renderItem={({ item, index }) => (
                <Pressable style={styles.imageSlide} onPress={() => openGallery(index)}>
                  <Image
                    source={{ uri: optimizedImageUrl(item, 'detail') }}
                    style={styles.mainProductImage}
                    contentFit="cover"
                    transition={220}
                    cachePolicy="memory-disk"
                  />
                </Pressable>
              )}
            />
            {displayImages.length > 1 && (
              <>
                <View style={styles.imageCounter} pointerEvents="none">
                  <Text style={styles.imageCounterText}>
                    {activeImage + 1}/{displayImages.length}
                  </Text>
                </View>
                <View style={styles.paginationDots} pointerEvents="none">
                  {displayImages.map((_, index) => (
                    <View
                      key={index}
                      style={[styles.paginationDot, index === activeImage && styles.paginationDotActive]}
                    />
                  ))}
                </View>
              </>
            )}
          </View>
        </View>

        <View style={[styles.detailsContentBox, isDesktop && styles.detailsAside]}>
          {product.category?.name ? (
            <View style={styles.categoryPill}>
              <Text style={styles.categoryText}>{product.category.name}</Text>
            </View>
          ) : null}

          {product.marca?.trim() ? (
            <Text style={styles.brandText}>{product.marca.trim()}</Text>
          ) : null}

          <Text style={styles.productTitleText}>{product.titulo}</Text>

          {product.group?.members && product.group.members.length > 1 ? (
            <View style={styles.groupSection}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.groupThumbRow}
              >
                {product.group.members.map((member) => {
                  const selected = member.id === product.id;
                  return (
                    <TouchableOpacity
                      key={member.id}
                      activeOpacity={0.85}
                      style={styles.groupThumbWrap}
                      onPress={() => {
                        void switchGroupMember(member.id);
                      }}
                    >
                      <View
                        style={[
                          styles.groupThumbFrame,
                          selected && styles.groupThumbFrameSelected,
                        ]}
                      >
                        <Image
                          source={{
                            uri: optimizedImageUrl(
                              member.image_url || FALLBACK_IMAGE,
                              'thumb'
                            ),
                          }}
                          style={styles.groupThumbImage}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          transition={120}
                        />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          <View style={styles.priceCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.priceHint}>{t('product.normalPrice')}</Text>
              <Text style={styles.premiumBlackPrice}>
                {displayRegularPrice.toLocaleString()} CFA
              </Text>
              <View style={styles.gcoinDetailRow}>
                <Text style={styles.gcoinDetailPrice}>
                  {(displayGpayPrice > 0 ? displayGpayPrice : displayRegularPrice).toLocaleString()} GCoin
                </Text>
                <View style={styles.gpayBadgeBox}>
                  <Ionicons name="wallet" size={11} color={C.accent} />
                  <Text style={styles.gpayBadgeText}>GPay</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.deliveryInfoCard}>
            <View style={styles.deliveryInfoRow}>
              <Ionicons name="bicycle-outline" size={16} color={C.accent} />
              <View style={{ flex: 1 }}>
                <Text style={styles.deliveryInfoLabel}>{t('product.deliveryFee')}</Text>
                <Text style={styles.deliveryInfoValue}>
                  {Number(product.delivery_fee ?? 1500) <= 0
                    ? t('product.deliveryFree')
                    : `${Number(product.delivery_fee ?? 1500).toLocaleString()} CFA`}
                </Text>
              </View>
            </View>
            <View style={[styles.deliveryInfoRow, { marginTop: 10 }]}>
              <Ionicons name="time-outline" size={16} color={C.accent} />
              <View style={{ flex: 1 }}>
                <Text style={styles.deliveryInfoLabel}>{t('product.deliveryTime')}</Text>
                <Text style={styles.deliveryInfoValue}>
                  {product.delivery_time?.trim() || t('product.deliveryTimeMissing')}
                </Text>
              </View>
            </View>
          </View>

          {dimensions.map((dimension) => (
            <View key={dimension.key} style={styles.variantSection}>
              <Text style={styles.variantLabel}>
                {dimension.label}
                {selectedOptions[dimension.key] ? `: ${selectedOptions[dimension.key]}` : ''}
              </Text>
              <View style={styles.optionList}>
                {dimension.options.map((option) => {
                  const disabled = !optionCanLeadToStock(dimension.key, option);
                  const selected = selectedOptions[dimension.key] === option;
                  return (
                    <TouchableOpacity
                      key={option}
                      style={[
                        styles.optionButton,
                        selected && styles.optionButtonSelected,
                        disabled && styles.optionButtonDisabled,
                      ]}
                      disabled={disabled}
                      onPress={() =>
                        setSelectedOptions((current) => {
                          const next = { ...current };
                          if (next[dimension.key] === option) {
                            delete next[dimension.key];
                          } else {
                            next[dimension.key] = option;
                          }
                          return next;
                        })
                      }
                    >
                      <Text
                        style={[
                          styles.optionButtonText,
                          selected && styles.optionButtonTextSelected,
                          disabled && styles.optionButtonTextDisabled,
                        ]}
                      >
                        {option}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}

          <View
            style={[
              styles.stockBadge,
              displayStock > 0 && (selectionComplete || isVirtualProduct)
                ? styles.stockBadgeAvailable
                : styles.stockBadgeUnavailable,
            ]}
          >
            <Ionicons
              name={
                displayStock > 0 && (selectionComplete || isVirtualProduct)
                  ? 'checkmark-circle'
                  : 'alert-circle'
              }
              size={16}
              color={
                displayStock > 0 && (selectionComplete || isVirtualProduct) ? '#2E7D32' : '#B45309'
              }
            />
            <Text style={styles.stockText}>
              {!selectionComplete && !isVirtualProduct
                ? t('product.selectOptionsStock')
                : displayStock > 0
                  ? t('product.inStock', { n: displayStock })
                  : t('product.outOfStock')}
            </Text>
          </View>

          {isDesktop ? (
            <View style={styles.desktopBuyCard}>
              <Text style={styles.premiumBlackPrice}>
                {displayRegularPrice.toLocaleString()} CFA
              </Text>
              <View style={styles.desktopBuyActions}>
                {cartQuantity > 0 && canAddToCart ? (
                  <View style={styles.qtyDock}>
                    <TouchableOpacity
                      style={styles.qtyDockBtn}
                      onPress={() => handleQuantityChange('minus')}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.qtyDockSymbol}>−</Text>
                    </TouchableOpacity>
                    <Text style={styles.qtyDockValue}>{cartQuantity}</Text>
                    <TouchableOpacity
                      style={styles.qtyDockBtn}
                      onPress={() => handleQuantityChange('plus')}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.qtyDockSymbol}>+</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.addCartBtn, !canAddToCart && styles.addCartBtnDisabled]}
                    onPress={handleAddToCart}
                    disabled={adding || buying || !canAddToCart}
                    activeOpacity={0.88}
                  >
                    {adding ? (
                      <RippleWaveLoader size="small" color={C.ink} />
                    ) : (
                      <Text style={[styles.addCartText, !canAddToCart && styles.addCartTextDisabled]}>
                        {t('product.add')}
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
                <BuyNowButton
                  disabled={!canAddToCart}
                  loading={buying}
                  label={t('product.buyNow')}
                  onPress={handleBuyNow}
                  styles={styles}
                  ink={C.ink}
                  isDark={isDark}
                />
              </View>
            </View>
          ) : null}
        </View>
        </View>

        <View style={[styles.detailsContentBox, isDesktop && styles.detailsFull]}>
          <View style={styles.infoDividerLine} />
          <Text style={styles.sectionLabelTitle}>{t('product.description')}</Text>
          <Text style={styles.bodyDescriptionParagraph}>
            {product.description || product.descricao || t('product.noDescription')}
          </Text>

          {product.garantia?.trim() ? (
            <>
              <View style={styles.infoDividerLine} />
              <Text style={styles.sectionLabelTitle}>{t('product.warranty')}</Text>
              <Text style={styles.bodyDescriptionParagraph}>
                {product.garantia.trim()}
              </Text>
            </>
          ) : null}

          {(() => {
            const visibleSpecs = (product.specifications || []).filter(
              (specification) => String(specification.value ?? '').trim().length > 0,
            );
            if (!visibleSpecs.length) return null;
            return (
              <>
                <View style={styles.infoDividerLine} />
                <Text style={styles.sectionLabelTitle}>{t('product.specs')}</Text>
                <View style={styles.specificationCard}>
                  {visibleSpecs.map((specification, index) => (
                    <View
                      key={specification.attribute_id || `${specification.key}-${index}`}
                      style={[
                        styles.specificationRow,
                        index === visibleSpecs.length - 1 && styles.lastSpecificationRow,
                      ]}
                    >
                      <Text style={styles.specificationLabel}>
                        {specification.label || specification.key || t('product.detail')}
                      </Text>
                      <Text style={styles.specificationValue}>{specification.value}</Text>
                    </View>
                  ))}
                </View>
              </>
            );
          })()}

          <View style={styles.infoDividerLine} />
          <Text style={styles.sectionLabelTitle}>{t('product.soldBy')}</Text>
          <TouchableOpacity
            style={styles.storeCard}
            activeOpacity={0.85}
            onPress={() => {
              const storeId = product.store?.id || product.store_id;
              if (!storeId) return;
              router.push({
                pathname: '/loja',
                params: {
                  id: storeId,
                  name: product.store?.name || '',
                  logo: product.store?.logo_url || '',
                  cover: product.store?.cover_url || '',
                  verified: product.store?.verified ? '1' : '0',
                  rating: String(product.store?.rating_avg || 0),
                  reviews: String(product.store?.review_count || 0),
                },
              });
            }}
          >
            {product.store?.logo_url ? (
              <Image
                source={{ uri: optimizedImageUrl(product.store.logo_url, 'thumb') }}
                style={styles.storeLogo}
                cachePolicy="memory-disk"
                recyclingKey={`${product.store.id}-logo-${product.store.logo_url}`}
              />
            ) : (
              <View style={styles.storeLogoFallback}>
                <Ionicons name="storefront" size={22} color={C.accent} />
              </View>
            )}
            <View style={styles.storeInfo}>
              <View style={styles.storeNameRow}>
                <Text style={styles.storeName}>{product.store?.name || t('product.official')}</Text>
                {(product.store?.verified ?? true) && (
                  <Ionicons name="checkmark-circle" size={16} color={C.accent} />
                )}
              </View>
              <Text style={styles.storeMeta}>
                {product.store
                  ? `${Number(product.store.rating_avg || 0).toFixed(1)} ★ · ${t('product.reviewsCount', { n: product.store.review_count || 0 })}`
                  : t('product.officialStore')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.muted} />
          </TouchableOpacity>
          {(product.store?.id || product.store_id) ? (
            <FollowStoreButton
              storeId={product.store?.id || product.store_id}
              style={{ marginTop: 10 }}
            />
          ) : null}

          <View style={styles.infoDividerLine} />
          <Text style={styles.sectionLabelTitle}>{t('product.reviews')}</Text>
          <View style={styles.reviewSummary}>
            <Text style={styles.reviewAverage}>{Number(product.reviews?.average || 0).toFixed(1)}</Text>
            <View style={{ gap: 4 }}>
              <StarRating
                value={Number(product.reviews?.average || 0)}
                size={16}
                gap={3}
                showValue={false}
              />
              <Text style={styles.reviewCount}>{t('product.reviewsCount', { n: product.reviews?.count || 0 })}</Text>
            </View>
          </View>
          {!!product.reviews?.items?.length && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToInterval={REVIEW_CARD_WIDTH + 12}
              snapToAlignment="start"
              contentContainerStyle={styles.reviewCarousel}
            >
              {product.reviews.items.map((review) => {
                const initials = (review.user_name || '?')
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((p) => p[0]?.toUpperCase() || '')
                  .join('');
                return (
                  <View key={review.id} style={styles.reviewCard}>
                    <View style={styles.reviewerRow}>
                      {review.user_avatar ? (
                        <Image
                          source={{ uri: review.user_avatar }}
                          style={styles.reviewerAvatar}
                          contentFit="cover"
                        />
                      ) : (
                        <View style={styles.reviewerAvatarFallback}>
                          <Text style={styles.reviewerInitials}>{initials || '?'}</Text>
                        </View>
                      )}
                      <Text style={styles.reviewerName} numberOfLines={2}>
                        {(review.user_name || '').trim() || 'Cliente GMarket'}
                      </Text>
                    </View>
                    <View style={styles.reviewCardStars}>
                      <StarRating value={review.rating} size={14} gap={3} />
                    </View>
                    {!!review.comment ? (
                      <Text style={styles.reviewComment} numberOfLines={5}>
                        {review.comment}
                      </Text>
                    ) : (
                      <Text style={styles.reviewCommentEmpty}>{t('product.noComment')}</Text>
                    )}
                    {!!review.photo_urls?.length && (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.reviewPhotos}
                      >
                        {review.photo_urls.map((uri, photoIndex) => (
                          <Pressable
                            key={uri}
                            onPress={() =>
                              setReviewPhotoViewer({
                                uris: review.photo_urls || [],
                                index: photoIndex,
                              })
                            }
                            style={({ pressed }) => [
                              styles.reviewPhotoPress,
                              pressed && { opacity: 0.85 },
                            ]}
                          >
                            <Image
                              source={{ uri }}
                              style={styles.reviewPhoto}
                              contentFit="cover"
                            />
                          </Pressable>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}
          {!product.reviews?.count && (
            <Text style={styles.emptyReviews}>{t('product.noReviews')}</Text>
          )}
        </View>
      </ScrollView>
      </Animated.View>

      {refreshing ? (
        <View
          style={[styles.refreshLoader, { top: insets.top + 10 }]}
          pointerEvents="none"
        >
          <PulsatingDots color={C.accent} />
        </View>
      ) : null}

      {/* Botões fixos por cima da foto — permanecem ao scroll */}
      {!isDesktop ? (
      <View
        pointerEvents="box-none"
        style={[styles.fixedTopActions, { top: Math.max(insets.top, 10) + 6 }]}
      >
        <View style={styles.actionPill}>
          <TouchableOpacity style={styles.pillBtn} onPress={() => router.back()} activeOpacity={0.85}>
            <Ionicons name="arrow-back" size={20} color={C.ink} />
          </TouchableOpacity>
        </View>

        <View style={styles.actionPill}>
          <TouchableOpacity style={styles.pillBtn} onPress={toggleFavorite} activeOpacity={0.85}>
            <Ionicons
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={20}
              color={isFavorite ? '#E91E63' : C.ink}
            />
          </TouchableOpacity>
          <View style={styles.pillDivider} />
          <TouchableOpacity style={styles.pillBtn} onPress={handleShareProduct} activeOpacity={0.85}>
            <Ionicons name="share-outline" size={20} color={C.ink} />
          </TouchableOpacity>
        </View>
      </View>
      ) : null}

      {/* Barra fixa acima da zona da tab bar */}
      {!isDesktop ? (
      <View style={[styles.fixedBottomDock, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.dockGlass}>
          {cartQuantity > 0 && canAddToCart ? (
            <View style={styles.qtyDock}>
              <TouchableOpacity
                style={styles.qtyDockBtn}
                onPress={() => handleQuantityChange('minus')}
                activeOpacity={0.85}
              >
                <Text style={styles.qtyDockSymbol}>−</Text>
              </TouchableOpacity>
              <Text style={styles.qtyDockValue}>{cartQuantity}</Text>
              <TouchableOpacity
                style={[
                  styles.qtyDockBtn,
                  selectedCombination && cartQuantity >= selectedCombination.stock && styles.qtyDockBtnDisabled,
                ]}
                disabled={Boolean(selectedCombination && cartQuantity >= selectedCombination.stock)}
                onPress={() => handleQuantityChange('plus')}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.qtyDockSymbol,
                    selectedCombination &&
                      cartQuantity >= selectedCombination.stock &&
                      styles.qtyDockSymbolDisabled,
                  ]}
                >
                  +
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.addCartBtn, !canAddToCart && styles.addCartBtnDisabled]}
              onPress={handleAddToCart}
              disabled={adding || buying || !canAddToCart}
              activeOpacity={0.88}
            >
              {adding ? (
                <RippleWaveLoader size="small" color={C.ink} />
              ) : (
                <Text style={[styles.addCartText, !canAddToCart && styles.addCartTextDisabled]}>
                  {actionLabel || t('product.add')}
                </Text>
              )}
            </TouchableOpacity>
          )}

          <BuyNowButton
            disabled={!canAddToCart}
            loading={buying}
            label={actionLabel || t('product.buyNow')}
            onPress={handleBuyNow}
            styles={styles}
            ink={C.ink}
            isDark={isDark}
          />
        </View>
      </View>
      ) : null}

      <Modal
        visible={galleryOpen}
        transparent
        animationType="none"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={closeGallery}
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View style={styles.galleryRoot}>
            <Reanimated.View style={[styles.galleryBackdrop, galleryBackdropStyle]} />
            <Reanimated.View style={[styles.galleryModal, gallerySheetStyle]}>
              <StatusBar barStyle="light-content" />

              <GestureDetector gesture={galleryHeaderDismiss}>
                <View style={[styles.galleryTopSafe, { paddingTop: Math.max(insets.top, 10) }]}>
                  <View style={styles.galleryBrandPill}>
                    <Text style={styles.galleryBrandText}>GMarket</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.galleryCloseBtn}
                    onPress={closeGallery}
                    activeOpacity={0.85}
                    hitSlop={12}
                  >
                    <Ionicons name="close" size={20} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              </GestureDetector>

              <View style={styles.galleryMainArea}>
                <GestureDetector gesture={galleryPagerGesture}>
                  <GHFlatList
                    ref={modalGalleryRef}
                    data={displayImages}
                    style={{ flex: 1 }}
                    horizontal
                    pagingEnabled
                    scrollEnabled={!galleryZoomed}
                    showsHorizontalScrollIndicator={false}
                    decelerationRate="fast"
                    keyExtractor={(image, index) => `modal-${image}-${index}`}
                    getItemLayout={(_, index) => ({
                      length: winWidth,
                      offset: winWidth * index,
                      index,
                    })}
                    onMomentumScrollEnd={({ nativeEvent }) => {
                      const index = Math.round(nativeEvent.contentOffset.x / winWidth);
                      setActiveImage(index);
                      setGalleryZoomState(false);
                      mainGalleryRef.current?.scrollToOffset({
                        offset: index * imageWidth,
                        animated: false,
                      });
                      scrollThumbTo(index);
                    }}
                    renderItem={({ item, index }) => {
                      const slideH = SCREEN_HEIGHT - Math.max(insets.top, 10) - 130;
                      return (
                        <View style={[styles.gallerySlide, { height: slideH }]}>
                          <ZoomableImage
                            key={`${item}-${index}-${index === activeImage ? 'focus' : 'idle'}`}
                            uri={optimizedImageUrl(item, 'detail')}
                            boxWidth={winWidth}
                            boxHeight={slideH}
                            onZoomActiveChange={setGalleryZoomState}
                            pagerGesture={galleryPagerGesture}
                          />
                        </View>
                      );
                    }}
                  />
                </GestureDetector>
              </View>

              {displayImages.length > 1 && (
                <View
                  style={[
                    styles.galleryThumbsWrap,
                    { paddingBottom: Math.max(insets.bottom, 16) },
                    galleryZoomed && styles.galleryThumbsHidden,
                  ]}
                  pointerEvents={galleryZoomed ? 'none' : 'auto'}
                >
                  <FlatList
                    ref={thumbListRef}
                    data={displayImages}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={(image, index) => `thumb-${image}-${index}`}
                    contentContainerStyle={styles.galleryThumbsContent}
                    renderItem={({ item, index }) => {
                      const selected = index === activeImage;
                      return (
                        <TouchableOpacity
                          activeOpacity={0.9}
                          onPress={() => {
                            setGalleryZoomState(false);
                            goToImage(index);
                          }}
                          style={styles.galleryThumbSlot}
                        >
                          <View
                            style={[
                              styles.galleryThumb,
                              selected ? styles.galleryThumbSelected : styles.galleryThumbIdle,
                            ]}
                          >
                            <Image
                              source={{ uri: optimizedImageUrl(item, 'thumb') }}
                              style={styles.galleryThumbImage}
                              contentFit="cover"
                              cachePolicy="memory-disk"
                            />
                          </View>
                        </TouchableOpacity>
                      );
                    }}
                  />
                </View>
              )}
            </Reanimated.View>
          </View>
        </GestureHandlerRootView>
      </Modal>

      <Modal
        visible={Boolean(reviewPhotoViewer)}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={() => setReviewPhotoViewer(null)}
      >
        <View style={styles.reviewPhotoViewerRoot}>
          <StatusBar barStyle="light-content" />
          <View style={[styles.reviewPhotoViewerTop, { paddingTop: Math.max(insets.top, 10) }]}>
            <Text style={styles.reviewPhotoViewerCount}>
              {reviewPhotoViewer
                ? `${Math.min(reviewPhotoViewer.index + 1, reviewPhotoViewer.uris.length)}/${reviewPhotoViewer.uris.length}`
                : ''}
            </Text>
            <TouchableOpacity
              style={styles.reviewPhotoViewerClose}
              onPress={() => setReviewPhotoViewer(null)}
              activeOpacity={0.85}
              hitSlop={12}
            >
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          {reviewPhotoViewer ? (
            <FlatList
              data={reviewPhotoViewer.uris}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={reviewPhotoViewer.index}
              getItemLayout={(_, index) => ({
                length: winWidth,
                offset: winWidth * index,
                index,
              })}
              onMomentumScrollEnd={({ nativeEvent }) => {
                const index = Math.round(nativeEvent.contentOffset.x / Math.max(winWidth, 1));
                setReviewPhotoViewer((prev) => (prev ? { ...prev, index } : prev));
              }}
              keyExtractor={(uri, index) => `review-photo-${index}-${uri}`}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.reviewPhotoViewerSlide}
                  onPress={() => setReviewPhotoViewer(null)}
                >
                  <Image
                    source={{ uri: item }}
                    style={styles.reviewPhotoViewerImage}
                    contentFit="contain"
                  />
                </Pressable>
              )}
            />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

function createStyles(
  C: DetailPalette,
  isDark: boolean,
  layout: {
    imageWidth: number;
    imageHeight: number;
    isDesktop: boolean;
    screenHeight: number;
    screenWidth: number;
    reviewCardWidth: number;
  },
) {
  const { imageWidth, imageHeight, isDesktop, screenHeight, screenWidth, reviewCardWidth } = layout;
  return StyleSheet.create({
  mainWrapper: { flex: 1, backgroundColor: isDark ? '#0E0E0E' : C.mist },
  desktopScrollContent: {
    maxWidth: 1360,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  desktopTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 20,
    marginBottom: 8,
  },
  imageSectionDesktop: {
    width: imageWidth,
    flexShrink: 0,
    paddingTop: 0,
  },
  imageCardDesktop: {
    borderRadius: 16,
  },
  detailsAside: {
    flex: 1,
    minWidth: 280,
    marginTop: 0,
    paddingTop: 0,
  },
  detailsFull: {
    marginTop: 8,
  },
  desktopBuyCard: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: isDark ? '#222222' : '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
    gap: 12,
  },
  desktopBuyActions: {
    gap: 10,
  },
  refreshLoader: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 2000,
    elevation: 2000,
  },
  centeredState: {
    flex: 1,
    backgroundColor: isDark ? '#0E0E0E' : C.mist,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  stateText: { color: C.muted, fontSize: 14, textAlign: 'center' },
  retryButton: {
    backgroundColor: C.accent,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 4,
  },
  retryButtonText: { color: '#FFF', fontSize: 13, fontWeight: '700' },

  fixedTopActions: {
    position: 'absolute',
    left: IMAGE_PAD + 10,
    right: IMAGE_PAD + 10,
    zIndex: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(26,26,26,0.92)' : 'rgba(255,255,255,0.92)',
    borderRadius: 22,
    paddingHorizontal: 4,
    height: 42,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.95)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: isDark ? 0.35 : 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  pillBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillDivider: {
    width: StyleSheet.hairlineWidth,
    height: 18,
    backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(17,17,17,0.12)',
  },
  imageSection: { paddingHorizontal: IMAGE_PAD, marginBottom: 8, alignItems: 'center' },
  imageCard: {
    width: imageWidth,
    height: imageHeight,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: C.white,
    position: 'relative',
    alignSelf: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
    borderWidth: Platform.OS === 'ios' ? 1 : 0,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  imageSlide: { width: imageWidth, height: imageHeight },
  mainProductImage: { width: '100%', height: '100%' },
  imageCounter: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: 'rgba(17,17,17,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  imageCounterText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  paginationDots: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  paginationDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.55)' },
  paginationDotActive: { width: 18, backgroundColor: C.goldBright },

  galleryRoot: {
    flex: 1,
  },
  galleryBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.92)',
  },
  galleryModal: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  galleryTopSafe: {
    zIndex: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 8,
    minHeight: 48,
  },
  galleryBrandPill: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  galleryBrandText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  galleryCloseBtn: {
    position: 'absolute',
    right: 16,
    bottom: 4,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gallerySlide: {
    width: screenWidth,
    justifyContent: 'center',
    alignItems: 'center',
  },
  galleryMainArea: {
    flex: 1,
  },
  galleryThumbsWrap: {
    paddingTop: 10,
  },
  galleryThumbsHidden: {
    opacity: 0,
  },
  galleryThumbsContent: {
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 8,
  },
  galleryThumbSlot: {
    width: THUMB_SIZE + 10,
    height: THUMB_SIZE + 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryThumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  galleryThumbIdle: {
    opacity: 0.45,
    transform: [{ scale: 0.9 }],
  },
  galleryThumbSelected: {
    opacity: 1,
    transform: [{ scale: 1.08 }],
  },
  galleryThumbImage: {
    width: '100%',
    height: '100%',
  },

  detailsContentBox: { paddingHorizontal: 20, paddingTop: 12 },
  categoryPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(15,118,110,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 10,
  },
  categoryText: { fontSize: 11, color: C.accent, fontWeight: '700', letterSpacing: 0.2 },
  brandText: {
    fontSize: 13,
    fontWeight: '700',
    color: C.muted,
    marginBottom: 6,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  productTitleText: {
    fontSize: 15.4,
    fontWeight: '800',
    color: C.ink,
    lineHeight: 20,
    letterSpacing: -0.3,
    marginBottom: 10,
  },
  priceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.white,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: C.line,
  },
  deliveryInfoCard: {
    marginTop: 10,
    backgroundColor: C.white,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: C.line,
  },
  deliveryInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  deliveryInfoLabel: {
    fontSize: 11,
    color: C.muted,
    fontWeight: '600',
    marginBottom: 2,
  },
  deliveryInfoValue: {
    fontSize: 14,
    fontWeight: '700',
    color: C.ink,
  },
  priceHint: { fontSize: 10, color: C.muted, fontWeight: '600', marginBottom: 1 },
  premiumBlackPrice: { fontSize: 18, fontWeight: '800', color: C.ink, letterSpacing: -0.3 },
  gpayBadgeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.soft,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
  },
  gpayBadgeText: { fontSize: 10, color: C.accent, fontWeight: '800' },
  gcoinDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  gcoinDetailPrice: {
    fontSize: 11,
    fontWeight: '600',
    color: C.muted,
  },
  slashedOriginalPrice: { fontSize: 11, color: C.muted, marginTop: 2 },

  groupSection: { marginTop: 2, marginBottom: 12 },
  groupThumbRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 0,
  },
  groupThumbWrap: { width: 52 },
  groupThumbFrame: {
    width: 52,
    height: 68,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: C.line,
    overflow: 'hidden',
    backgroundColor: C.graySoft,
  },
  groupThumbFrameSelected: {
    borderColor: C.accent,
    borderWidth: 2.5,
  },
  groupThumbImage: {
    width: '100%',
    height: '100%',
  },

  infoDividerLine: { height: 1, backgroundColor: C.line, marginVertical: 22 },
  sectionLabelTitle: { fontSize: 15, fontWeight: '800', color: C.ink, marginBottom: 8, letterSpacing: -0.2 },
  bodyDescriptionParagraph: { fontSize: 14, color: C.muted, lineHeight: 22 },

  variantSection: { marginTop: 20 },
  variantLabel: { fontSize: 13, fontWeight: '700', color: C.ink, marginBottom: 10 },
  optionList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionButton: {
    borderWidth: 1.5,
    borderColor: isDark ? C.line : '#D1D5DB',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: C.white,
  },
  optionButtonSelected: {
    borderColor: C.accent,
    backgroundColor: isDark ? 'rgba(94,234,212,0.12)' : C.soft,
  },
  optionButtonDisabled: { borderColor: C.line, backgroundColor: C.graySoft, opacity: 0.55 },
  optionButtonText: { color: C.ink, fontSize: 13, fontWeight: '600' },
  optionButtonTextSelected: { color: C.accent, fontWeight: '800' },
  optionButtonTextDisabled: { color: C.muted, textDecorationLine: 'line-through' },

  stockBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    marginTop: 18,
  },
  stockBadgeAvailable: { backgroundColor: 'rgba(125,219,138,0.22)' },
  stockBadgeUnavailable: { backgroundColor: isDark ? 'rgba(251,146,60,0.18)' : '#FFF7ED' },
  stockText: { fontSize: 12, color: C.ink, fontWeight: '700' },

  specificationCard: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 6,
    backgroundColor: C.white,
  },
  specificationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  lastSpecificationRow: { borderBottomWidth: 0 },
  specificationLabel: { flex: 1, fontSize: 12, color: isDark ? '#D1D1D6' : C.muted, fontWeight: '600' },
  specificationValue: { flex: 1, fontSize: 12, color: C.ink, fontWeight: '700', textAlign: 'right' },

  storeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 18,
    padding: 14,
    marginTop: 6,
    backgroundColor: C.white,
  },
  storeLogo: { width: 48, height: 48, borderRadius: 14, backgroundColor: C.graySoft },
  storeLogoFallback: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: C.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeInfo: { flex: 1, marginLeft: 12 },
  storeNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  storeName: { fontSize: 14, color: C.ink, fontWeight: '800' },
  storeMeta: { fontSize: 11, color: C.muted, marginTop: 3 },

  reviewSummary: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4, marginBottom: 12 },
  reviewAverage: { fontSize: 32, color: C.ink, fontWeight: '900' },
  reviewStars: { fontSize: 15, color: C.gold, letterSpacing: 1 },
  reviewCount: { fontSize: 11, color: C.muted, marginTop: 2 },
  reviewCarousel: {
    paddingRight: 8,
    gap: 12,
    paddingBottom: 4,
  },
  reviewCard: {
    width: reviewCardWidth,
    minHeight: 168,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: isDark ? C.soft : C.white,
    padding: 14,
  },
  reviewerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  reviewerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: C.graySoft,
  },
  reviewerAvatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: C.soft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.line,
  },
  reviewerInitials: {
    fontSize: 13,
    fontWeight: '800',
    color: C.ink,
  },
  reviewCardStars: {
    marginTop: 10,
    marginBottom: 8,
  },
  reviewItem: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.line },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewerName: {
    flex: 1,
    fontSize: 13,
    color: C.ink,
    fontWeight: '800',
    lineHeight: 18,
  },
  reviewItemRating: { fontSize: 12, color: C.gold },
  reviewComment: { fontSize: 13, color: C.muted, lineHeight: 19 },
  reviewCommentEmpty: { fontSize: 12, color: C.muted, fontStyle: 'italic', lineHeight: 18 },
  reviewPhotos: { gap: 8, marginTop: 10, paddingRight: 4 },
  reviewPhotoPress: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  reviewPhoto: { width: 56, height: 56, borderRadius: 10, backgroundColor: C.graySoft },
  reviewPhotoViewerRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
  },
  reviewPhotoViewerTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reviewPhotoViewerCount: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: '700',
  },
  reviewPhotoViewerClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewPhotoViewerSlide: {
    width: screenWidth,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  reviewPhotoViewerImage: {
    width: screenWidth - 24,
    height: screenHeight * 0.78,
  },
  emptyReviews: { fontSize: 12, color: C.muted, marginTop: 4 },

  fixedBottomDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingTop: 10,
    backgroundColor: 'transparent',
  },
  dockGlass: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: isDark
      ? (Platform.OS === 'ios' ? 'rgba(26,26,26,0.92)' : 'rgba(26,26,26,0.98)')
      : (Platform.OS === 'ios' ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.98)'),
    borderRadius: 28,
    padding: 10,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.08)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: isDark ? 0.35 : 0.16,
    shadowRadius: 22,
    elevation: 14,
  },
  addCartBtn: {
    flex: 1,
    height: 54,
    borderRadius: 18,
    backgroundColor: C.graySoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCartBtnDisabled: {
    backgroundColor: C.graySoft,
    opacity: 0.7,
  },
  addCartText: { color: C.ink, fontSize: 14, fontWeight: '700' },
  addCartTextDisabled: { color: C.muted },
  qtyDock: {
    flex: 1,
    height: 54,
    borderRadius: 18,
    backgroundColor: C.graySoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  qtyDockBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyDockBtnDisabled: {
    opacity: 0.4,
  },
  qtyDockSymbol: {
    fontSize: 22,
    fontWeight: '600',
    color: C.ink,
    lineHeight: 24,
  },
  qtyDockSymbolDisabled: {
    color: C.muted,
  },
  qtyDockValue: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
    color: C.ink,
  },

  buyBtn: {
    flex: 1.15,
    height: 54,
    borderRadius: 18,
    backgroundColor: C.buyGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyBtnDisabled: { opacity: 0.55 },
  buyBtnPressed: { opacity: 0.88 },
  buyBtnText: {
    color: isDark ? '#000000' : C.ink,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
}

