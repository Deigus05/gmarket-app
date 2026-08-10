import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getEvents } from '@/components/api';
import { FeaturedConcertCarousel } from '@/components/eventos/FeaturedConcertCarousel';
import { EventTicketCard } from '@/components/eventos/EventTicketCard';
import {
  cacheEvents,
  eventDtoToRecord,
  recordsToFeatured,
  recordsToListItems,
  type EventRecord,
} from '@/components/eventos/eventsData';
import { GUITAR_GOLD_SOFT } from '@/components/eventos/guitarPaths';
import { useLocale } from '@/components/LocaleContext';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import { useAppTheme } from '@/components/tema';

const { width: SCREEN_W } = Dimensions.get('window');
const H_PAD = 14;
const FEATURED_W = SCREEN_W - H_PAD * 2;
/** Card grande horizontal (amarelo/preto) para eventos principais */
const FEATURED_H = Math.min(412, FEATURED_W * 1.085);
/** Grelha igual aos produtos da home */
const GRID_PAD = 4;
const GRID_GAP = 4;
const COLUMN_W = (SCREEN_W - GRID_PAD * 2 - GRID_GAP) / 2;
const TICKET_IMAGE_H = COLUMN_W * 1.35;
const ACCENT = '#F5C518';
const AD_H = 96;

function eventsTheme(isDark: boolean) {
  if (isDark) {
    return {
      pageBg: '#1A1A1A',
      ink: '#FFFFFF',
      muted: '#9A9A9A',
      chipBg: '#121212',
      chipText: '#9A9A9A',
      adBg: '#121212',
      icon: '#FFFFFF',
      statusBar: 'light' as const,
    };
  }
  return {
    pageBg: '#FFFFFF',
    ink: '#111111',
    muted: '#6B7280',
    chipBg: '#F3F4F6',
    chipText: '#6B7280',
    adBg: '#F3F4F6',
    icon: '#111111',
    statusBar: 'dark' as const,
  };
}

type FilterId = 'tudo' | 'show' | 'festival' | 'atividade' | 'noite';

const AD_BANNER =
  'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200&h=400&fit=crop';

