import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PromoInterstitial } from '@/components/api';

type Props = {
  item: PromoInterstitial | null;
  visible: boolean;
  onClose: () => void;
  onGoToProduct: (productId: string) => void;
  onCopyPromo: (code: string) => void | Promise<void>;
};

function hexToRgb(hex: string) {
  const raw = hex.replace('#', '').trim();
  if (raw.length === 3) {
    const r = parseInt(raw[0] + raw[0], 16);
    const g = parseInt(raw[1] + raw[1], 16);
    const b = parseInt(raw[2] + raw[2], 16);
    return { r, g, b };
  }
  if (raw.length === 6) {
    return {
      r: parseInt(raw.slice(0, 2), 16),
      g: parseInt(raw.slice(2, 4), 16),
      b: parseInt(raw.slice(4, 6), 16),
    };
  }
  return { r: 229, g: 57, b: 66 };
}

function darken(hex: string, amount = 0.28) {
  const { r, g, b } = hexToRgb(hex);
  const f = 1 - amount;
  return `rgb(${Math.round(r * f)}, ${Math.round(g * f)}, ${Math.round(b * f)})`;
}

export default function PromoInterstitialModal({
  item,
  visible,
  onClose,
  onGoToProduct,
  onCopyPromo,
}: Props) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);

  const isSheet = item?.placement === 'sheet';
  const imageFill = item?.image_fill !== false;
  const sheetHeight = Math.round(height * 0.52);
  const bg = item?.background_color || '#E53935';
  const gradient = useMemo(
    () => [bg, darken(bg, 0.22)] as const,
    [bg],
  );

  const backdrop = useSharedValue(0);
  const sheetY = useSharedValue(sheetHeight + 40);
  const fullOpacity = useSharedValue(0);

  useEffect(() => {
    if (!visible || !item) return;
    setCopied(false);
    setCopying(false);

    if (isSheet) {
      backdrop.value = 0;
      sheetY.value = sheetHeight + 40;
      backdrop.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
      sheetY.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) });
    } else {
      fullOpacity.value = 0;
      fullOpacity.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
    }
  }, [visible, item?.id, isSheet, sheetHeight, backdrop, sheetY, fullOpacity]);

  const animateOut = (done: () => void) => {
    if (isSheet) {
      backdrop.value = withTiming(0, { duration: 180 });
      sheetY.value = withTiming(
        sheetHeight + 40,
        { duration: 240, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(done)();
        },
      );
    } else {
      fullOpacity.value = withTiming(0, { duration: 200 }, (finished) => {
        if (finished) runOnJS(done)();
      });
    }
  };

  const handleClose = () => {
    animateOut(onClose);
  };

  const handleCopy = async () => {
    if (!item?.promo_code || copying) return;
    setCopying(true);
    try {
      await onCopyPromo(item.promo_code);
      setCopied(true);
    } finally {
      setCopying(false);
    }
  };

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdrop.value * 0.55,
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }));

  const fullStyle = useAnimatedStyle(() => ({
    opacity: fullOpacity.value,
  }));

  if (!item) return null;

  const hasProduct = Boolean(item.product_id);
  const hasPromo = Boolean(item.promo_code);
  const hasText = Boolean(
    (item.title || '').trim()
    || (item.subtitle || '').trim()
    || (item.promo_code || '').trim(),
  );
  const showOverlay = hasText || hasProduct || hasPromo;

  const copyBlock = (
    <>
      {item.title ? (
        <Text style={isSheet ? styles.sheetTitle : styles.fullTitle} numberOfLines={isSheet ? 2 : undefined}>
          {item.title}
        </Text>
      ) : null}
      {item.subtitle ? (
        <Text style={isSheet ? styles.sheetSubtitle : styles.fullSubtitle} numberOfLines={isSheet ? 3 : undefined}>
          {item.subtitle}
        </Text>
      ) : null}
      {item.promo_code ? (
        <View style={[styles.codeChip, !isSheet && styles.codeChipLight]}>
          <Text style={styles.codeChipText}>{item.promo_code}</Text>
        </View>
      ) : null}
    </>
  );

  const actions = (
    <View style={styles.actions}>
      {hasProduct ? (
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
          onPress={() => {
            if (item.product_id) onGoToProduct(item.product_id);
          }}
        >
          <Text style={styles.primaryBtnText}>
            {item.cta_product_label || 'Ver produto'}
          </Text>
        </Pressable>
      ) : null}
      {hasPromo ? (
        <Pressable
          style={({ pressed }) => [
            hasProduct ? styles.secondaryBtn : styles.primaryBtn,
            pressed && styles.pressed,
          ]}
          onPress={() => void handleCopy()}
          disabled={copying}
        >
          {copying ? (
            <ActivityIndicator color={hasProduct ? '#0D47A1' : '#FFF'} />
          ) : (
            <Text style={hasProduct ? styles.secondaryBtnText : styles.primaryBtnText}>
              {copied
                ? 'Código copiado!'
                : item.cta_promo_label || 'Copiar código'}
            </Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );

  if (isSheet) {
    return (
      <Modal visible={visible} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={handleClose}>
        <View style={styles.sheetRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose}>
            <Animated.View style={[styles.backdrop, backdropStyle]} />
          </Pressable>
          <Animated.View
            style={[
              styles.sheet,
              sheetStyle,
              {
                height: sheetHeight + Math.max(insets.bottom, 0),
                backgroundColor: imageFill ? '#FFF' : bg,
              },
            ]}
          >
            {imageFill ? (
              <Image
                source={{ uri: item.image_url }}
                style={[StyleSheet.absoluteFill, { backgroundColor: 'transparent' }]}
                contentFit="cover"
                contentPosition="center"
                transition={200}
              />
            ) : null}
            <View style={[styles.sheetInner, { paddingBottom: Math.max(insets.bottom, 14) }]}>
              <View style={styles.sheetHandle} />
              <Pressable
                accessibilityLabel="Fechar"
                onPress={handleClose}
                style={[styles.closeBtn, styles.sheetClose]}
                hitSlop={10}
              >
                <FontAwesome name="times" size={16} color="#FFF" />
              </Pressable>

              {imageFill ? (
                <View style={styles.sheetFillBody}>{showOverlay ? copyBlock : null}</View>
              ) : (
                <View style={styles.sheetBody}>
                  <Image
                    source={{ uri: item.image_url }}
                    style={styles.sheetImage}
                    contentFit="cover"
                    transition={200}
                  />
                  {showOverlay ? <View style={styles.sheetCopy}>{copyBlock}</View> : null}
                </View>
              )}
              {showOverlay ? actions : null}
            </View>
          </Animated.View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={handleClose}>
      <Animated.View style={[styles.fullRoot, fullStyle]}>
        {imageFill ? (
          <Image
            source={{ uri: item.image_url }}
            style={[StyleSheet.absoluteFill, { backgroundColor: 'transparent' }]}
            contentFit="cover"
            contentPosition="center"
            transition={220}
          />
        ) : (
          <LinearGradient colors={[gradient[0], gradient[1]]} style={StyleSheet.absoluteFill} />
        )}
        {!showOverlay ? (
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        ) : null}
        <Pressable
          accessibilityLabel="Fechar"
          onPress={handleClose}
          style={[styles.closeBtn, { top: Math.max(insets.top, 12) + 6, right: 16 }]}
          hitSlop={10}
        >
          <FontAwesome name="times" size={18} color="#FFF" />
        </Pressable>

        {imageFill ? (
          showOverlay ? (
            <View
              style={[
                styles.fullFillContent,
                { paddingTop: Math.max(insets.top, 12) + 48, paddingBottom: Math.max(insets.bottom, 16) + 8 },
              ]}
            >
              {copyBlock}
              {actions}
            </View>
          ) : null
        ) : (
          <View style={[styles.fullContent, { paddingTop: Math.max(insets.top, 12) + 48 }]}>
            <View style={styles.fullImageWrap}>
              <Image
                source={{ uri: item.image_url }}
                style={styles.fullImage}
                contentFit="cover"
                transition={220}
              />
            </View>

            {showOverlay ? (
              <View style={[styles.fullTextBlock, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
                {copyBlock}
                {actions}
              </View>
            ) : null}
          </View>
        )}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fullRoot: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  fullContent: {
    flex: 1,
    justifyContent: 'space-between',
  },
  fullImageWrap: {
    flex: 1,
    marginHorizontal: 20,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
  fullFillContent: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 22,
    gap: 10,
  },
  fullTextBlock: {
    paddingHorizontal: 22,
    paddingTop: 22,
    gap: 10,
  },
  fullTitle: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 34,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  fullSubtitle: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  closeBtn: {
    position: 'absolute',
    zIndex: 5,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden',
  },
  sheetInner: {
    flex: 1,
    paddingTop: 8,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.45)',
    marginBottom: 10,
    zIndex: 2,
  },
  sheetFillBody: {
    flex: 1,
    justifyContent: 'flex-end',
    gap: 6,
    paddingHorizontal: 18,
    marginBottom: 10,
    zIndex: 2,
  },
  sheetClose: {
    top: 12,
    right: 14,
  },
  sheetBody: {
    flex: 1,
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 18,
  },
  sheetImage: {
    width: 112,
    height: '88%',
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  sheetCopy: {
    flex: 1,
    gap: 6,
    paddingRight: 28,
  },
  sheetTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 25,
  },
  sheetSubtitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  codeChip: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  codeChipLight: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  codeChipText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  actions: {
    gap: 8,
    alignItems: 'center',
    zIndex: 2,
    paddingHorizontal: 18,
  },
  primaryBtn: {
    backgroundColor: '#0D47A1',
    borderRadius: 999,
    minHeight: 38,
    minWidth: 168,
    maxWidth: '78%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 8,
  },
  primaryBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryBtn: {
    backgroundColor: '#FFF',
    borderRadius: 999,
    minHeight: 36,
    minWidth: 168,
    maxWidth: '78%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 8,
  },
  secondaryBtnText: {
    color: '#0D47A1',
    fontSize: 13,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.88,
  },
});
