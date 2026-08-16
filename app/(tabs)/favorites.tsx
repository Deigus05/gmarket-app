import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/components/AuthContext';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import {
  getFollowedStores,
  unfollowStore,
} from '@/components/api';
import { formatPropertyPrice } from '@/constants/propertyDisplay';
import { useLocale } from '@/components/LocaleContext';
import { useAppTheme, type AppUI } from '@/components/tema';
import { listImageUrl, optimizedImageUrl } from '@/lib/imageOptimization';
import {
  AccountDataKey,
  getAccountItem,
  setAccountItem,
} from '@/lib/accountStorage';
import {
  getFavoriteProducts,
  removeProductFavorite,
  subscribeProductFavorites,
  type FavProduct,
} from '@/lib/productFavorites';
import {
  getFavoriteProperties,
  removePropertyFavorite,
} from '@/lib/propertyFavorites';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 40;
const FALLBACK_PRODUCT_IMAGE =
  'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800';
const FALLBACK_STORE_LOGO =
  'https://images.unsplash.com/photo-1560179707-f14dd11c87e8?w=200&h=200&fit=crop';

interface FavStore {
  id: string;
  nome: string;
  categoria: string;
  logo_url: string;
  cover_url?: string;
  avaliacao: number;
  verified?: boolean;
  slug?: string;
  review_count?: number;
}

interface FavProperty {
  id: string;
  title: string;
  type: string;
  category: string;
  location: string;
  price: number;
  purpose?: string;
  rental_period?: string | null;
  negotiable?: boolean;
  image_url: string;
  image_urls?: string[];
  advertiser: string;
}

type FavSegment = 'produtos' | 'imoveis' | 'lojas';

