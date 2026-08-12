import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TAGLINE = 'Você merece os melhores produtos!';
const FADE_OUT_MS = 420;
const LOGO_FADE_MS = 380;
const TEXT_FADE_MS = 520;
const TEXT_DELAY_MS = 280;
const HOLD_MS = 900;
/** Se a animação/Reanimated falhar (ex.: IPA Sideloadly), não ficar preso no splash. */
const INTRO_SAFETY_MS = 4500;

type AppLaunchIntroProps = {
  visible: boolean;
  onFinished: () => void;
};

/**
 * Intro estável: logo + frase com fade simples.
 * Sem vibração por letra / scale (causava “tremor” ao abrir o app).
 */
export default function AppLaunchIntro({ visible, onFinished }: AppLaunchIntroProps) {
  const insets = useSafeAreaInsets();
  const overlayOpacity = useSharedValue(1);
  const logoOpacity = useSharedValue(0);
  const textOpacity = useSharedValue(0);
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
    if (!visible) return;

    finishedRef.current = false;
    setTextDone(false);
    overlayOpacity.value = 1;
    logoOpacity.value = 0;
    textOpacity.value = 0;

    logoOpacity.value = withTiming(1, {
      duration: LOGO_FADE_MS,
      easing: Easing.out(Easing.cubic),
    });

    textOpacity.value = withDelay(
      TEXT_DELAY_MS,
      withTiming(1, { duration: TEXT_FADE_MS, easing: Easing.out(Easing.cubic) }, (done) => {
        if (done) runOnJS(setTextDone)(true);
      }),
    );

    // Fallback se o callback do Reanimated não correr
    const fallback = setTimeout(() => setTextDone(true), TEXT_DELAY_MS + TEXT_FADE_MS + 200);
    return () => clearTimeout(fallback);
  }, [visible, logoOpacity, textOpacity, overlayOpacity]);

  useEffect(() => {
    if (!textDone) return;

    const hold = setTimeout(() => {
      overlayOpacity.value = withTiming(
        0,
        { duration: FADE_OUT_MS, easing: Easing.out(Easing.cubic) },
        (done) => {
          if (done) runOnJS(finish)();
        },
      );
    }, HOLD_MS);

    const safety = setTimeout(() => finish(), HOLD_MS + FADE_OUT_MS + 400);
    return () => {
      clearTimeout(hold);
      clearTimeout(safety);
    };
  }, [finish, overlayOpacity, textDone]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));
  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
  }));
  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
  }));

  if (!visible) return null;

  return (
    <Animated.View pointerEvents="auto" style={[styles.overlay, overlayStyle]}>
      <View style={styles.center}>
        <Animated.View style={logoStyle}>
          <Image
            source={require('../assets/images/gmarket-splash.png')}
            style={styles.logo}
            contentFit="contain"
            accessibilityLabel="GMarket"
          />
        </Animated.View>
      </View>

      <Animated.View
        style={[
          styles.bottom,
          { paddingBottom: Math.max(insets.bottom, 16) + 28 },
          textStyle,
        ]}
      >
        <Text style={styles.tagline}>{TAGLINE}</Text>
      </Animated.View>
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
