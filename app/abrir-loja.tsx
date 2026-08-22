import { Stack, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnnounceStepIndicator } from '@/components/AnnounceStepIndicator';
import { KeyboardFormScrollView } from '@/components/KeyboardFormScrollView';
import { getCategories, type ProductCategory, type StoreFulfillmentMode } from '@/components/api';
import { useLocale } from '@/components/LocaleContext';
import { PropertyMapPickerModal } from '@/components/PropertyMapPickerModal';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import { StepPageTransition } from '@/components/StepPageTransition';
import {
  CheckRow,
  Chip,
  Field,
  PhotoGrid,
  PrimaryButton,
  SellerHeader,
  useSellerStyles,
} from '@/components/seller/ui';
import { useRequireAuth } from '@/components/seller/useRequireAuth';
import { useAppTheme } from '@/components/tema';
import { submitStoreApplication } from '@/lib/seller/api';
import { markStoreSubmitted, resolveSellerMe, saveStoreApplication } from '@/lib/seller/snapshot';
import {
  emptyStoreApplication,
  isOpenForEdit,
  type SellerApplicationStatus,
  type StoreApplication,
  type StoreBusinessType,
  type StoreDocumentKind,
  type StorePayoutMethod,
} from '@/lib/seller/types';
import { openSupportWhatsApp } from '@/lib/support';

const STEP_COUNT = 6;

function statusTitle(status: SellerApplicationStatus, t: (key: string) => string) {
  if (status === 'needs_changes') return t('sell.needCorrection');
  if (status === 'rejected') return t('sell.rejected');
  if (status === 'approved') return t('sell.approved');
  if (status === 'submitted' || status === 'under_review') return t('sell.inReview');
  return t('sell.storeWizardTitle');
}

