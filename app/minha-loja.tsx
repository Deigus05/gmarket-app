import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import { useLocale } from '@/components/LocaleContext';
import { SellerHeader, useSellerStyles } from '@/components/seller/ui';
import { useRequireAuth } from '@/components/seller/useRequireAuth';
import { useAppTheme } from '@/components/tema';
import { resolveSellerMe } from '@/lib/seller/snapshot';
import type { SellerMe } from '@/lib/seller/types';

const TILES: Array<{
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  titleKey: string;
  subKey: string;
  route: string;
}> = [
  { id: 'orders', icon: 'receipt-outline', titleKey: 'hubOrders', subKey: 'hubEmptyOrders', route: '/minha-loja-pedidos' },
  { id: 'products', icon: 'bag-handle-outline', titleKey: 'hubProducts', subKey: 'hubEmptyProducts', route: '/minha-loja-produtos' },
  { id: 'store', icon: 'storefront-outline', titleKey: 'hubStore', subKey: 'storeEditTitle', route: '/minha-loja-dados' },
  { id: 'payouts', icon: 'cash-outline', titleKey: 'hubPayouts', subKey: 'payoutsHint', route: '/minha-loja-recebimentos' },
  { id: 'ads', icon: 'easel-outline', titleKey: 'hubAds', subKey: 'hubAdsHint', route: '/minha-loja-publicidade' },
];

export default function MinhaLojaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const { ui } = useAppTheme();
  const styles = useSellerStyles(ui);
  const { ready, token } = useRequireAuth('/minha-loja');
  const [me, setMe] = useState<SellerMe | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const snapshot = await resolveSellerMe(token);
    if (snapshot.storeApplication.status !== 'approved' && !snapshot.store) {
      setLoading(false);
      router.replace('/abrir-loja');
      return;
    }
    setMe(snapshot);
    setLoading(false);
  }, [token, router]);

  useFocusEffect(
    useCallback(() => {
      if (!ready) return;
      void load();
    }, [ready, load]),
  );

  if (!ready || loading || !me) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <RippleWaveLoader />
      </View>
    );
  }

  const storeName = me.store?.name || me.storeApplication.trade_name;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SellerHeader
        title={t('sell.hubTitle')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))}
        styles={styles}
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}>
        <Text style={styles.hero}>{storeName || t('sell.hubTitle')}</Text>
        <Text style={styles.heroSub}>{t('sell.storeApprovedBody')}</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('sell.hubToday')}</Text>
          <Text style={styles.cardBody}>
            {t('sell.hubProducts')}: {me.products.length}
          </Text>
        </View>

        <View style={styles.hubGrid}>
          {TILES.map((tile) => (
            <TouchableOpacity
              key={tile.id}
              style={styles.hubTile}
              activeOpacity={0.8}
              onPress={() => router.push(tile.route as never)}
            >
              <View style={styles.hubIcon}>
                <Ionicons name={tile.icon} size={20} color={ui.brand} />
              </View>
              <Text style={styles.hubTileTitle}>{t(`sell.${tile.titleKey}`)}</Text>
              <Text style={styles.hubTileSub} numberOfLines={2}>
                {t(`sell.${tile.subKey}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
