import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { memo, useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { LiveStore } from '@/components/api';
import { useAppTheme, type AppUI } from '@/components/tema';
import { optimizedImageUrl } from '@/lib/imageOptimization';

const FALLBACK_LOGO =
  'https://images.unsplash.com/photo-1560179707-f14dd11c87e8?w=200&h=200&fit=crop';

type Props = {
  stores: LiveStore[];
};

export const RecommendedStores = memo(function RecommendedStores({ stores }: Props) {
  const router = useRouter();
  const { ui } = useAppTheme();
  const styles = useMemo(() => createStyles(ui), [ui]);

  if (!stores.length) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.title}>Lojas recomendadas</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.railScroll}
        contentContainerStyle={styles.list}
        nestedScrollEnabled
        removeClippedSubviews
      >
        {stores.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.card}
            activeOpacity={0.85}
            onPress={() =>
              router.push({
                pathname: '/loja',
                params: {
                  id: item.id,
                  name: item.name,
                  logo: item.logo_url || '',
                  cover: item.cover_url || '',
                  verified: item.verified ? '1' : '0',
                  rating: String(item.rating_avg || 0),
                  reviews: String(item.review_count || 0),
                },
              })
            }
          >
            <Image
              source={{
                uri: optimizedImageUrl(item.logo_url || FALLBACK_LOGO, 'thumb'),
              }}
              style={styles.logo}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={`${item.id}-logo-${item.logo_url || 'default'}`}
            />
            <Text style={styles.name} numberOfLines={2}>
              {item.name}
            </Text>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={12} color="#F5A623" />
              <Text style={styles.rating}>
                {(item.rating_avg || 0).toFixed(1)}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
});

function createStyles(ui: AppUI) {
  return StyleSheet.create({
    section: {
      marginTop: 8,
      marginBottom: 10,
    },
    title: {
      fontSize: 17,
      fontWeight: '800',
      color: ui.text,
      letterSpacing: -0.3,
      paddingHorizontal: 12,
      marginBottom: 10,
    },
    railScroll: {
      height: 120,
    },
    list: {
      paddingHorizontal: 10,
      gap: 8,
      alignItems: 'flex-start',
    },
    card: {
      width: 118,
      backgroundColor: ui.card,
      borderRadius: 12,
      padding: 10,
      alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: ui.border,
    },
    logo: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: ui.input,
      marginBottom: 8,
    },
    name: {
      fontSize: 12,
      fontWeight: '700',
      color: ui.text,
      textAlign: 'center',
      minHeight: 32,
    },
    ratingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginTop: 4,
    },
    rating: {
      fontSize: 11,
      color: ui.muted,
      fontWeight: '600',
    },
  });
}
