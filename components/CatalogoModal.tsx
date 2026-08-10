import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getCategories, type ProductCategory } from '@/components/api';
import { useLocale } from '@/components/LocaleContext';
import { useAppTheme, type AppUI } from '@/components/tema';

const { width } = Dimensions.get('window');
const H_PAD = 14;
const GAP = 10;
const COLS = 3;
const CARD_W = (width - H_PAD * 2 - GAP * (COLS - 1)) / COLS;
const CARD_H = CARD_W * 1.28;

const FLUENT_3D =
  'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets';

const CATALOG_CATEGORIES = [
  {
    id: 'c1',
    slug: 'eletronica',
    nameKey: 'catalog.electronics' as const,
    image: `${FLUENT_3D}/Laptop/3D/laptop_3d.png`,
  },
  {
    id: 'c1b',
    slug: 'telemovel-tablet',
    nameKey: 'catalog.phoneTablet' as const,
    image: `${FLUENT_3D}/Mobile%20phone/3D/mobile_phone_3d.png`,
  },
  {
    id: 'c1c',
    slug: 'computador',
    nameKey: 'catalog.computer' as const,
    image: `${FLUENT_3D}/Desktop%20computer/3D/desktop_computer_3d.png`,
  },
  {
    id: 'c2',
    slug: 'vestuario',
    nameKey: 'catalog.clothing' as const,
    image: `${FLUENT_3D}/T-shirt/3D/t-shirt_3d.png`,
  },
  {
    id: 'c3',
    slug: 'sapatos',
    nameKey: 'catalog.shoes' as const,
    image: `${FLUENT_3D}/Running%20shoe/3D/running_shoe_3d.png`,
  },
  {
    id: 'c4',
    slug: 'casa',
    nameKey: 'catalog.home' as const,
    image: `${FLUENT_3D}/Couch%20and%20lamp/3D/couch_and_lamp_3d.png`,
  },
  {
    id: 'c5',
    slug: 'escola',
    nameKey: 'catalog.school' as const,
    image: `${FLUENT_3D}/Notebook/3D/notebook_3d.png`,
  },
  {
    id: 'c6',
    slug: 'beleza',
    nameKey: 'catalog.beauty' as const,
    image: `${FLUENT_3D}/Lipstick/3D/lipstick_3d.png`,
  },
  {
    id: 'c7',
    slug: 'construcao',
    nameKey: 'catalog.construction' as const,
    image: `${FLUENT_3D}/Hammer%20and%20wrench/3D/hammer_and_wrench_3d.png`,
  },
  {
    id: 'c8',
    slug: 'local',
    nameKey: 'catalog.local' as const,
    image: `${FLUENT_3D}/Mango/3D/mango_3d.png`,
  },
  {
    id: 'c9',
    slug: 'supermercado',
    nameKey: 'catalog.supermarket' as const,
    image: `${FLUENT_3D}/Shopping%20cart/3D/shopping_cart_3d.png`,
  },
];

export type CatalogCategorySelection = {
  id?: string;
  slug: string;
  name: string;
};

interface CatalogoModalProps {
  visivel: boolean;
  onFechar: () => void;
  onSelectCategory?: (category: CatalogCategorySelection) => void;
}

export default function CatalogoModal({
  visivel,
  onFechar,
  onSelectCategory,
}: CatalogoModalProps) {
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const { ui, scheme } = useAppTheme();
  const styles = useMemo(() => createStyles(ui, scheme), [ui, scheme]);
  const [apiCategories, setApiCategories] = useState<ProductCategory[]>([]);

  useEffect(() => {
    if (!visivel) return;
    let cancelled = false;
    void getCategories().then((cats) => {
      if (!cancelled) setApiCategories(cats);
    });
    return () => {
      cancelled = true;
    };
  }, [visivel]);

  const categoriesBySlug = useMemo(() => {
    const map = new Map<string, ProductCategory>();
    for (const cat of apiCategories) {
      map.set(cat.slug.trim().toLowerCase(), cat);
    }
    return map;
  }, [apiCategories]);

  return (
    <Modal visible={visivel} animationType="slide" transparent={false} onRequestClose={onFechar}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onFechar} hitSlop={12} style={styles.sideBtn}>
            <Ionicons name="arrow-back" size={24} color={ui.text} />
          </TouchableOpacity>
          <Text style={styles.title}>{t('catalog.title')}</Text>
          <View style={styles.sideBtn} />
        </View>

        <FlatList
          data={CATALOG_CATEGORIES}
          keyExtractor={(item) => item.id}
          numColumns={COLS}
          showsVerticalScrollIndicator={false}
          columnWrapperStyle={styles.row}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 28 }]}
          renderItem={({ item }) => {
            const name = t(item.nameKey).replace(/\n/g, ' ').trim();
            const apiCat = categoriesBySlug.get(item.slug);
            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.82}
                onPress={() => {
                  if (onSelectCategory) {
                    onSelectCategory({
                      id: apiCat?.id,
                      slug: item.slug,
                      name: apiCat?.name || name,
                    });
                    return;
                  }
                  onFechar();
                }}
              >
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {name}
                </Text>
                <View style={styles.imageWrap} pointerEvents="none">
                  <Image source={{ uri: item.image }} style={styles.cardImage} />
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </Modal>
  );
}

function createStyles(ui: AppUI, scheme: 'light' | 'dark') {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: ui.bg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    sideBtn: {
      width: 32,
      height: 32,
      justifyContent: 'center',
      alignItems: 'flex-start',
    },
    title: {
      fontSize: 17,
      fontWeight: '700',
      color: ui.text,
      letterSpacing: -0.2,
    },
    listContent: {
      paddingHorizontal: H_PAD,
      paddingTop: 2,
    },
    row: {
      gap: GAP,
      marginBottom: GAP,
    },
    card: {
      width: CARD_W,
      height: CARD_H,
      // Um pouco mais cinza que ui.input — contraste visível no fundo claro
      backgroundColor: scheme === 'light' ? '#E5E5EA' : '#2C2C2E',
      borderRadius: 20,
      overflow: 'hidden',
      paddingTop: 14,
      paddingHorizontal: 12,
    },
    cardTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: ui.text,
      lineHeight: 18,
      letterSpacing: -0.2,
      zIndex: 2,
    },
    imageWrap: {
      position: 'absolute',
      right: -4,
      bottom: -6,
      width: CARD_W * 0.86,
      height: CARD_W * 0.86,
      justifyContent: 'center',
      alignItems: 'center',
    },
    cardImage: {
      width: '100%',
      height: '100%',
      resizeMode: 'contain',
    },
  });
}
