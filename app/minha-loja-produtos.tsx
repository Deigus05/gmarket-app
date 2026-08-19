import { Image } from 'expo-image';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchSellerProducts } from '@/lib/seller/api';
import { useLocale } from '@/components/LocaleContext';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import { PrimaryButton, SellerHeader, useSellerStyles } from '@/components/seller/ui';
import { useRequireAuth } from '@/components/seller/useRequireAuth';
import { useAppTheme } from '@/components/tema';
import { loadStoreProductDrafts } from '@/lib/seller/storage';
import type { SellerProductDraft } from '@/lib/seller/types';

export default function MinhaLojaProdutosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const { ui } = useAppTheme();
  const styles = useSellerStyles(ui);
  const { ready, token } = useRequireAuth('/minha-loja-produtos');
  const [items, setItems] = useState<SellerProductDraft[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const local = await loadStoreProductDrafts();
    if (token) {
      const remote = await fetchSellerProducts(token);
      if (remote.success && Array.isArray(remote.data)) {
        const mapped: SellerProductDraft[] = remote.data.map((product) => ({
          id: product.id,
          title: product.titulo,
          price: String(product.preco),
          stock: String(product.stock),
          description: product.descricao || '',
          category_id: product.category_id || '',
          photos: (product.image_urls || (product.image_url ? [product.image_url] : [])).map((uri) => ({
            uri,
            remote_url: uri,
          })),
          visible: true,
          created_at: '',
        }));
        setItems(mapped.length ? mapped : local);
        setLoading(false);
        return;
      }
    }
    setItems(local);
    setLoading(false);
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      if (!ready) return;
      void load();
    }, [ready, load]),
  );

  if (!ready || loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <RippleWaveLoader />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SellerHeader title={t('sell.hubProducts')} onBack={() => router.back()} styles={styles} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}>
        <PrimaryButton label={t('sell.productNew')} onPress={() => router.push('/minha-loja-produto')} styles={styles} />
        {items.length === 0 ? <Text style={styles.empty}>{t('sell.hubEmptyProducts')}</Text> : null}
        {items.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.card, { flexDirection: 'row', gap: 12, alignItems: 'center' }]}
            onPress={() => router.push({ pathname: '/minha-loja-produto', params: { id: item.id } })}
          >
            {item.photos[0] ? (
              <Image
                source={{ uri: item.photos[0].remote_url || item.photos[0].uri }}
                style={{ width: 56, height: 56, borderRadius: 10 }}
                contentFit="cover"
              />
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={styles.strongLine}>{item.title}</Text>
              <Text style={styles.mutedLine}>
                {item.price} CFA · {t('sell.productStock')} {item.stock}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}
