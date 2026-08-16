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
import { StoreAvatar } from '@/components/StoreAvatar';
import { useAppTheme, type AppUI } from '@/components/tema';
import { useBreakpoint } from '@/hooks/useBreakpoint';

type Props = {
  stores: LiveStore[];
};

export const RecommendedStores = memo(function RecommendedStores({ stores }: Props) {
  const router = useRouter();
  const { ui } = useAppTheme();
  const { isDesktop } = useBreakpoint();
  const styles = useMemo(() => createStyles(ui, isDesktop), [ui, isDesktop]);

  if (!stores.length) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.title}>Lojas recomendadas</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        nestedScrollEnabled
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
            <View style={styles.logoWrap}>
              <StoreAvatar
                storeId={item.id}
                logoUrl={item.logo_url}
                size={64}
                borderRadius={32}
              />
            </View>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={2}>
                {item.name}
              </Text>
              {item.verified ? (
                <Ionicons name="checkmark-circle" size={14} color={ui.brand} style={styles.verified} />
              ) : null}
            </View>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={12} color="#F5A623" />
              <Text style={styles.rating}>
                {(item.rating_avg || 0).toFixed(1)}
              </Text>
              {item.review_count > 0 ? (
                <Text style={styles.reviews}>({item.review_count})</Text>
              ) : null}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
});

function createStyles(ui: AppUI, isDesktop: boolean) {
  const pad = isDesktop ? 0 : 12;
  return StyleSheet.create({
    section: {
      marginTop: 8,
      marginBottom: 10,
    },
    title: {
      fontSize: isDesktop ? 14 : 17,
      fontWeight: '800',
      color: ui.text,
      letterSpacing: -0.2,
      paddingHorizontal: pad,
      marginBottom: 8,
    },
    list: {
      paddingHorizontal: isDesktop ? 0 : 10,
      gap: 10,
      alignItems: 'stretch',
      paddingBottom: 2,
    },
    card: {
      width: 132,
      backgroundColor: ui.card,
      borderRadius: 14,
      paddingTop: 12,
      paddingBottom: 12,
      paddingHorizontal: 10,
      alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: ui.border,
    },
    logoWrap: {
      marginBottom: 10,
      // Fundo claro atrás do logo — evita logos brancos “sumirem” no dark mode
      backgroundColor: '#FFFFFF',
      borderRadius: 32,
      padding: 2,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'center',
      gap: 3,
      minHeight: 34,
      width: '100%',
    },
    name: {
      flexShrink: 1,
      fontSize: 12,
      fontWeight: '700',
      color: ui.text,
      textAlign: 'center',
      lineHeight: 16,
    },
    verified: {
      marginTop: 1,
    },
    ratingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginTop: 6,
    },
    rating: {
      fontSize: 11,
      color: ui.muted,
      fontWeight: '600',
    },
    reviews: {
      fontSize: 10,
      color: ui.muted,
      fontWeight: '500',
    },
  });
}
