import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getEventById as fetchEventById } from '@/components/api';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import { useAuth } from '@/components/AuthContext';
import {
  cacheEvent,
  eventDtoToRecord,
  formatCfa,
  getCachedEvent,
  type EventRecord,
} from '@/components/eventos/eventsData';
import { useLocale } from '@/components/LocaleContext';
import { useAppTheme } from '@/components/tema';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const HERO_H = Math.min(360, SCREEN_W * 0.95);
const GUEST_CIRCLE = Math.min(SCREEN_W * 0.78, SCREEN_H * 0.42);
const ACCENT = '#F5C518';
const ACCENT_NEON = '#E8FF00';

function detailTheme(isDark: boolean) {
  if (isDark) {
    return {
      pageBg: '#1A1A1A',
      ink: '#FFFFFF',
      muted: '#9A9A9A',
      card: '#121212',
      line: 'rgba(255,255,255,0.08)',
      icon: '#FFFFFF',
      statusBar: 'light' as const,
    };
  }
  return {
    pageBg: '#FFFFFF',
    ink: '#111111',
    muted: '#6B7280',
    card: '#F3F4F6',
    line: 'rgba(0,0,0,0.08)',
    icon: '#111111',
    statusBar: 'dark' as const,
  };
}

export default function EventoDetalheScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const { isDark } = useAppTheme();
  const { isLoggedIn } = useAuth();
  const theme = useMemo(() => detailTheme(isDark), [isDark]);
  const params = useLocalSearchParams<{ id?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const initialEvent = id ? getCachedEvent(id) : undefined;
  const [event, setEvent] = useState<EventRecord | undefined>(initialEvent);
  const [loading, setLoading] = useState(!initialEvent && !!id);
  const [qty, setQty] = useState(1);
  const [liked, setLiked] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [gallerySession, setGallerySession] = useState(0);
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [galleryLabels, setGalleryLabels] = useState<(string | null)[] | null>(null);
  const loadGenerationRef = useRef(0);
  const loadedEventIdRef = useRef<string | null>(null);
  const navigationInFlightRef = useRef(false);
  const galleryCaption = galleryLabels?.[galleryIndex] ?? null;

  useFocusEffect(
    useCallback(() => {
      const generation = ++loadGenerationRef.current;
      navigationInFlightRef.current = false;

      async function load() {
        const isCurrent = () => loadGenerationRef.current === generation;
        if (!isCurrent()) return;
        if (!id) {
          setLoading(false);
          return;
        }

        const cached = getCachedEvent(id);
        if (cached) {
          setEvent(cached);
          setLoading(false);
          void Image.prefetch(cached.images);
        } else {
          setLoading(true);
        }

        if (loadedEventIdRef.current === id) return;
        const apiEvent = await fetchEventById(id);
        if (!isCurrent()) return;
        if (apiEvent) {
          const record = eventDtoToRecord(apiEvent);
          cacheEvent(record);
          setEvent(record);
          void Image.prefetch(record.images);
        } else if (!cached) {
          setEvent(undefined);
        }
        setLoading(false);
        loadedEventIdRef.current = id;
      }
      void load();
      return () => {
        loadGenerationRef.current += 1;
        navigationInFlightRef.current = false;
      };
    }, [id]),
  );

  const totalLabel = useMemo(() => {
    if (!event) return '';
    if (event.priceCfa <= 0) return t('events.free');
    return formatCfa(event.priceCfa * qty);
  }, [event, qty, t]);

  const onBuy = () => {
    if (!event || navigationInFlightRef.current) return;
    navigationInFlightRef.current = true;
    if (!isLoggedIn) {
      router.push({
        pathname: '/login',
        params: { redirect: 'bilhete-dados', eventId: event.id, qty: String(qty) },
      });
      return;
    }
    router.push({
      pathname: '/bilhete-dados',
      params: { eventId: event.id, qty: String(qty) },
    });
  };

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/eventos');
  }, [router]);

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: theme.pageBg, paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar style={theme.statusBar} />
        <RippleWaveLoader style={{ marginTop: 48 }} color={ACCENT} />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={[styles.root, { backgroundColor: theme.pageBg, paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar style={theme.statusBar} />
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={goBack} activeOpacity={0.75}>
            <Ionicons name="arrow-back" size={22} color={theme.icon} />
          </TouchableOpacity>
        </View>
        <View style={styles.emptyWrap}>
          <Text style={[styles.emptyText, { color: theme.ink }]}>{t('events.notFound')}</Text>
          <TouchableOpacity onPress={goBack} style={styles.emptyBtn}>
            <Text style={styles.emptyBtnText}>{t('events.backToEvents')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const hero = event.images[0];
  const eventImages = event.images.length ? event.images : [hero];

  const openGallery = (
    uris: string[],
    index = 0,
    labels: (string | null)[] | null = null,
  ) => {
    if (!uris.length) return;
    setGalleryImages(uris);
    setGalleryLabels(labels);
    setGalleryIndex(Math.max(0, Math.min(index, uris.length - 1)));
    setGallerySession((s) => s + 1);
    setGalleryOpen(true);
  };

  const closeGallery = useCallback(() => {
    setGalleryOpen(false);
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: theme.pageBg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
      >
        <Pressable style={styles.hero} onPress={() => openGallery(eventImages, 0)}>
          <Image
            source={{ uri: hero }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            priority="high"
            transition={0}
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.45)', 'transparent', 'rgba(0,0,0,0.75)']}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          <View style={[styles.heroTop, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
            <TouchableOpacity
              style={styles.heroIconBtn}
              onPress={goBack}
              activeOpacity={0.8}
            >
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.heroIconBtn}
              onPress={() => setLiked((v) => !v)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={liked ? 'heart' : 'heart-outline'}
                size={22}
                color={liked ? ACCENT : '#fff'}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.heroBottom} pointerEvents="none">
            <View style={styles.dateBadge}>
              <Text style={styles.dateDay}>{event.day}</Text>
              <Text style={styles.dateMonth}>
                {event.month} · {event.weekday}
              </Text>
            </View>
            <Text style={styles.heroMeta}>
              {event.typeLabel.toUpperCase()} · {event.age}
            </Text>
            <Text style={styles.heroTitle}>{event.title}</Text>
          </View>
        </Pressable>

        <View style={styles.body}>
          <View style={[styles.infoCard, { backgroundColor: theme.card }]}>
            <View style={styles.infoRow}>
              <Ionicons name="location-sharp" size={18} color={ACCENT} />
              <View style={styles.infoCopy}>
                <Text style={[styles.infoLabel, { color: theme.muted }]}>{t('events.venue')}</Text>
                <Text style={[styles.infoValue, { color: theme.ink }]}>{event.venue}</Text>
                <Text style={[styles.infoSub, { color: theme.muted }]}>{event.city}</Text>
              </View>
            </View>
            <View style={[styles.infoDivider, { backgroundColor: theme.line }]} />
            <View style={styles.infoRow}>
              <Ionicons name="ticket-outline" size={18} color={ACCENT} />
              <View style={styles.infoCopy}>
                <Text style={[styles.infoLabel, { color: theme.muted }]}>{t('events.price')}</Text>
                <Text style={[styles.infoValue, { color: theme.ink }]}>{event.priceLabel}</Text>
              </View>
            </View>
          </View>

          {event.guests && event.guests.length > 0 ? (
            <View style={styles.guestsSection}>
              <Text style={[styles.sectionTitle, { color: theme.ink }]}>{t('events.guests')}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.guestsRow}
              >
                {event.guests.map((guest, guestIndex) => (
                  <TouchableOpacity
                    key={guest.id}
                    style={styles.guestItem}
                    activeOpacity={0.85}
                    onPress={() =>
                      openGallery(
                        event.guests!.map((g) => g.image),
                        guestIndex,
                        event.guests!.map((g) => g.name),
                      )
                    }
                  >
                    <View style={styles.guestAvatarRing}>
                      <Image
                        source={{ uri: guest.image }}
                        style={styles.guestAvatar}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                    </View>
                    <Text
                      style={[styles.guestName, { color: theme.ink }]}
                      numberOfLines={2}
                    >
                      {guest.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <Text style={[styles.sectionTitle, { color: theme.ink }]}>{t('events.description')}</Text>
          <Text style={[styles.description, { color: theme.muted }]}>{event.description}</Text>

          <Text style={[styles.sectionTitle, { color: theme.ink, marginTop: 22 }]}>
            {t('events.quantity')}
          </Text>
          <View style={[styles.qtyRow, { backgroundColor: theme.card }]}>
            <TouchableOpacity
              style={styles.qtyBtn}
              activeOpacity={0.8}
              onPress={() => setQty((q) => Math.max(1, q - 1))}
              disabled={qty <= 1}
            >
              <Ionicons
                name="remove"
                size={20}
                color={qty <= 1 ? theme.muted : theme.ink}
              />
            </TouchableOpacity>
            <Text style={[styles.qtyValue, { color: theme.ink }]}>{qty}</Text>
            <TouchableOpacity
              style={styles.qtyBtn}
              activeOpacity={0.8}
              onPress={() => setQty((q) => Math.min(10, q + 1))}
              disabled={qty >= 10}
            >
              <Ionicons
                name="add"
                size={20}
                color={qty >= 10 ? theme.muted : theme.ink}
              />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: Math.max(insets.bottom, 12),
            backgroundColor: theme.pageBg,
            borderTopColor: theme.line,
          },
        ]}
      >
        <View style={styles.footerTotal}>
          <Text style={[styles.footerLabel, { color: theme.muted }]}>{t('events.total')}</Text>
          <Text style={[styles.footerPrice, { color: theme.ink }]}>{totalLabel}</Text>
        </View>
        <TouchableOpacity style={styles.buyBtn} activeOpacity={0.9} onPress={onBuy}>
          <Text style={styles.buyBtnText}>{t('events.buyTicket')}</Text>
          <View style={styles.buyArrow}>
            <Ionicons
              name="arrow-up"
              size={14}
              color="#fff"
              style={{ transform: [{ rotate: '45deg' }] }}
            />
          </View>
        </TouchableOpacity>
      </View>

      {/* Overlay de convidado: desfocca o fundo do evento (30%) */}
      {galleryOpen && galleryLabels != null ? (
        <View style={styles.guestOverlay} pointerEvents="box-none">
          <BlurView
            intensity={30}
            tint="dark"
            experimentalBlurMethod="dimezisBlurView"
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.guestOverlayDim} pointerEvents="none" />

          <View style={[styles.guestOverlayTop, { paddingTop: insets.top + 6 }]}>
            <View style={styles.galleryTopCopy}>
              {galleryCaption ? (
                <Text style={styles.galleryCaption} numberOfLines={1}>
                  {galleryCaption}
                </Text>
              ) : null}
              <Text style={styles.galleryCounter}>
                {galleryIndex + 1}/{galleryImages.length}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.galleryCloseBtn}
              onPress={closeGallery}
              activeOpacity={0.85}
            >
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          <FlatList
            key={`guest-${gallerySession}`}
            data={galleryImages}
            horizontal
            pagingEnabled
            initialScrollIndex={galleryIndex}
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            style={styles.guestOverlayList}
            keyExtractor={(uri, index) => `guest-photo-${index}-${uri}`}
            getItemLayout={(_, index) => ({
              length: SCREEN_W,
              offset: SCREEN_W * index,
              index,
            })}
            onMomentumScrollEnd={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
              const next = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
              setGalleryIndex(Math.max(0, Math.min(next, galleryImages.length - 1)));
            }}
            renderItem={({ item, index }) => {
              const label = galleryLabels?.[index] ?? null;
              return (
                <Pressable style={styles.guestOverlaySlide} onPress={closeGallery}>
                  <View style={styles.guestCircleWrap}>
                    <View style={styles.guestCircle}>
                      <Image
                        source={{ uri: item }}
                        style={styles.guestCircleImage}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                    </View>
                    {label ? (
                      <Text style={styles.guestCircleName} numberOfLines={2}>
                        {label}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            }}
          />
        </View>
      ) : null}

      {/* Galeria do destaque */}
      {galleryOpen && galleryLabels == null ? (
        <View style={styles.galleryOverlay}>
          <StatusBar style="light" />
          <View style={[styles.galleryOverlayTop, { paddingTop: insets.top + 6 }]}>
            <View style={styles.galleryTopCopy}>
              <Text style={styles.galleryCounter}>
                {galleryIndex + 1}/{galleryImages.length}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.galleryCloseBtn}
              onPress={closeGallery}
              activeOpacity={0.85}
            >
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          <FlatList
            key={`gallery-${gallerySession}`}
            data={galleryImages}
            horizontal
            pagingEnabled
            initialScrollIndex={galleryIndex}
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            style={styles.galleryOverlayList}
            keyExtractor={(uri, index) => `event-photo-${index}-${uri}`}
            getItemLayout={(_, index) => ({
              length: SCREEN_W,
              offset: SCREEN_W * index,
              index,
            })}
            onMomentumScrollEnd={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
              const next = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
              setGalleryIndex(Math.max(0, Math.min(next, galleryImages.length - 1)));
            }}
            renderItem={({ item }) => (
              <Pressable style={styles.galleryFullSlide} onPress={closeGallery}>
                <Image
                  source={{ uri: item }}
                  style={styles.galleryFullImage}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  priority="high"
                />
              </Pressable>
            )}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 16,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyBtn: {
    backgroundColor: ACCENT,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
  },
  emptyBtnText: {
    color: '#111',
    fontWeight: '800',
    fontSize: 14,
  },
  hero: {
    width: SCREEN_W,
    height: HERO_H,
    backgroundColor: '#111',
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  heroIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  heroBottom: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 18,
  },
  dateBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: ACCENT,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    minWidth: 52,
    marginBottom: 10,
  },
  dateDay: {
    color: ACCENT_NEON,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 26,
  },
  dateMonth: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 1,
  },
  heroMeta: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 28,
    marginTop: 4,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  infoCard: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 22,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  infoCopy: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  infoSub: {
    fontSize: 13,
    marginTop: 2,
  },
  infoDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  guestsSection: {
    marginBottom: 22,
  },
  guestsRow: {
    paddingTop: 4,
    gap: 14,
    paddingRight: 8,
  },
  guestItem: {
    width: 76,
    alignItems: 'center',
  },
  guestAvatarRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2,
    borderColor: ACCENT,
    padding: 2,
    backgroundColor: 'transparent',
  },
  guestAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 32,
  },
  guestName: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 15,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 6,
    gap: 14,
  },
  qtyBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValue: {
    fontSize: 17,
    fontWeight: '800',
    minWidth: 24,
    textAlign: 'center',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerTotal: {
    flexShrink: 0,
    minWidth: 88,
  },
  footerLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  footerPrice: {
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  buyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: ACCENT_NEON,
    borderRadius: 999,
    paddingLeft: 18,
    paddingRight: 6,
    paddingVertical: 8,
    minHeight: 52,
  },
  buyBtnText: {
    color: '#111',
    fontSize: 15,
    fontWeight: '900',
  },
  buyArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 50,
  },
  galleryOverlayTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
    zIndex: 3,
  },
  galleryOverlayList: {
    ...StyleSheet.absoluteFillObject,
  },
  galleryFullSlide: {
    width: SCREEN_W,
    height: SCREEN_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryFullImage: {
    width: SCREEN_W,
    height: SCREEN_H,
  },
  galleryTopCopy: {
    flex: 1,
    paddingRight: 12,
  },
  galleryCaption: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 2,
  },
  galleryCounter: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '700',
  },
  galleryCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
  },
  guestOverlayDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  guestOverlayTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
    zIndex: 3,
  },
  guestOverlayList: {
    ...StyleSheet.absoluteFillObject,
  },
  guestOverlaySlide: {
    width: SCREEN_W,
    height: SCREEN_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestCircleWrap: {
    alignItems: 'center',
    zIndex: 2,
    paddingHorizontal: 24,
  },
  guestCircle: {
    width: GUEST_CIRCLE,
    height: GUEST_CIRCLE,
    borderRadius: GUEST_CIRCLE / 2,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: ACCENT,
    backgroundColor: '#222',
  },
  guestCircleImage: {
    width: '100%',
    height: '100%',
  },
  guestCircleName: {
    marginTop: 18,
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
