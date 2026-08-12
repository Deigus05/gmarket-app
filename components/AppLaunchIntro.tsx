import { Image } from 'expo-image';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import FocusReveal from '@/components/FocusReveal';
import { hideNativeSplashSafe } from '@/lib/splash';

const TAGLINE = 'Você merece os melhores produtos!';
const FADE_OUT_MS = 420;
/** Se a animação/Reanimated falhar (ex.: IPA Sideloadly), não ficar preso no splash. */
const INTRO_SAFETY_MS = 4500;

type AppLaunchIntroProps = {
  visible: boolean;
  onFinished: () => void;
};

/**
 * Intro: logo GMarket + frase com FocusReveal (vibração por letra).
 * Esconde o splash nativo só depois do overlay branco + logo estarem no ecrã.
 */
export default function AppLaunchIntro({ visible, onFinished }: AppLaunchIntroProps) {
  const insets = useSafeAreaInsets();
  const opacity = useSharedValue(1);
  const [textDone, setTextDone] = useState(false);
  const finishedRef = React.useRef(false);

  const hideSplash = useCallback(() => {
    void hideNativeSplashSafe();
  }, []);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinished();
  }, [onFinished]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      hideSplash();
      finish();
    }, INTRO_SAFETY_MS);
    return () => clearTimeout(timer);
  }, [visible, finish, hideSplash]);

  useEffect(() => {
    if (!textDone) return;

    opacity.value = withTiming(
      0,
      { duration: FADE_OUT_MS, easing: Easing.out(Easing.cubic) },
      (done) => {
        if (done) runOnJS(finish)();
      },
    );
    const timer = setTimeout(() => finish(), FADE_OUT_MS + 400);
    return () => clearTimeout(timer);
  }, [finish, opacity, textDone]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="auto"
      style={[styles.overlay, overlayStyle]}
      onLayout={hideSplash}
    >
      <View style={styles.center}>
        <Image
          source={require('../assets/images/gmarket-splash.png')}
          style={styles.logo}
          contentFit="contain"
          accessibilityLabel="GMarket"
          onLoad={hideSplash}
        />
      </View>

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 16) + 28 }]}>
        <FocusReveal
          text={TAGLINE}
          blur={20}
          staggerFrom="start"
          vibrate
          style={styles.tagline}
          onComplete={() => setTextDone(true)}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    zIndex: 9999,
    elevation: 9999,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logo: {
    width: 280,
    height: 280,
  },
  bottom: {
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  tagline: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0D47A1',
    letterSpacing: -0.2,
    textAlign: 'center',
    lineHeight: 28,
  },
});
