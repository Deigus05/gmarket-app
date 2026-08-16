import { Image } from 'expo-image';
import React, { memo, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { HomeBanner } from '@/components/api';
import { useAppTheme } from '@/components/tema';
import { optimizedImageUrl } from '@/lib/imageOptimization';

type Props = {
  banners: HomeBanner[];
  contentWidth: number;
  onPress: (banner: HomeBanner) => void;
};

/** Faixa Yandex-like: 2–3 cards médios lado a lado (não um banner full-width). */
export const DesktopBannerStrip = memo(function DesktopBannerStrip({
  banners,
  contentWidth,
  onPress,
}: Props) {
  const { ui } = useAppTheme();
  const gap = 10;
  const visible = Math.min(3, Math.max(1, banners.length));
  const cardWidth = useMemo(() => {
    if (visible <= 1) return Math.min(contentWidth, 420);
    return (contentWidth - gap * (visible - 1)) / visible;
  }, [contentWidth, visible]);

  if (!banners.length) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      contentContainerStyle={[styles.row, { gap }]}
      style={styles.wrap}
    >
      {banners.map((item) => (
        <TouchableOpacity
          key={item.id}
          activeOpacity={0.92}
          onPress={() => onPress(item)}
          style={[
            styles.card,
            {
              width: cardWidth,
              backgroundColor: ui.card,
              borderColor: ui.border,
            },
          ]}
        >
          <Image
            source={{ uri: optimizedImageUrl(item.image_url, 'card') }}
            style={styles.image}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={item.id}
          />
          <View style={styles.copy}>
            {item.title ? (
              <Text style={[styles.title, { color: ui.text }]} numberOfLines={2}>
                {item.title}
              </Text>
            ) : null}
            {item.subtitle ? (
              <Text style={[styles.subtitle, { color: ui.muted }]} numberOfLines={2}>
                {item.subtitle}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingBottom: 2,
  },
  card: {
    height: 156,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
  },
  image: {
    width: '46%',
    height: '100%',
    backgroundColor: '#E8EEF5',
  },
  copy: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: 'center',
    gap: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
    lineHeight: 18,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 15,
  },
});