export default function FavoritesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ui } = useAppTheme();
  const { t } = useLocale();
  const { token, isLoggedIn } = useAuth();
  const styles = useMemo(() => createStyles(ui), [ui]);
  const isFocused = useIsFocused();
  const [activeSegment, setActiveTab] = useState<FavSegment>('produtos');
  const [favStores, setFavStores] = useState<FavStore[]>([]);
  const [favProperties, setFavProperties] = useState<FavProperty[]>([]);
  const [favProducts, setFavProducts] = useState<FavProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [headerHeight, setHeaderHeight] = useState(120);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    async function loadFavorites() {
      if (!isFocused) return;
      if (!hasLoadedRef.current) setLoading(true);
      try {
        const [storedProps, products, followed] = await Promise.all([
          getFavoriteProperties(),
          getFavoriteProducts(),
          isLoggedIn && token
            ? getFollowedStores(token)
            : Promise.resolve({ success: false as const, message: '' }),
        ]);

        setFavProperties(
          storedProps.map((p) => ({
            id: p.id,
            title: p.title,
            type: p.type || '',
            category: p.category || '',
            location: p.location || [p.sector, p.region].filter(Boolean).join(', ') || '',
            price: Number(p.price) || 0,
            purpose: p.purpose,
            rental_period: p.rental_period,
            negotiable: p.negotiable,
            image_url: p.image_url || '',
            image_urls: p.image_urls || undefined,
            advertiser: p.advertiser || p.agency_name || p.owner_name || p.agency?.nome || '',
          })),
        );
        setFavProducts(products);

        if (followed.success) {
          setFavStores(
            followed.data.map((item) => ({
              id: item.store.id,
              nome: item.store.name,
              categoria: item.store.categoria || (item.store.verified ? 'Verificada' : 'Parceira'),
              logo_url: item.store.logo_url || FALLBACK_STORE_LOGO,
              cover_url: item.store.cover_url || undefined,
              avaliacao: item.store.rating_avg || 0,
              verified: item.store.verified,
              slug: item.store.slug,
              review_count: item.store.review_count,
            })),
          );
        } else if (isLoggedIn) {
          // Fallback local legado (antes das lojas vinham só do AsyncStorage)
          const storedStores = await getAccountItem(AccountDataKey.favStores);
          setFavStores(storedStores ? JSON.parse(storedStores) : []);
        } else {
          setFavStores([]);
        }
      } catch (error) {
        console.log('Erro ao carregar favoritos:', error);
      } finally {
        hasLoadedRef.current = true;
        setLoading(false);
      }
    }
    loadFavorites();
  }, [isFocused, isLoggedIn, token]);

  useEffect(() => {
    return subscribeProductFavorites(setFavProducts);
  }, []);

  const removePropertyFav = async (id: string) => {
    await removePropertyFavorite(id);
    setFavProperties((prev) => prev.filter((p) => p.id !== id));
  };

  const removeStoreFav = async (id: string) => {
    setFavStores((prev) => prev.filter((s) => s.id !== id));
    if (token) {
      await unfollowStore(token, id);
    }
    try {
      const storedStores = await getAccountItem(AccountDataKey.favStores);
      if (storedStores) {
        const parsed = JSON.parse(storedStores) as FavStore[];
        await setAccountItem(
          AccountDataKey.favStores,
          JSON.stringify(parsed.filter((s) => s.id !== id)),
        );
      }
    } catch {
      // ignore local cleanup errors
    }
  };

  const removeProductFav = async (id: string) => {
    const updated = await removeProductFavorite(id);
    setFavProducts(updated);
  };

  const openStore = (item: FavStore) => {
    router.push({
      pathname: '/loja',
      params: {
        id: item.id,
        name: item.nome,
        logo: item.logo_url && item.logo_url !== FALLBACK_STORE_LOGO ? item.logo_url : '',
        cover: item.cover_url || '',
        verified: item.verified ? '1' : '0',
        rating: String(item.avaliacao || 0),
        reviews: String(item.review_count || 0),
      },
    });
  };

  const renderSegmentHeader = () => (
    <View
      style={[styles.topNavbarHeader, { paddingTop: Math.max(insets.top, 12) }]}
      onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
    >
      <Text style={styles.screenMainTitle}>{t('favorites.title')}</Text>

      <View style={styles.segmentContainer}>
        <TouchableOpacity
          style={[styles.segmentBtn, activeSegment === 'produtos' && styles.segmentBtnActive]}
          onPress={() => setActiveTab('produtos')}
        >
          <Ionicons name="bag-handle" size={14} color={activeSegment === 'produtos' ? ui.brand : ui.muted} />
          <Text style={[styles.segmentText, activeSegment === 'produtos' && styles.segmentTextActive]}>
            {t('favorites.segmentProducts', { count: favProducts.length })}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, activeSegment === 'imoveis' && styles.segmentBtnActive]}
          onPress={() => setActiveTab('imoveis')}
        >
          <Ionicons name="home" size={14} color={activeSegment === 'imoveis' ? ui.brand : ui.muted} />
          <Text style={[styles.segmentText, activeSegment === 'imoveis' && styles.segmentTextActive]}>
            {t('favorites.segmentProperties', { count: favProperties.length })}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, activeSegment === 'lojas' && styles.segmentBtnActive]}
          onPress={() => setActiveTab('lojas')}
        >
          <Ionicons name="storefront" size={14} color={activeSegment === 'lojas' ? ui.brand : ui.muted} />
          <Text style={[styles.segmentText, activeSegment === 'lojas' && styles.segmentTextActive]}>
            {t('favorites.segmentStores', { count: favStores.length })}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.mainWrapper, { justifyContent: 'center', alignItems: 'center' }]}>
        <RippleWaveLoader color={ui.brand} />
      </View>
    );
  }

  return (
    <View style={styles.mainWrapper} collapsable={false}>
      {activeSegment === 'produtos' ? (
        <FlatList
          key="fav-produtos"
          data={favProducts}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 12 }}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={{
            padding: 16,
            paddingTop: headerHeight + 16,
            paddingBottom: 24,
            gap: 12,
            flexGrow: favProducts.length === 0 ? 1 : undefined,
          }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="heart-dislike-outline" size={48} color={ui.muted} />
              <Text style={styles.emptyTxt}>{t('favorites.emptyProducts')}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const imageUri = listImageUrl(
              item.image_urls,
              item.image_url,
              FALLBACK_PRODUCT_IMAGE,
              'card',
            );
            return (
              <TouchableOpacity
                style={styles.productFavCard}
                activeOpacity={0.9}
                onPress={() => router.push(`/productDetail?id=${encodeURIComponent(item.id)}`)}
              >
                <View style={styles.productFavImgWrap}>
                  <Image
                    source={{ uri: imageUri }}
                    style={styles.productFavImg}
                    contentFit="cover"
                    transition={200}
                    cachePolicy="memory-disk"
                    recyclingKey={item.id}
                  />
                  <TouchableOpacity style={styles.heartActiveBtn} onPress={() => removeProductFav(item.id)}>
                    <Ionicons name="heart" size={18} color="#E91E63" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.productFavTitle} numberOfLines={2}>
                  {item.titulo}
                </Text>
                <Text style={styles.productFavPrice}>
                  {Number(item.preco || 0).toLocaleString()} CFA
                </Text>
                <View style={styles.productFavGcoinRow}>
                  <Text style={styles.productFavGcoin}>
                    {Number(item.preco_gpay || 0).toLocaleString()} GCoin
                  </Text>
                  <View style={styles.productFavGpayBadge}>
                    <Text style={styles.productFavGpayText}>GPay</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      ) : activeSegment === 'imoveis' ? (
        <FlatList
          key="fav-imoveis"
          data={favProperties}
          keyExtractor={(item) => item.id}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={{ padding: 16, paddingTop: headerHeight + 16, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="heart-dislike-outline" size={48} color={ui.muted} />
              <Text style={styles.emptyTxt}>{t('favorites.emptyProperties')}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.propFavCard}
              activeOpacity={0.9}
              onPress={() => router.push({ pathname: '/propertyDetail', params: { id: item.id } })}
            >
              <Image
                source={{
                  uri: listImageUrl(
                    item.image_urls,
                    item.image_url,
                    'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800',
                    'card',
                  ),
                }}
                style={styles.propFavImg}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
              <TouchableOpacity style={styles.heartActiveBtn} onPress={() => removePropertyFav(item.id)}>
                <Ionicons name="heart" size={18} color="#E91E63" />
              </TouchableOpacity>
              <View style={styles.propFavInfo}>
                <Text style={styles.propFavCategory}>
                  {item.category} • {item.advertiser}
                </Text>
                <Text style={styles.propFavTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.propFavPrice}>
                  {formatPropertyPrice({
                    price: Number(item.price),
                    purpose: item.purpose as any,
                    rental_period: item.rental_period as any,
                    negotiable: item.negotiable,
                  })}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      ) : (
        <FlatList
          key="fav-lojas"
          data={favStores}
          keyExtractor={(item) => item.id}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={{ padding: 16, paddingTop: headerHeight + 16, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="heart-dislike-outline" size={48} color={ui.muted} />
              <Text style={styles.emptyTxt}>{t('favorites.emptyStores')}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.storeFavCard}
              activeOpacity={0.8}
              onPress={() => openStore(item)}
            >
              <Image
                source={{
                  uri: optimizedImageUrl(item.logo_url || FALLBACK_STORE_LOGO, 'thumb'),
                }}
                style={styles.storeFavLogo}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={`${item.id}-logo-${item.logo_url || 'default'}`}
              />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.storeFavName}>{item.nome}</Text>
                <Text style={styles.storeFavCat}>{item.categoria}</Text>
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={12} color="#FFC107" />
                  <Text style={styles.ratingTxt}>{Number(item.avaliacao || 0).toFixed(1)}</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.heartStoreBtn} onPress={() => removeStoreFav(item.id)}>
                <Ionicons name="heart" size={18} color="#E91E63" />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}

      {renderSegmentHeader()}
    </View>
  );
}

