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
import {
  AppearanceMode,
  HomeThemePreview,
  THEME_PRESETS,
  ThemeThumb,
  resolvePalette,
  useAppTheme,
  type AppUI,
} from '@/components/tema';

export default function TemaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const { appearance, paletteId, scheme, colors, ui, setAppearance, setPaletteId } = useAppTheme();
  const styles = useMemo(() => createStyles(ui), [ui]);

  const modes: Array<{ key: AppearanceMode; label: string }> = useMemo(
    () => [
      { key: 'system', label: t('theme.system') },
      { key: 'light', label: t('theme.light') },
      { key: 'dark', label: t('theme.dark') },
    ],
    [t],
  );

  const thumbs = useMemo(
    () =>
      THEME_PRESETS.map((preset) => ({
        id: preset.id,
        name: preset.name,
        colors: resolvePalette(preset.id, scheme),
      })),
    [scheme],
  );

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
        <Text style={styles.headerTitle}>{t('theme.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
      >
        <Text style={styles.sectionLabel}>{t('theme.appearance')}</Text>

        <View style={styles.segment}>
          {modes.map((mode) => {
            const active = appearance === mode.key;
            return (
              <TouchableOpacity
                key={mode.key}
                style={[
                  styles.segmentItem,
                  active && styles.segmentItemActive,
                ]}
                onPress={() => setAppearance(mode.key)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.segmentText,
                    { color: active ? colors.accent : ui.muted },
                    active && styles.segmentTextActive,
                  ]}
                >
                  {mode.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.sectionLabel, { marginTop: 22 }]}>{t('theme.preview')}</Text>
        <HomeThemePreview colors={colors} />

        <Text style={[styles.sectionLabel, { marginTop: 22 }]}>{t('theme.colors')}</Text>
        <Text style={styles.sectionHint}>
          {scheme === 'dark' ? t('theme.hintDark') : t('theme.hintLight')}
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.thumbsRow}
        >
          {thumbs.map((thumb) => (
            <ThemeThumb
              key={thumb.id}
              name={thumb.name}
              colors={thumb.colors}
              selected={paletteId === thumb.id}
              onPress={() => setPaletteId(thumb.id)}
            />
          ))}
        </ScrollView>
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
      marginBottom: 10,
      paddingLeft: 2,
      color: ui.muted,
    },
    sectionHint: {
      fontSize: 13,
      lineHeight: 18,
      marginTop: -4,
      marginBottom: 14,
      paddingLeft: 2,
      color: ui.muted,
    },
    segment: {
      flexDirection: 'row',
      borderRadius: 14,
      padding: 4,
      backgroundColor: ui.input,
    },
    segmentItem: {
      flex: 1,
      height: 38,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentItemActive: {
      backgroundColor: ui.card,
    },
    segmentText: {
      fontSize: 14,
      fontWeight: '600',
    },
    segmentTextActive: {
      fontWeight: '700',
    },
    thumbsRow: {
      paddingRight: 8,
      paddingBottom: 8,
    },
  });
}
