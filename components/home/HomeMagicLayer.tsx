import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import TornadoOverlay from '@/components/TornadoOverlay';
import { useShakeDetection } from '@/lib/useShakeDetection';

export const MAGIC_DURATION_MS = 15_000;
/** Break apart → suck (10 shards). */
export const DISINTEGRATE_DURATION_MS = 10_000;
const BUTTON_TTL_MS = 10_000;
const HAPTIC_EVERY_MS = 260;

export const DISINTEGRATE_EASING = Easing.bezier(0.33, 0.01, 0.2, 1);

type UseHomeMagicArgs = {
  enabled: boolean;
};

export type HomeMagicController = {
  running: boolean;
  buttonVisible: boolean;
  tornadoVisible: boolean;
  /** 0→1 drives shard break / orbit / suck. */
  suckProgress: SharedValue<number>;
  startMagic: () => void;
  dismissButton: () => void;
};

export function useHomeMagic({ enabled }: UseHomeMagicArgs): HomeMagicController {
  const supported = Platform.OS !== 'android' && Platform.OS !== 'web';
  const [buttonVisible, setButtonVisible] = useState(false);
  const [running, setRunning] = useState(false);
  const [tornadoVisible, setTornadoVisible] = useState(false);
  const suckProgress = useSharedValue(0);
  const buttonTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hapticTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const runningRef = useRef(false);

  const clearButtonTimer = useCallback(() => {
    if (buttonTimer.current) {
      clearTimeout(buttonTimer.current);
      buttonTimer.current = null;
    }
  }, []);

  const clearRunTimers = useCallback(() => {
    if (runTimer.current) {
      clearTimeout(runTimer.current);
      runTimer.current = null;
    }
    if (hapticTimer.current) {
      clearInterval(hapticTimer.current);
      hapticTimer.current = null;
    }
  }, []);

  const dismissButton = useCallback(() => {
    clearButtonTimer();
    setButtonVisible(false);
  }, [clearButtonTimer]);

  const revealButton = useCallback(() => {
    if (!supported || runningRef.current) return;
    setButtonVisible(true);
    clearButtonTimer();
    buttonTimer.current = setTimeout(() => {
      setButtonVisible(false);
    }, BUTTON_TTL_MS);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [clearButtonTimer, supported]);

  const startMagic = useCallback(() => {
    if (!supported || runningRef.current) return;
    runningRef.current = true;
    clearButtonTimer();
    clearRunTimers();
    setButtonVisible(false);
    setRunning(true);
    setTornadoVisible(true);

    suckProgress.value = 0;
    suckProgress.value = withTiming(1, {
      duration: DISINTEGRATE_DURATION_MS,
      easing: DISINTEGRATE_EASING,
    });

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    let tick = 0;
    hapticTimer.current = setInterval(() => {
      tick += 1;
      const style =
        tick % 5 === 0
          ? Haptics.ImpactFeedbackStyle.Heavy
          : tick % 2 === 0
            ? Haptics.ImpactFeedbackStyle.Medium
            : Haptics.ImpactFeedbackStyle.Light;
      void Haptics.impactAsync(style);
    }, HAPTIC_EVERY_MS);

    runTimer.current = setTimeout(() => {
      clearRunTimers();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      suckProgress.value = 0;
      runningRef.current = false;
      setTornadoVisible(false);
      setRunning(false);
    }, MAGIC_DURATION_MS);
  }, [clearButtonTimer, clearRunTimers, suckProgress, supported]);

  useShakeDetection(revealButton, {
    enabled: supported && enabled && !running,
  });

  useEffect(() => {
    return () => {
      clearButtonTimer();
      clearRunTimers();
      cancelAnimation(suckProgress);
      suckProgress.value = 0;
      runningRef.current = false;
    };
  }, [clearButtonTimer, clearRunTimers, suckProgress]);

  return {
    running,
    buttonVisible,
    tornadoVisible,
    suckProgress,
    startMagic,
    dismissButton,
  };
}

type LayerProps = {
  running: boolean;
  buttonVisible: boolean;
  tornadoVisible: boolean;
  onPressMagic: () => void;
  label?: string;
};

export function HomeMagicLayer({
  running,
  buttonVisible,
  tornadoVisible,
  onPressMagic,
  label = 'Mágica',
}: LayerProps) {
  const insets = useSafeAreaInsets();
  const btnProgress = useSharedValue(0);
  const showButton = buttonVisible && !running;

  useEffect(() => {
    btnProgress.value = withTiming(showButton ? 1 : 0, {
      duration: 280,
      easing: Easing.out(Easing.cubic),
    });
  }, [showButton, btnProgress]);

  const buttonStyle = useAnimatedStyle(() => ({
    opacity: btnProgress.value,
    transform: [
      { translateY: (1 - btnProgress.value) * 24 },
      { scale: 0.86 + btnProgress.value * 0.14 },
    ],
  }));

  if (Platform.OS === 'android') return null;

  return (
    <>
      <TornadoOverlay
        visible={tornadoVisible}
        prewarm={buttonVisible || running}
        variant="portal"
        heatShift={running}
        heatDurationMs={DISINTEGRATE_DURATION_MS}
      />

      {showButton ? (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.buttonWrap,
            { bottom: Math.max(insets.bottom, 12) + 78 },
            buttonStyle,
          ]}
        >
          <Pressable
            onPress={onPressMagic}
            style={({ pressed }) => [styles.magicBtn, pressed && styles.magicBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel={label}
          >
            <View style={styles.magicIcon}>
              <Ionicons name="sparkles" size={18} color="#FFF8E7" />
            </View>
            <Text style={styles.magicLabel}>{label}</Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  buttonWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1200,
    elevation: 1200,
  },
  magicBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 999,
    backgroundColor: '#0D47A1',
    shadowColor: '#0D47A1',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  magicBtnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  magicIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  magicLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
