import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/components/AuthContext';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import {
  getHomeBanners,
  getProductsByCategory,
  smartSearch,
  trackEvent,
  trackUserActivity,
  type FavoriteCategory,
  type HomeBanner,
  type LiveStore,
  type Product,
  type SmartSearchResult,
} from '@/components/api';
import { useLocale } from '@/components/LocaleContext';
import { useAppTheme, type AppUI } from '@/components/tema';
import { trackAdImpressions } from '@/lib/analytics';
import {
  AccountDataKey,
  getAccountItem,
  setAccountItem,
  subscribeAccountScope,
} from '@/lib/accountStorage';
import { listImageUrl, optimizedImageUrl } from '@/lib/imageOptimization';
import { parseCmsNavigationTarget } from '@/lib/navigation';
import {
  formatProductPrice,
  getFavoriteProductIds,
  normalizeProductPrice,
  subscribeProductFavorites,
  toggleProductFavorite,
  toFavProduct,
} from '@/lib/productFavorites';

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400';
const FALLBACK_LOGO =
  'https://images.unsplash.com/photo-1560179707-f14dd11c87e8?w=200&h=200&fit=crop';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BANNER_H_PAD = 12;
/** Altura do banner feed na home */
const FEED_BANNER_HEIGHT = 178;
/** Banner da pesquisa: slot próprio, 10% maior que o feed */
const SEARCH_BANNER_WIDTH = SCREEN_WIDTH - BANNER_H_PAD * 2;
const SEARCH_BANNER_HEIGHT = Math.round(FEED_BANNER_HEIGHT * 1.1);
const BANNER_AUTOPLAY_MS = 4500;
const CHIP_GAP = 8;
const MAX_HISTORY_ROWS = 3;

/** Mesmas medidas da grelha da home */
const GRID_PAD = 4;
const GRID_GAP = 4;
const COLUMN_WIDTH = (SCREEN_WIDTH - GRID_PAD * 2 - GRID_GAP) / 2;

type SearchParams = {
  q?: string;
  categoryId?: string;
  categoryName?: string;
};

