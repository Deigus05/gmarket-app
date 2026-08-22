import { Stack, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardFormScrollView } from '@/components/KeyboardFormScrollView';
import { useLocale } from '@/components/LocaleContext';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import { Chip, Field, PhotoGrid, PrimaryButton, SellerHeader, useSellerStyles } from '@/components/seller/ui';
import { useRequireAuth } from '@/components/seller/useRequireAuth';
import { useAppTheme } from '@/components/tema';
import { fetchSellerAds, submitSellerAdRequest } from '@/lib/seller/api';
import { loadStoreAdRequests, saveStoreAdRequests } from '@/lib/seller/storage';
import type { LocalImage, SellerAdRequest, SellerAdSlot } from '@/lib/seller/types';

export default function MinhaLojaPublicidadeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const { ui } = useAppTheme();
  const styles = useSellerStyles(ui);
  const { ready, token } = useRequireAuth('/minha-loja-publicidade');
  const [items, setItems] = useState<SellerAdRequest[]>([]);
  const [target, setTarget] = useState<'store' | 'product'>('store');
  const [productId, setProductId] = useState('');
  const [slot, setSlot] = useState<SellerAdSlot>('hero');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<LocalImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const local = await loadStoreAdRequests();
    if (token) {
      const remote = await fetchSellerAds(token);
      if (remote.success && Array.isArray(remote.data) && remote.data.length) {
        setItems(remote.data);
        await saveStoreAdRequests(remote.data);
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

  const send = async () => {
    if (!startDate.trim() || !endDate.trim()) {
      Alert.alert(t('sell.adsTitle'), t('sell.required'));
      return;
    }
    if (target === 'product' && !productId.trim()) {
      Alert.alert(t('sell.adsTitle'), t('sell.required'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        target,
        product_id: target === 'product' ? productId.trim() : null,
        slot,
        start_date: startDate.trim(),
        end_date: endDate.trim(),
        image_uri: photos[0]?.uri || null,
        notes: notes.trim() || undefined,
      };
      let created: SellerAdRequest = {
        ...payload,
        id: `ad-${Date.now()}`,
        status: 'pending',
        created_at: new Date().toISOString(),
        local_only: true,
      };
      if (token) {
        const result = await submitSellerAdRequest(token, payload);
        if (result.success) {
          created = { ...created, ...result.data, local_only: false };
        }
      }
      const next = [created, ...items];
      await saveStoreAdRequests(next);
      setItems(next);
      setNotes('');
      setPhotos([]);
      Alert.alert(t('sell.adsTitle'), t('sell.sentLocal'));
    } finally {
      setSaving(false);
    }
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
      <SellerHeader title={t('sell.adsTitle')} onBack={() => router.back()} styles={styles} />
      <KeyboardFormScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.hint}>{t('sell.hubAdsHint')}</Text>

        <Text style={styles.label}>{t('sell.adsTarget')}</Text>
        <View style={styles.chipWrap}>
          <Chip label={t('sell.adsTargetStore')} active={target === 'store'} onPress={() => setTarget('store')} styles={styles} />
          <Chip label={t('sell.adsTargetProduct')} active={target === 'product'} onPress={() => setTarget('product')} styles={styles} />
        </View>
        {target === 'product' ? (
          <Field label={t('sell.adsProductId')} value={productId} onChangeText={setProductId} styles={styles} />
        ) : null}

        <Text style={styles.label}>{t('sell.adsSlot')}</Text>
        <View style={styles.chipWrap}>
          {([
            ['hero', 'adsHero'],
            ['feed', 'adsFeed'],
            ['grid', 'adsGrid'],
            ['search', 'adsSearch'],
            ['interstitial', 'adsInterstitial'],
          ] as [SellerAdSlot, string][]).map(([id, key]) => (
            <Chip key={id} label={t(`sell.${key}`)} active={slot === id} onPress={() => setSlot(id)} styles={styles} />
          ))}
        </View>

        <Field label={t('sell.adsStart')} value={startDate} onChangeText={setStartDate} placeholder="2026-08-20" styles={styles} />
        <Field label={t('sell.adsEnd')} value={endDate} onChangeText={setEndDate} placeholder="2026-08-27" styles={styles} />
        <Text style={styles.label}>{t('sell.adsImage')}</Text>
        <PhotoGrid photos={photos} onChange={setPhotos} max={1} addLabel={t('sell.addPhotos')} styles={styles} />
        <Field label={t('sell.adsNotes')} value={notes} onChangeText={setNotes} styles={styles} multiline />
        <PrimaryButton
          label={saving ? t('common.loading') : t('sell.adsSend')}
          onPress={send}
          styles={styles}
          disabled={saving}
        />

        <Text style={[styles.cardTitle, { marginTop: 18 }]}>{t('sell.hubAds')}</Text>
        {items.length === 0 ? <Text style={styles.empty}>{t('sell.adsEmpty')}</Text> : null}
        {items.map((item) => (
          <View key={item.id} style={styles.card}>
            <Text style={styles.strongLine}>{item.slot} · {item.target}</Text>
            <Text style={styles.mutedLine}>{item.status}</Text>
          </View>
        ))}
      </KeyboardFormScrollView>
    </View>
  );
}
