import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/components/LocaleContext';
import { useAppTheme, type AppUI } from '@/components/tema';
import { AppLocale, LOCALE_META, SUPPORTED_LOCALES } from '@/lib/i18n';

export default function IdiomaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ui } = useAppTheme();
  const { locale, followsDevice, setLocale, useDeviceLocale, t } = useLocale();
  const styles = useMemo(() => createStyles(ui), [ui]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={22} color={ui.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('languages.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
      >
        <Text style={styles.sectionLabel}>{t('languages.section')}</Text>
        <Text style={styles.sectionHint}>{t('languages.hint')}</Text>

        <View style={styles.listCard}>
          <TouchableOpacity
            style={styles.row}
            onPress={useDeviceLocale}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <View style={[styles.codeBox, followsDevice && styles.codeBoxActive]}>
                <Ionicons
                  name="phone-portrait-outline"
                  size={18}
                  color={followsDevice ? ui.brand : ui.text}
                />
              </View>
              <View>
                <Text style={[styles.langName, followsDevice && { color: ui.brand }]}>
                  {t('languages.device')}
                </Text>
                <Text style={styles.langNative}>{t('languages.deviceNative')}</Text>
              </View>
            </View>
            {followsDevice ? (
              <Ionicons name="checkmark-circle" size={22} color={ui.brand} />
            ) : (
              <View style={styles.radio} />
            )}
          </TouchableOpacity>

          <View style={styles.divider} />

          {SUPPORTED_LOCALES.map((code, index) => {
            const meta = LOCALE_META[code as AppLocale];
            const active = !followsDevice && locale === code;
            return (
              <View key={code}>
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => setLocale(code)}
                  activeOpacity={0.7}
                >
                  <View style={styles.rowLeft}>
                    <View style={[styles.codeBox, active && styles.codeBoxActive]}>
                      <Text style={[styles.codeText, active && { color: ui.brand }]}>
                        {meta.code}
                      </Text>
                    </View>
                    <View>
                      <Text style={[styles.langName, active && { color: ui.brand }]}>
                        {t(`languages.${meta.nameKey}`)}
                      </Text>
                      <Text style={styles.langNative}>
                        {t(`languages.${meta.nativeKey}`)}
                      </Text>
                    </View>
                  </View>

                  {active ? (
                    <Ionicons name="checkmark-circle" size={22} color={ui.brand} />
                  ) : (
                    <View style={styles.radio} />
                  )}
                </TouchableOpacity>
                {index < SUPPORTED_LOCALES.length - 1 ? <View style={styles.divider} /> : null}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
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
    sectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1,
      marginBottom: 8,
      paddingLeft: 2,
      color: ui.muted,
    },
    sectionHint: {
      fontSize: 13,
      lineHeight: 18,
      marginBottom: 16,
      paddingLeft: 2,
      color: ui.muted,
    },
    listCard: {
      backgroundColor: ui.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: ui.border,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
      minHeight: 72,
    },
    rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
    codeBox: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: ui.iconBox,
      alignItems: 'center',
      justifyContent: 'center',
    },
    codeBoxActive: {
      backgroundColor: ui.brandSoft,
    },
    codeText: { fontSize: 13, fontWeight: '800', color: ui.text, letterSpacing: 0.5 },
    langName: { fontSize: 16, fontWeight: '700', color: ui.text },
    langNative: { fontSize: 12, color: ui.muted, marginTop: 2 },
    radio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: ui.border,
    },
    divider: { height: 1, backgroundColor: ui.divider, marginLeft: 74 },
  });
}
