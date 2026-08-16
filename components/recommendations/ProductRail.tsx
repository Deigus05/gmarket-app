import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { memo, useCallback, useMemo } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import type { Product } from '@/components/api';
import { useAppTheme, type AppUI } from '@/components/tema';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { listImageUrl } from '@/lib/imageOptimization';

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400';

function formatDeliveryEta(deliveryTime?: string | null) {
  const value = deliveryTime?.trim();
  if (!value) return null;
  if (/^entrega\b/i.test(value)) return value;
  return `Entrega em ${value}`;
}

function productImage(product: Product) {
  return listImageUrl(product.image_urls, product.image_url, FALLBACK_IMAGE, 'thumb');
}

type ProductRailProps = {
  title: string;
  subtitle?: string;
  products: Product[];
  emptyText?: string;
};

const ProductCard = memo(function ProductCard({
  product,
  styles,
  onPress,
}: {
  product: Product;
  styles: ReturnType<typeof createStyles>;
  onPress: (id: string) => void;
}) {
  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={() => onPress(product.id)}
    >
      <Image
        source={{ uri: productImage(product) }}
        style={styles.image}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={product.id}
      />
      <Text style={styles.productTitle} numberOfLines={2}>
        {product.titulo}
      </Text>
      {(() => {
        const eta = formatDeliveryEta(product.delivery_time);
        return eta ? (
          <Text style={styles.deliveryEta} numberOfLines={1}>
            {eta}
          </Text>
        ) : null;
      })()}
      <Text style={styles.normalPrice}>
        {Number(product.preco || 0).toLocaleString()} CFA
      </Text>
      <View style={styles.gcoinRow}>
        <Text style={styles.gcoinPrice}>
          {Number(product.preco_gpay || 0).toLocaleString()} GCoin
        </Text>
        <View style={styles.gpayBadge}>
          <Text style={styles.gpayBadgeText}>GPay</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

export const ProductRail = memo(function ProductRail({
  title,
  subtitle,
  products,
  emptyText,
}: ProductRailProps) {
  const router = useRouter();
  const { ui } = useAppTheme();
  const { isDesktop } = useBreakpoint();
  const styles = useMemo(() => createStyles(ui, isDesktop), [ui, isDesktop]);

  const openProduct = useCallback(
    (id: string) => {
      if (!id) return;
      router.push(`/productDetail?id=${encodeURIComponent(id)}`);
    },
    [router],
  );

  if (!products.length) {
    if (!emptyText) return null;
    return (
      <View style={styles.section}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        <Text style={styles.empty}>{emptyText}</Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <FlatList
        horizontal
        data={products}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ProductCard product={item} styles={styles} onPress={openProduct} />
        )}
        showsHorizontalScrollIndicator={false}
        style={styles.railScroll}
        contentContainerStyle={styles.list}
        nestedScrollEnabled
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        removeClippedSubviews
      />
    </View>
  );
});

function createStyles(ui: AppUI, isDesktop: boolean) {
  const cardWidth = isDesktop ? 118 : 132;
  const imageHeight = isDesktop ? 118 : 148;
  const cardHeight = imageHeight + (isDesktop ? 92 : 108);
  const sidePad = isDesktop ? 0 : 12;

  return StyleSheet.create({
    section: {
      marginTop: 8,
      marginBottom: 10,
      backgroundColor: isDesktop ? 'transparent' : ui.bg,
      borderRadius: isDesktop ? 12 : 0,
      paddingVertical: isDesktop ? 12 : 0,
    },
    header: {
      paddingHorizontal: sidePad,
      marginBottom: 10,
      gap: 2,
    },
    title: {
      fontSize: isDesktop ? 14 : 17,
      fontWeight: '800',
      color: ui.text,
      letterSpacing: -0.2,
    },
    subtitle: {
      fontSize: 12,
      color: ui.muted,
    },
    railScroll: {
      height: cardHeight,
    },
    list: {
      paddingHorizontal: isDesktop ? 0 : 10,
      gap: isDesktop ? 12 : 8,
      alignItems: 'flex-start',
    },
    card: {
      width: cardWidth,
      height: cardHeight,
      backgroundColor: ui.card,
      borderRadius: 12,
      padding: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: ui.border,
    },
    image: {
      width: '100%',
      height: imageHeight,
      borderRadius: 8,
      backgroundColor: ui.input,
      marginBottom: 8,
    },
    productTitle: {
      fontSize: 12,
      fontWeight: '600',
      color: ui.text,
      minHeight: 32,
      marginBottom: 2,
    },
    deliveryEta: {
      fontSize: 10,
      fontWeight: '600',
      color: '#60A5FA',
      marginBottom: 4,
    },
    normalPrice: {
      fontSize: 13,
      fontWeight: '800',
      color: ui.brand,
    },
    gcoinRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 2,
      gap: 5,
    },
    gcoinPrice: {
      fontSize: 11,
      fontWeight: '600',
      color: ui.muted,
    },
    gpayBadge: {
      backgroundColor: ui.brandSoft,
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: 4,
    },
    gpayBadgeText: {
      fontSize: 8,
      fontWeight: 'bold',
      color: ui.brand,
    },
    empty: {
      paddingHorizontal: sidePad,
      fontSize: 12,
      color: ui.muted,
    },
  });
}
