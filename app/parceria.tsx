import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Stack, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/components/LocaleContext';
import { useAppTheme } from '@/components/tema';
import { openSupportWhatsApp } from '@/lib/support';

type OpportunityId = 'seller' | 'affiliate' | 'courier' | 'ads';

type Opportunity = {
  id: OpportunityId;
  accent: string;
  blockBg: string;
  soft: string;
  icon: keyof typeof Ionicons.glyphMap;
  chipIcons: (keyof typeof Ionicons.glyphMap)[];
};

type OriginRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SPRING = { damping: 20, stiffness: 170, mass: 0.9 };
const PAD = 16;
const GRID_GAP = 10;
const BLOCK_SIZE = (SCREEN_W - PAD * 2 - GRID_GAP) / 2;
const EXPANDED_W = SCREEN_W - PAD * 2;
const THIN_BORDER = StyleSheet.hairlineWidth;
const BLUR_METHOD = Platform.OS === 'android' ? ('dimezisBlurView' as const) : undefined;

function OpportunityBlock({
  item,
  title,
  subtitle,
  index,
  borderColor,
  text,
  hidden,
  onPress,
}: {
  item: Opportunity;
  title: string;
  subtitle: string;
  index: number;
  borderColor: string;
  text: string;
  hidden: boolean;
  onPress: (origin: OriginRect) => void;
}) {
  const ref = useRef<View>(null);
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: hidden ? 0 : 1,
  }));

  const handlePress = () => {
    ref.current?.measureInWindow((x, y, width, height) => {
      onPress({ x, y, width, height });
    });
  };

  return (
    <Animated.View
      entering={FadeInDown.delay(70 + index * 60).duration(360)}
      style={[styles.blockSlot, animStyle]}
    >
      <Pressable
        onPressIn={() => {
          scale.value = withSpring(0.97, SPRING);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, SPRING);
        }}
        onPress={handlePress}
      >
        <View
          ref={ref}
          collapsable={false}
          style={[
            styles.block,
            {
              backgroundColor: item.blockBg,
              borderColor,
              opacity: hidden ? 0 : 1,
            },
          ]}
        >
          <View style={[styles.iconWrap, { backgroundColor: item.soft }]}>
            <Ionicons name={item.icon} size={26} color={item.accent} />
          </View>
          <Text style={[styles.blockSubtitle, { color: item.accent }]} numberOfLines={1}>
            {subtitle}
          </Text>
          <Text style={[styles.blockTitle, { color: text }]} numberOfLines={2}>
            {title}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function BornFromBlock({
  item,
  copy,
  chips,
  origin,
  borderColor,
  text,
  muted,
  topInset,
  bottomInset,
  onClosed,
  onInterest,
}: {
  item: Opportunity;
  copy: { title: string; subtitle: string; body: string; cta: string };
  chips: string[];
  origin: OriginRect;
  borderColor: string;
  text: string;
  muted: string;
  topInset: number;
  bottomInset: number;
  onClosed: () => void;
  onInterest: () => void;
}) {
  const progress = useSharedValue(0);

  const targetY = Math.max(topInset + 52, Math.min(origin.y, SCREEN_H * 0.16));
  const targetH = Math.min(420, SCREEN_H - targetY - bottomInset - 28);

  React.useEffect(() => {
    progress.value = withSpring(1, SPRING);
  }, [progress]);

  const close = () => {
    progress.value = withTiming(
      0,
      { duration: 280, easing: Easing.bezier(0.32, 0.72, 0, 1) },
      (finished) => {
        if (finished) runOnJS(onClosed)();
      },
    );
  };

  const shellStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      position: 'absolute' as const,
      left: interpolate(p, [0, 1], [origin.x, PAD]),
      top: interpolate(p, [0, 1], [origin.y, targetY]),
      width: interpolate(p, [0, 1], [origin.width, EXPANDED_W]),
      height: interpolate(p, [0, 1], [origin.height, targetH]),
      borderRadius: interpolate(p, [0, 1], [22, 24]),
      backgroundColor: item.blockBg,
      borderWidth: THIN_BORDER,
      borderColor,
      overflow: 'hidden' as const,
      shadowColor: '#000',
      shadowOpacity: interpolate(p, [0, 1], [0, 0.16]),
      shadowRadius: interpolate(p, [0, 1], [0, 18]),
      shadowOffset: { width: 0, height: interpolate(p, [0, 1], [0, 10]) },
      elevation: interpolate(p, [0, 1], [0, 12]),
    };
  });

  const headerCompactStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.35, 0.55], [1, 0.3, 0]),
  }));

  const detailStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.25, 0.7], [0, 1]),
    transform: [
      {
        translateY: interpolate(progress.value, [0.25, 1], [18, 0]),
      },
    ],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1]),
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      </Animated.View>

      <Animated.View style={shellStyle}>
        <Animated.View style={[styles.bornCompact, headerCompactStyle]} pointerEvents="none">
          <View style={styles.bornCompactInner}>
            <View style={[styles.iconWrap, { backgroundColor: item.soft }]}>
              <Ionicons name={item.icon} size={26} color={item.accent} />
            </View>
            <Text style={[styles.blockSubtitle, { color: item.accent }]} numberOfLines={1}>
              {copy.subtitle}
            </Text>
            <Text style={[styles.blockTitle, { color: text }]} numberOfLines={2}>
              {copy.title}
            </Text>
          </View>
        </Animated.View>

        <Animated.View style={[styles.bornDetail, detailStyle]}>
          <Pressable style={styles.closeBtn} onPress={close} hitSlop={10}>
            <Ionicons name="close" size={16} color={text} />
          </Pressable>

          <View style={[styles.bornIcon, { backgroundColor: item.soft }]}>
            <Ionicons name={item.icon} size={28} color={item.accent} />
          </View>

          <Text style={[styles.bornSubtitle, { color: item.accent }]}>{copy.subtitle}</Text>
          <Text style={[styles.bornTitle, { color: text }]}>{copy.title}</Text>
          <Text style={[styles.bornBody, { color: muted }]}>{copy.body}</Text>

          <View style={styles.chipRow}>
            {chips.map((chip, i) => (
              <View
                key={chip}
                style={[styles.chip, { backgroundColor: item.soft, borderColor }]}
              >
                <Ionicons name={item.chipIcons[i]} size={12} color={item.accent} />
                <Text style={[styles.chipText, { color: item.accent }]}>{chip}</Text>
              </View>
            ))}
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: item.accent, opacity: pressed ? 0.9 : 1 },
            ]}
            onPress={onInterest}
          >
            <Text style={styles.ctaText}>{copy.cta}</Text>
            <Ionicons name="arrow-forward" size={16} color="#FFF" />
          </Pressable>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

