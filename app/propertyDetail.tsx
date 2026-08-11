import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getPropertyById, Property, PropertyAttribute } from '@/components/api';
import { ImageGalleryViewer } from '@/components/ImageGalleryViewer';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import { useLocale } from '@/components/LocaleContext';
import { useAppTheme, type AppUI } from '@/components/tema';
import { formatPropertyPrice, hotelStarCount, propertyPurposeBadge } from '@/constants/propertyDisplay';
import { listImageUrl, optimizedImageUrl } from '@/lib/imageOptimization';
import { openMapsDirections } from '@/lib/openMapsDirections';
import {
  isPropertyFavorite,
  togglePropertyFavorite,
} from '@/lib/propertyFavorites';

const { width } = Dimensions.get('window');
const STAR_GOLD = '#F5A623';

function formatAttrValue(attr: PropertyAttribute): string {
  if (attr.value == null || attr.value === '') return '';
  if (attr.input_type === 'boolean') {
    return attr.value === 'true' ? 'Sim' : '';
  }
  if (attr.input_type === 'multiselect') {
    try {
      const arr = JSON.parse(attr.value);
      return Array.isArray(arr) ? arr.join(', ') : attr.value;
    } catch {
      return attr.value;
    }
  }
  return attr.unit ? `${attr.value} ${attr.unit}` : attr.value;
}

