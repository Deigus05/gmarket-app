import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme, type AppUI } from '@/components/tema';

export type LegalSection = {
  title: string;
  body: string;
};

type Props = {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
};

export function LegalDocumentScreen({ title, updated, intro, sections }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ui } = useAppTheme();
  const styles = useMemo(() => createStyles(ui), [ui]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={ui.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
      >
        <Text style={styles.updated}>{updated}</Text>
        <Text style={styles.intro}>{intro}</Text>

        {sections.map((section) => (
          <View key={section.title} style={styles.block}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
          </View>
        ))}
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
    updated: {
      fontSize: 12,
      fontWeight: '600',
      color: ui.muted,
      marginBottom: 10,
    },
    intro: {
      fontSize: 15,
      lineHeight: 22,
      color: ui.text,
      marginBottom: 20,
    },
    block: {
      marginBottom: 18,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: ui.text,
      marginBottom: 6,
    },
    sectionBody: {
      fontSize: 14,
      lineHeight: 21,
      color: ui.muted,
    },
  });
}