export default function AbrirLojaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const { ui } = useAppTheme();
  const styles = useSellerStyles(ui);
  const { ready, token, user } = useRequireAuth('/abrir-loja');
  const [form, setForm] = useState<StoreApplication>(emptyStoreApplication());
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [mapOpen, setMapOpen] = useState(false);

  const steps = useMemo(
    () => [
      t('sell.storeStepType'),
      t('sell.storeStepIdentity'),
      t('sell.storeStepShop'),
      t('sell.storeStepOps'),
      t('sell.storeStepDocs'),
      t('sell.storeStepReview'),
    ],
    [t],
  );

  const patch = (partial: Partial<StoreApplication>) => setForm((prev) => ({ ...prev, ...partial }));

  const load = useCallback(async () => {
    setLoading(true);
    const [me, cats] = await Promise.all([resolveSellerMe(token), getCategories()]);
    if (me.storeApplication.status === 'approved' || me.store) {
      setLoading(false);
      router.replace('/minha-loja');
      return;
    }
    const next = {
      ...me.storeApplication,
      responsible_name: me.storeApplication.responsible_name || (user ? `${user.nome} ${user.apelido}`.trim() : ''),
      store_phone: me.storeApplication.store_phone || user?.telefone || '',
      store_whatsapp: me.storeApplication.store_whatsapp || user?.telefone || '',
    };
    setForm(next);
    setCategories(cats);
    setLoading(false);
  }, [token, user, router]);

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

  const validateStep = () => {
    if (step === 0) {
      if (!form.business_type || form.has_physical_shop == null || !form.what_sells.trim() || !form.category_ids.length) {
        Alert.alert(t('sell.storeWizardTitle'), t('sell.required'));
        return false;
      }
    }
    if (step === 1) {
      if (!form.trade_name.trim() || !form.legal_name.trim() || !form.responsible_name.trim() || !form.store_phone.trim()) {
        Alert.alert(t('sell.storeWizardTitle'), t('sell.required'));
        return false;
      }
      if (form.business_type === 'company' && !form.nif.trim()) {
        Alert.alert(t('sell.storeWizardTitle'), t('sell.required'));
        return false;
      }
    }
    if (step === 2) {
      if (!form.logo || !form.neighborhood.trim() || !form.address_details.trim() || !form.opening_hours.trim()) {
        Alert.alert(t('sell.storeWizardTitle'), form.logo ? t('sell.required') : t('sell.logoNeed'));
        return false;
      }
      if (form.has_physical_shop && form.space_photos.length < 2) {
        Alert.alert(t('sell.storeWizardTitle'), t('sell.spaceNeed'));
        return false;
      }
    }
    if (step === 3) {
      if (!form.fulfillment_mode || !form.payout_method || !form.payout_holder.trim() || !form.payout_account.trim()) {
        Alert.alert(t('sell.storeWizardTitle'), t('sell.required'));
        return false;
      }
      if (form.fulfillment_mode !== 'recolha' && !form.delivery_zones?.trim()) {
        Alert.alert(t('sell.storeWizardTitle'), t('sell.required'));
        return false;
      }
      if (form.payout_account.trim() !== form.payout_account_confirm.trim()) {
        Alert.alert(t('sell.storeWizardTitle'), t('sell.payoutMismatch'));
        return false;
      }
    }
    if (step === 4) {
      const kinds = new Set(form.documents.map((doc) => doc.kind));
      if (!kinds.has('id_front') || !kinds.has('selfie')) {
        Alert.alert(t('sell.storeWizardTitle'), t('sell.docsNeed'));
        return false;
      }
    }
    return true;
  };

  const goNext = async () => {
    if (!validateStep()) return;
    await saveStoreApplication({ ...form, status: form.status === 'none' ? 'draft' : form.status });
    if (step < STEP_COUNT - 1) {
      setDirection(1);
      setStep((prev) => prev + 1);
      return;
    }
    if (!form.terms_accepted) {
      Alert.alert(t('sell.storeWizardTitle'), t('sell.termsNeed'));
      return;
    }
    setSaving(true);
    try {
      const draft = { ...form, status: 'draft' as const };
      await saveStoreApplication(draft);
      if (token) {
        const result = await submitStoreApplication(token, draft);
        if (result.success) {
          await saveStoreApplication({
            ...draft,
            ...result.data,
            status: result.data.status || 'submitted',
            local_only: false,
          });
        } else {
          await markStoreSubmitted(draft);
        }
      } else {
        await markStoreSubmitted(draft);
      }
      Alert.alert(t('sell.sent'), t('sell.sentLocal'), [
        { text: t('common.ok'), onPress: () => void load() },
        {
          text: t('sell.talkTeam'),
          onPress: async () => {
            await openSupportWhatsApp(t('sell.storeWa', { name: form.trade_name }));
            void load();
          },
        },
      ]);
    } finally {
      setSaving(false);
    }
  };

  const goPrev = () => {
    if (step === 0) {
      if (router.canGoBack()) router.back();
      else router.replace('/parceria');
      return;
    }
    setDirection(-1);
    setStep((prev) => prev - 1);
  };

  const addDocument = (kind: StoreDocumentKind, photos: { uri: string }[]) => {
    const next = form.documents.filter((doc) => doc.kind !== kind);
    patch({ documents: [...next, ...photos.map((photo) => ({ ...photo, kind }))] });
  };

  if (!ready || loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <RippleWaveLoader />
      </View>
    );
  }

  const showWizard = isOpenForEdit(form.status);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SellerHeader title={t('sell.storeWizardTitle')} onBack={goPrev} styles={styles} />

      {showWizard ? (
        <>
          <AnnounceStepIndicator currentStep={step} steps={steps} ui={ui} />
          <StepPageTransition step={step} direction={direction} style={{ flex: 1 }}>
            <KeyboardFormScrollView
              contentContainerStyle={[styles.content, { paddingBottom: 24 }]}
              keyboardShouldPersistTaps="handled"
            >
              {form.admin_message ? (
                <View style={styles.adminBox}>
                  <Text style={styles.adminBoxText}>{form.admin_message}</Text>
                </View>
              ) : null}

              {step === 0 && (
                <>
                  <Text style={styles.label}>{t('sell.storeTypeLabel')}</Text>
                  <View style={styles.chipWrap}>
                    {([
                      ['company', 'storeTypeCompany'],
                      ['physical_shop', 'storeTypeShop'],
                    ] as [StoreBusinessType, string][]).map(([id, key]) => (
                      <Chip
                        key={id}
                        label={t(`sell.${key}`)}
                        active={form.business_type === id}
                        onPress={() => patch({ business_type: id })}
                        styles={styles}
                      />
                    ))}
                  </View>
                  <Text style={styles.label}>{t('sell.supplyCategories')}</Text>
                  <View style={styles.chipWrap}>
                    {(categories.length ? categories : [{ id: 'outros', slug: 'outros', name: t('sell.other') }]).map(
                      (cat) => (
                        <Chip
                          key={cat.id}
                          label={cat.name}
                          active={form.category_ids.includes(cat.id)}
                          onPress={() => toggleCategory(cat.id)}
                          styles={styles}
                        />
                      ),
                    )}
                  </View>
                  <Text style={styles.label}>{t('sell.storeHasShop')}</Text>
                  <View style={styles.chipWrap}>
                    <Chip
                      label={t('sell.storeYes')}
                      active={form.has_physical_shop === true}
                      onPress={() => patch({ has_physical_shop: true })}
                      styles={styles}
                    />
                    <Chip
                      label={t('sell.storeNo')}
                      active={form.has_physical_shop === false}
                      onPress={() => patch({ has_physical_shop: false })}
                      styles={styles}
                    />
                  </View>
                  <Field
                    label={t('sell.storeWhatSells')}
                    value={form.what_sells}
                    onChangeText={(what_sells) => patch({ what_sells })}
                    placeholder={t('sell.storeWhatSellsPlaceholder')}
                    styles={styles}
                    multiline
                  />
                </>
              )}

              {step === 1 && (
                <>
                  <Field label={t('sell.storeTradeName')} value={form.trade_name} onChangeText={(trade_name) => patch({ trade_name })} styles={styles} />
                  <Field label={t('sell.storeLegalName')} value={form.legal_name} onChangeText={(legal_name) => patch({ legal_name })} styles={styles} />
                  <Field label={t('sell.storeNif')} value={form.nif} onChangeText={(nif) => patch({ nif })} styles={styles} />
                  <Field
                    label={t('sell.storeResponsible')}
                    value={form.responsible_name}
                    onChangeText={(responsible_name) => patch({ responsible_name })}
                    styles={styles}
                  />
                  <Field label={t('sell.storeRole')} value={form.role || ''} onChangeText={(role) => patch({ role })} styles={styles} />
                  <Field
                    label={t('sell.storePhone')}
                    value={form.store_phone}
                    onChangeText={(store_phone) => patch({ store_phone })}
                    styles={styles}
                    keyboardType="phone-pad"
                  />
                  <Field
                    label={t('sell.storeWhatsapp')}
                    value={form.store_whatsapp || ''}
                    onChangeText={(store_whatsapp) => patch({ store_whatsapp })}
                    styles={styles}
                    keyboardType="phone-pad"
                  />
                  <Field
                    label={t('sell.storeEmail')}
                    value={form.email || ''}
                    onChangeText={(email) => patch({ email })}
                    styles={styles}
                    keyboardType="email-address"
                  />
                </>
              )}

              {step === 2 && (
                <>
                  <Text style={styles.label}>{t('sell.storeLogo')}</Text>
                  <PhotoGrid
                    photos={form.logo ? [form.logo] : []}
                    onChange={(photos) => patch({ logo: photos[0] || null })}
                    max={1}
                    square
                    addLabel={t('sell.storeLogo')}
                    styles={styles}
                  />
                  <Text style={styles.label}>{t('sell.storeCover')}</Text>
                  <PhotoGrid
                    photos={form.cover ? [form.cover] : []}
                    onChange={(photos) => patch({ cover: photos[0] || null })}
                    max={1}
                    addLabel={t('sell.storeCover')}
                    styles={styles}
                  />
                  <Text style={styles.label}>{t('sell.storeSpace')}</Text>
                  <PhotoGrid
                    photos={form.space_photos}
                    onChange={(space_photos) => patch({ space_photos })}
                    max={4}
                    addLabel={t('sell.addPhotos')}
                    styles={styles}
                  />
                  <Field
                    label={t('sell.storeNeighborhood')}
                    value={form.neighborhood}
                    onChangeText={(neighborhood) => patch({ neighborhood })}
                    styles={styles}
                  />
                  <Field
                    label={t('sell.storeAddress')}
                    value={form.address_details}
                    onChangeText={(address_details) => patch({ address_details })}
                    styles={styles}
                    multiline
                  />
                  <TouchableOpacity style={styles.card} onPress={() => setMapOpen(true)} activeOpacity={0.8}>
                    <Text style={styles.cardTitle}>{t('sell.storeMap')}</Text>
                    <Text style={styles.cardBody}>
                      {form.latitude && form.longitude ? t('sell.storeMapSet') : t('sell.storeMapHint')}
                    </Text>
                  </TouchableOpacity>
                  <Field
                    label={t('sell.storeHours')}
                    value={form.opening_hours}
                    onChangeText={(opening_hours) => patch({ opening_hours })}
                    placeholder={t('sell.storeHoursPlaceholder')}
                    styles={styles}
                  />
                </>
              )}

              {step === 3 && (
                <>
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
                        onPress={() => patch({ fulfillment_mode: id })}
                        styles={styles}
                      />
                    ))}
                  </View>
                  {form.fulfillment_mode !== 'recolha' ? (
                    <Field
                      label={t('sell.storeZones')}
                      value={form.delivery_zones || ''}
                      onChangeText={(delivery_zones) => patch({ delivery_zones })}
                      placeholder={t('sell.storeZonesPlaceholder')}
                      styles={styles}
                    />
                  ) : null}
                  <Field
                    label={t('sell.storePrep')}
                    value={form.prep_time || ''}
                    onChangeText={(prep_time) => patch({ prep_time })}
                    styles={styles}
                  />
                  <Text style={styles.cardTitle}>{t('sell.storePayoutTitle')}</Text>
                  <Text style={styles.hint}>{t('sell.storePayoutHint')}</Text>
                  <View style={styles.chipWrap}>
                    {([
                      ['orange_money', 'storePayoutOrange'],
                      ['transfer', 'storePayoutTransfer'],
                      ['other', 'storePayoutOther'],
                    ] as [StorePayoutMethod, string][]).map(([id, key]) => (
                      <Chip
                        key={id}
                        label={t(`sell.${key}`)}
                        active={form.payout_method === id}
                        onPress={() => patch({ payout_method: id })}
                        styles={styles}
                      />
                    ))}
                  </View>
                  <Field
                    label={t('sell.storePayoutHolder')}
                    value={form.payout_holder}
                    onChangeText={(payout_holder) => patch({ payout_holder })}
                    styles={styles}
                  />
                  <Field
                    label={t('sell.storePayoutAccount')}
                    value={form.payout_account}
                    onChangeText={(payout_account) => patch({ payout_account })}
                    styles={styles}
                    keyboardType="numeric"
                  />
                  <Field
                    label={t('sell.storePayoutConfirm')}
                    value={form.payout_account_confirm}
                    onChangeText={(payout_account_confirm) => patch({ payout_account_confirm })}
                    styles={styles}
                    keyboardType="numeric"
                  />
                </>
              )}

              {step === 4 && (
                <>
                  {(
                    [
                      ['id_front', 'storeDocIdFront'],
                      ['id_back', 'storeDocIdBack'],
                      ['selfie', 'storeDocSelfie'],
                      ['nif', 'storeDocNif'],
                      ['storefront', 'storeDocFront'],
                      ['other', 'storeDocOther'],
                    ] as [StoreDocumentKind, string][]
                  ).map(([kind, key]) => (
                    <View key={kind}>
                      <Text style={styles.label}>{t(`sell.${key}`)}</Text>
                      <PhotoGrid
                        photos={form.documents.filter((doc) => doc.kind === kind)}
                        onChange={(photos) => addDocument(kind, photos)}
                        max={kind === 'other' ? 3 : 1}
                        addLabel={t('sell.addPhotos')}
                        styles={styles}
                      />
                    </View>
                  ))}
                </>
              )}

              {step === 5 && (
                <>
                  <Text style={styles.hint}>{t('sell.storeReviewHint')}</Text>
                  <View style={styles.card}>
                    <Text style={styles.strongLine}>{form.trade_name}</Text>
                    <Text style={styles.mutedLine}>{form.legal_name}</Text>
                    <Text style={styles.mutedLine}>{form.what_sells}</Text>
                    <Text style={styles.mutedLine}>
                      {form.neighborhood} · {form.store_phone}
                    </Text>
                    <Text style={styles.mutedLine}>{form.opening_hours}</Text>
                  </View>
                  <CheckRow
                    checked={form.terms_accepted}
                    label={t('sell.storeTerms')}
                    onPress={() => patch({ terms_accepted: !form.terms_accepted })}
                    styles={styles}
                  />
                </>
              )}
            </KeyboardFormScrollView>
          </StepPageTransition>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={styles.footerRow}>
              {step > 0 ? (
                <View style={styles.flexBtn}>
                  <PrimaryButton
                    label={t('sell.previous')}
                    onPress={goPrev}
                    styles={styles}
                    style={{ backgroundColor: ui.card, borderWidth: 1.5, borderColor: ui.brand }}
                    textStyle={{ color: ui.brand }}
                  />
                </View>
              ) : null}
              <View style={styles.flexBtn}>
                <PrimaryButton
                  label={saving ? t('common.loading') : step === STEP_COUNT - 1 ? t('sell.submit') : t('sell.continue')}
                  onPress={goNext}
                  styles={styles}
                  disabled={saving}
                />
              </View>
            </View>
          </View>
        </>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}>
          <Text style={styles.hero}>{statusTitle(form.status, t)}</Text>
          <Text style={styles.heroSub}>{t('sell.inReviewBody')}</Text>
          {form.admin_message ? (
            <View style={styles.adminBox}>
              <Text style={styles.adminBoxText}>{form.admin_message}</Text>
            </View>
          ) : null}
          <View style={styles.card}>
            <Text style={styles.strongLine}>{form.trade_name || t('sell.storeWizardTitle')}</Text>
            <Text style={styles.mutedLine}>{form.what_sells}</Text>
          </View>
          <PrimaryButton
            label={t('sell.talkTeam')}
            onPress={async () => {
              const ok = await openSupportWhatsApp(t('sell.storeWa', { name: form.trade_name || '—' }));
              if (!ok) Alert.alert(t('help.openFailTitle'), t('help.openFailMessage'));
            }}
            styles={styles}
            style={{ backgroundColor: '#25D366' }}
          />
          {form.status === 'rejected' ? (
            <PrimaryButton
              label={t('sell.newRequest')}
              onPress={async () => {
                const next = emptyStoreApplication();
                await saveStoreApplication(next);
                setForm(next);
                setStep(0);
              }}
              styles={styles}
              style={{ marginTop: 10 }}
            />
          ) : null}
        </ScrollView>
      )}

      <PropertyMapPickerModal
        visible={mapOpen}
        initial={
          form.latitude && form.longitude
            ? { latitude: form.latitude, longitude: form.longitude }
            : null
        }
        onClose={() => setMapOpen(false)}
        onConfirm={(coordinate) => {
          patch({ latitude: coordinate.latitude, longitude: coordinate.longitude });
          setMapOpen(false);
        }}
      />
    </View>
  );
}
