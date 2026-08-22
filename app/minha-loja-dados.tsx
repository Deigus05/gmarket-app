import { Stack, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { StoreFulfillmentMode } from '@/components/api';
import { KeyboardFormScrollView } from '@/components/KeyboardFormScrollView';
import { useLocale } from '@/components/LocaleContext';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import { Chip, Field, PrimaryButton, SellerHeader, useSellerStyles } from '@/components/seller/ui';
import { useRequireAuth } from '@/components/seller/useRequireAuth';
import { useAppTheme } from '@/components/tema';
import { updateSellerStore } from '@/lib/seller/api';
import { resolveSellerMe, saveStoreApplication } from '@/lib/seller/snapshot';
import type { StoreApplication } from '@/lib/seller/types';

export default function MinhaLojaDadosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const { ui } = useAppTheme();
  const styles = useSellerStyles(ui);
  const { ready, token } = useRequireAuth('/minha-loja-dados');
  const [form, setForm] = useState<StoreApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const me = await resolveSellerMe(token);
    if (me.storeApplication.status !== 'approved' && !me.store) {
      setLoading(false);
      router.replace('/abrir-loja');
      return;
    }
    setForm({
      ...me.storeApplication,
      trade_name: me.store?.name || me.storeApplication.trade_name,
      store_phone: me.store?.phone || me.storeApplication.store_phone,
      opening_hours: me.store?.opening_hours || me.storeApplication.opening_hours,
      address_details: me.store?.address || me.storeApplication.address_details,
      fulfillment_mode: me.store?.fulfillment_mode || me.storeApplication.fulfillment_mode,
    });
    setLoading(false);
  }, [token, router]);

  useFocusEffect(
    useCallback(() => {
      if (!ready) return;
      void load();
    }, [ready, load]),
  );

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await saveStoreApplication(form);
      if (token) {
        const result = await updateSellerStore(token, {
          name: form.trade_name,
          phone: form.store_phone,
          opening_hours: form.opening_hours,
          address: [form.neighborhood, form.address_details].filter(Boolean).join(', '),
          fulfillment_mode: form.fulfillment_mode || undefined,
        });
        if (!result.success && result.message !== 'not_found') {
          Alert.alert(t('sell.storeEditTitle'), result.message);
          return;
        }
      }
      Alert.alert(t('sell.storeEditTitle'), t('sell.saved'));
    } finally {
      setSaving(false);
    }
  };

  if (!ready || loading || !form) {
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
      <SellerHeader title={t('sell.storeEditTitle')} onBack={() => router.back()} styles={styles} />
      <KeyboardFormScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.hint}>{t('sell.storeEditLocked')}</Text>
        <Field label={t('sell.storeTradeName')} value={form.trade_name} onChangeText={(trade_name) => setForm({ ...form, trade_name })} styles={styles} />
        <Field label={t('sell.storeLegalName')} value={form.legal_name} onChangeText={() => undefined} styles={styles} editable={false} />
        <Field label={t('sell.storeNif')} value={form.nif} onChangeText={() => undefined} styles={styles} editable={false} />
        <Field label={t('sell.storePhone')} value={form.store_phone} onChangeText={(store_phone) => setForm({ ...form, store_phone })} styles={styles} keyboardType="phone-pad" />
        <Field label={t('sell.storeHours')} value={form.opening_hours} onChangeText={(opening_hours) => setForm({ ...form, opening_hours })} styles={styles} />
        <Field label={t('sell.storeNeighborhood')} value={form.neighborhood} onChangeText={(neighborhood) => setForm({ ...form, neighborhood })} styles={styles} />
        <Field label={t('sell.storeAddress')} value={form.address_details} onChangeText={(address_details) => setForm({ ...form, address_details })} styles={styles} multiline />
        <Text style={styles.label}>{t('sell.storeFulfillment')}</Text>
        <View style={styles.chipWrap}>
          {([
            ['ambos', 'storeFulfillBoth'],
            ['entrega', 'storeFulfillDelivery'],
            ['recolha', 'storeFulfillPickup'],
          ] as [StoreFulfillmentMode, string][]).map(([id, key]) => (
            <Chip
              key={id}
              label={t(`sell.${key}`)}
              active={form.fulfillment_mode === id}
              onPress={() => setForm({ ...form, fulfillment_mode: id })}
              styles={styles}
            />
          ))}
        </View>
        <PrimaryButton
          label={saving ? t('common.loading') : t('common.save')}
          onPress={save}
          styles={styles}
          disabled={saving}
        />
      </KeyboardFormScrollView>
    </View>
  );
}
