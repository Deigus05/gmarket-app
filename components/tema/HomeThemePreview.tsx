import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { HomePalette } from './themes';

type Props = {
  colors: HomePalette;
};

/** Pré-visualização compacta da página inicial com o tema seleccionado. */
export function HomeThemePreview({ colors }: Props) {
  const isDark = colors.surface === '#0E0E0E';

  return (
    <View style={[styles.frame, { backgroundColor: colors.surface }]}>
      <LinearGradient
        colors={[colors.deep, colors.mid, colors.soft, colors.mist, colors.surface]}
        locations={[0, 0.25, 0.5, 0.78, 1]}
        start={{ x: 0.05, y: 0 }}
        end={{ x: 0.95, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.addressRow}>
          <Ionicons name="location-sharp" size={11} color={colors.accent} />
          <Text style={[styles.address, { color: colors.address }]} numberOfLines={1}>
            PBZ: Av. Amílcar Cabral
          </Text>
        </View>

        <View style={styles.searchRow}>
          <View
            style={[
              styles.circle,
              {
                backgroundColor: isDark ? 'rgba(14,14,14,0.82)' : colors.surface,
                shadowColor: colors.shadow,
              },
            ]}
          />
          <View
            style={[
              styles.searchPill,
              {
                backgroundColor: isDark ? 'rgba(14,14,14,0.82)' : colors.surface,
                shadowColor: colors.shadow,
              },
            ]}
          >
            <Text style={[styles.searchHint, { color: colors.muted }]}>Buscar no GMarket</Text>
          </View>
          <View
            style={[
              styles.circle,
              {
                backgroundColor: isDark ? 'rgba(14,14,14,0.82)' : colors.surface,
                shadowColor: colors.shadow,
              },
            ]}
          />
        </View>

        <View style={styles.cats}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.catItem}>
              <View style={[styles.catIcon, { backgroundColor: 'rgba(255,255,255,0.92)' }]}>
                <View style={[styles.catGlyph, { backgroundColor: '#111111' }]} />
              </View>
              <View
                style={[
                  styles.catLabel,
                  { backgroundColor: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.12)' },
                ]}
              />
            </View>
          ))}
        </View>

        <View
          style={[
            styles.banner,
            { backgroundColor: isDark ? `${colors.accent}33` : 'rgba(255,255,255,0.55)' },
          ]}
        />
      </LinearGradient>

      <View style={[styles.feed, { backgroundColor: colors.surface }]}>
        <View style={styles.productRow}>
          <View style={[styles.product, { backgroundColor: colors.mist }]}>
            <View style={[styles.productImg, { backgroundColor: colors.soft }]} />
            <View style={[styles.productLine, { backgroundColor: colors.mid }]} />
            <Text style={[styles.price, { color: colors.accent }]}>2.500 CFA</Text>
          </View>
          <View style={[styles.product, { backgroundColor: colors.mist }]}>
            <View style={[styles.productImg, { backgroundColor: colors.soft }]} />
            <View style={[styles.productLine, { backgroundColor: colors.mid }]} />
            <Text style={[styles.price, { color: colors.accent }]}>1.800 CFA</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  hero: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 16,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 10,
  },
  address: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  circle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  searchPill: {
    flex: 1,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    paddingHorizontal: 12,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  searchHint: {
    fontSize: 11,
    fontWeight: '500',
  },
  cats: {
    flexDirection: 'row',
    marginTop: 14,
    gap: 12,
  },
  catItem: {
    alignItems: 'center',
    width: 40,
  },
  catIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginBottom: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catGlyph: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  catLabel: {
    width: 28,
    height: 4,
    borderRadius: 2,
  },
  banner: {
    marginTop: 12,
    height: 56,
    borderRadius: 12,
  },
  feed: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
  },
  productRow: {
    flexDirection: 'row',
    gap: 8,
  },
  product: {
    flex: 1,
    borderRadius: 12,
    padding: 6,
  },
  productImg: {
    height: 52,
    borderRadius: 10,
  },
  productLine: {
    marginTop: 8,
    height: 6,
    borderRadius: 3,
    width: '70%',
  },
  price: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '800',
  },
});
