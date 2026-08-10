import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
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

const TAGLINE = 'Você merece os melhores produtos!';
const FADE_OUT_MS = 420;
/** Se a animação/Reanimated falhar (ex.: IPA Sideloadly), não ficar preso no splash. */
const INTRO_SAFETY_MS = 4500;

type AppLaunchIntroProps = {
  visible: boolean;
  onFinished: () => void;
};

export default function AppLaunchIntro({ visible, onFinished }: AppLaunchIntroProps) {
  const insets = useSafeAreaInsets();
  const opacity = useSharedValue(1);
  const [textDone, setTextDone] = useState(false);
  const finishedRef = React.useRef(false);

  useEffect(() => {
    if (!visible) return;
    void SplashScreen.hideAsync().catch(() => undefined);
  }, [visible]);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinished();
  }, [onFinished]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      finish();
    }, INTRO_SAFETY_MS);
    return () => clearTimeout(timer);
  }, [visible, finish]);

  useEffect(() => {
    if (!textDone) return;

    opacity.value = withTiming(
      0,
      { duration: FADE_OUT_MS, easing: Easing.out(Easing.cubic) },
      (done) => {
        if (done) runOnJS(finish)();
      },
    );
    // Fallback se o callback do Reanimated não correr neste build
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
    >
      <View style={styles.center}>
        <Image
          source={require('../assets/images/gmarket-splash.png')}
          style={styles.logo}
          contentFit="contain"
          accessibilityLabel="GMarket"
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
    width: '78%',
    maxWidth: 320,
    aspectRatio: 1,
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
