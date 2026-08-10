import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { HeroBlobReveal } from './HeroBlobReveal';
import { GUITAR_GOLD, GUITAR_GOLD_SOFT } from './guitarPaths';

export type FeaturedConcert = {
  id: string;
  title: string;
  type: string;
  age: string;
  city: string;
  day: string;
  month: string;
  weekday: string;
  priceLabel: string;
  images: string[];
};

const AUTOPLAY_MS = 4800;
const REVEAL_MS = 10000;
const YELLOW = '#F5C518';
const YELLOW_NEON = '#E8FF00';

type Props = {
  concerts: FeaturedConcert[];
  width: number;
  height: number;
  onPress?: (concert: FeaturedConcert) => void;
  buyLabel: string;
  onRevealComplete?: () => void;
};

export const FeaturedConcertCarousel = memo(function FeaturedConcertCarousel({
  concerts,
  width,
  height,
  onPress,
  buyLabel,
  onRevealComplete,
}: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const indexRef = useRef(0);
  const touchingRef = useRef(false);
  const onRevealCompleteRef = useRef(onRevealComplete);
  onRevealCompleteRef.current = onRevealComplete;
  const revealUriRef = useRef(concerts[0]?.images[0] ?? '');
  if (!revealUriRef.current && concerts[0]?.images[0]) {
    revealUriRef.current = concerts[0].images[0];
  }
  const [activeIndex, setActiveIndex] = useState(0);
  const [revealDone, setRevealDone] = useState(!revealUriRef.current);
  const multi = concerts.length > 1;
  const cardW = width;
  const cardH = height;
  const innerW = cardW - 4;
  const innerH = cardH - 4;

  const goToIndex = useCallback(
    (next: number, animated = true) => {
      if (next < 0 || next >= concerts.length) return;
      indexRef.current = next;
      setActiveIndex(next);
      scrollRef.current?.scrollTo({ x: next * cardW, y: 0, animated });
    },
    [concerts.length, cardW],
  );

  useEffect(() => {
    if (!multi || !revealDone) return;
    const timer = setInterval(() => {
      if (touchingRef.current) return;
      goToIndex((indexRef.current + 1) % concerts.length, true);
    }, AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [multi, concerts.length, goToIndex, revealDone]);

  useEffect(() => {
    // Prefetch imagens do destaque para o reveal não esperar rede
    for (const c of concerts) {
      if (c.images[0]) void Image.prefetch(c.images[0]);
    }
  }, [concerts]);

  if (!concerts.length) return null;

  return (
    <View style={{ width: cardW }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={revealDone}
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        style={{ width: cardW, height: cardH }}
        onScrollBeginDrag={() => {
          touchingRef.current = true;
        }}
        onMomentumScrollEnd={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
          touchingRef.current = false;
          const next = Math.round(event.nativeEvent.contentOffset.x / cardW);
          const clamped = Math.max(0, Math.min(next, concerts.length - 1));
          indexRef.current = clamped;
          setActiveIndex(clamped);
        }}
      >
        {concerts.map((item, itemIndex) => {
          const showReveal =
            itemIndex === 0 && !revealDone && !!revealUriRef.current;

          return (
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.94}
              onPress={() => onPress?.(item)}
              style={{ width: cardW, height: cardH, paddingHorizontal: 2 }}
            >
              <View style={[styles.card, { height: innerH }]}>
                {showReveal ? (
                  <HeroBlobReveal
                    uri={revealUriRef.current}
                    width={innerW}
                    height={innerH}
                    borderRadius={28}
                    durationMs={REVEAL_MS}
                    onComplete={() => {
                      setRevealDone(true);
                      onRevealCompleteRef.current?.();
                    }}
                  />
                ) : (
                  <>
                    <LinearGradient
                      colors={['#1A1A1A', '#222018', '#1A1A1A']}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.collage} pointerEvents="none">
                      {item.images.slice(0, 4).map((uri, idx) => (
                        <Image
                          key={`${item.id}-${idx}`}
                          source={{ uri }}
                          style={[styles.collageImage, collageStyle(idx)]}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          recyclingKey={`${item.id}-${idx}`}
                          transition={0}
                        />
                      ))}
                      <LinearGradient
                        colors={[
                          'rgba(245,197,24,0.35)',
                          'transparent',
                          'rgba(245,197,24,0.12)',
                        ]}
                        start={{ x: 0.5, y: 0.5 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.rayGlow}
                      />
                    </View>
                  </>
                )}

                <LinearGradient
                  colors={['rgba(0,0,0,0.92)', 'rgba(0,0,0,0.55)', 'transparent']}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.leftFade}
                  pointerEvents="none"
                />

                <View style={styles.content}>
                  <View>
                    <View style={styles.dateBadge}>
                      <Text style={styles.dateDay}>{item.day}</Text>
                      <Text style={styles.dateMonth}>
                        {item.month} {item.weekday}
                      </Text>
                    </View>

                    <Text style={styles.meta}>
                      {item.type.toUpperCase()} · {item.age}
                    </Text>
                    <Text style={styles.title} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <View style={styles.locationRow}>
                      <Ionicons name="location-sharp" size={13} color={GUITAR_GOLD_SOFT} />
                      <Text style={styles.location}>{item.city}</Text>
                    </View>
                  </View>

                  <View style={styles.cta}>
                    <View style={styles.ctaCopy}>
                      <Text style={styles.ctaTitle}>{buyLabel}</Text>
                      <Text style={styles.ctaPrice}>{item.priceLabel}</Text>
                    </View>
                    <View style={styles.ctaArrow}>
                      <Ionicons
                        name="arrow-up"
                        size={14}
                        color="#fff"
                        style={{ transform: [{ rotate: '45deg' }] }}
                      />
                    </View>
                  </View>
                </View>

                <TouchableOpacity style={styles.heartBtn} activeOpacity={0.8}>
                  <Ionicons name="heart-outline" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {multi ? (
        <View style={styles.dotsRow}>
          {concerts.map((c, index) => (
            <View
              key={c.id}
              style={[styles.dot, activeIndex === index && styles.dotActive]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
});

function collageStyle(index: number): {
  top: `${number}%`;
  left: `${number}%`;
  width: `${number}%`;
  height: `${number}%`;
} {
  switch (index) {
    case 0:
      return { top: '6%', left: '48%', width: '28%', height: '58%' };
    case 1:
      return { top: '10%', left: '68%', width: '30%', height: '55%' };
    case 2:
      return { top: '48%', left: '52%', width: '26%', height: '48%' };
    default:
      return { top: '42%', left: '74%', width: '24%', height: '52%' };
  }
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#1A1A1A',
  },
  collage: {
    ...StyleSheet.absoluteFillObject,
  },
  collageImage: {
    position: 'absolute',
    borderRadius: 8,
  },
  rayGlow: {
    position: 'absolute',
    right: 0,
    top: '8%',
    width: '55%',
    height: '85%',
  },
  leftFade: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '62%',
  },
  content: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    justifyContent: 'space-between',
    maxWidth: '58%',
  },
  dateBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: YELLOW,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    minWidth: 48,
  },
  dateDay: {
    color: YELLOW_NEON,
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
  meta: {
    color: '#A8A8A8',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginTop: 10,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22,
    marginTop: 4,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  location: {
    color: '#D0D0D0',
    fontSize: 12,
  },
  cta: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: YELLOW_NEON,
    borderRadius: 999,
    paddingLeft: 14,
    paddingRight: 5,
    paddingVertical: 8,
    gap: 8,
    maxWidth: '100%',
  },
  ctaCopy: {
    flex: 1,
  },
  ctaTitle: {
    color: '#111',
    fontSize: 13,
    fontWeight: '900',
  },
  ctaPrice: {
    color: '#222',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 1,
  },
  ctaArrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartBtn: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#3A3A3A',
  },
  dotActive: {
    backgroundColor: GUITAR_GOLD,
    width: 18,
    borderRadius: 3,
  },
});
