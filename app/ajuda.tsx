import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/components/LocaleContext';
import { useAppTheme, type AppUI } from '@/components/tema';
import { openSupportWhatsApp } from '@/lib/support';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type FaqKey =
  | 'order'
  | 'payment'
  | 'delivery'
  | 'track'
  | 'cancel'
  | 'account'
  | 'property'
  | 'problem';

const FAQ_KEYS: FaqKey[] = [
  'order',
  'payment',
  'delivery',
  'track',
  'cancel',
  'account',
  'property',
  'problem',
];

export default function AjudaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const { ui } = useAppTheme();
  const styles = useMemo(() => createStyles(ui), [ui]);
  const [openKey, setOpenKey] = useState<FaqKey | null>('order');

  const faqs = useMemo(
    () =>
      FAQ_KEYS.map((key) => ({
        key,
        q: t(`help.faq${capitalize(key)}Q`),
        a: t(`help.faq${capitalize(key)}A`),
      })),
    [t],
  );

  const toggle = useCallback((key: FaqKey) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenKey((prev) => (prev === key ? null : key));
  }, []);

  const openWhatsApp = useCallback(async () => {
    const ok = await openSupportWhatsApp(t('help.waPrefill'));
    if (!ok) {
      Alert.alert(t('help.openFailTitle'), t('help.openFailMessage'));
    }
  }, [t]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={ui.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('help.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
      >
        <Text style={styles.hero}>{t('help.subtitle')}</Text>
        <Text style={styles.heroHint}>{t('help.subtitleHint')}</Text>

        <TouchableOpacity style={styles.waBtn} onPress={openWhatsApp} activeOpacity={0.85}>
          <Ionicons name="logo-whatsapp" size={22} color="#fff" />
          <Text style={styles.waBtnText}>{t('help.whatsappCta')}</Text>
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>{t('help.faqTitle')}</Text>
        <View style={styles.card}>
          {faqs.map((item, index) => {
            const open = openKey === item.key;
            return (
              <View key={item.key}>
                <TouchableOpacity
                  style={styles.faqRow}
                  onPress={() => toggle(item.key)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.faqQ, open && styles.faqQOpen]}>{item.q}</Text>
                  <Ionicons
                    name={open ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={ui.muted}
                  />
                </TouchableOpacity>
                {open ? <Text style={styles.faqA}>{item.a}</Text> : null}
                {index < faqs.length - 1 ? <View style={styles.divider} /> : null}
              </View>
            );
          })}
        </View>

        <Text style={[styles.sectionLabel, { marginTop: 22 }]}>{t('help.legalSection')}</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => router.push('/termos')}
            activeOpacity={0.7}
          >
            <View style={styles.linkLeft}>
              <Ionicons name="document-text-outline" size={20} color={ui.brand} />
              <Text style={styles.linkText}>{t('help.termsLink')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={ui.muted} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => router.push('/regulamento-gcoin')}
            activeOpacity={0.7}
          >
            <View style={styles.linkLeft}>
              <Ionicons name="wallet-outline" size={20} color={ui.brand} />
              <Text style={styles.linkText}>{t('help.gcoinLink')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={ui.muted} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => router.push('/privacidade')}
            activeOpacity={0.7}
          >
            <View style={styles.linkLeft}>
              <Ionicons name="shield-checkmark-outline" size={20} color={ui.brand} />
              <Text style={styles.linkText}>{t('help.privacyLink')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={ui.muted} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function capitalize(key: FaqKey): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function createStyles(ui: AppUI) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: ui.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: ui.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: 17,
      fontWeight: '700',
      color: ui.text,
    },
    headerSpacer: { width: 40 },
    content: {
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    hero: {
      fontSize: 22,
      fontWeight: '700',
      color: ui.text,
      marginBottom: 6,
    },
    heroHint: {
      fontSize: 14,
      lineHeight: 20,
      color: ui.muted,
      marginBottom: 16,
    },
    waBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: '#25D366',
      borderRadius: 14,
      paddingVertical: 14,
      marginBottom: 22,
    },
    waBtnText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700',
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1,
      marginBottom: 10,
      paddingLeft: 2,
      color: ui.muted,
    },
    card: {
      backgroundColor: ui.card,
      borderRadius: 14,
      overflow: 'hidden',
    },
    faqRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    faqQ: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
      color: ui.text,
    },
    faqQOpen: {
      color: ui.brand,
    },
    faqA: {
      paddingHorizontal: 14,
      paddingBottom: 14,
      fontSize: 14,
      lineHeight: 21,
      color: ui.muted,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: ui.divider,
      marginLeft: 14,
    },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    linkLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
    },
    linkText: {
      fontSize: 15,
      fontWeight: '600',
      color: ui.text,
    },
  });
}
