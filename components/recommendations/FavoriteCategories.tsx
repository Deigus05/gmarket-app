import { useRouter } from 'expo-router';
import React, { memo, useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { FavoriteCategory } from '@/components/api';
import { trackUserActivity } from '@/components/api';
import { useAuth } from '@/components/AuthContext';
import { useAppTheme, type AppUI } from '@/components/tema';
import { useBreakpoint } from '@/hooks/useBreakpoint';

type Props = {
  categories: FavoriteCategory[];
};

export const FavoriteCategories = memo(function FavoriteCategories({
  categories,
}: Props) {
  const router = useRouter();
  const { token } = useAuth();
  const { ui } = useAppTheme();
  const { isDesktop } = useBreakpoint();
  const styles = useMemo(() => createStyles(ui, isDesktop), [ui, isDesktop]);

  if (!categories.length) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.title}>As suas categorias</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
      >
        {categories.map((category) => (
          <TouchableOpacity
            key={category.id}
            style={styles.chip}
            activeOpacity={0.85}
            onPress={() => {
              void trackUserActivity(token, {
                action: 'view_category',
                categoryId: category.id,
                categoryName: category.name,
              });
              router.push({
                pathname: '/search',
                params: {
                  q: category.name,
                  categoryId: category.id,
                  categoryName: category.name,
                },
              });
            }}
          >
            <Ionicons name="grid-outline" size={14} color={ui.brand} />
            <Text style={styles.chipText}>{category.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
});

function createStyles(ui: AppUI, isDesktop: boolean) {
  const pad = isDesktop ? 0 : 12;
  return StyleSheet.create({
    section: {
      marginTop: 8,
      marginBottom: 10,
    },
    title: {
      fontSize: isDesktop ? 14 : 17,
      fontWeight: '800',
      color: ui.text,
      letterSpacing: -0.2,
      paddingHorizontal: pad,
      marginBottom: 8,
    },
    list: {
      paddingHorizontal: pad,
      gap: 8,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: ui.brandSoft,
      borderRadius: 18,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    chipText: {
      fontSize: 13,
      fontWeight: '700',
      color: ui.brand,
    },
  });
}
