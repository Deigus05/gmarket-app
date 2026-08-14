// app/(tabs)/index.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { useScrollToTop } from '@react-navigation/native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Dimensions,
    FlatList,
    NativeScrollEvent,
    NativeSyntheticEvent,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    type ListRenderItemInfo,
} from 'react-native';
import Animated, {
    Easing,
    Extrapolation,
    interpolate,
    runOnJS,
    useAnimatedProps,
    useAnimatedScrollHandler,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
    type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** FlatList animada: no Android o FlashList esticava o fundo em vez de deslizar o conteúdo no pull. */
const AnimatedFlatList = Animated.createAnimatedComponent(FlatList) as typeof FlatList;

/** Snap rápido entre fotos do card. */
const CARD_GALLERY_DECEL = Platform.OS === 'ios' ? 0.99 : 0.9;

import { invalidateApiCache } from '@/components/apiCache';
import { HomeTicketStrip } from '@/components/eventos/HomeTicketStrip';
import HomeDisintegrate from '@/components/home/HomeDisintegrate';
import { HomeMagicLayer, useHomeMagic } from '@/components/home/HomeMagicLayer';
import { useLocale } from '@/components/LocaleContext';
import { PulsatingDots } from '@/components/PulsatingDots';
import {
    FavoriteCategories,
    PopularProducts,
    ProductRail,
    RecommendedProducts,
    RecommendedStores,
} from '@/components/recommendations';
import { useAppTheme, type HomePalette } from '@/components/tema';
import {
    AccountDataKey,
    getAccountItem,
    setAccountItem,
    subscribeAccountScope,
} from '@/lib/accountStorage';
import { getCartJson, setCartJson } from '@/lib/cartStorage';
import { listImageUrl, optimizedImageUrl } from '@/lib/imageOptimization';
import { parseCmsNavigationTarget } from '@/lib/navigation';
import {
    announceNewlyConfirmedTickets,
    getLocalTickets,
    mergeTicketsWithLocal,
    syncLocalTicketsToServer,
} from '@/lib/localTickets';
import {
    getFavoriteProductIds,
    subscribeProductFavorites,
    toFavProduct,
    toggleProductFavorite,
} from '@/lib/productFavorites';
import { connectChatSocket } from '@/lib/chatSocket';
import ViewShot, { captureRef } from 'react-native-view-shot';
import {
    getHomeBanners,
    getHomeRecommendations,
    getLiveProducts,
    getMyOrders,
    getMyTickets,
    getMyNotifications,
    getSupportConversation,
    syncCartToServer,
    trackAppAccess,
    trackEvent,
    trackUserActivity,
    type EventTicketDto,
    type HomeBanner,
    type HomeBannersGrouped,
    type HomeRecommendations,
    type SupportConversation,
} from '../../components/api';
import { useAuth } from '../../components/AuthContext';
import CatalogoModal from '../../components/CatalogoModal';
import LocalizacaoModal from '../../components/LocalizacaoModal';

function supportUnreadFromConversation(data: SupportConversation) {
  const raw =
    data.unread_count
    ?? (data as { unreadCount?: number }).unreadCount
    ?? (data as { customer_unread?: number }).customer_unread
    ?? 0;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

const { width } = Dimensions.get('window');
/** Grade estilo Yandex/Market: quase de borda a borda, gap mínimo */
const GRID_PAD = 4;
const GRID_GAP = 4;
const COLUMN_WIDTH = (width - GRID_PAD * 2 - GRID_GAP) / 2;
const HERO_PAGE_WIDTH = width - 28;
const FEED_PAGE_WIDTH = width - 24;
const BANNER_AUTOPLAY_MS = 4500;
const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400';
const G_CART_LOGO = require('../../assets/images/g-cart-logo.png');

type HomeCartItem = {
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
};

function productIdFromCartItem(item: HomeCartItem): string | undefined {
  if (item.productId) return item.productId;
  const fromId = item.id?.split(':')[0];
  return fromId || undefined;
}

async function readCartQtyByProductId(): Promise<Record<string, number>> {
  try {
    const raw = await getCartJson();
    if (!raw) return {};
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) throw new Error('Carrinho local inválido');
    const cart = value as HomeCartItem[];
    const map: Record<string, number> = {};
    for (const item of cart) {
      const pid = productIdFromCartItem(item);
      if (!pid) continue;
      map[pid] = (map[pid] || 0) + Math.max(1, Number(item.quantity) || 1);
    }
    return map;
  } catch {
    return {};
  }
}

function bannersSignature(group: HomeBannersGrouped) {
  const pack = (list: HomeBanner[]) =>
    list.map((b) => `${b.id}:${b.image_url}:${b.title}:${b.subtitle}:${b.link_url ?? ''}`).join('|');
  return `h:${pack(group.hero)};f:${pack(group.feed)};g:${pack(group.grid)};s:${pack(group.search)}`;
}

function productIdsSignature(products: {
  id: string;
  titulo?: string;
  preco?: unknown;
  preco_gpay?: unknown;
  delivery_time?: string | null;
  stock?: unknown;
}[]) {
  return products.map((p) => [
    p.id,
    p.titulo ?? '',
    p.preco ?? '',
    p.preco_gpay ?? '',
    p.delivery_time ?? '',
    p.stock ?? '',
  ].join(':')).join('|');
}

function recommendationsSignature(data: HomeRecommendations) {
  return [
    productIdsSignature(data.continueWatching),
    productIdsSignature(data.recommended),
    data.favoriteCategories.map((c) => c.id).join('|'),
    data.becauseYouVisited
      .map((s) => `${s.category.id}:${productIdsSignature(s.products)}`)
      .join(';'),
    `${data.basedOnSearches.terms.join(',')}:${productIdsSignature(data.basedOnSearches.products)}`,
    productIdsSignature(data.similarProducts),
    productIdsSignature(data.newProducts),
    productIdsSignature(data.popularProducts),
    `${data.popularInRegion.region}:${productIdsSignature(data.popularInRegion.products)}`,
    data.recommendedStores.map((s) => s.id).join('|'),
    productIdsSignature(data.youMayLike),
  ].join('||');
}

type HomeStyles = ReturnType<typeof createHomeStyles>;

type BannerCarouselProps = {
  banners: HomeBanner[];
  variant: 'hero' | 'feed';
  onPress: (banner: HomeBanner) => void;
  styles: HomeStyles;
};

const BannerCarousel = memo(function BannerCarousel({
  banners,
  variant,
  onPress,
  styles,
}: BannerCarouselProps) {
  const { t } = useLocale();
  const scrollRef = useRef<ScrollView>(null);
  const indexRef = useRef(0);
  const directionRef = useRef(1);
  const touchingRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const pageWidth = variant === 'hero' ? HERO_PAGE_WIDTH : FEED_PAGE_WIDTH;
  const multi = banners.length > 1;
  const bannerIds = banners.map((banner) => banner.id).join(',');

  const goToIndex = useCallback(
    (next: number, animated = true) => {
      if (next < 0 || next >= banners.length) return;
      indexRef.current = next;
      setActiveIndex(next);
      scrollRef.current?.scrollTo({ x: next * pageWidth, y: 0, animated });
    },
    [banners.length, pageWidth],
  );

  useEffect(() => {
    indexRef.current = 0;
    directionRef.current = 1;
    setActiveIndex(0);
    scrollRef.current?.scrollTo({ x: 0, y: 0, animated: false });
  }, [bannerIds]);

  useEffect(() => {
    if (!multi) return;

    const timer = setInterval(() => {
      if (touchingRef.current) return;

      let next = indexRef.current + directionRef.current;
      if (next >= banners.length || next < 0) {
        directionRef.current *= -1;
        next = indexRef.current + directionRef.current;
      }
      if (next === indexRef.current) return;
      goToIndex(next, true);
    }, BANNER_AUTOPLAY_MS);

    return () => clearInterval(timer);
  }, [multi, banners.length, goToIndex]);

  if (!banners.length) return null;

  return (
    <View style={variant === 'hero' ? styles.heroCarouselWrap : styles.feedCarouselWrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        scrollEventThrottle={16}
        style={{ width: pageWidth }}
        onScrollBeginDrag={() => {
          touchingRef.current = true;
        }}
        onMomentumScrollEnd={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
          touchingRef.current = false;
          const next = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
          const clamped = Math.max(0, Math.min(next, banners.length - 1));
          indexRef.current = clamped;
          setActiveIndex(clamped);
        }}
      >
        {banners.map((item) =>
          (variant === 'hero' ? (
            <TouchableOpacity
              key={item.id}
              style={[styles.promoRow, { width: pageWidth }]}
              activeOpacity={0.9}
              onPress={() => onPress(item)}
            >
              <View style={styles.promoTextCol}>
                <Text style={styles.promoTitle} numberOfLines={2}>
                  {item.title || t('home.bannerFallback')}
                </Text>
                {item.subtitle ? (
                  <Text style={styles.promoSubtitle} numberOfLines={2}>
                    {item.subtitle}
                  </Text>
                ) : null}
              </View>
              <Image
                source={{ uri: optimizedImageUrl(item.image_url, 'card') }}
                style={styles.promoImage}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={item.id}
              />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              key={item.id}
              style={[styles.adCard, { width: pageWidth }]}
              activeOpacity={0.95}
              onPress={() => onPress(item)}
            >
              <Image
                source={{ uri: optimizedImageUrl(item.image_url, 'card') }}
                style={[styles.adImage, { width: pageWidth }]}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={item.id}
              />
              <View style={styles.adOverlay} pointerEvents="none">
                <View style={styles.adBadge}>
                  <Text style={styles.adBadgeText}>Anúncio</Text>
                </View>
                <View style={styles.adCopy}>
                  {item.title ? <Text style={styles.adTitle}>{item.title}</Text> : null}
                  {item.subtitle ? <Text style={styles.adSubtitle}>{item.subtitle}</Text> : null}
                </View>
              </View>
            </TouchableOpacity>
          )),
        )}
      </ScrollView>
      {multi ? (
        <View style={styles.dotsRow}>
          {banners.map((banner, index) => (
            <View
              key={banner.id}
              style={[styles.dot, activeIndex === index && styles.dotActive]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
});

/** Some o endereço; barra de busca fica fixa. */
const ADDRESS_COLLAPSE = 44;

interface ProductItemProps {
  id: string;
  titulo: string;
  preco: number;
  preco_gpay: number;
  image_url: string | null;
  image_urls?: string[] | null;
  delivery_time?: string | null;
}

function formatDeliveryEta(deliveryTime?: string | null) {
  const value = deliveryTime?.trim();
  if (!value) return null;
  if (/^entrega\b/i.test(value)) return value;
  return `Entrega em ${value}`;
}

type FeedItem =
  | { kind: 'product'; key: string; product: ProductItemProps }
  | { kind: 'ad'; key: string; banner: HomeBanner };

const EMPTY_BANNERS: HomeBannersGrouped = { hero: [], feed: [], grid: [], search: [] };
const SKELETON_CARD_COUNT = 6;

const HomeFeedSkeleton = memo(function HomeFeedSkeleton({
  styles,
  boneColor,
}: {
  styles: HomeStyles;
  boneColor: string;
}) {
  const pulse = useSharedValue(0.42);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(0.88, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <View style={styles.productGrid}>
      {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
        <View key={`skeleton-${index}`} style={styles.skeletonGridItem}>
          <Animated.View style={[styles.skeletonCard, pulseStyle]}>
            <View style={[styles.skeletonImage, { backgroundColor: boneColor }]} />
            <View style={[styles.skeletonLine, styles.skeletonTitle, { backgroundColor: boneColor }]} />
            <View style={[styles.skeletonLine, styles.skeletonTitleShort, { backgroundColor: boneColor }]} />
            <View style={[styles.skeletonLine, styles.skeletonPrice, { backgroundColor: boneColor }]} />
          </Animated.View>
        </View>
      ))}
    </View>
  );
});

const FeedAdCard = memo(function FeedAdCard({
  banner,
  styles,
  onPress,
}: {
  banner: HomeBanner;
  styles: HomeStyles;
  onPress: (banner: HomeBanner) => void;
}) {
  return (
    <TouchableOpacity
      style={styles.productCard}
      activeOpacity={0.85}
      onPress={() => onPress(banner)}
    >
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: optimizedImageUrl(banner.image_url, 'card') }}
          style={styles.productImage}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={banner.id}
        />
        <View style={styles.publicidadeBadge}>
          <Text style={styles.publicidadeBadgeText}>Publicidade</Text>
        </View>
      </View>
      {banner.title ? (
        <Text style={styles.productTitle} numberOfLines={2}>
          {banner.title}
        </Text>
      ) : (
        <Text style={styles.productTitle} numberOfLines={1}>
          Publicidade
        </Text>
      )}
      {banner.subtitle ? (
        <Text style={styles.adGridSubtitle} numberOfLines={2}>
          {banner.subtitle}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
});

function productCardImageUris(product: ProductItemProps): string[] {
  const seen = new Set<string>();
  const uris: string[] = [];

  for (const raw of product.image_urls ?? []) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    uris.push(optimizedImageUrl(trimmed, 'card'));
  }

  if (!uris.length && typeof product.image_url === 'string' && product.image_url.trim()) {
    uris.push(optimizedImageUrl(product.image_url, 'card'));
  }

  return uris.length ? uris : [FALLBACK_IMAGE];
}

const CardGalleryDot = memo(function CardGalleryDot({
  index,
  scrollX,
  pageWidth,
  styles,
}: {
  index: number;
  scrollX: SharedValue<number>;
  pageWidth: number;
  styles: HomeStyles;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const input = [(index - 1) * pageWidth, index * pageWidth, (index + 1) * pageWidth];
    return {
      width: interpolate(scrollX.value, input, [5, 14, 5], Extrapolation.CLAMP),
      opacity: interpolate(scrollX.value, input, [0.42, 1, 0.42], Extrapolation.CLAMP),
    };
  });

  return <Animated.View style={[styles.cardImageDot, animatedStyle]} />;
});

const FeedProductCard = memo(function FeedProductCard({
  product,
  isFavorite,
  cartQty,
  styles,
  onPress,
  onToggleFavorite,
  onAddToCart,
  onGalleryDragStart,
  onGalleryDragEnd,
}: {
  product: ProductItemProps;
  isFavorite: boolean;
  cartQty: number;
  styles: HomeStyles;
  onPress: (id: string) => void;
  onToggleFavorite: (product: ProductItemProps) => void;
  onAddToCart: (product: ProductItemProps) => void;
  onGalleryDragStart?: () => void;
  onGalleryDragEnd?: () => void;
}) {
  const images = useMemo(() => productCardImageUris(product), [product]);
  const multi = images.length > 1;
  const showCounter = multi && images.length > 5;
  const [activeImage, setActiveImage] = useState(0);
  const scrollX = useSharedValue(0);
  const activeIndexRef = useRef(0);
  const galleryRef = useRef<Animated.ScrollView>(null);
  const inCart = cartQty > 0;

  useEffect(() => {
    activeIndexRef.current = 0;
    setActiveImage(0);
    scrollX.value = 0;
    galleryRef.current?.scrollTo({ x: 0, y: 0, animated: false });
  }, [product.id, scrollX]);

  useEffect(() => {
    return () => {
      onGalleryDragEnd?.();
    };
  }, [onGalleryDragEnd]);

  const openDetails = useCallback(() => {
    onPress(product.id);
  }, [onPress, product.id]);

  const syncActiveImage = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(next, images.length - 1));
    if (activeIndexRef.current === clamped) return;
    activeIndexRef.current = clamped;
    setActiveImage(clamped);
  }, [images.length]);

  const handleDragStart = useCallback(() => {
    onGalleryDragStart?.();
  }, [onGalleryDragStart]);

  const handleDragEnd = useCallback(() => {
    onGalleryDragEnd?.();
  }, [onGalleryDragEnd]);

  const onGalleryScroll = useAnimatedScrollHandler({
    onBeginDrag: () => {
      runOnJS(handleDragStart)();
    },
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
    onEndDrag: (event) => {
      const velocityX = event.velocity?.x ?? 0;
      // Sem momentum a seguir: libertar o feed de imediato.
      if (Math.abs(velocityX) < 0.08) {
        runOnJS(handleDragEnd)();
      }
      const next = Math.round(event.contentOffset.x / COLUMN_WIDTH);
      runOnJS(syncActiveImage)(next);
    },
    onMomentumEnd: (event) => {
      const next = Math.round(event.contentOffset.x / COLUMN_WIDTH);
      runOnJS(syncActiveImage)(next);
      runOnJS(handleDragEnd)();
    },
  });

  return (
    <View style={styles.productCard}>
      <View style={styles.imageContainer}>
        {multi ? (
          <Animated.ScrollView
            ref={galleryRef}
            key={product.id}
            horizontal
            bounces={false}
            alwaysBounceHorizontal={false}
            overScrollMode="never"
            nestedScrollEnabled
            directionalLockEnabled
            disableIntervalMomentum
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            decelerationRate={CARD_GALLERY_DECEL}
            scrollEventThrottle={16}
            style={styles.productImagePager}
            onScroll={onGalleryScroll}
          >
            {images.map((uri, index) => (
              <Pressable
                key={`${product.id}-img-${index}`}
                style={styles.productImageSlide}
                onPress={openDetails}
                accessibilityRole="button"
                accessibilityLabel={product.titulo}
              >
                <Image
                  source={{ uri }}
                  style={styles.productImage}
                  contentFit="cover"
                  transition={160}
                  cachePolicy="memory-disk"
                  recyclingKey={`${product.id}-${index}`}
                />
              </Pressable>
            ))}
          </Animated.ScrollView>
        ) : (
          <Pressable
            style={styles.productImageSlide}
            onPress={openDetails}
            accessibilityRole="button"
            accessibilityLabel={product.titulo}
          >
            <Image
              source={{ uri: images[0] }}
              style={styles.productImage}
              contentFit="cover"
              transition={160}
              cachePolicy="memory-disk"
              recyclingKey={product.id}
            />
          </Pressable>
        )}

        <TouchableOpacity
          style={styles.heartButton}
          onPress={() => onToggleFavorite(product)}
          hitSlop={8}
        >
          <Ionicons
            name={isFavorite ? 'heart' : 'heart-outline'}
            size={18}
            color={isFavorite ? '#E91E63' : '#777'}
          />
        </TouchableOpacity>

        <Pressable
          onPress={(e) => {
            e?.stopPropagation?.();
            onAddToCart(product);
          }}
          style={({ pressed }) => [
            styles.cartButton,
            pressed && styles.cartButtonPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Adicionar ao carrinho"
          hitSlop={6}
        >
          {({ pressed }) => (
            <>
              <View
                style={[
                  styles.cartButtonFill,
                  (pressed || inCart) && styles.cartButtonFillActive,
                ]}
              >
                <Image
                  source={G_CART_LOGO}
                  style={styles.cartLogo}
                  contentFit="contain"
                />
              </View>
              {inCart ? (
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>{cartQty > 99 ? '99+' : String(cartQty)}</Text>
                </View>
              ) : null}
            </>
          )}
        </Pressable>

        {multi ? (
          showCounter ? (
            <View style={styles.cardImageCounter} pointerEvents="none">
              <Text style={styles.cardImageCounterText}>
                {activeImage + 1}/{images.length}
              </Text>
            </View>
          ) : (
            <View style={styles.cardImageDots} pointerEvents="none">
              {images.map((_, index) => (
                <CardGalleryDot
                  key={`dot-${index}`}
                  index={index}
                  scrollX={scrollX}
                  pageWidth={COLUMN_WIDTH}
                  styles={styles}
                />
              ))}
            </View>
          )
        ) : null}
      </View>

      <Pressable onPress={openDetails} accessibilityRole="button">
        <Text style={styles.productTitle} numberOfLines={2}>
          {product.titulo}
        </Text>

        {(() => {
          const eta = formatDeliveryEta(product.delivery_time);
          return eta ? (
            <Text style={styles.deliveryEta} numberOfLines={1}>
              {eta}
            </Text>
          ) : null;
        })()}

        <View style={styles.priceContainer}>
          <Text style={styles.normalPrice}>
            {parseFloat(product.preco as any).toLocaleString()} CFA
          </Text>
        </View>

        <View style={styles.gcoinRow}>
          <Text style={styles.gcoinPrice}>
            {parseFloat(product.preco_gpay as any).toLocaleString()} GCoin
          </Text>
          <View style={styles.gpayBadge}>
            <Text style={styles.gpayBadgeText}>GPay</Text>
          </View>
        </View>
      </Pressable>
    </View>
  );
});

function buildFeedItems(products: ProductItemProps[], gridAds: HomeBanner[]): FeedItem[] {
  if (!gridAds.length) {
    return products.map((product) => ({
      kind: 'product' as const,
      key: `product-${product.id}`,
      product,
    }));
  }

  const items: FeedItem[] = [];
  let adIndex = 0;

  products.forEach((product, index) => {
    items.push({
      kind: 'product',
      key: `product-${product.id}`,
      product,
    });
    // A cada 2 linhas (4 produtos), mistura 1 publicidade em coluna
    if ((index + 1) % 4 === 0 && adIndex < gridAds.length) {
      const banner = gridAds[adIndex];
      adIndex += 1;
      items.push({
        kind: 'ad',
        key: `ad-${banner.id}`,
        banner,
      });
    }
  });

  while (adIndex < gridAds.length) {
    const banner = gridAds[adIndex];
    adIndex += 1;
    items.push({
      kind: 'ad',
      key: `ad-${banner.id}`,
      banner,
    });
  }

  return items;
}

function SearchRow({
  colors,
  styles,
  onCatalog,
  onNotifications,
  onSearch,
  onChat,
  notificationsUnread,
  chatUnread,
}: {
  colors: HomePalette;
  styles: HomeStyles;
  onCatalog: () => void;
  onNotifications: () => void;
  onSearch: () => void;
  onChat: () => void;
  notificationsUnread: number;
  chatUnread: number;
}) {
  const { t } = useLocale();
  return (
    <View style={styles.searchRow}>
      <TouchableOpacity style={styles.circleBtn} onPress={onCatalog} activeOpacity={0.85}>
        <Ionicons name="grid-outline" size={22} color={colors.ink} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.searchPill} onPress={onSearch} activeOpacity={0.9}>
        <Ionicons name="search-outline" size={20} color={colors.ink} style={styles.searchIcon} />
        <Text style={[styles.input, { color: '#9CA3AF', lineHeight: 20 }]} numberOfLines={1}>
          {t('home.searchPlaceholder')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.circleBtn} onPress={onChat} activeOpacity={0.85}>
        <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.ink} />
        {chatUnread > 0 ? (
          <View style={styles.notifBadge}>
            <Text style={styles.notifBadgeText}>
              {chatUnread > 99 ? '99+' : String(chatUnread)}
            </Text>
          </View>
        ) : null}
      </TouchableOpacity>

      <TouchableOpacity style={styles.circleBtn} onPress={onNotifications} activeOpacity={0.85}>
        <Ionicons
          name={notificationsUnread > 0 ? 'notifications' : 'notifications-outline'}
          size={22}
          color={colors.ink}
        />
        {notificationsUnread > 0 ? (
          <View style={styles.notifBadge}>
            <Text style={styles.notifBadgeText}>
              {notificationsUnread > 99 ? '99+' : String(notificationsUnread)}
            </Text>
          </View>
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

const EMPTY_RECOMMENDATIONS: HomeRecommendations = {
  continueWatching: [],
  recommended: [],
  favoriteCategories: [],
  becauseYouVisited: [],
  basedOnSearches: { terms: [], products: [] },
  similarProducts: [],
  newProducts: [],
  popularProducts: [],
  popularInRegion: { region: 'Guiné-Bissau', products: [] },
  recommendedStores: [],
  youMayLike: [],
  popularSearches: [],
};

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, isLoggedIn, user } = useAuth();
  const { colors, isDark } = useAppTheme();
  const { t } = useLocale();
  const styles = useMemo(() => createHomeStyles(colors, isDark), [colors, isDark]);
  const [homeFocused, setHomeFocused] = useState(true);
  const homeFocusedRef = useRef(true);
  const homeScopeGenerationRef = useRef(0);
  const isHomeScopeActive = useCallback(
    (generation: number) =>
      homeFocusedRef.current && generation === homeScopeGenerationRef.current,
    [],
  );
  const {
    running: magicRunning,
    buttonVisible: magicButtonVisible,
    tornadoVisible,
    suckProgress,
    startMagic,
  } = useHomeMagic({ enabled: homeFocused });
  const shortcuts = useMemo(
    () => [
      { id: '1', name: 'GPay', icon: 'card-sharp', route: '/gpay' },
      { id: '2', name: t('home.shortcutStores'), icon: 'storefront-sharp', route: '/listaLojas' },
      { id: '3', name: t('home.shortcutDelivery'), icon: 'bicycle-sharp', route: '/entrega' },
      { id: '4', name: t('home.shortcutSpecials'), icon: 'flash-sharp', route: '' },
      { id: '5', name: t('home.shortcutEvents'), icon: 'musical-notes', route: '/eventos' },
      { id: '6', name: t('home.shortcutReviews'), icon: 'star-sharp', route: '/avaliacao' },
    ],
    [t],
  );
  const [favorites, setFavorites] = useState<string[]>([]);
  const [cartQtyById, setCartQtyById] = useState<Record<string, number>>({});
  const [catalogVisible, setCatalogVisible] = useState(false);
  const [localizacaoVisivel, setLocalizacaoVisivel] = useState(false);
  const [enderecoAtual, setEnderecoAtual] = useState('');
  const [products, setProducts] = useState<ProductItemProps[]>([]);
  const [banners, setBanners] = useState<HomeBannersGrouped>(EMPTY_BANNERS);
  const [refreshing, setRefreshing] = useState(false);
  const [homeLoading, setHomeLoading] = useState(true);
  const [activeDeliveries, setActiveDeliveries] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);
  const [myTickets, setMyTickets] = useState<EventTicketDto[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<HomeRecommendations>(EMPTY_RECOMMENDATIONS);
  const [homeError, setHomeError] = useState<string | null>(null);
  const bannersSigRef = useRef('');
  const productsSigRef = useRef('');
  const recommendationsSigRef = useRef('');
  const homeScrollRef = useRef<FlatList<FeedItem>>(null);
  const homeShotRef = useRef<ViewShot>(null);
  const [shardUri, setShardUri] = useState<string | null>(null);
  const scrollY = useSharedValue(0);

  // Toque em Início (já na Home) → sobe ao topo via a FlatList existente.
  useScrollToTop(homeScrollRef);

  // Troca de conta: limpa UI sensível imediatamente (evita flash da conta anterior).
  useEffect(() => {
    let active = true;
    setMyTickets([]);
    setUnreadNotifications(0);
    setChatUnread(0);
    setActiveDeliveries(0);
    setFavorites([]);
    void readCartQtyByProductId().then((next) => {
      if (active) setCartQtyById(next);
    });
    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!magicRunning) setShardUri(null);
  }, [magicRunning]);

  useEffect(() => {
    let cancelled = false;
    const loadHomeAddress = async () => {
      try {
        const saved = await getAccountItem(AccountDataKey.homeAddress, { allowGuest: true });
        if (cancelled) return;
        if (saved?.trim()) {
          setEnderecoAtual(saved.trim());
          return;
        }
        if (user?.endereco?.details) {
          const fromProfile = `${user.endereco.label}: ${user.endereco.details}`;
          setEnderecoAtual(fromProfile);
        } else {
          setEnderecoAtual('');
        }
      } catch {
        // keep default
      }
    };
    void loadHomeAddress();
    const unsub = subscribeAccountScope(() => {
      void loadHomeAddress();
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [user?.endereco?.label, user?.endereco?.details, user?.id]);

  const saveHomeAddress = useCallback(async (novoEnd: string) => {
    const next = novoEnd.trim();
    setEnderecoAtual(next);
    try {
      await setAccountItem(AccountDataKey.homeAddress, next, { allowGuest: true });
    } catch (error) {
      console.log('Erro ao guardar endereço da home:', error);
    }
  }, []);

  const loadHomeData = useCallback(async (forceRefresh = false) => {
    const generation = homeScopeGenerationRef.current;
    let cartProductIds: string[] = [];
    try {
      const rawCart = await getCartJson();
      if (rawCart) {
        const value: unknown = JSON.parse(rawCart);
        if (!Array.isArray(value)) throw new Error('Carrinho local inválido');
        const parsed = value as Array<{ productId?: string; id?: string }>;
        cartProductIds = [
          ...new Set(
            parsed
              .map((item) => item.productId || item.id)
              .filter((id): id is string => Boolean(id)),
          ),
        ];
      }
    } catch {
      cartProductIds = [];
    }

    // Enquanto o feed ainda não tem itens, mostra o pulso em vez do texto vazio.
    if (!productsSigRef.current) {
      setHomeLoading(true);
    }

    try {
      const cacheOpts = { forceRefresh };
      const [productData, bannerData, recommendationData] = await Promise.all([
        getLiveProducts(cacheOpts),
        getHomeBanners(cacheOpts),
        getHomeRecommendations(token, {
          region: enderecoAtual || 'Guiné-Bissau',
          cartProductIds,
          limit: 12,
          ...cacheOpts,
        }),
      ]);
      if (!isHomeScopeActive(generation)) return;

      // Só atualiza estado se o conteúdo mudou — evita tremor a cada poll
      const nextProductsSig = productIdsSignature(productData);
      if (forceRefresh || nextProductsSig !== productsSigRef.current) {
        productsSigRef.current = nextProductsSig;
        setProducts(productData);
      }

      const nextRecoSig = recommendationsSignature(recommendationData);
      if (nextRecoSig !== recommendationsSigRef.current) {
        recommendationsSigRef.current = nextRecoSig;
        setRecommendations(recommendationData);
      }

      const nextSig = bannersSignature(bannerData);
      if (nextSig !== bannersSigRef.current) {
        bannersSigRef.current = nextSig;
        setBanners(bannerData);
      }

      const hasContent =
        productData.length > 0
        || bannerData.hero.length > 0
        || bannerData.feed.length > 0
        || bannerData.grid.length > 0;
      setHomeError(
        hasContent
          ? null
          : t('home.offlineNoCache'),
      );
    } catch (error) {
      console.log('Erro ao carregar home:', error);
      if (isHomeScopeActive(generation)) setHomeError(t('home.offlineCache'));
    } finally {
      if (isHomeScopeActive(generation)) setHomeLoading(false);
    }
  }, [enderecoAtual, isHomeScopeActive, t, token]);

  const loadActiveDeliveries = useCallback(async () => {
    const generation = homeScopeGenerationRef.current;
    if (!isLoggedIn || !token) {
      setActiveDeliveries(0);
      return;
    }
    const result = await getMyOrders(token, 'active');
    if (result.success && isHomeScopeActive(generation)) {
      setActiveDeliveries(result.data.length);
    }
  }, [isHomeScopeActive, isLoggedIn, token]);

  const loadMyTickets = useCallback(async () => {
    const generation = homeScopeGenerationRef.current;
    if (!isLoggedIn || !token) {
      setMyTickets([]);
      setTicketsLoading(false);
      return;
    }

    // Nunca mostrar cache de outra conta: só o scope da conta ativa.
    const cached = await getLocalTickets();
    if (!isHomeScopeActive(generation)) return;
    if (cached.length) {
      setMyTickets(cached);
      setTicketsLoading(false);
    } else {
      setMyTickets([]);
      setTicketsLoading(true);
    }

    await syncLocalTicketsToServer(token);
    if (!isHomeScopeActive(generation)) return;
    const remote = await getMyTickets(token);
    if (!isHomeScopeActive(generation)) return;
    if (remote === null) {
      const offline = await getLocalTickets();
      if (!isHomeScopeActive(generation)) return;
      setMyTickets(offline);
      setTicketsLoading(false);
      return;
    }

    const previous = cached.length ? cached : await getLocalTickets();
    const tickets = await mergeTicketsWithLocal(remote);
    if (!isHomeScopeActive(generation)) return;
    void announceNewlyConfirmedTickets(previous, tickets);
    setMyTickets(tickets);
    setTicketsLoading(false);
  }, [isHomeScopeActive, isLoggedIn, token]);

  const loadUnreadNotifications = useCallback(async () => {
    const generation = homeScopeGenerationRef.current;
    if (!isLoggedIn || !token) {
      setUnreadNotifications(0);
      return;
    }
    // Conta só a inbox — mensagens de suporte ficam no badge do chat.
    const result = await getMyNotifications(token, 50);
    if (result.success && isHomeScopeActive(generation)) {
      const count = result.data.filter(
        (item) => !item.read_at && item.type !== 'support_message',
      ).length;
      setUnreadNotifications(count);
    }
  }, [isHomeScopeActive, isLoggedIn, token]);

  const loadChatUnread = useCallback(async () => {
    const generation = homeScopeGenerationRef.current;
    if (!isLoggedIn || !token) {
      setChatUnread(0);
      return;
    }
    const supportResult = await getSupportConversation(token);
    if (!isHomeScopeActive(generation)) return;
    if (supportResult.success) {
      setChatUnread(supportUnreadFromConversation(supportResult.data));
      return;
    }
    // Fallback: conta alertas de suporte ainda não lidos na inbox.
    const inbox = await getMyNotifications(token, 50);
    if (inbox.success && isHomeScopeActive(generation)) {
      const count = inbox.data.filter(
        (item) => !item.read_at && item.type === 'support_message',
      ).length;
      setChatUnread(count);
    }
  }, [isHomeScopeActive, isLoggedIn, token]);

  useEffect(() => {
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem('@gmarket:presence_device_id');
        const deviceId =
          stored
          || `gm-${Platform.OS}-home-${Date.now().toString(36)}`;
        await trackAppAccess(
          deviceId,
          Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : 'Web',
        );
      } catch {
        // analytics best-effort
      }
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      homeScopeGenerationRef.current += 1;
      const generation = homeScopeGenerationRef.current;
      homeFocusedRef.current = true;
      setHomeFocused(true);
      loadHomeData(false);
      loadActiveDeliveries();
      loadUnreadNotifications();
      void loadChatUnread();

      void loadMyTickets();
      void getFavoriteProductIds().then((next) => {
        if (isHomeScopeActive(generation)) setFavorites(next);
      });
      void readCartQtyByProductId().then((next) => {
        if (isHomeScopeActive(generation)) setCartQtyById(next);
      });
      // Cache local evita rede a cada ciclo; 2 min basta para dados frescos sem gastar MB
      const refreshInterval = setInterval(() => {
        loadHomeData(false);
        loadActiveDeliveries();
        loadUnreadNotifications();
        void loadChatUnread();
        void loadMyTickets();
      }, 120000);

      return () => {
        homeFocusedRef.current = false;
        homeScopeGenerationRef.current += 1;
        setHomeFocused(false);
        clearInterval(refreshInterval);
      };
    }, [
      loadActiveDeliveries,
      loadChatUnread,
      loadHomeData,
      loadMyTickets,
      loadUnreadNotifications,
      isHomeScopeActive,
    ]),
  );

  // Badge do chat em tempo real enquanto a home está focada.
  useEffect(() => {
    if (!token || !isLoggedIn || !homeFocused) return;
    const supportSession = connectChatSocket({
      token,
      onMessage: (message) => {
        const fromSupport =
          (message.sender_type || message.sender) !== 'customer';
        if (fromSupport) void loadChatUnread();
      },
      onConversation: () => {
        void loadChatUnread();
      },
    });
    return () => {
      supportSession.teardown();
    };
  }, [homeFocused, isLoggedIn, loadChatUnread, token]);

  useEffect(() => {
    return subscribeProductFavorites((products) => {
      setFavorites(products.map((p) => p.id));
    });
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await invalidateApiCache('live-products');
      await invalidateApiCache('product:');
      await invalidateApiCache('home-banners');
      await Promise.all([
        loadHomeData(true),
        loadActiveDeliveries(),
        loadUnreadNotifications(),
        loadChatUnread(),
        loadMyTickets(),
      ]);
    } finally {
      setRefreshing(false);
    }
    // loadHomeData / loaders fecham sobre estado atual a cada render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isLoggedIn, user?.id]);

  const feedItems = useMemo(
    () => buildFeedItems(products, banners.grid),
    [products, banners.grid],
  );

  const onBannerPress = useCallback(async (banner: HomeBanner) => {
    trackEvent('CLICOU_ANUNCIO', banner.id, banner.title || 'Banner GMarket');
    const target = parseCmsNavigationTarget(banner.link_url || '');
    if (!target) return;

    try {
      if (target.kind === 'internal') {
        router.push(target.href);
        return;
      }
      if (target.kind === 'native') {
        await Linking.openURL(target.url);
        return;
      }
      await WebBrowser.openBrowserAsync(target.url);
    } catch (error) {
      console.log('Erro ao abrir link do banner:', error);
    }
  }, [router]);

  const openSearch = useCallback(() => {
    router.push('/search');
  }, [router]);

  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const favoritesRef = useRef(favorites);
  favoritesRef.current = favorites;

  const toggleFavorite = useCallback((product: ProductItemProps) => {
    const removing = favoritesRef.current.includes(product.id);
    setFavorites((prev) =>
      removing ? prev.filter((id) => id !== product.id) : [...prev, product.id],
    );
    void toggleProductFavorite(toFavProduct(product)).then(({ isFavorite }) => {
      setFavorites((prev) => {
        if (isFavorite) return prev.includes(product.id) ? prev : [...prev, product.id];
        return prev.filter((id) => id !== product.id);
      });
    });
    void trackUserActivity(token, {
      action: removing ? 'remove_favorite' : 'add_favorite',
      productId: product.id,
    });
  }, [token]);

  const addToCartFromHome = useCallback(async (product: ProductItemProps) => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      const raw = await getCartJson();
      const value: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(value)) throw new Error('Carrinho local inválido');
      let cartList = value as HomeCartItem[];
      const alreadyInCart = cartList.some(
        (item) => productIdFromCartItem(item) === product.id,
      );

      if (alreadyInCart) {
        cartList = cartList.filter(
          (item) => productIdFromCartItem(item) !== product.id,
        );
        void trackUserActivity(token, {
          action: 'remove_cart',
          productId: product.id,
        });
        setCartQtyById((prev) => {
          const next = { ...prev };
          delete next[product.id];
          return next;
        });
      } else {
        const image = listImageUrl(product.image_urls, product.image_url, FALLBACK_IMAGE, 'thumb');
        const price =
          Number(product.preco_gpay) > 0 ? Number(product.preco_gpay) : Number(product.preco) || 0;

        cartList.push({
          id: product.id,
          productId: product.id,
          title: product.titulo,
          price,
          image,
          quantity: 1,
          selected: true,
        });
        void trackUserActivity(token, {
          action: 'add_cart',
          productId: product.id,
        });
        setCartQtyById((prev) => ({ ...prev, [product.id]: 1 }));
      }

      await setCartJson(JSON.stringify(cartList));
      if (token) void syncCartToServer(token, cartList);

      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(
          alreadyInCart
            ? Haptics.NotificationFeedbackType.Warning
            : Haptics.NotificationFeedbackType.Success,
        );
      }
    } catch (error) {
      console.log('Erro ao atualizar carrinho na home:', error);
    }
  }, [token]);

  const openProduct = useCallback((id: string) => {
    router.push({
      pathname: '/productDetail',
      params: { id },
    });
  }, [router]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const startMagicAndScroll = useCallback(() => {
    if (Platform.OS === 'android') return;
    homeScrollRef.current?.scrollToOffset({ offset: 0, animated: false });
    requestAnimationFrame(() => {
      void (async () => {
        try {
          const uri = await captureRef(homeShotRef, {
            format: 'jpg',
            quality: 0.72,
            result: 'tmpfile',
          });
          setShardUri(uri);
        } catch (error) {
          console.log('Home magic capture failed:', error);
          setShardUri(null);
        }
        startMagic();
      })();
    });
  }, [startMagic]);

  const stickyStyle = useAnimatedStyle(() => {
    // Esconde no topo e durante o pull (offset negativo no iOS)
    if (scrollY.value <= 0) {
      return { opacity: 0, transform: [{ translateY: -12 }] };
    }
    const opacity = interpolate(
      scrollY.value,
      [ADDRESS_COLLAPSE - 32, ADDRESS_COLLAPSE + 4],
      [0, 1],
      Extrapolation.CLAMP,
    );
    const translateY = interpolate(
      scrollY.value,
      [ADDRESS_COLLAPSE - 32, ADDRESS_COLLAPSE + 4],
      [-12, 0],
      Extrapolation.CLAMP,
    );
    return { opacity, transform: [{ translateY }] };
  });

  const stickyAnimatedProps = useAnimatedProps(() => ({
    pointerEvents: (scrollY.value > ADDRESS_COLLAPSE - 6 ? 'auto' : 'none') as 'auto' | 'none',
  }));

  const listHeader = useMemo(() => (
    <View style={styles.headerBlock}>
      {/* Hero opaco full-bleed: no pull desce COM o conteúdo, não o fundo atrás */}
      <View style={styles.heroZone}>
        <LinearGradient
          colors={[colors.deep, colors.mid, colors.soft, colors.mist, colors.surface]}
          locations={[0, 0.22, 0.48, 0.78, 1]}
          start={{ x: 0.05, y: 0 }}
          end={{ x: 0.95, y: 1 }}
          style={[styles.heroGradient, { paddingTop: insets.top + 8 }]}
        >
          <TouchableOpacity
            style={styles.addressRow}
            onPress={() => setLocalizacaoVisivel(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="location-sharp" size={15} color={colors.accent} />
            <Text style={styles.addressText} numberOfLines={1}>
              {enderecoAtual || t('home.addAddress')}
            </Text>
            <Ionicons name="chevron-forward" size={15} color={colors.muted} />
          </TouchableOpacity>

          <SearchRow
            colors={colors}
            styles={styles}
            onCatalog={() => setCatalogVisible(true)}
            onNotifications={() => router.push('/notificacoes')}
            onSearch={openSearch}
            onChat={() => router.push('/chat')}
            notificationsUnread={unreadNotifications}
            chatUnread={chatUnread}
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoriesScroll}
            contentContainerStyle={styles.categoriesContent}
          >
            {shortcuts.map((cat) => {
              const showDeliveryBadge = cat.route === '/entrega' && activeDeliveries > 0;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={styles.categoryItem}
                  activeOpacity={0.75}
                  onPress={() => (cat.route ? router.push(cat.route as any) : null)}
                >
                  <View style={styles.categoryIcon}>
                    <Ionicons
                      name={cat.icon as any}
                      size={22}
                      color={isDark ? '#111111' : colors.ink}
                    />
                    {showDeliveryBadge ? (
                      <View style={styles.deliveryBadge}>
                        <Text style={styles.deliveryBadgeText}>
                          {activeDeliveries > 99 ? '99+' : String(activeDeliveries)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.categoryName}>{cat.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {banners.hero.length > 0 ? (
            <BannerCarousel
              banners={banners.hero}
              variant="hero"
              onPress={onBannerPress}
              styles={styles}
            />
          ) : null}
        </LinearGradient>
      </View>

      <HomeTicketStrip
        tickets={myTickets}
        loading={ticketsLoading && isLoggedIn}
        isDark={isDark}
        pendingLabel={t('events.ticketPending')}
        pendingHint={t('events.ticketPendingHint')}
        shareLabel={t('events.shareTicket')}
        closeLabel={t('events.closeTicket')}
      />

      {banners.feed.length > 0 ? (
        <View style={styles.feed}>
          <BannerCarousel
            banners={banners.feed}
            variant="feed"
            onPress={onBannerPress}
            styles={styles}
          />
        </View>
      ) : (
        <View style={styles.feedSpacer} />
      )}

      <View style={styles.recommendationsWrap}>
        <FavoriteCategories categories={recommendations.favoriteCategories} />
        <RecommendedProducts products={recommendations.recommended} />
        {recommendations.becauseYouVisited.map((section) => (
          <ProductRail
            key={section.category.id}
            title={section.title}
            products={section.products}
          />
        ))}
        <ProductRail
          title={t('home.similarCart')}
          products={recommendations.similarProducts}
        />
        <ProductRail title={t('home.newArrivals')} products={recommendations.newProducts} />
        <PopularProducts products={recommendations.popularProducts} />
        <PopularProducts
          title={t('home.popularRegion')}
          subtitle={recommendations.popularInRegion.region || 'Guiné-Bissau'}
          products={recommendations.popularInRegion.products}
        />
        <RecommendedStores stores={recommendations.recommendedStores} />
      </View>
    </View>
  ), [
    activeDeliveries,
    banners.feed,
    banners.hero,
    colors,
    enderecoAtual,
    insets.top,
    isDark,
    isLoggedIn,
    myTickets,
    onBannerPress,
    openSearch,
    recommendations,
    router,
    shortcuts,
    styles,
    t,
    ticketsLoading,
    unreadNotifications,
    chatUnread,
  ]);

  const listHeaderWithError = useMemo(
    () => (
      <View>
        {listHeader}
        {homeError ? (
          <TouchableOpacity
            style={styles.errorBanner}
            onPress={() => {
              setHomeLoading(true);
              void loadHomeData(true);
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.errorBannerText}>{homeError}</Text>
            <Text style={styles.errorBannerAction}>{t('home.tapRetry')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    ),
    [homeError, listHeader, styles.errorBanner, styles.errorBannerAction, styles.errorBannerText, t],
  );

  const lockFeedScroll = useCallback(() => {
    // setNativeProps evita re-render do feed (que também saltava a posição).
    homeScrollRef.current?.setNativeProps({ scrollEnabled: false });
  }, []);

  const unlockFeedScroll = useCallback(() => {
    homeScrollRef.current?.setNativeProps({ scrollEnabled: true });
  }, []);

  const renderFeedItem = useCallback(
    ({ item }: ListRenderItemInfo<FeedItem>) => (
      <View style={styles.productGridItem}>
        {item.kind === 'ad' ? (
          <FeedAdCard banner={item.banner} styles={styles} onPress={onBannerPress} />
        ) : (
          <FeedProductCard
            product={item.product}
            isFavorite={favoriteSet.has(item.product.id)}
            cartQty={cartQtyById[item.product.id] || 0}
            styles={styles}
            onPress={openProduct}
            onToggleFavorite={toggleFavorite}
            onAddToCart={addToCartFromHome}
            onGalleryDragStart={lockFeedScroll}
            onGalleryDragEnd={unlockFeedScroll}
          />
        )}
      </View>
    ),
    [
      addToCartFromHome,
      cartQtyById,
      favoriteSet,
      lockFeedScroll,
      onBannerPress,
      openProduct,
      styles,
      toggleFavorite,
      unlockFeedScroll,
    ],
  );

  const keyExtractor = useCallback((item: FeedItem) => item.key, []);

  const listEmpty = useMemo(() => {
    if (homeLoading || homeError) {
      return (
        <HomeFeedSkeleton styles={styles} boneColor={isDark ? colors.soft : colors.mist} />
      );
    }
    return <Text style={styles.emptyText}>{t('home.emptyCloud')}</Text>;
  }, [colors.mist, colors.soft, homeError, homeLoading, isDark, styles, t]);

  const showShards = magicRunning && !!shardUri;

  return (
    <View
      style={[styles.mainWrapper, magicRunning && styles.mainWrapperMagic]}
      collapsable={false}
    >
      {/* FlatList first in the native chain so NativeTabs can minimize on scroll. */}
      <ViewShot
        ref={homeShotRef}
        style={styles.homeSuckLayer}
        options={{ format: 'jpg', quality: 0.72 }}
      >
        <View
          style={[styles.homeSuckLayer, showShards && styles.homeHidden]}
          pointerEvents={magicRunning ? 'none' : 'auto'}
          collapsable={false}
        >
          {/* FlatList 1.º na cadeia nativa: NativeTabs encontra o scroll no re-tap Início. */}
          <AnimatedFlatList
            ref={homeScrollRef}
            data={feedItems}
            renderItem={renderFeedItem}
            keyExtractor={keyExtractor}
            numColumns={2}
            extraData={{ favorites, cartQtyById, chatUnread, unreadNotifications }}
            style={[styles.list, magicRunning && styles.listMagic]}
            contentContainerStyle={[
              styles.listContent,
              magicRunning && styles.listContentMagic,
              // Espaço só o necessário para o último produto ficar acima da tab bar.
              { paddingBottom: Math.max(insets.bottom, 12) + 56 },
            ]}
            columnWrapperStyle={feedItems.length > 0 ? styles.columnWrapper : undefined}
            showsVerticalScrollIndicator={false}
            bounces={!magicRunning}
            alwaysBounceVertical={!magicRunning}
            overScrollMode="never"
            onScroll={scrollHandler}
            scrollEventThrottle={16}
            scrollEnabled={!magicRunning}
            contentInsetAdjustmentBehavior="never"
            refreshControl={
              magicRunning ? undefined : (
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor="transparent"
                  colors={['transparent']}
                  progressBackgroundColor="transparent"
                  progressViewOffset={Platform.OS === 'android' ? insets.top : 0}
                />
              )
            }
            ListHeaderComponent={listHeaderWithError}
            ListEmptyComponent={listEmpty}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={7}
            removeClippedSubviews={false}
          />
          <View pointerEvents="none" style={styles.overscrollDeepFill} />

          {/* Barra fixa: categoria + busca + notificação */}
          <Animated.View
            style={[styles.stickyWrap, stickyStyle, magicRunning && styles.stickyHidden]}
            animatedProps={stickyAnimatedProps}
          >
            <LinearGradient
              colors={[colors.deep, colors.mid]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.stickyInner, { paddingTop: insets.top + 8 }]}
            >
              <SearchRow
                colors={colors}
                styles={styles}
                onCatalog={() => setCatalogVisible(true)}
                onNotifications={() => router.push('/notificacoes')}
                onSearch={openSearch}
                onChat={() => router.push('/chat')}
                notificationsUnread={unreadNotifications}
                chatUnread={chatUnread}
              />
            </LinearGradient>
          </Animated.View>

          {refreshing ? (
            <View
              style={[styles.refreshLoader, { top: insets.top + 10 }]}
              pointerEvents="none"
            >
              <PulsatingDots color={colors.accent} />
            </View>
          ) : null}
        </View>
      </ViewShot>

      {/* Tornado atrás da UI — conteúdo voa para dentro dele */}
      <HomeMagicLayer
        running={magicRunning}
        buttonVisible={magicButtonVisible}
        tornadoVisible={tornadoVisible}
        onPressMagic={startMagicAndScroll}
        label={t('home.magic')}
      />

      {shardUri && magicRunning ? (
        <HomeDisintegrate uri={shardUri} progress={suckProgress} />
      ) : null}

      <CatalogoModal
        visivel={catalogVisible}
        onFechar={() => setCatalogVisible(false)}
        onSelectCategory={(category) => {
          void trackUserActivity(token, {
            action: 'view_category',
            categoryId: category.id,
            categoryName: category.name,
          });
          // Navega primeiro; fecha o catálogo depois para não revelar a home.
          router.push({
            pathname: '/search',
            params: {
              q: category.name,
              ...(category.id
                ? { categoryId: category.id, categoryName: category.name }
                : {}),
            },
          });
          setTimeout(() => setCatalogVisible(false), 120);
        }}
      />
      {localizacaoVisivel ? (
        <LocalizacaoModal
          visivel
          onFechar={() => setLocalizacaoVisivel(false)}
          onSelecionarEndereco={(novoEnd: string) => {
            void saveHomeAddress(novoEnd);
          }}
        />
      ) : null}
    </View>
  );
}

function createHomeStyles(C: HomePalette, isDark: boolean) {
  return StyleSheet.create({
    mainWrapper: {
      flex: 1,
      // surface atrás da tab bar → Liquid Glass não amostra o deep (fumaça)
      backgroundColor: C.surface,
    },
    mainWrapperMagic: {
      backgroundColor: '#000000',
    },
    homeSuckLayer: {
      flex: 1,
      zIndex: 2,
      elevation: 2,
      overflow: 'visible',
      backgroundColor: C.surface,
    },
    homeHidden: {
      opacity: 0,
    },
    /** Camada deep só no topo — aparece no overscroll/pull-down do iOS. */
    overscrollDeepFill: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 480,
      backgroundColor: C.deep,
      zIndex: 0,
    },
    list: {
      flex: 1,
      // transparente: no bounce de cima revela overscrollDeepFill (deep)
      backgroundColor: 'transparent',
      zIndex: 1,
    },
    listMagic: {
      backgroundColor: 'transparent',
    },
    listContent: {
      paddingBottom: 24,
      backgroundColor: C.surface,
      flexGrow: 1,
    },
    listContentMagic: {
      backgroundColor: 'transparent',
    },
    columnWrapper: {
      paddingHorizontal: GRID_PAD,
      justifyContent: 'space-between',
    },
    headerBlock: {
      backgroundColor: C.surface,
    },

    refreshLoader: {
      position: 'absolute',
      left: 0,
      right: 0,
      zIndex: 1100,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stickyWrap: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 1000,
      backgroundColor: C.deep,
      shadowColor: C.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 10,
      elevation: 6,
    },
    stickyHidden: {
      opacity: 0,
      pointerEvents: 'none',
    },
    stickyInner: {
      paddingHorizontal: 14,
      paddingBottom: 12,
    },

    heroZone: {
      backgroundColor: C.deep,
    },
    heroGradient: {
      paddingHorizontal: 14,
      paddingBottom: 20,
    },

    addressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    addressText: {
      flex: 1,
      marginHorizontal: 5,
      fontSize: 13,
      fontWeight: '600',
      color: C.address,
    },

    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    circleBtn: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: isDark ? 'rgba(14,14,14,0.82)' : C.surface,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: C.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.25 : 0.07,
      shadowRadius: 8,
      elevation: 2,
    },
    notifBadge: {
      position: 'absolute',
      top: 6,
      right: 6,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: '#DC2626',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
      borderWidth: 1.5,
      borderColor: '#FFF',
    },
    notifBadgeText: {
      color: '#FFF',
      fontSize: 10,
      fontWeight: '800',
    },
    searchPill: {
      flex: 1,
      height: 50,
      borderRadius: 25,
      backgroundColor: isDark ? 'rgba(14,14,14,0.82)' : C.surface,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      shadowColor: C.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.25 : 0.07,
      shadowRadius: 8,
      elevation: 2,
    },
    searchIcon: { marginRight: 8 },
    input: {
      flex: 1,
      fontSize: 15,
      fontWeight: '500',
      color: C.ink,
      paddingVertical: 0,
    },

    categoriesScroll: {
      marginTop: 18,
    },
    categoriesContent: {
      paddingRight: 6,
    },
    categoryItem: {
      alignItems: 'center',
      marginRight: 16,
      width: 64,
    },
    categoryIcon: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: 'rgba(255,255,255,0.92)',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 6,
      overflow: 'visible',
    },
    deliveryBadge: {
      position: 'absolute',
      top: -3,
      right: -3,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 4,
      backgroundColor: '#E53935',
      borderWidth: 2,
      borderColor: isDark ? C.deep : C.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    deliveryBadgeText: {
      color: '#FFF',
      fontSize: 10,
      fontWeight: '800',
      lineHeight: 12,
    },
    categoryName: {
      fontSize: 11,
      fontWeight: '600',
      color: C.ink,
    },

    promoRow: {
      marginTop: 18,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 4,
    },
    promoTextCol: {
      flex: 1,
      paddingRight: 12,
    },
    promoTitle: {
      fontSize: 20,
      fontWeight: '900',
      color: C.ink,
      letterSpacing: -0.3,
    },
    promoSubtitle: {
      marginTop: 6,
      fontSize: 13,
      fontWeight: '600',
      color: C.muted,
    },
    promoImage: {
      width: 96,
      height: 96,
      borderRadius: 16,
      backgroundColor: 'rgba(255,255,255,0.55)',
    },
    heroCarouselWrap: {
      marginTop: 14,
    },
    feedCarouselWrap: {
      marginBottom: 4,
    },
    dotsRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 6,
      marginTop: 10,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: 'rgba(17,17,17,0.2)',
    },
    dotActive: {
      width: 16,
      backgroundColor: C.accent,
    },

    feed: {
      backgroundColor: C.surface,
      paddingHorizontal: 12,
      paddingTop: 4,
      paddingBottom: 8,
    },
    feedSpacer: {
      height: 8,
      backgroundColor: C.surface,
    },
    recommendationsWrap: {
      backgroundColor: C.surface,
      paddingBottom: 8,
    },
    adCard: {
      width: FEED_PAGE_WIDTH,
      height: 178,
      borderRadius: 18,
      overflow: 'hidden',
      marginBottom: 8,
      backgroundColor: '#E5E7EB',
    },
    publicidadeBadge: {
      position: 'absolute',
      top: 8,
      left: 8,
      backgroundColor: 'rgba(0,0,0,0.62)',
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    publicidadeBadgeText: {
      color: '#FFF',
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.2,
    },
    adGridSubtitle: {
      fontSize: 11,
      color: '#6B7280',
      marginTop: 2,
      paddingHorizontal: 2,
    },
    adImage: {
      ...StyleSheet.absoluteFillObject,
      width: FEED_PAGE_WIDTH,
      height: 178,
      opacity: 1,
    },
    adOverlay: {
      ...StyleSheet.absoluteFillObject,
      padding: 16,
      justifyContent: 'space-between',
      backgroundColor: 'transparent',
    },
    adBadge: {
      alignSelf: 'flex-end',
      backgroundColor: '#E8E8E8',
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    adBadgeText: {
      color: '#111',
      fontSize: 9,
      fontWeight: '600',
    },
    adCopy: {
      maxWidth: '80%',
    },
    adTitle: {
      color: '#FFF',
      fontSize: 20,
      fontWeight: '900',
      lineHeight: 24,
      textShadowColor: 'rgba(0,0,0,0.55)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
    },
    adSubtitle: {
      color: '#FFF',
      fontSize: 13,
      marginTop: 6,
      fontWeight: '500',
      textShadowColor: 'rgba(0,0,0,0.5)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },

    productGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      backgroundColor: C.surface,
      rowGap: GRID_GAP,
    },
    productGridItem: {
      width: COLUMN_WIDTH,
      paddingBottom: GRID_GAP,
    },
    productCard: {
      width: COLUMN_WIDTH,
      backgroundColor: C.surface,
    },
    imageContainer: {
      position: 'relative',
      width: COLUMN_WIDTH,
      aspectRatio: 1 / 1.18,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: C.mist,
    },
    productImagePager: {
      width: COLUMN_WIDTH,
      height: '100%',
    },
    productImageSlide: {
      width: COLUMN_WIDTH,
      height: '100%',
    },
    productImage: {
      width: COLUMN_WIDTH,
      height: '100%',
    },
    cardImageDots: {
      position: 'absolute',
      left: 8,
      right: 54,
      bottom: 10,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 4,
      zIndex: 2,
    },
    cardImageDot: {
      height: 5,
      borderRadius: 3,
      backgroundColor: '#FFFFFF',
    },
    cardImageCounter: {
      position: 'absolute',
      left: 8,
      bottom: 10,
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderRadius: 10,
      paddingHorizontal: 7,
      paddingVertical: 3,
      zIndex: 2,
    },
    cardImageCounterText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '700',
    },
    heartButton: {
      position: 'absolute',
      top: 8,
      right: 8,
      backgroundColor: 'rgba(255,255,255,0.92)',
      borderRadius: 16,
      padding: 7,
      zIndex: 2,
    },
    cartButton: {
      position: 'absolute',
      right: 8,
      bottom: 8,
      width: 42,
      height: 42,
      borderRadius: 21,
      overflow: 'visible',
      zIndex: 2,
      shadowColor: '#000',
      shadowOpacity: 0.1,
      shadowRadius: 5,
      shadowOffset: { width: 0, height: 2 },
      elevation: 3,
    },
    cartButtonPressed: {
      transform: [{ scale: 0.94 }],
    },
    cartButtonFill: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FFFFFF',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(0,0,0,0.28)',
      overflow: 'hidden',
    },
    cartButtonFillActive: {
      backgroundColor: '#E3F2FD',
    },
    cartLogo: {
      width: 28,
      height: 28,
    },
    cartBadge: {
      position: 'absolute',
      top: -4,
      right: -4,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 4,
      backgroundColor: '#E53935',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: '#FFF',
    },
    cartBadgeText: {
      color: '#FFF',
      fontSize: 10,
      fontWeight: '800',
      lineHeight: 12,
    },
    productTitle: {
      fontSize: 13,
      color: C.ink,
      marginTop: 8,
      paddingHorizontal: 2,
      minHeight: 36,
      lineHeight: 18,
    },
    deliveryEta: {
      fontSize: 11,
      fontWeight: '600',
      color: '#60A5FA',
      marginTop: 2,
      paddingHorizontal: 2,
    },
    priceContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
      paddingHorizontal: 2,
    },
    normalPrice: {
      fontSize: 17.28,
      fontWeight: '900',
      color: '#16A34A',
    },
    gcoinRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 2,
      paddingHorizontal: 2,
    },
    gcoinPrice: {
      fontSize: 11,
      fontWeight: '600',
      color: '#999',
    },
    gpayBadge: {
      backgroundColor: '#DCFCE7',
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: 4,
      marginLeft: 6,
    },
    gpayBadgeText: {
      fontSize: 9,
      color: '#15803D',
      fontWeight: 'bold',
    },
    emptyText: {
      textAlign: 'center',
      color: '#999',
      marginTop: 28,
      fontSize: 13,
      fontWeight: '500',
      width: '100%',
    },
    skeletonGridItem: {
      width: COLUMN_WIDTH,
      marginBottom: GRID_GAP,
    },
    skeletonCard: {
      width: '100%',
      paddingBottom: 10,
    },
    skeletonImage: {
      width: '100%',
      aspectRatio: 1 / 1.18,
      borderRadius: 16,
    },
    skeletonLine: {
      borderRadius: 6,
      marginTop: 8,
      marginHorizontal: 2,
    },
    skeletonTitle: {
      height: 12,
      width: '92%',
    },
    skeletonTitleShort: {
      height: 12,
      width: '64%',
      marginTop: 6,
    },
    skeletonPrice: {
      height: 14,
      width: '42%',
      marginTop: 10,
    },

    errorBanner: {
      marginHorizontal: 12,
      marginTop: 10,
      marginBottom: 6,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: isDark ? '#3F1D1D' : '#FEF2F2',
      borderWidth: 1,
      borderColor: isDark ? '#7F1D1D' : '#FECACA',
    },
    errorBannerText: {
      color: isDark ? '#FECACA' : '#991B1B',
      fontSize: 13,
      fontWeight: '600',
      lineHeight: 18,
    },
    errorBannerAction: {
      marginTop: 4,
      color: isDark ? '#FCA5A5' : '#B91C1C',
      fontSize: 12,
      fontWeight: '500',
    },
  });
}
