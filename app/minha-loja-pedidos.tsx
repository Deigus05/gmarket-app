import { Stack, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Order } from '@/components/api';
import { useLocale } from '@/components/LocaleContext';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import { PrimaryButton, SellerHeader, useSellerStyles } from '@/components/seller/ui';
import { useRequireAuth } from '@/components/seller/useRequireAuth';
import { useAppTheme } from '@/components/tema';
import { fetchSellerOrders, updateSellerOrderStatus } from '@/lib/seller/api';

export default function MinhaLojaPedidosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const { ui } = useAppTheme();
  const styles = useSellerStyles(ui);
  const { ready, token } = useRequireAuth('/minha-loja-pedidos');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const result = await fetchSellerOrders(token);
    setOrders(result.success && Array.isArray(result.data) ? result.data : []);
    setLoading(false);
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      if (!ready) return;
      void load();
    }, [ready, load]),
  );

  const markReady = async (orderId: string) => {
    if (!token) return;
    const result = await updateSellerOrderStatus(token, orderId, 'ready');
    if (!result.success) {
      Alert.alert(t('sell.ordersTitle'), result.message);
      return;
    }
    void load();
  };

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
      <SellerHeader title={t('sell.ordersTitle')} onBack={() => router.back()} styles={styles} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}>
        {orders.length === 0 ? <Text style={styles.empty}>{t('sell.hubEmptyOrders')}</Text> : null}
        {orders.map((order) => (
          <View key={order.id} style={styles.card}>
            <Text style={styles.strongLine}>#{order.order_number}</Text>
            <Text style={styles.mutedLine}>
              {order.buyer.nome} {order.buyer.apelido} · {order.status}
            </Text>
            <Text style={styles.mutedLine}>
              {order.total} CFA · {order.fulfillment_method}
            </Text>
            {order.status !== 'delivered' && order.status !== 'cancelled' ? (
              <PrimaryButton
                label={t('common.ready')}
                onPress={() => markReady(order.id)}
                styles={styles}
                style={{ marginTop: 10 }}
              />
            ) : null}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