export default function EventosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const { isDark } = useAppTheme();
  const theme = useMemo(() => eventsTheme(isDark), [isDark]);
  const [filter, setFilter] = useState<FilterId>('tudo');
  const [records, setRecords] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadEvents = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    const apiEvents = await getEvents();
    const next = apiEvents.map(eventDtoToRecord);
    cacheEvents(next);
    setRecords(next);
    if (!opts?.silent) setLoading(false);
  }, []);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadEvents({ silent: true });
    setRefreshing(false);
  }, [loadEvents]);

  const featured = useMemo(() => recordsToFeatured(records), [records]);
  const events = useMemo(() => {
    const list = recordsToListItems(records);
    // Se todos forem featured, mostrar todos na grelha também
    return list.length ? list : records.map((e) => ({
      id: e.id,
      title: e.title,
      venue: e.venue,
      city: e.city,
      day: e.day,
      month: e.month,
      weekday: e.weekday,
      age: e.age,
      priceLabel: e.priceLabel,
      category: e.category,
      image: e.images[0] ?? '',
    }));
  }, [records]);

  const filters = useMemo(
    () =>
      [
        { id: 'tudo' as const, label: t('events.filterAll') },
        { id: 'show' as const, label: t('events.filterShow') },
        { id: 'festival' as const, label: t('events.filterFestival') },
        { id: 'atividade' as const, label: t('events.filterActivity') },
        { id: 'noite' as const, label: t('events.filterNight') },
      ] as const,
    [t],
  );

  const filteredEvents = useMemo(
    () => (filter === 'tudo' ? events : events.filter((e) => e.category === filter)),
    [filter, events],
  );

  const openEvent = (eventId: string, imageUris?: string[]) => {
    const record = records.find((r) => r.id === eventId);
    if (record) cacheEvents([record]);
    if (imageUris?.length) void Image.prefetch(imageUris);
    else if (record?.images?.length) void Image.prefetch(record.images);
    router.push({ pathname: '/evento-detalhe', params: { id: eventId } });
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.pageBg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style={theme.statusBar} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 28, flexGrow: 1 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />
        }
      >
        <View style={{ paddingTop: insets.top + 8 }}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.75}>
              <Ionicons name="arrow-back" size={22} color={theme.icon} />
            </TouchableOpacity>
            <View style={styles.headerTitleWrap}>
              <Text style={[styles.headerTitle, { color: theme.ink }]}>{t('events.title')}</Text>
              <Ionicons name="chevron-down" size={16} color={theme.icon} style={{ marginLeft: 4 }} />
            </View>
            <TouchableOpacity style={styles.searchBtn} activeOpacity={0.75}>
              <Ionicons name="search" size={20} color={theme.icon} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingWrap}>
              <RippleWaveLoader color={ACCENT} />
            </View>
          ) : (
            <View style={styles.featuredWrap}>
              <FeaturedConcertCarousel
                concerts={featured}
                width={FEATURED_W}
                height={FEATURED_H}
                buyLabel={t('events.buyTicket')}
                onPress={(concert) => openEvent(concert.id, concert.images)}
              />
            </View>
          )}
        </View>

        {!loading ? (
          <>
            <TouchableOpacity
              style={[styles.adBanner, { backgroundColor: theme.adBg }]}
              activeOpacity={0.9}
            >
              <Image
                source={{ uri: AD_BANNER }}
                style={styles.adImage}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.75)']}
                style={styles.adFade}
                pointerEvents="none"
              />
              <View style={styles.adBadge}>
                <Text style={styles.adBadgeText}>{t('events.adBadge')}</Text>
              </View>
              <Text style={styles.adTitle} numberOfLines={1}>
                {t('events.adTitle')}
              </Text>
            </TouchableOpacity>

            <Text style={[styles.sectionTitle, { color: theme.ink }]}>{t('events.forYou')}</Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filtersRow}
            >
              {filters.map((chip) => {
                const active = chip.id === filter;
                return (
                  <TouchableOpacity
                    key={chip.id}
                    style={[
                      styles.chip,
                      { backgroundColor: theme.chipBg },
                      active && styles.chipActive,
                    ]}
                    activeOpacity={0.8}
                    onPress={() => setFilter(chip.id)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: theme.chipText },
                        active && styles.chipTextActive,
                      ]}
                    >
                      {chip.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {filteredEvents.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.muted }]}>{t('events.empty')}</Text>
            ) : (
              <View style={styles.grid}>
                {filteredEvents.map((event) => (
                  <View key={event.id} style={styles.gridItem}>
                    <EventTicketCard
                      event={event}
                      width={COLUMN_W}
                      imageHeight={TICKET_IMAGE_H}
                      pageBg={theme.pageBg}
                      isDark={isDark}
                      onPress={(item) => {
                        const full = records.find((r) => r.id === item.id);
                        openEvent(item.id, full?.images ?? (item.image ? [item.image] : undefined));
                      }}
                    />
                  </View>
                ))}
              </View>
            )}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  searchBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredWrap: {
    paddingHorizontal: H_PAD,
    paddingTop: 4,
    paddingBottom: 8,
  },
  loadingWrap: {
    minHeight: FEATURED_H,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 24,
    marginHorizontal: H_PAD,
  },
  adBanner: {
    marginTop: 10,
    marginHorizontal: H_PAD,
    height: AD_H,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(245,197,24,0.25)',
  },
  adImage: {
    ...StyleSheet.absoluteFillObject,
  },
  adFade: {
    ...StyleSheet.absoluteFillObject,
  },
  adBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: GUITAR_GOLD_SOFT,
  },
  adBadgeText: {
    color: GUITAR_GOLD_SOFT,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  adTitle: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginTop: 22,
    marginHorizontal: H_PAD,
    marginBottom: 12,
  },
  filtersRow: {
    paddingHorizontal: H_PAD,
    gap: 8,
    paddingBottom: 14,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  chipActive: {
    backgroundColor: 'transparent',
    borderColor: ACCENT,
    shadowColor: ACCENT,
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
    color: ACCENT,
    fontWeight: '800',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: GRID_PAD,
    rowGap: 14,
  },
  gridItem: {
    width: COLUMN_W,
  },
});