export default function PropertyDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const { ui } = useAppTheme();
  const styles = useMemo(() => createStyles(ui), [ui]);
  const params = useLocalSearchParams();
  const propertyId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageIndex, setImageIndex] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const mainGalleryRef = useRef<FlatList<string>>(null);

  useEffect(() => {
    async function load() {
      if (!propertyId) return;
      setLoading(true);
      const data = await getPropertyById(String(propertyId));
      setProperty(data);
      setLoading(false);

      try {
        setIsFavorite(await isPropertyFavorite(String(propertyId)));
      } catch {
        setIsFavorite(false);
      }
    }
    load();
  }, [propertyId]);

  const images = useMemo(() => {
    if (!property) return [];
    const list = [
      ...(property.image_urls || []),
      ...(property.image_url ? [property.image_url] : []),
    ].filter((uri, index, arr) => typeof uri === 'string' && uri && arr.indexOf(uri) === index);
    return list.length ? list : ['https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800'];
  }, [property]);

  const mainAttrs = (property?.attributes || []).filter((a) => a.show_in_main && formatAttrValue(a));
  const infoAttrs = (property?.attributes || []).filter(
    (a) => a.attr_group === 'info' && formatAttrValue(a),
  );
  const amenityAttrs = (property?.attributes || []).filter(
    (a) =>
      (a.attr_group === 'amenity' || a.attr_group === 'structure' || a.attr_group === 'service') &&
      formatAttrValue(a),
  );

  const fullLocation = [
    property?.rua,
    property?.bairro,
    property?.tabanca,
    property?.sector,
    property?.region,
    property?.country || 'Guiné-Bissau',
  ]
    .filter(Boolean)
    .join(', ');

  const toggleFavorite = async () => {
    if (!property) return;
    try {
      const { isFavorite } = await togglePropertyFavorite(property);
      setIsFavorite(isFavorite);
    } catch {
      // ignore
    }
  };

  const shareProperty = async () => {
    if (!property) return;
    await Share.share({
      message: `${property.title} — ${formatPropertyPrice(property)}\n${fullLocation}`,
    });
  };

  const callPhone = () => {
    if (property?.phone) {
      void Linking.openURL(`tel:${property.phone}`).catch((error) => {
        console.log('Erro ao abrir telefone:', error);
      });
    }
  };

  const openWhatsApp = (prefill?: string) => {
    const number = (property?.whatsapp || property?.phone || '').replace(/[^\d]/g, '');
    if (!number) return;
    const text = encodeURIComponent(
      prefill || t('propertyDetail.waInterest', { title: property?.title }),
    );
    void Linking.openURL(`https://wa.me/${number}?text=${text}`).catch((error) => {
      console.log('Erro ao abrir WhatsApp:', error);
    });
  };

  const openRoute = () => {
    if (!property?.latitude || !property?.longitude) return;
    void openMapsDirections(
      Number(property.latitude),
      Number(property.longitude),
      property.title || fullLocation,
      {
        title: t('propertyDetail.routeTitle'),
        googleMaps: t('propertyDetail.routeGoogle'),
        appleMaps: t('propertyDetail.routeApple'),
        waze: t('propertyDetail.routeWaze'),
        cancel: t('common.cancel'),
        fail: t('propertyDetail.routeFail'),
      },
    );
  };

  const showMap =
    property?.show_on_map !== false &&
    property?.latitude != null &&
    property?.longitude != null &&
    Number.isFinite(Number(property.latitude)) &&
    Number.isFinite(Number(property.longitude));

  const openGallery = (index?: number) => {
    if (typeof index === 'number') setImageIndex(index);
    setGalleryOpen(true);
  };

  const onGalleryIndexChange = (index: number) => {
    setImageIndex(index);
    mainGalleryRef.current?.scrollToOffset({
      offset: index * width,
      animated: false,
    });
  };

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <RippleWaveLoader color={ui.brand} />
      </View>
    );
  }

  if (!property) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={{ color: ui.muted }}>{t('propertyDetail.notFound')}</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={{ color: ui.brand, fontWeight: '700' }}>{t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const stars = hotelStarCount(property);

  return (
    <View style={{ flex: 1, backgroundColor: ui.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <View>
          <FlatList
            ref={mainGalleryRef}
            data={images}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            keyExtractor={(uri, index) => `${uri}-${index}`}
            getItemLayout={(_, index) => ({
              length: width,
              offset: width * index,
              index,
            })}
            onMomentumScrollEnd={(e) => {
              setImageIndex(Math.round(e.nativeEvent.contentOffset.x / width));
            }}
            renderItem={({ item, index }) => (
              <Pressable onPress={() => openGallery(index)}>
                <Image
                  source={{ uri: optimizedImageUrl(item, 'detail') }}
                  style={{ width, height: 280 }}
                  resizeMode="cover"
                />
              </Pressable>
            )}
          />
          <View style={[styles.topBar, { top: insets.top + 8 }]} pointerEvents="box-none">
            <TouchableOpacity style={styles.roundBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={20} color={ui.text} />
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={styles.roundBtn} onPress={toggleFavorite}>
                <Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={20} color={isFavorite ? '#E91E63' : ui.text} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.roundBtn} onPress={shareProperty}>
                <Ionicons name="share-outline" size={20} color={ui.text} />
              </TouchableOpacity>
            </View>
          </View>
          <Pressable style={styles.dots} onPress={() => openGallery(imageIndex)}>
            <Text style={styles.dotsText}>{imageIndex + 1}/{images.length}</Text>
          </Pressable>
        </View>

        <View style={styles.body}>
          <Text style={styles.category}>
            {propertyPurposeBadge(property)}
            {property.category ? ` · ${property.category}` : ''}
            {property.agency?.verified ? ` ${t('propertyDetail.verifiedAgency')}` : ''}
          </Text>
          <Text style={styles.title}>{property.title}</Text>
          {stars > 0 ? (
            <View style={styles.starsRow}>
              {Array.from({ length: stars }, (_, i) => (
                <Ionicons key={i} name="star" size={16} color={STAR_GOLD} />
              ))}
            </View>
          ) : null}
          <Text style={styles.location}>{fullLocation || property.location}</Text>
          <Text style={styles.price}>{formatPropertyPrice(property)}</Text>

          {(property.video_urls?.length || property.virtual_tour_url) && (
            <View style={styles.mediaRow}>
              {!!property.video_urls?.[0] && (
                <TouchableOpacity
                  style={styles.mediaChip}
                  onPress={() => {
                    void Linking.openURL(property.video_urls![0]).catch((error) => {
                      console.log('Erro ao abrir vídeo:', error);
                    });
                  }}
                >
                  <Ionicons name="play-circle-outline" size={16} color={ui.brand} />
                  <Text style={styles.mediaChipText}>{t('propertyDetail.watchVideo')}</Text>
                </TouchableOpacity>
              )}
              {!!property.virtual_tour_url && (
                <TouchableOpacity
                  style={styles.mediaChip}
                  onPress={() => WebBrowser.openBrowserAsync(property.virtual_tour_url!)}
                >
                  <Ionicons name="globe-outline" size={16} color={ui.brand} />
                  <Text style={styles.mediaChipText}>{t('propertyDetail.virtualTour')}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {!!mainAttrs.length && (
            <View style={styles.mainGrid}>
              {mainAttrs.map((attr) => (
                <View key={attr.id || attr.key} style={styles.mainItem}>
                  <Text style={styles.mainValue}>{formatAttrValue(attr)}</Text>
                  <Text style={styles.mainLabel}>{attr.label}</Text>
                </View>
              ))}
            </View>
          )}

          {showMap && (
            <View style={styles.mapSection}>
              <Text style={styles.section}>{t('propertyDetail.locationOnMap')}</Text>
              <View style={styles.mapBox}>
                <MapView
                  style={styles.map}
                  provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
                  initialRegion={{
                    latitude: Number(property.latitude),
                    longitude: Number(property.longitude),
                    latitudeDelta: 0.02,
                    longitudeDelta: 0.02,
                  }}
                >
                  <Marker
                    coordinate={{
                      latitude: Number(property.latitude),
                      longitude: Number(property.longitude),
                    }}
                    title={property.title}
                  />
                </MapView>
              </View>
              <TouchableOpacity style={styles.routeBtn} onPress={openRoute} activeOpacity={0.85}>
                <Ionicons name="navigate" size={18} color={ui.onBrand} />
                <Text style={styles.routeBtnText}>{t('propertyDetail.makeRoute')}</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.section}>{t('propertyDetail.description')}</Text>
          <Text style={styles.description}>
            {property.description || property.details || t('propertyDetail.noDescription')}
          </Text>

          {!!infoAttrs.length && (
            <>
              <Text style={styles.section}>{t('propertyDetail.features')}</Text>
              {infoAttrs.map((attr) => (
                <View key={attr.id || attr.key} style={styles.specRow}>
                  <Text style={styles.specLabel}>{attr.label}</Text>
                  <Text style={styles.specValue}>{formatAttrValue(attr)}</Text>
                </View>
              ))}
            </>
          )}

          {!!amenityAttrs.length && (
            <>
              <Text style={styles.section}>{t('propertyDetail.amenities')}</Text>
              <View style={styles.amenityWrap}>
                {amenityAttrs.map((attr) => (
                  <View key={attr.id || attr.key} style={styles.amenityChip}>
                    <Ionicons name="checkmark-circle" size={14} color={ui.brand} />
                    <Text style={styles.amenityText}>{attr.label}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {!!property.rooms?.length && (
            <>
              <Text style={styles.section}>{t('propertyDetail.roomTypes')}</Text>
              {property.rooms.map((room, index) => (
                <View key={room.id || `room-${index}`} style={styles.roomCard}>
                  <Text style={styles.roomName}>{room.name}</Text>
                  <Text style={styles.roomMeta}>
                    {Number(room.price_per_night).toLocaleString()} CFA/noite · {room.guests} hóspedes ·{' '}
                    {room.beds} camas · {room.bathrooms} WC
                    {room.available === false ? ` ${t('propertyDetail.unavailable')}` : ''}
                  </Text>
                </View>
              ))}
            </>
          )}

          <Text style={styles.section}>{t('propertyDetail.contact')}</Text>
          <Text style={styles.contactName}>
            {property.owner_name || property.advertiser || t('propertyDetail.advertiser')}
            {property.agency_name ? ` · ${property.agency_name}` : ''}
          </Text>
          <View style={styles.contactActions}>
            <TouchableOpacity style={styles.contactBtn} onPress={callPhone}>
              <Ionicons name="call" size={16} color="#FFF" />
              <Text style={styles.contactBtnText}>{t('propertyDetail.call')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.contactBtn, styles.waBtn]} onPress={() => openWhatsApp()}>
              <Ionicons name="logo-whatsapp" size={16} color="#FFF" />
              <Text style={styles.contactBtnText}>{t('propertyDetail.whatsapp')}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.contactActions}>
            <TouchableOpacity
              style={[styles.contactBtn, styles.secondaryContact]}
              onPress={() => openWhatsApp(t('propertyDetail.waMessage', { title: property.title }))}
            >
              <Text style={[styles.contactBtnText, { color: ui.brand }]}>{t('propertyDetail.sendMessage')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.contactBtn, styles.secondaryContact]}
              onPress={() =>
                openWhatsApp(t('propertyDetail.waVisit', { title: property.title }))
              }
            >
              <Text style={[styles.contactBtnText, { color: ui.brand }]}>{t('propertyDetail.scheduleVisit')}</Text>
            </TouchableOpacity>
          </View>

          {!!property.related?.length && (
            <>
              <Text style={styles.section}>{t('propertyDetail.related')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {property.related.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.relatedCard}
                    onPress={() => router.push({ pathname: '/propertyDetail', params: { id: item.id } })}
                  >
                    <Image
                      source={{
                        uri: listImageUrl(
                          item.image_urls,
                          item.image_url,
                          'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=400',
                          'thumb',
                        ),
                      }}
                      style={styles.relatedImage}
                    />
                    <Text style={styles.relatedTitle} numberOfLines={2}>{item.title}</Text>
                    <Text style={styles.relatedPrice}>{formatPropertyPrice(item)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}
        </View>
      </ScrollView>

      <ImageGalleryViewer
        visible={galleryOpen}
        images={images}
        initialIndex={imageIndex}
        onClose={() => setGalleryOpen(false)}
        onIndexChange={onGalleryIndexChange}
      />
    </View>
  );
}

function createStyles(ui: AppUI) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: ui.bg },
    topBar: {
      position: 'absolute',
      left: 16,
      right: 16,
      flexDirection: 'row',
      justifyContent: 'space-between',
      zIndex: 10,
    },
    roundBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: ui.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dots: {
      position: 'absolute',
      right: 12,
      bottom: 12,
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    dotsText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
    body: { padding: 16 },
    category: { fontSize: 11, fontWeight: '800', color: ui.brand, textTransform: 'uppercase' },
    title: { fontSize: 22, fontWeight: '900', color: ui.text, marginTop: 4 },
    starsRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 6 },
    location: { fontSize: 13, color: ui.muted, marginTop: 6 },
    price: { fontSize: 20, fontWeight: '900', color: ui.text, marginTop: 10 },
    mediaRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    mediaChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: ui.brandSoft,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 10,
    },
    mediaChipText: { color: ui.brand, fontWeight: '700', fontSize: 12 },
    mainGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16, gap: 8 },
    mainItem: {
      width: (width - 48) / 2,
      backgroundColor: ui.brandSoft,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1.5,
      borderColor: ui.brand,
    },
    mainValue: { fontSize: 16, fontWeight: '900', color: ui.text },
    mainLabel: { fontSize: 11, color: ui.text, marginTop: 2, fontWeight: '600' },
    mapSection: { marginTop: 8 },
    mapBox: { height: 200, borderRadius: 14, overflow: 'hidden', marginTop: 4 },
    map: { flex: 1 },
    routeBtn: {
      marginTop: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: ui.brand,
      borderRadius: 14,
      paddingVertical: 14,
    },
    routeBtnText: { color: ui.onBrand, fontWeight: '800', fontSize: 15 },
    section: { fontSize: 16, fontWeight: '900', color: ui.text, marginTop: 22, marginBottom: 10 },
    description: { fontSize: 14, color: ui.text, lineHeight: 21 },
    specRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: ui.divider,
    },
    specLabel: { fontSize: 13, color: ui.muted },
    specValue: { fontSize: 13, fontWeight: '700', color: ui.text },
    amenityWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    amenityChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: ui.input,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 16,
    },
    amenityText: { fontSize: 12, color: ui.text, fontWeight: '600' },
    roomCard: {
      backgroundColor: ui.input,
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: ui.border,
    },
    roomName: { fontSize: 14, fontWeight: '800', color: ui.text },
    roomMeta: { fontSize: 12, color: ui.muted, marginTop: 4 },
    contactName: { fontSize: 14, fontWeight: '700', color: ui.text, marginBottom: 10 },
    contactActions: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    contactBtn: {
      flex: 1,
      backgroundColor: ui.brand,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    waBtn: { backgroundColor: '#128C7E' },
    secondaryContact: { backgroundColor: ui.brandSoft },
    contactBtnText: { color: '#FFF', fontWeight: '800', fontSize: 12 },
    relatedCard: { width: 160, marginRight: 10 },
    relatedImage: { width: 160, height: 110, borderRadius: 12, backgroundColor: ui.input },
    relatedTitle: { fontSize: 12, fontWeight: '700', color: ui.text, marginTop: 6 },
    relatedPrice: { fontSize: 12, fontWeight: '900', color: ui.brand, marginTop: 2 },
  });
}