function createStyles(ui: AppUI) {
  const productCardWidth = (width - 40 - 12) / 2;

  return StyleSheet.create({
    mainWrapper: { flex: 1, backgroundColor: ui.bg },
    topNavbarHeader: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 20,
      paddingHorizontal: 16,
      backgroundColor: ui.card,
      borderBottomWidth: 1,
      borderBottomColor: ui.border,
      paddingBottom: 16,
    },
    screenMainTitle: { fontSize: 22, fontWeight: '900', color: ui.text, marginBottom: 12 },
    segmentContainer: {
      flexDirection: 'row',
      backgroundColor: ui.input,
      borderRadius: 12,
      padding: 3,
      gap: 4,
    },
    segmentBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: 8,
      paddingHorizontal: 2,
      borderRadius: 10,
    },
    segmentBtnActive: {
      backgroundColor: ui.card,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 1,
    },
    segmentText: { fontSize: 11, fontWeight: '600', color: ui.muted },
    segmentTextActive: { color: ui.brand, fontWeight: '700' },
    emptyBox: { alignItems: 'center', marginTop: 120, width: '100%' },
    emptyTxt: { fontSize: 14, color: ui.muted, fontWeight: '500', marginTop: 10, textAlign: 'center' },

    productFavCard: {
      width: productCardWidth,
      backgroundColor: ui.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: ui.border,
      padding: 8,
      paddingBottom: 10,
    },
    productFavImgWrap: {
      width: '100%',
      aspectRatio: 1,
      borderRadius: 10,
      overflow: 'hidden',
      backgroundColor: ui.iconBox,
      position: 'relative',
    },
    productFavImg: { width: '100%', height: '100%' },
    productFavTitle: { fontSize: 13, fontWeight: '600', color: ui.text, marginTop: 8, minHeight: 34 },
    productFavPrice: { fontSize: 14, fontWeight: '900', color: ui.text, marginTop: 4 },
    productFavGcoinRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 6 },
    productFavGcoin: { fontSize: 11, fontWeight: '600', color: ui.muted },
    productFavGpayBadge: {
      backgroundColor: ui.brandSoft,
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: 4,
    },
    productFavGpayText: { fontSize: 9, color: ui.brand, fontWeight: 'bold' },

    propFavCard: {
      width: CARD_WIDTH,
      backgroundColor: ui.card,
      borderRadius: 18,
      marginBottom: 14,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: ui.border,
      position: 'relative',
    },
    propFavImg: { width: '100%', height: 130, resizeMode: 'cover' },
    heartActiveBtn: {
      position: 'absolute',
      top: 10,
      right: 10,
      backgroundColor: ui.card,
      width: 32,
      height: 32,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.1,
      shadowRadius: 3,
    },
    propFavInfo: { padding: 12 },
    propFavCategory: { fontSize: 10, fontWeight: '700', color: ui.muted, textTransform: 'uppercase' },
    propFavTitle: { fontSize: 14, fontWeight: '700', color: ui.text, marginTop: 2 },
    propFavPrice: { fontSize: 16, fontWeight: '900', color: ui.text, marginTop: 4 },

    storeFavCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: ui.card,
      borderRadius: 16,
      padding: 12,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: ui.border,
    },
    storeFavLogo: { width: 50, height: 50, borderRadius: 25, backgroundColor: ui.iconBox },
    storeFavName: { fontSize: 14, fontWeight: '700', color: ui.text },
    storeFavCat: { fontSize: 12, color: ui.muted, marginTop: 1 },
    ratingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 3 },
    ratingTxt: { fontSize: 11, fontWeight: '700', color: ui.text },
    heartStoreBtn: { backgroundColor: ui.dangerSoft, padding: 8, borderRadius: 10 },
  });
}
