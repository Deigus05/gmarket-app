import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getCategories, type ProductCategory } from '@/components/api';
import { KeyboardFormScrollView } from '@/components/KeyboardFormScrollView';
import { useLocale } from '@/components/LocaleContext';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import { Chip, Field, PhotoGrid, PrimaryButton, SellerHeader, useSellerStyles } from '@/components/seller/ui';
import { useRequireAuth } from '@/components/seller/useRequireAuth';
import { useAppTheme } from '@/components/tema';
import { createSellerProduct } from '@/lib/seller/api';
import { loadStoreProductDrafts, saveStoreProductDrafts } from '@/lib/seller/storage';
import type { SellerProductDraft } from '@/lib/seller/types';

export default function MinhaLojaProdutoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const { ui } = useAppTheme();
  const styles = useSellerStyles(ui);
  const { ready, token } = useRequireAuth('/minha-loja-produto');
  const params = useLocalSearchParams<{ id?: string }>();
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SellerProductDraft>({
    id: params.id || `local-${Date.now()}`,
    title: '',
    price: '',
    stock: '',
    description: '',
    category_id: '',
    photos: [],
    visible: true,
    created_at: new Date().toISOString(),
    local_only: true,
  });

  useEffect(() => {
    let active = true;
    async function boot() {
      const [cats, drafts] = await Promise.all([getCategories(), loadStoreProductDrafts()]);
      if (!active) return;
      setCategories(cats);
      if (params.id) {
        const found = drafts.find((item) => item.id === params.id);
        if (found) setForm(found);
      }
      setLoading(false);
    }
    if (ready) void boot();
    return () => {
      active = false;
    };
  }, [ready, params.id]);

  const save = async () => {
    if (!form.title.trim() || !form.price.trim() || !form.stock.trim()) {
      Alert.alert(t('sell.productNew'), t('sell.required'));
      return;
    }
    setSaving(true);
    try {
      const drafts = await loadStoreProductDrafts();
      const nextItem = { ...form, created_at: form.created_at || new Date().toISOString() };
      if (token) {
        const result = await createSellerProduct(token, nextItem);
        if (result.success && result.data && 'id' in result.data) {
          nextItem.id = String(result.data.id);
          nextItem.local_only = false;
        }
      }
      const next = [nextItem, ...drafts.filter((item) => item.id !== form.id && item.id !== nextItem.id)];
      await saveStoreProductDrafts(next);
      Alert.alert(t('sell.productSave'), t('sell.productSavedLocal'), [
        { text: t('common.ok'), onPress: () => router.back() },
      ]);
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
      <SellerHeader title={t('sell.productNew')} onBack={() => router.back()} styles={styles} />
      <KeyboardFormScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
        <Field label={t('sell.productTitle')} value={form.title} onChangeText={(title) => setForm((p) => ({ ...p, title }))} styles={styles} />
        <Field
          label={t('sell.productPrice')}
          value={form.price}
          onChangeText={(price) => setForm((p) => ({ ...p, price }))}
          styles={styles}
          keyboardType="numeric"
        />
        <Field
          label={t('sell.productStock')}
          value={form.stock}
          onChangeText={(stock) => setForm((p) => ({ ...p, stock }))}
          styles={styles}
          keyboardType="numeric"
        />
        <Text style={styles.label}>{t('sell.supplyCategories')}</Text>
        <View style={styles.chipWrap}>
          {categories.map((cat) => (
            <Chip
              key={cat.id}
              label={cat.name}
              active={form.category_id === cat.id}
              onPress={() => setForm((p) => ({ ...p, category_id: cat.id }))}
              styles={styles}
            />
          ))}
        </View>
        <PhotoGrid
          photos={form.photos}
          onChange={(photos) => setForm((p) => ({ ...p, photos }))}
          addLabel={t('sell.addPhotos')}
          styles={styles}
        />
        <Field
          label={t('sell.productDesc')}
          value={form.description}
          onChangeText={(description) => setForm((p) => ({ ...p, description }))}
          styles={styles}
          multiline
        />
        <View style={[styles.card, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
          <Text style={styles.checkText}>{t('sell.productVisible')}</Text>
          <Switch
            value={form.visible}
            onValueChange={(visible) => setForm((p) => ({ ...p, visible }))}
            trackColor={{ true: ui.brand }}
          />
        </View>
        <PrimaryButton
          label={saving ? t('common.loading') : t('sell.productSave')}
          onPress={save}
          styles={styles}
          disabled={saving}
        />
      </KeyboardFormScrollView>
    </View>
  );
}
