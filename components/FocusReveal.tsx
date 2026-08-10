import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

type StaggerFrom = 'start' | 'center' | 'end' | 'random';

type FocusRevealProps = {
  text?: string;
  style?: StyleProp<TextStyle>;
  blur?: number;
  staggerFrom?: StaggerFrom;
  durationMs?: number;
  delayMs?: number;
  staggerMs?: number;
  /** Soft vibration while each character reveals. */
  vibrate?: boolean;
  onComplete?: () => void;
};

const START_SCALE = 1.45;
const MAX_BLUR = 20;
const EASE_OUT = Easing.bezier(0.215, 0.61, 0.355, 1);

const DEFAULTS = {
  durationMs: 300,
  delayMs: 0,
  staggerMs: 35,
};

function buildStaggerDelays(
  count: number,
  each: number,
  from: StaggerFrom,
  baseDelay: number,
): number[] {
  if (count === 0) return [];

  if (from === 'random') {
    const order = Array.from({ length: count }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return order.map((rank) => baseDelay + rank * each);
  }

  if (from === 'end') {
    return Array.from(
      { length: count },
      (_, i) => baseDelay + (count - 1 - i) * each,
    );
  }

  if (from === 'center') {
    const mid = (count - 1) / 2;
    return Array.from(
      { length: count },
      (_, i) => baseDelay + Math.abs(i - mid) * each,
    );
  }

  return Array.from({ length: count }, (_, i) => baseDelay + i * each);
}

function FocusChar({
  char,
  delay,
  durationMs,
  startBlur,
  skipMotion,
  textStyle,
  onStart,
  onComplete,
}: {
  char: string;
  delay: number;
  durationMs: number;
  startBlur: number;
  skipMotion: boolean;
  textStyle?: StyleProp<TextStyle>;
  onStart?: () => void;
  onComplete?: () => void;
}) {
  const progress = useSharedValue(skipMotion ? 1 : 0);
  const startedRef = useRef(false);
  const onStartRef = useRef(onStart);
  const onCompleteRef = useRef(onComplete);
  onStartRef.current = onStart;
  onCompleteRef.current = onComplete;

  useEffect(() => {
    startedRef.current = false;

    const notifyComplete = () => onCompleteRef.current?.();

    if (skipMotion) {
      progress.value = 1;
      notifyComplete();
      return;
    }

    progress.value = 0;
    progress.value = withDelay(
      delay,
      withTiming(1, { duration: durationMs, easing: EASE_OUT }, (finished) => {
        if (finished) runOnJS(notifyComplete)();
      }),
    );

    const startTimer = setTimeout(() => {
      if (startedRef.current) return;
      startedRef.current = true;
      onStartRef.current?.();
    }, delay);

    return () => clearTimeout(startTimer);
  }, [delay, durationMs, progress, skipMotion]);

  const animatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: p,
      transform: [{ scale: START_SCALE - (START_SCALE - 1) * p }],
      textShadowRadius: startBlur * (1 - p),
      textShadowColor: 'rgba(13, 71, 161, 0.35)',
      textShadowOffset: { width: 0, height: 0 },
    };
  });

  return (
    <Animated.Text style={[textStyle, animatedStyle]}>
      {char === ' ' ? '\u00A0' : char}
    </Animated.Text>
  );
}

export default function FocusReveal({
  text = 'Você merece os melhores produtos!',
  style,
  blur = 20,
  staggerFrom = 'start',
  durationMs = DEFAULTS.durationMs,
  delayMs = DEFAULTS.delayMs,
  staggerMs = DEFAULTS.staggerMs,
  vibrate = true,
  onComplete,
}: FocusRevealProps) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  const skipMotion = reduceMotion;
  const safeBlur = Math.min(Math.max(blur, 0), MAX_BLUR);
  const chars = useMemo(() => text.split(''), [text]);
  const lastIndex = chars.length - 1;

  const delays = useMemo(
    () =>
      buildStaggerDelays(
        chars.length,
        skipMotion ? 0 : staggerMs,
        staggerFrom,
        delayMs,
      ),
    [chars.length, skipMotion, staggerFrom, delayMs, staggerMs],
  );

  const words = useMemo(() => {
    const parts: { chars: string[]; startIndex: number }[] = [];
    let startIndex = 0;
    for (const token of text.split(/(\s+)/)) {
      if (token.length === 0) continue;
      const tokenChars = token.split('');
      parts.push({ chars: tokenChars, startIndex });
      startIndex += tokenChars.length;
    }
    return parts;
  }, [text]);

  useEffect(() => {
    completedRef.current = false;
  }, [text, blur, staggerFrom, durationMs, delayMs, staggerMs]);

  useEffect(() => {
    if (!skipMotion || !onCompleteRef.current || completedRef.current) return;
    completedRef.current = true;
    onCompleteRef.current();
  }, [skipMotion]);

  const fireHaptic = () => {
    if (!vibrate || skipMotion || Platform.OS === 'web') return;
    void Haptics.selectionAsync();
  };

  const handleCharComplete = (index: number) => {
    if (index !== lastIndex || completedRef.current) return;
    completedRef.current = true;
    if (vibrate && Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    onCompleteRef.current?.();
  };

  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={text}
      style={styles.row}
    >
      {words.map((word, wordIndex) => {
        const isWhitespace = word.chars.every((c) => /\s/.test(c));

        return (
          <View
            key={`word-${wordIndex}`}
            style={isWhitespace ? undefined : styles.word}
            importantForAccessibility="no-hide-descendants"
          >
            {word.chars.map((char, charOffset) => {
              const index = word.startIndex + charOffset;
              return (
                <FocusChar
                  key={`${char}-${index}`}
                  char={char}
                  delay={delays[index] ?? 0}
                  durationMs={skipMotion ? 150 : durationMs}
                  startBlur={safeBlur}
                  skipMotion={skipMotion}
                  textStyle={style}
                  onStart={fireHaptic}
                  onComplete={() => handleCharComplete(index)}
                />
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    width: '100%',
  },
  word: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
  },
});

export type { FocusRevealProps, StaggerFrom };
