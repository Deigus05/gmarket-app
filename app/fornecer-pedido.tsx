import { Stack, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getCategories, type ProductCategory } from '@/components/api';
import { KeyboardFormScrollView } from '@/components/KeyboardFormScrollView';
import { useLocale } from '@/components/LocaleContext';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import {
  Chip,
  Field,
  PhotoGrid,
  PrimaryButton,
  SellerHeader,
  useSellerStyles,
} from '@/components/seller/ui';
import { useRequireAuth } from '@/components/seller/useRequireAuth';
import { useAppTheme } from '@/components/tema';
import { submitSupplierApplication } from '@/lib/seller/api';
import { markSupplierSubmitted, resolveSellerMe, saveSupplierApplication } from '@/lib/seller/snapshot';
import {
  emptySupplierApplication,
  isOpenForEdit,
  type SupplierApplication,
  type SupplierDeliveryMode,
  type SupplierStockNow,
} from '@/lib/seller/types';
import { openSupportWhatsApp } from '@/lib/support';

export default function FornecerPedidoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const { ui } = useAppTheme();
  const styles = useSellerStyles(ui);
  const { ready, token, user } = useRequireAuth('/fornecer-pedido');
  const [form, setForm] = useState<SupplierApplication>(emptySupplierApplication());
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const patch = (partial: Partial<SupplierApplication>) => setForm((prev) => ({ ...prev, ...partial }));

  const load = useCallback(async () => {
    setLoading(true);
    const [me, cats] = await Promise.all([resolveSellerMe(token), getCategories()]);
    const next = me.supplier.status === 'none' ? { ...me.supplier, understood: true } : me.supplier;
    if (!next.whatsapp && user?.telefone) next.whatsapp = user.telefone;
    if (!next.understood) {
      setLoading(false);
      router.replace('/fornecer');
      return;
    }
    if (!isOpenForEdit(next.status)) {
      setLoading(false);
      router.replace('/fornecer');
      return;
    }
    setForm(next);
    setCategories(cats);
    setLoading(false);
  }, [token, user?.telefone, router]);

  useFocusEffect(
    useCallback(() => {
      if (!ready) return;
      void load();
    }, [ready, load]),
  );

  const toggleCategory = (id: string) => {
    const selected = form.category_ids.includes(id)
      ? form.category_ids.filter((item) => item !== id)
      : form.category_ids.length >= 3
        ? form.category_ids
        : [...form.category_ids, id];
    patch({ category_ids: selected });
  };

  const saveDraft = async () => {
    await saveSupplierApplication({ ...form, status: form.status === 'none' ? 'draft' : form.status });
    Alert.alert(t('sell.supplyFormTitle'), t('sell.saved'));
  };

  const submit = async () => {
    if (!form.what_sells.trim() || !form.neighborhood.trim() || !form.stock_now || !form.delivery_mode) {
      Alert.alert(t('sell.supplyFormTitle'), t('sell.required'));
      return;
    }
    if (!form.category_ids.length) {
      Alert.alert(t('sell.supplyFormTitle'), t('sell.categoryNeed'));
      return;
    }
    if (form.photos.length < 2) {
      Alert.alert(t('sell.supplyFormTitle'), t('sell.photosNeed'));
      return;
    }

    setSaving(true);
    try {
      const draft: SupplierApplication = { ...form, status: 'draft' };
      await saveSupplierApplication(draft);
      let submitted = draft;
      if (token) {
        const result = await submitSupplierApplication(token, draft);
        if (result.success) {
          submitted = { ...draft, ...result.data, status: result.data.status || 'submitted', local_only: false };
          await saveSupplierApplication(submitted);
        } else {
          submitted = await markSupplierSubmitted(draft);
        }
      } else {
        submitted = await markSupplierSubmitted(draft);
      }
      setForm(submitted);
      Alert.alert(t('sell.sent'), t('sell.sentLocal'), [
        { text: t('common.ok'), onPress: () => router.replace('/fornecer') },
        {
          text: t('sell.talkTeam'),
          onPress: async () => {
            await openSupportWhatsApp(
              t('sell.supplyWa', { what: submitted.what_sells, where: submitted.neighborhood }),
            );
            router.replace('/fornecer');
          },
        },
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
      <SellerHeader title={t('sell.supplyFormTitle')} onBack={() => router.back()} styles={styles} />
      <KeyboardFormScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
        keyboardShouldPersistTaps="handled"
      >
        {form.admin_message ? (
          <View style={styles.adminBox}>
            <Text style={styles.adminBoxText}>{form.admin_message}</Text>
          </View>
        ) : null}

        <Text style={styles.label}>{t('sell.supplyAccount')}</Text>
        <Text style={styles.strongLine}>{user ? `${user.nome} ${user.apelido}`.trim() : '—'}</Text>
        <Text style={styles.mutedLine}>{user?.telefone}</Text>

        <Field
          label={t('sell.supplyWhat')}
          value={form.what_sells}
          onChangeText={(what_sells) => patch({ what_sells })}
          placeholder={t('sell.supplyWhatPlaceholder')}
          styles={styles}
          multiline
        />

        <Text style={styles.label}>{t('sell.supplyCategories')}</Text>
        <View style={styles.chipWrap}>
          {(categories.length ? categories : [{ id: 'outros', slug: 'outros', name: t('sell.other') }]).map((cat) => (
            <Chip
              key={cat.id}
              label={cat.name}
              active={form.category_ids.includes(cat.id)}
              onPress={() => toggleCategory(cat.id)}
              styles={styles}
            />
          ))}
        </View>

        <Field
          label={t('sell.supplyWhere')}
          value={form.neighborhood}
          onChangeText={(neighborhood) => patch({ neighborhood })}
          placeholder={t('sell.supplyWherePlaceholder')}
          styles={styles}
        />

        <Text style={styles.label}>{t('sell.supplyStock')}</Text>
        <View style={styles.chipWrap}>
          {([
            ['yes', 'supplyStockYes'],
            ['no', 'supplyStockNo'],
            ['on_order', 'supplyStockOrder'],
          ] as [SupplierStockNow, string][]).map(([id, key]) => (
            <Chip
              key={id}
              label={t(`sell.${key}`)}
              active={form.stock_now === id}
              onPress={() => patch({ stock_now: id })}
              styles={styles}
            />
          ))}
        </View>

        <Text style={styles.label}>{t('sell.supplyDelivery')}</Text>
        <View style={styles.chipWrap}>
          {([
            ['dropoff', 'supplyDropoff'],
            ['pickup', 'supplyPickup'],
            ['tbd', 'supplyTbd'],
          ] as [SupplierDeliveryMode, string][]).map(([id, key]) => (
            <Chip
              key={id}
              label={t(`sell.${key}`)}
              active={form.delivery_mode === id}
              onPress={() => patch({ delivery_mode: id })}
              styles={styles}
            />
          ))}
        </View>

        <Text style={styles.label}>{t('sell.addPhotos')}</Text>
        <PhotoGrid photos={form.photos} onChange={(photos) => patch({ photos })} styles={styles} addLabel={t('sell.addPhotos')} />

        <Field
          label={t('sell.supplyPrice')}
          value={form.asking_price || ''}
          onChangeText={(asking_price) => patch({ asking_price })}
          styles={styles}
          keyboardType="numeric"
        />
        <Field
          label={t('sell.supplyWhatsapp')}
          value={form.whatsapp || ''}
          onChangeText={(whatsapp) => patch({ whatsapp })}
          styles={styles}
          keyboardType="phone-pad"
        />
        <Field
          label={t('sell.supplyNotes')}
          value={form.notes || ''}
          onChangeText={(notes) => patch({ notes })}
          placeholder={t('sell.supplyNotesPlaceholder')}
          styles={styles}
          multiline
        />
      </KeyboardFormScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.footerRow}>
          <View style={styles.flexBtn}>
            <PrimaryButton
              label={t('sell.saveDraft')}
              onPress={saveDraft}
              styles={styles}
              style={{ backgroundColor: ui.card, borderWidth: 1.5, borderColor: ui.brand }}
              textStyle={{ color: ui.brand }}
            />
          </View>
          <View style={styles.flexBtn}>
            <PrimaryButton
              label={saving ? t('common.loading') : t('sell.submit')}
              onPress={submit}
              styles={styles}
              disabled={saving}
            />
          </View>
        </View>
      </View>
    </View>
  );
}
