import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLiveProperties, Property } from '../../components/api';
import { useLocale } from '@/components/LocaleContext';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import { useAppTheme, type AppUI } from '@/components/tema';
import { TabBarScrollSpacer } from '@/components/FloatingGlassTabBar';
import { formatPropertyPrice, hotelStarCount, propertyPurposeBadge } from '../../constants/propertyDisplay';
import { listImageUrl } from '@/lib/imageOptimization';
import {
  getFavoriteProperties,
  togglePropertyFavorite,
} from '@/lib/propertyFavorites';

const STAR_GOLD = '#F5A623';

function paramStr(value: string | string[] | undefined, fallback = ''): string {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

function HotelStars({ count }: { count: number }) {
  if (count < 1) return null;
  return (
    <View style={starsStyles.row}>
      {Array.from({ length: count }, (_, i) => (
        <Ionicons key={i} name="star" size={14} color={STAR_GOLD} />
      ))}
    </View>
  );
}

const starsStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 },
});

export default function ImoveisScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const { ui } = useAppTheme();
  const { t } = useLocale();
  const styles = useMemo(() => createStyles(ui), [ui]);

  const [properties, setProperties] = useState<Property[]>([]);
  const [favorites, setFavorites] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(insets.top + 108);

  const purpose = paramStr(params.purpose, '');
  const rentalPeriod = paramStr(params.rental_period, '');
  const subcategory = paramStr(params.subcategory, '');
  const region = paramStr(params.region, '');
  const sector = paramStr(params.sector, '');
  const bedrooms = paramStr(params.bedrooms, '');
  const minPrice = paramStr(params.min_price, '');
  const maxPrice = paramStr(params.max_price, '');
  const checkIn = paramStr(params.check_in, '');
  const checkOut = paramStr(params.check_out, '');

  const activeFilterCount = [
    purpose,
    purpose === 'arrendamento' ? rentalPeriod : '',
    subcategory,
    region,
    sector,
    bedrooms,
    minPrice,
    maxPrice,
    rentalPeriod === 'diaria' ? checkIn : '',
    rentalPeriod === 'diaria' ? checkOut : '',
  ].filter(Boolean).length;

  const loadFavorites = useCallback(async () => {
    try {
      const stored = await getFavoriteProperties();
      setFavorites(stored);
    } catch {
      setFavorites([]);
    }
  }, []);

  const loadProperties = useCallback(
    async (opts?: { forceRefresh?: boolean; silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      const data = await getLiveProperties(
        {
          purpose: purpose || undefined,
          rental_period: purpose === 'arrendamento' && rentalPeriod ? rentalPeriod : undefined,
          subcategory: subcategory || undefined,
          region: region || undefined,
          sector: sector || undefined,
          bedrooms: bedrooms || undefined,
          min_price: minPrice || undefined,
          max_price: maxPrice || undefined,
          check_in: rentalPeriod === 'diaria' ? checkIn || undefined : undefined,
          check_out: rentalPeriod === 'diaria' ? checkOut || undefined : undefined,
          status: 'disponivel',
        },
        { forceRefresh: opts?.forceRefresh },
      );
      setProperties(data);
      if (!opts?.silent) setLoading(false);
    },
    [purpose, rentalPeriod, subcategory, region, sector, bedrooms, minPrice, maxPrice, checkIn, checkOut],
  );

  useFocusEffect(
    useCallback(() => {
      loadFavorites();
      loadProperties();
    }, [loadFavorites, loadProperties]),
  );

  const onRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([loadFavorites(), loadProperties({ forceRefresh: true, silent: true })]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, loadFavorites, loadProperties]);

  const toggleFavorite = async (property: Property) => {
    const { properties } = await togglePropertyFavorite(property);
    setFavorites(properties);
  };

  const coverOf = (item: Property) =>
    listImageUrl(
      item.image_urls,
      item.image_url,
      'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800',
      'card',
    );

  const openFilters = () => {
    router.push({
      pathname: '/filtros-imoveis',
      params: {
        purpose,
        rental_period: rentalPeriod,
        subcategory,
        region,
        sector,
        bedrooms,
        min_price: minPrice,
        max_price: maxPrice,
        check_in: checkIn,
        check_out: checkOut,
      },
    });
  };

  return (
    <View style={styles.screen} collapsable={false}>
      {loading && properties.length === 0 && !refreshing ? (
        <View style={styles.loadingBox}>
          <RippleWaveLoader color={ui.brand} />
          <Text style={styles.loadingText}>{t('properties.loading')}</Text>
        </View>
      ) : (
        <FlatList
          data={properties}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={[
            styles.listContent,
            { paddingTop: headerHeight + 14 },
          ]}
          ListFooterComponent={<TabBarScrollSpacer extra={8} />}
          refreshControl={
            <RefreshControl
              // refreshing=false: não mantém o spinner nativo.
              // Cores = fundo da página: no Android "transparent" cai no cinzento default.
              refreshing={false}
              onRefresh={onRefresh}
              tintColor={ui.bg}
              colors={[ui.bg]}
              progressBackgroundColor={ui.bg}
            />
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>{t('properties.emptyFilters')}</Text>
          }
          renderItem={({ item }) => {
            const stars = hotelStarCount(item);
            return (
              <TouchableOpacity
                style={styles.propertyCard}
                activeOpacity={0.9}
                onPress={() => router.push({ pathname: '/propertyDetail', params: { id: item.id } })}
              >
                <Image source={{ uri: coverOf(item) }} style={styles.propertyImage} />
                <View style={styles.propertyBadge}>
                  <Text style={styles.propertyBadgeText}>
                    {propertyPurposeBadge(item).toUpperCase()}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.heartCardButton}
                  activeOpacity={0.7}
                  onPress={() => toggleFavorite(item)}
                >
                  <Ionicons
                    name={favorites.some((f) => f.id === item.id) ? 'heart' : 'heart-outline'}
                    size={18}
                    color={favorites.some((f) => f.id === item.id) ? '#E91E63' : '#FFF'}
                  />
                </TouchableOpacity>
                <View style={styles.propertyDetailsBox}>
                  <Text style={styles.propertyCategory}>
                    {item.category}
                    {item.agency?.verified
                      ? ' • Verificado'
                      : item.advertiser
                        ? ` • ${item.advertiser}`
                        : ''}
                  </Text>
                  <Text style={styles.propertyTitle}>{item.title}</Text>
                  <HotelStars count={stars} />
                  <View style={styles.locationRow}>
                    <Ionicons name="location-sharp" size={14} color={ui.muted} />
                    <Text style={styles.propertyLocation}>{item.location}</Text>
                  </View>
                  <Text style={styles.propertySpecs} numberOfLines={2}>
                    {item.details || item.description || ''}
                  </Text>
                  <Text style={styles.propertyPrice}>{formatPropertyPrice(item)}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <View
        style={[styles.fixedTop, { paddingTop: insets.top + 8 }]}
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>
              GMarket <Text style={styles.ultraText}>ULTIMA</Text>
            </Text>
            <Text style={styles.headerSubtitle}>{t('properties.title')}</Text>
          </View>
          <TouchableOpacity style={styles.addButton} onPress={() => router.push('/anunciar-imovel')}>
            <Ionicons name="add" size={18} color="#FFF" />
            <Text style={styles.addButtonText}>{t('properties.announce')}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.filterRow} onPress={openFilters} activeOpacity={0.75}>
          <Ionicons name="options-outline" size={18} color={ui.brand} />
          <Text style={styles.filterLabel}>{t('properties.filter')}</Text>
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {refreshing ? (
        <View
          style={[styles.refreshLoader, { top: headerHeight + 8, backgroundColor: ui.bg }]}
          pointerEvents="none"
        >
          <RippleWaveLoader size="small" color={ui.brand} />
        </View>
      ) : null}
    </View>
  );
}

function createStyles(ui: AppUI) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: ui.bg },
    fixedTop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      backgroundColor: ui.card,
      paddingHorizontal: 16,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: ui.border,
      zIndex: 20,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    headerTitle: { fontSize: 20, fontWeight: '900', color: ui.text },
    ultraText: { color: ui.brand, fontStyle: 'italic' },
    headerSubtitle: { fontSize: 11, color: ui.muted },
    addButton: {
      flexDirection: 'row',
      backgroundColor: ui.brand,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      alignItems: 'center',
    },
    addButtonText: { color: '#FFF', fontSize: 12, fontWeight: 'bold', marginLeft: 4 },
    filterRow: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 6,
      paddingRight: 10,
    },
    filterLabel: { fontSize: 14, fontWeight: '700', color: ui.brand },
    filterBadge: {
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: ui.brand,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    filterBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
    loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { fontSize: 13, color: ui.muted, marginTop: 12, fontWeight: '500' },
    refreshLoader: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      elevation: 100,
    },
    listContent: { paddingHorizontal: 16 },
    emptyText: {
      textAlign: 'center',
      color: ui.muted,
      marginTop: 40,
      fontSize: 13,
      fontWeight: '500',
    },
    propertyCard: {
      backgroundColor: ui.card,
      borderRadius: 16,
      marginBottom: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: ui.border,
      position: 'relative',
    },
    propertyImage: { width: '100%', height: 160 },
    propertyBadge: {
      position: 'absolute',
      top: 12,
      left: 12,
      backgroundColor: ui.brand,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    propertyBadgeText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
    heartCardButton: {
      position: 'absolute',
      top: 12,
      right: 12,
      backgroundColor: 'rgba(0, 0, 0, 0.42)',
      width: 32,
      height: 32,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.25)',
      zIndex: 99,
    },
    propertyDetailsBox: { padding: 12 },
    propertyCategory: {
      fontSize: 11,
      fontWeight: 'bold',
      color: ui.brand,
      textTransform: 'uppercase',
    },
    propertyTitle: { fontSize: 14, fontWeight: 'bold', color: ui.text, marginTop: 2 },
    locationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, opacity: 0.7 },
    propertyLocation: { fontSize: 12, color: ui.text, marginLeft: 4, flex: 1 },
    propertySpecs: { fontSize: 12, color: ui.muted, marginTop: 4 },
    propertyPrice: { fontSize: 16, fontWeight: '900', color: ui.text, marginTop: 8 },
  });
}
