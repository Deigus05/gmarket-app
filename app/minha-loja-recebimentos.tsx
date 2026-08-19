import { Stack, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/components/LocaleContext';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import { SellerHeader, useSellerStyles } from '@/components/seller/ui';
import { useRequireAuth } from '@/components/seller/useRequireAuth';
import { useAppTheme } from '@/components/tema';
import { fetchSellerPayouts, type SellerPayoutRow } from '@/lib/seller/api';

export default function MinhaLojaRecebimentosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const { ui } = useAppTheme();
  const styles = useSellerStyles(ui);
  const { ready, token } = useRequireAuth('/minha-loja-recebimentos');
  const [rows, setRows] = useState<SellerPayoutRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const result = await fetchSellerPayouts(token);
    setRows(result.success && Array.isArray(result.data) ? result.data : []);
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
      <SellerHeader title={t('sell.payoutsTitle')} onBack={() => router.back()} styles={styles} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}>
        <Text style={styles.hint}>{t('sell.payoutsHint')}</Text>
        {rows.length === 0 ? <Text style={styles.empty}>{t('sell.hubEmptyPayouts')}</Text> : null}
        {rows.map((row) => (
          <View key={row.id} style={styles.card}>
            <Text style={styles.strongLine}>{row.net} CFA</Text>
            <Text style={styles.mutedLine}>
              {row.amount} − {row.commission} · {row.status}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
