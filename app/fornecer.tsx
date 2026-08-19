import { Stack, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import { useLocale } from '@/components/LocaleContext';
import {
  CheckRow,
  PrimaryButton,
  SellerHeader,
  useSellerStyles,
} from '@/components/seller/ui';
import { useRequireAuth } from '@/components/seller/useRequireAuth';
import { useAppTheme } from '@/components/tema';
import { resolveSellerMe, saveSupplierApplication } from '@/lib/seller/snapshot';
import {
  emptySupplierApplication,
  isOpenForEdit,
  type SellerApplicationStatus,
  type SupplierApplication,
} from '@/lib/seller/types';
import { openSupportWhatsApp } from '@/lib/support';

function statusTitle(status: SellerApplicationStatus, t: (key: string) => string) {
  if (status === 'needs_changes') return t('sell.needCorrection');
  if (status === 'rejected') return t('sell.rejected');
  if (status === 'accepted') return t('sell.accepted');
  if (status === 'submitted' || status === 'under_review') return t('sell.inReview');
  return t('sell.supplyTitle');
}

export default function FornecerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const { ui } = useAppTheme();
  const styles = useSellerStyles(ui);
  const { ready, token, user } = useRequireAuth('/fornecer');
  const [application, setApplication] = useState<SupplierApplication>(emptySupplierApplication());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const me = await resolveSellerMe(token);
    setApplication(me.supplier);
    setLoading(false);
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      if (!ready) return;
      void load();
    }, [ready, load]),
  );

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/parceria');
  };

  const continueForm = async () => {
    if (!application.understood) {
      Alert.alert(t('sell.supplyTitle'), t('sell.understandNeed'));
      return;
    }
    await saveSupplierApplication({
      ...application,
      status: application.status === 'none' ? 'draft' : application.status,
      whatsapp: application.whatsapp || user?.telefone || '',
    });
    router.push('/fornecer-pedido');
  };

  if (!ready || loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <RippleWaveLoader />
      </View>
    );
  }

  const editable = isOpenForEdit(application.status);
  const showExplain = application.status === 'none' || application.status === 'draft';

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SellerHeader title={t('sell.supplyTitle')} onBack={goBack} styles={styles} />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}>
        {showExplain ? (
          <>
            <Text style={styles.hero}>{t('sell.supplyTitle')}</Text>
            <Text style={styles.heroSub}>{t('sell.supplySubtitle')}</Text>

            {[
              ['supplyHow1Title', 'supplyHow1Body'],
              ['supplyHow2Title', 'supplyHow2Body'],
              ['supplyHow3Title', 'supplyHow3Body'],
              ['supplyHow4Title', 'supplyHow4Body'],
            ].map(([titleKey, bodyKey]) => (
              <View key={titleKey} style={styles.card}>
                <Text style={styles.cardTitle}>{t(`sell.${titleKey}`)}</Text>
                <Text style={styles.cardBody}>{t(`sell.${bodyKey}`)}</Text>
              </View>
            ))}

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('sell.supplyNotTitle')}</Text>
              <Text style={styles.cardBody}>• {t('sell.supplyNot1')}</Text>
              <Text style={styles.cardBody}>• {t('sell.supplyNot2')}</Text>
              <Text style={styles.cardBody}>• {t('sell.supplyNot3')}</Text>
            </View>

            <CheckRow
              checked={application.understood}
              label={t('sell.supplyUnderstand')}
              onPress={() => setApplication((prev) => ({ ...prev, understood: !prev.understood }))}
              styles={styles}
            />

            <PrimaryButton label={t('sell.supplyContinue')} onPress={continueForm} styles={styles} />
            <PrimaryButton
              label={t('sell.openStoreInstead')}
              onPress={() => router.replace('/abrir-loja')}
              styles={styles}
              style={{ marginTop: 10, backgroundColor: ui.card, borderWidth: 1.5, borderColor: ui.brand }}
              textStyle={{ color: ui.brand }}
            />
          </>
        ) : (
          <>
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor:
                    application.status === 'rejected'
                      ? ui.dangerSoft
                      : application.status === 'accepted'
                        ? ui.successSoft
                        : ui.brandSoft,
                },
              ]}
            >
              <Text
                style={[
                  styles.statusPillText,
                  {
                    color:
                      application.status === 'rejected'
                        ? ui.danger
                        : application.status === 'accepted'
                          ? ui.success
                          : ui.brand,
                  },
                ]}
              >
                {statusTitle(application.status, t)}
              </Text>
            </View>
            <Text style={styles.hero}>{statusTitle(application.status, t)}</Text>
            <Text style={styles.heroSub}>
              {application.status === 'accepted' ? t('sell.supplyAcceptedBody') : t('sell.inReviewBody')}
            </Text>
            {application.admin_message ? (
              <View style={styles.adminBox}>
                <Text style={styles.adminBoxText}>{application.admin_message}</Text>
              </View>
            ) : null}
            {application.what_sells ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t('sell.supplyWhat')}</Text>
                <Text style={styles.cardBody}>{application.what_sells}</Text>
              </View>
            ) : null}
            {editable ? (
              <PrimaryButton label={t('sell.resubmit')} onPress={() => router.push('/fornecer-pedido')} styles={styles} />
            ) : null}
            {application.status === 'rejected' ? (
              <PrimaryButton
                label={t('sell.newRequest')}
                onPress={async () => {
                  const next = emptySupplierApplication();
                  await saveSupplierApplication(next);
                  setApplication(next);
                }}
                styles={styles}
              />
            ) : null}
            <PrimaryButton
              label={t('sell.talkTeam')}
              onPress={async () => {
                const ok = await openSupportWhatsApp(
                  t('sell.supplyWa', {
                    what: application.what_sells || '—',
                    where: application.neighborhood || '—',
                  }),
                );
                if (!ok) Alert.alert(t('help.openFailTitle'), t('help.openFailMessage'));
              }}
              styles={styles}
              style={{ marginTop: 10, backgroundColor: '#25D366' }}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}