export default function ParceriaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const { ui, isDark } = useAppTheme();
  const [activeId, setActiveId] = useState<OpportunityId | null>(null);
  const [origin, setOrigin] = useState<OriginRect | null>(null);

  const pageBg = isDark ? ui.bg : '#EDEEF1';
  const borderColor = isDark ? '#FFFFFF' : '#000000';
  const blurTint = isDark ? 'dark' : 'light';

  const opportunities: Opportunity[] = useMemo(
    () => [
      {
        id: 'seller',
        accent: '#1565C0',
        blockBg: isDark ? '#1A222C' : '#E4E8EE',
        soft: isDark ? 'rgba(66,165,245,0.18)' : 'rgba(21,101,192,0.12)',
        icon: 'storefront-outline',
        chipIcons: ['bag-handle-outline', 'home-outline', 'construct-outline'],
      },
      {
        id: 'affiliate',
        accent: '#7B1FA2',
        blockBg: isDark ? '#241A28' : '#E9E4EC',
        soft: isDark ? 'rgba(186,104,200,0.18)' : 'rgba(123,31,162,0.12)',
        icon: 'megaphone-outline',
        chipIcons: ['share-social-outline', 'cash-outline', 'link-outline'],
      },
      {
        id: 'courier',
        accent: '#2E7D32',
        blockBg: isDark ? '#1A241C' : '#E4EAE5',
        soft: isDark ? 'rgba(129,199,132,0.18)' : 'rgba(46,125,50,0.12)',
        icon: 'bicycle-outline',
        chipIcons: ['navigate-outline', 'time-outline', 'wallet-outline'],
      },
      {
        id: 'ads',
        accent: '#E65100',
        blockBg: isDark ? '#2A2218' : '#EEE8E2',
        soft: isDark ? 'rgba(255,167,38,0.18)' : 'rgba(230,81,0,0.12)',
        icon: 'easel-outline',
        chipIcons: ['eye-outline', 'images-outline', 'phone-portrait-outline'],
      },
    ],
    [isDark],
  );

  const copyFor = useCallback(
    (id: OpportunityId) => {
      if (id === 'seller') {
        return {
          title: t('partnership.sellerTitle'),
          subtitle: t('partnership.sellerSubtitle'),
          body: t('partnership.sellerBody'),
          cta: t('partnership.sellerCta'),
          wa: t('partnership.sellerWa'),
          chips: [
            t('partnership.sellerChipStore'),
            t('partnership.sellerChipProperty'),
            t('partnership.sellerChipTools'),
          ],
        };
      }
      if (id === 'affiliate') {
        return {
          title: t('partnership.affiliateTitle'),
          subtitle: t('partnership.affiliateSubtitle'),
          body: t('partnership.affiliateBody'),
          cta: t('partnership.affiliateCta'),
          wa: t('partnership.affiliateWa'),
          chips: [
            t('partnership.affiliateChipShare'),
            t('partnership.affiliateChipEarn'),
            t('partnership.affiliateChipLink'),
          ],
        };
      }
      if (id === 'ads') {
        return {
          title: t('partnership.adsTitle'),
          subtitle: t('partnership.adsSubtitle'),
          body: t('partnership.adsBody'),
          cta: t('partnership.adsCta'),
          wa: t('partnership.adsWa'),
          chips: [
            t('partnership.adsChipReach'),
            t('partnership.adsChipBanners'),
            t('partnership.adsChipApp'),
          ],
        };
      }
      return {
        title: t('partnership.courierTitle'),
        subtitle: t('partnership.courierSubtitle'),
        body: t('partnership.courierBody'),
        cta: t('partnership.courierCta'),
        wa: t('partnership.courierWa'),
        chips: [
          t('partnership.courierChipRoutes'),
          t('partnership.courierChipFlex'),
          t('partnership.courierChipPay'),
        ],
      };
    },
    [t],
  );

  const onInterest = useCallback(
    async (id: OpportunityId) => {
      const { wa } = copyFor(id);
      const ok = await openSupportWhatsApp(wa);
      if (!ok) {
        Alert.alert(t('help.openFailTitle'), t('help.openFailMessage'));
      }
    },
    [copyFor, t],
  );

  const openFocus = useCallback((id: OpportunityId, rect: OriginRect) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
    setOrigin(rect);
    setActiveId(id);
  }, []);

  const closeFocus = useCallback(() => {
    setActiveId(null);
    setOrigin(null);
  }, []);

  const active = activeId ? opportunities.find((o) => o.id === activeId) : null;
  const activeCopy = activeId ? copyFor(activeId) : null;

  return (
    <View style={[styles.root, { backgroundColor: pageBg, paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <Pressable
          style={[
            styles.backBtn,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.55)',
              borderColor,
            },
          ]}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={22} color={ui.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: ui.text }]}>{t('partnership.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        scrollEnabled={!activeId}
      >
        <View style={[styles.frostCard, { borderColor }]}>
          <BlurView
            intensity={isDark ? 38 : 46}
            tint={blurTint}
            experimentalBlurMethod={BLUR_METHOD}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              styles.frostSheen,
              {
                backgroundColor: isDark
                  ? 'rgba(120,120,128,0.28)'
                  : 'rgba(180,180,188,0.42)',
              },
            ]}
          />
          <View style={styles.frostContent}>
            <Text style={[styles.heroTitle, { color: ui.text }]}>
              {t('partnership.heroTitle')}
            </Text>
            <Text style={[styles.heroSubtitle, { color: ui.muted }]}>
              {t('partnership.heroSubtitle')}
            </Text>
          </View>
        </View>

        <View style={styles.grid}>
          {opportunities.map((item, index) => {
            const copy = copyFor(item.id);
            return (
              <OpportunityBlock
                key={item.id}
                item={item}
                index={index}
                title={copy.title}
                subtitle={copy.subtitle}
                borderColor={borderColor}
                text={ui.text}
                hidden={activeId === item.id}
                onPress={(rect) => openFocus(item.id, rect)}
              />
            );
          })}
        </View>
      </ScrollView>

      {active && activeCopy && origin && (
        <BornFromBlock
          item={active}
          copy={activeCopy}
          chips={activeCopy.chips}
          origin={origin}
          borderColor={borderColor}
          text={ui.text}
          muted={ui.muted}
          topInset={insets.top}
          bottomInset={insets.bottom}
          onClosed={closeFocus}
          onInterest={() => onInterest(active.id)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    zIndex: 2,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: THIN_BORDER,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    paddingHorizontal: PAD,
    paddingTop: 4,
    gap: 16,
  },
  frostCard: {
    borderRadius: 18,
    borderWidth: THIN_BORDER,
    overflow: 'hidden',
  },
  frostSheen: {
    ...StyleSheet.absoluteFillObject,
  },
  frostContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  blockSlot: {
    width: BLOCK_SIZE,
  },
  block: {
    width: BLOCK_SIZE,
    height: BLOCK_SIZE,
    borderRadius: 22,
    borderWidth: THIN_BORDER,
    padding: 14,
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  blockSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 3,
  },
  blockTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
    lineHeight: 19,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: THIN_BORDER,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  bornCompact: {
    ...StyleSheet.absoluteFillObject,
    padding: 14,
  },
  bornCompactInner: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
  },
  bornDetail: {
    padding: 18,
    paddingTop: 20,
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(127,127,127,0.18)',
    zIndex: 2,
  },
  bornIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  bornSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  bornTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 10,
  },
  bornBody: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 14,
  },
  cta: {
    marginTop: 16,
    height: 50,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