function uniqueTerms(items: string[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const EMPTY_RESULT: SmartSearchResult = {
  query: '',
  products: [],
  categories: [],
  stores: [],
  suggestions: [],
  history: [],
  popularSearches: [],
};

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<SearchParams>();
  const { token } = useAuth();
  const { t } = useLocale();
  const { ui } = useAppTheme();
  const styles = useMemo(() => createStyles(ui), [ui]);
  const inputRef = useRef<TextInput>(null);
  const submittedOnceRef = useRef(false);

  const initialQuery = typeof params.q === 'string' ? params.q : '';
  const initialCategoryId =
    typeof params.categoryId === 'string' ? params.categoryId.trim() : '';
  const initialCategoryName =
    typeof params.categoryName === 'string'
      ? params.categoryName.trim()
      : initialQuery;
  const entersWithCategory = Boolean(initialCategoryId);
  const entersWithQuery = Boolean(initialQuery.trim()) && !entersWithCategory;
  const seedLabel = entersWithCategory
    ? initialCategoryName || 'Categoria'
    : initialQuery.trim();
  const [query, setQuery] = useState(seedLabel || initialQuery);
  /** Só mostra resultados depois de confirmar a pesquisa (Enter / chip). */
  const [submittedQuery, setSubmittedQuery] = useState(
    entersWithCategory || entersWithQuery ? seedLabel : '',
  );
  const [loading, setLoading] = useState(entersWithCategory || entersWithQuery);
  const [discovery, setDiscovery] = useState<SmartSearchResult>(EMPTY_RESULT);
  const [result, setResult] = useState<SmartSearchResult | null>(null);
  const [searchBanners, setSearchBanners] = useState<HomeBanner[]>([]);
  const [hiddenHistory, setHiddenHistory] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);

  const showResults = Boolean(submittedQuery.trim());

  const loadDiscovery = useCallback(async () => {
    const data = await smartSearch('', token, 24);
    setDiscovery(data);
  }, [token]);

  const submitCategory = useCallback(
    async (categoryId: string, categoryName: string) => {
      const id = categoryId.trim();
      const name = categoryName.trim() || 'Categoria';
      if (!id) return;

      setQuery(name);
      setSubmittedQuery(name);
      setLoading(true);
      try {
        const products = await getProductsByCategory(id);
        setResult({
          ...EMPTY_RESULT,
          query: name,
          products,
          categories: [{ id, slug: '', name, score: 0 }],
        });
        void trackUserActivity(token, {
          action: 'view_category',
          categoryId: id,
          categoryName: name,
        });
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  const submitSearch = useCallback(
    async (value: string) => {
      const q = value.trim();
      if (!q) {
        setSubmittedQuery('');
        setResult(null);
        return;
      }

      setQuery(q);
      setSubmittedQuery(q);
      setLoading(true);
      try {
        const data = await smartSearch(q, token, 24);
        setResult(data);
        void trackUserActivity(token, { action: 'search', searchTerm: q });
        // Atualiza histórico de descoberta com o termo pesquisado
        setDiscovery((prev) => ({
          ...prev,
          history: uniqueTerms([q, ...(prev.history || [])]),
        }));
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    void loadDiscovery();
  }, [loadDiscovery]);

  useEffect(() => {
    let cancelled = false;
    const loadHidden = async () => {
      try {
        const raw = await getAccountItem(AccountDataKey.hiddenSearchHistory, { allowGuest: true });
        if (cancelled) return;
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setHiddenHistory(parsed.filter((t): t is string => typeof t === 'string'));
            return;
          }
        }
        setHiddenHistory([]);
      } catch {
        // ignore
      }
    };
    void loadHidden();
    const unsub = subscribeAccountScope(() => {
      void loadHidden();
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  useEffect(() => {
    if (submittedOnceRef.current) return;
    if (initialCategoryId) {
      submittedOnceRef.current = true;
      void submitCategory(initialCategoryId, initialCategoryName);
      return;
    }
    if (initialQuery.trim()) {
      submittedOnceRef.current = true;
      void submitSearch(initialQuery);
    }
  }, [initialCategoryId, initialCategoryName, initialQuery, submitCategory, submitSearch]);

  useEffect(() => {
    // Ao abrir por categoria/query, não foca o teclado — mostra os produtos direto.
    if (entersWithCategory || entersWithQuery) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(timer);
  }, [entersWithCategory, entersWithQuery]);

  const loadSearchBanners = useCallback(async () => {
    const banners = await getHomeBanners();
    setSearchBanners(banners.search || []);
    trackAdImpressions(banners.search || [], 'search');
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadSearchBanners();
      void getFavoriteProductIds().then(setFavorites);
    }, [loadSearchBanners]),
  );

  useEffect(() => {
    return subscribeProductFavorites((products) => {
      setFavorites(products.map((p) => p.id));
    });
  }, []);

  const products = result?.products || [];
  const categories = result?.categories || [];
  const stores = result?.stores || [];
  const suggestions = discovery.suggestions || [];
  const history = useMemo(() => {
    const hidden = new Set(hiddenHistory.map((t) => t.trim().toLowerCase()));
    return uniqueTerms(discovery.history || []).filter(
      (item) => !hidden.has(item.trim().toLowerCase()),
    );
  }, [discovery.history, hiddenHistory]);

  const discoverySuggestions = useMemo(() => {
    const historyKeys = new Set(history.map((t) => t.toLowerCase()));
    return uniqueTerms(suggestions).filter((s) => !historyKeys.has(s.toLowerCase()));
  }, [history, suggestions]);

  const removeHistoryItem = useCallback(async (term: string) => {
    const key = term.trim().toLowerCase();
    if (!key) return;
    setHiddenHistory((prev) => {
      const next = prev.includes(key) ? prev : [...prev, key];
      void setAccountItem(AccountDataKey.hiddenSearchHistory, JSON.stringify(next), {
        allowGuest: true,
      });
      return next;
    });
  }, []);

  const clearSearch = useCallback(() => {
    setQuery('');
    setSubmittedQuery('');
    setResult(null);
  }, []);

  const openProduct = useCallback((product: Product) => {
    router.push(`/productDetail?id=${encodeURIComponent(product.id)}&from=search`);
  }, [router]);

  const openStore = useCallback((store: LiveStore) => {
    void trackUserActivity(token, { action: 'visit_store', storeId: store.id });
    router.push({
      pathname: '/loja',
      params: {
        id: store.id,
        name: store.name,
        logo: store.logo_url || '',
        cover: store.cover_url || '',
      },
    });
  }, [router, token]);

  const openCategory = useCallback((category: FavoriteCategory) => {
    void submitCategory(category.id, category.name);
  }, [submitCategory]);

  const favoritesRef = useRef(favorites);
  favoritesRef.current = favorites;

  const toggleFavorite = useCallback((product: Product) => {
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
      categoryId: product.category?.id,
      storeId: product.store_id || product.store?.id,
    });
  }, [token]);

  const onBannerPress = useCallback(
    async (banner: HomeBanner) => {
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
    },
    [router],
  );

  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);

  const resultsHeader = useMemo(
    () => (
      <View>
        {categories.length > 0 ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>{t('search.categories')}</Text>
            {categories.map((category) => (
              <TouchableOpacity
                key={category.id}
                style={styles.rowItem}
                onPress={() => openCategory(category)}
              >
                <Ionicons name="grid-outline" size={18} color={ui.brand} />
                <Text style={styles.rowText}>{category.name}</Text>
                <Ionicons name="chevron-forward" size={16} color={ui.muted} />
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {stores.length > 0 ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>{t('search.stores')}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.storeRow}
            >
              {stores.map((store) => (
                <TouchableOpacity
                  key={store.id}
                  style={styles.storeCard}
                  onPress={() => openStore(store)}
                >
                  <Image
                    source={{
                      uri: optimizedImageUrl(store.logo_url || FALLBACK_LOGO, 'thumb'),
                    }}
                    style={styles.storeLogo}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={`${store.id}-logo-${store.logo_url || 'default'}`}
                  />
                  <Text style={styles.storeName} numberOfLines={2}>
                    {store.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.resultsHeader}>
          <Text style={styles.resultsTitle}>
            {loading
              ? t('search.searching')
              : t('search.resultsFor', { query: submittedQuery })}
          </Text>
        </View>
      </View>
    ),
    [
      categories,
      loading,
      openCategory,
      openStore,
      stores,
      styles,
      submittedQuery,
      t,
      ui.brand,
      ui.muted,
    ],
  );

  const renderProductItem = useCallback(
    ({ item }: { item: Product }) => {
      const imageUri = listImageUrl(item.image_urls, item.image_url, FALLBACK_IMAGE, 'card');
      const isFavorite = favoriteSet.has(item.id);
      const regularPrice = normalizeProductPrice(item.preco);
      const gcoinPrice = normalizeProductPrice(item.preco_gpay) || regularPrice;

      return (
        <View style={styles.productGridItem}>
          <TouchableOpacity
            style={styles.productCard}
            activeOpacity={0.8}
            onPress={() => openProduct(item)}
          >
            <View style={styles.imageContainer}>
              <Image
                source={{ uri: imageUri }}
                style={styles.productImage}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={item.id}
              />
              <TouchableOpacity
                style={styles.heartButton}
                onPress={() => toggleFavorite(item)}
                hitSlop={8}
              >
                <Ionicons
                  name={isFavorite ? 'heart' : 'heart-outline'}
                  size={18}
                  color={isFavorite ? '#E91E63' : '#777'}
                />
              </TouchableOpacity>
            </View>

            <Text style={styles.productTitle} numberOfLines={2}>
              {item.titulo}
            </Text>

            <View style={styles.priceContainer}>
              <Text style={styles.normalPrice}>
                {formatProductPrice(regularPrice)} CFA
              </Text>
            </View>

            {gcoinPrice > 0 ? <View style={styles.gcoinRow}>
              <Text style={styles.gcoinPrice}>
                {formatProductPrice(gcoinPrice)} GCoin
              </Text>
              <View style={styles.gpayBadge}>
                <Text style={styles.gpayBadgeText}>GPay</Text>
              </View>
            </View> : null}
          </TouchableOpacity>
        </View>
      );
    },
    [favoriteSet, openProduct, styles, toggleFavorite],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.searchBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={ui.text} />
        </TouchableOpacity>
        <View style={styles.inputWrap}>
          <Ionicons name="search-outline" size={18} color={ui.muted} />
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder={t('search.placeholder')}
            placeholderTextColor={ui.muted}
            returnKeyType="search"
            onSubmitEditing={() => void submitSearch(query)}
            autoCorrect={false}
          />
          {query.length > 0 ? (
            <TouchableOpacity onPress={clearSearch} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={ui.muted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {loading && showResults && !result ? (
        <View style={styles.centered}>
          <RippleWaveLoader color={ui.brand} />
        </View>
      ) : !showResults ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        >
          <HistorySection
            items={history}
            onPress={(value) => void submitSearch(value)}
            onDelete={(value) => void removeHistoryItem(value)}
            styles={styles}
            ui={ui}
          />
          <ChipSection
            title={t('search.suggestions')}
            items={discoverySuggestions}
            onPress={(value) => void submitSearch(value)}
            styles={styles}
          />
          <SearchPromoBanners
            banners={searchBanners}
            onPress={onBannerPress}
            styles={styles}
          />
        </ScrollView>
      ) : (
        <FlashList
          data={products}
          numColumns={2}
          renderItem={renderProductItem}
          keyExtractor={(item) => item.id}
          extraData={favorites}
          keyboardShouldPersistTaps="handled"
          drawDistance={SCREEN_WIDTH * 2}
          ListHeaderComponent={resultsHeader}
          ListEmptyComponent={
            !loading ? (
              <Text style={styles.empty}>
                {t('search.empty', { query: submittedQuery })}
              </Text>
            ) : null
          }
          contentContainerStyle={[
            styles.resultsListContent,
            { paddingBottom: insets.bottom + 24 },
          ]}
        />
      )}
    </View>
  );
}

function HistorySection({
  items,
  onPress,
  onDelete,
  styles,
  ui,
}: {
  items: string[];
  onPress: (value: string) => void;
  onDelete: (value: string) => void;
  styles: ReturnType<typeof createStyles>;
  ui: AppUI;
}) {
  const { t } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [chipWidths, setChipWidths] = useState<Record<string, number>>({});
  const [maisWidth, setMaisWidth] = useState(0);

  const uniqueItems = useMemo(() => uniqueTerms(items), [items]);

  useEffect(() => {
    setExpanded(false);
  }, [uniqueItems.join('|')]);

  const widthsReady =
    uniqueItems.length === 0
    || (maisWidth > 0 && uniqueItems.every((item) => chipWidths[item] != null));

  const visibleCount = useMemo(() => {
    if (expanded || uniqueItems.length === 0) return uniqueItems.length;
    if (!containerWidth || !widthsReady) {
      return Math.min(uniqueItems.length, 6);
    }

    let row = 0;
    let x = 0;
    let count = 0;

    for (let i = 0; i < uniqueItems.length; i++) {
      const w = chipWidths[uniqueItems[i]] || 0;
      const moreAfter = i < uniqueItems.length - 1;
      const gap = x > 0 ? CHIP_GAP : 0;
      const onLastRow = row === MAX_HISTORY_ROWS - 1;
      const trailing = moreAfter && onLastRow ? CHIP_GAP + maisWidth : 0;

      if (x > 0 && x + gap + w + trailing > containerWidth) {
        if (onLastRow) break;
        row += 1;
        x = 0;
      }

      const onLastRowNow = row === MAX_HISTORY_ROWS - 1;
      const trailingNow = moreAfter && onLastRowNow ? CHIP_GAP + maisWidth : 0;
      const nextX = (x > 0 ? x + CHIP_GAP : 0) + w;

      if (x === 0 && nextX + trailingNow > containerWidth && moreAfter && onLastRowNow) {
        break;
      }

      x = nextX;
      count = i + 1;

      if (moreAfter && onLastRowNow) {
        const nextW = chipWidths[uniqueItems[i + 1]] || 0;
        if (x + CHIP_GAP + nextW + CHIP_GAP + maisWidth > containerWidth) break;
      }
    }

    return Math.max(count, uniqueItems.length ? 1 : 0);
  }, [chipWidths, containerWidth, expanded, maisWidth, uniqueItems, widthsReady]);

  const showMais = !expanded && visibleCount < uniqueItems.length;
  const visibleItems = expanded ? uniqueItems : uniqueItems.slice(0, visibleCount);

  if (!uniqueItems.length) return null;

  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{t('search.history')}</Text>

      <View style={styles.measureLayer} pointerEvents="none">
        {uniqueItems.map((item) => (
          <View
            key={`measure-${item}`}
            style={styles.historyChip}
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              setChipWidths((prev) => (prev[item] === w ? prev : { ...prev, [item]: w }));
            }}
          >
            <Text style={styles.chipText}>{item}</Text>
            <Ionicons name="close" size={14} color={ui.muted} />
          </View>
        ))}
        <View
          style={styles.chip}
          onLayout={(e) => setMaisWidth(e.nativeEvent.layout.width)}
        >
          <Text style={styles.chipText}>{t('search.more')}</Text>
          <Ionicons name="chevron-down" size={14} color={ui.text} />
        </View>
      </View>

      <View
        style={styles.chipWrap}
        onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
      >
        {visibleItems.map((item) => (
          <View key={`history-${item}`} style={styles.historyChip}>
            <TouchableOpacity
              style={styles.historyChipLabel}
              onPress={() => onPress(item)}
              activeOpacity={0.7}
            >
              <Text style={styles.chipText}>{item}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onDelete(item)}
              hitSlop={10}
              style={styles.historyDeleteBtn}
              accessibilityLabel={t('search.removeHistory', { item })}
            >
              <Ionicons name="close" size={14} color={ui.muted} />
            </TouchableOpacity>
          </View>
        ))}
        {showMais ? (
          <TouchableOpacity style={styles.chip} onPress={() => setExpanded(true)}>
            <Text style={styles.chipText}>{t('search.more')}</Text>
            <Ionicons name="chevron-down" size={14} color={ui.text} />
          </TouchableOpacity>
        ) : null}
        {expanded && uniqueItems.length > visibleCount ? (
          <TouchableOpacity style={styles.chip} onPress={() => setExpanded(false)}>
            <Text style={styles.chipText}>{t('search.less')}</Text>
            <Ionicons name="chevron-up" size={14} color={ui.text} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function SearchPromoBanners({
  banners,
  onPress,
  styles,
}: {
  banners: HomeBanner[];
  onPress: (banner: HomeBanner) => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const indexRef = useRef(0);
  const directionRef = useRef(1);
  const touchingRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const multi = banners.length > 1;
  const bannerIds = banners.map((b) => b.id).join(',');

  useEffect(() => {
    indexRef.current = 0;
    directionRef.current = 1;
    setActiveIndex(0);
    scrollRef.current?.scrollTo({ x: 0, animated: false });
  }, [bannerIds]);

  useEffect(() => {
    if (!multi) return;
    const timer = setInterval(() => {
      if (touchingRef.current) return;
      let next = indexRef.current + directionRef.current;
      if (next >= banners.length) {
        directionRef.current = -1;
        next = banners.length - 2;
      } else if (next < 0) {
        directionRef.current = 1;
        next = 1;
      }
      next = Math.max(0, Math.min(next, banners.length - 1));
      indexRef.current = next;
      setActiveIndex(next);
      scrollRef.current?.scrollTo({ x: next * SEARCH_BANNER_WIDTH, animated: true });
    }, BANNER_AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [banners.length, multi]);

  if (!banners.length) return null;

  return (
    <View style={styles.searchBannerBlock}>
      <Text style={styles.blockTitle}>Destaques</Text>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={() => {
          touchingRef.current = true;
        }}
        onMomentumScrollEnd={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
          touchingRef.current = false;
          const next = Math.round(event.nativeEvent.contentOffset.x / SEARCH_BANNER_WIDTH);
          const clamped = Math.max(0, Math.min(next, banners.length - 1));
          indexRef.current = clamped;
          setActiveIndex(clamped);
        }}
      >
        {banners.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.searchBanner}
            activeOpacity={0.95}
            onPress={() => onPress(item)}
          >
            <Image
              source={{ uri: optimizedImageUrl(item.image_url, 'card') }}
              style={styles.searchBannerImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={item.id}
            />
            <View style={styles.searchBannerOverlay} pointerEvents="none">
              <View style={styles.searchBannerBadge}>
                <Text style={styles.searchBannerBadgeText}>Anúncio</Text>
              </View>
              <View>
                {item.title ? (
                  <Text style={styles.searchBannerTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                ) : null}
                {item.subtitle ? (
                  <Text style={styles.searchBannerSubtitle} numberOfLines={2}>
                    {item.subtitle}
                  </Text>
                ) : null}
              </View>
            </View>
          </TouchableOpacity>
        ))}
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
}

function ChipSection({
  title,
  items,
  onPress,
  styles,
}: {
  title: string;
  items: string[];
  onPress: (value: string) => void;
  styles: ReturnType<typeof createStyles>;
}) {
  if (!items.length) return null;
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{title}</Text>
      <View style={styles.chipWrap}>
        {items.map((item) => (
          <TouchableOpacity
            key={`${title}-${item}`}
            style={styles.chip}
            onPress={() => onPress(item)}
          >
            <Text style={styles.chipText}>{item}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function createStyles(ui: AppUI) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: ui.bg,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: ui.border,
      backgroundColor: ui.card,
    },
    backBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    inputWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: ui.input,
      borderRadius: 22,
      paddingHorizontal: 12,
      height: 42,
    },
    input: {
      flex: 1,
      fontSize: 15,
      color: ui.text,
      paddingVertical: 0,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    block: {
      paddingTop: 18,
      paddingHorizontal: 16,
    },
    blockTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: ui.text,
      marginBottom: 12,
      letterSpacing: -0.3,
    },
    resultsHeader: {
      paddingTop: 14,
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    resultsTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: ui.text,
      letterSpacing: -0.2,
    },
    chipWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: CHIP_GAP,
    },
    measureLayer: {
      position: 'absolute',
      opacity: 0,
      left: 0,
      top: 0,
      flexDirection: 'row',
      flexWrap: 'nowrap',
      zIndex: -1,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: ui.input,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    historyChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: ui.input,
      borderRadius: 10,
      paddingLeft: 12,
      paddingRight: 6,
      paddingVertical: 7,
      gap: 2,
    },
    historyChipLabel: {
      paddingVertical: 2,
      paddingRight: 2,
    },
    historyDeleteBtn: {
      width: 24,
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
    },
    chipText: {
      fontSize: 14,
      fontWeight: '500',
      color: ui.text,
    },
    searchBannerBlock: {
      marginTop: 8,
      paddingBottom: 8,
      paddingHorizontal: BANNER_H_PAD,
    },
    searchBanner: {
      width: SEARCH_BANNER_WIDTH,
      height: SEARCH_BANNER_HEIGHT,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: ui.input,
    },
    searchBannerImage: {
      ...StyleSheet.absoluteFillObject,
      width: SEARCH_BANNER_WIDTH,
      height: SEARCH_BANNER_HEIGHT,
    },
    searchBannerOverlay: {
      ...StyleSheet.absoluteFillObject,
      padding: 16,
      justifyContent: 'space-between',
    },
    searchBannerBadge: {
      alignSelf: 'flex-end',
      backgroundColor: '#E8E8E8',
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    searchBannerBadgeText: {
      color: '#111',
      fontSize: 9,
      fontWeight: '600',
    },
    searchBannerTitle: {
      color: '#FFF',
      fontSize: 18,
      fontWeight: '800',
      textShadowColor: 'rgba(0,0,0,0.45)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
    },
    searchBannerSubtitle: {
      color: 'rgba(255,255,255,0.92)',
      fontSize: 13,
      fontWeight: '600',
      marginTop: 4,
      textShadowColor: 'rgba(0,0,0,0.4)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
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
      backgroundColor: ui.brand,
    },
    rowItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: ui.card,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 12,
      marginBottom: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: ui.border,
    },
    rowText: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
      color: ui.text,
    },
    storeRow: {
      gap: 8,
      paddingBottom: 4,
    },
    storeCard: {
      width: 96,
      alignItems: 'center',
      backgroundColor: ui.card,
      borderRadius: 12,
      padding: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: ui.border,
    },
    storeLogo: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: ui.input,
      marginBottom: 6,
    },
    storeName: {
      fontSize: 11,
      fontWeight: '700',
      color: ui.text,
      textAlign: 'center',
    },
    resultsListContent: {
      paddingHorizontal: GRID_PAD,
      paddingTop: 4,
    },
    productGridItem: {
      width: COLUMN_WIDTH,
      paddingBottom: GRID_GAP,
    },
    productCard: {
      width: COLUMN_WIDTH,
      backgroundColor: ui.bg,
    },
    imageContainer: {
      position: 'relative',
      width: COLUMN_WIDTH,
      aspectRatio: 1 / 1.18,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: ui.input,
    },
    productImage: {
      ...StyleSheet.absoluteFillObject,
    },
    heartButton: {
      position: 'absolute',
      top: 8,
      right: 8,
      backgroundColor: 'rgba(255,255,255,0.92)',
      borderRadius: 16,
      padding: 7,
    },
    productTitle: {
      fontSize: 13,
      color: ui.text,
      marginTop: 8,
      paddingHorizontal: 2,
      minHeight: 36,
      lineHeight: 18,
    },
    priceContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
      paddingHorizontal: 2,
    },
    normalPrice: {
      fontSize: 18,
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
    empty: {
      fontSize: 13,
      color: ui.muted,
      paddingHorizontal: 16,
      paddingTop: 8,
    },
  });
}
