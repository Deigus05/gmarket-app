import React, { memo, useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useAppTheme } from '@/components/tema';

const DOT_COUNT = 3;
const DOT_SIZE = 12;
const DOT_GAP = 8;

type PulsatingDotsProps = {
  color?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

const Dot = memo(function Dot({
  delay,
  color,
  size,
}: {
  delay: number;
  color: string;
  size: number;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      ),
    );
  }, [delay, progress]);

  const style = useAnimatedStyle(() => {
    const scale = interpolate(progress.value, [0, 1], [1, 1.5]);
    const opacity = interpolate(progress.value, [0, 1], [0.5, 1]);
    return { opacity, transform: [{ scale }] };
  });

  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
});

/** Três pontos a pulsar — loader para pull-to-refresh / estados curtos. */
export const PulsatingDots = memo(function PulsatingDots({
  color,
  size = DOT_SIZE,
  style,
}: PulsatingDotsProps) {
  const { ui } = useAppTheme();
  const dotColor = color ?? ui.brand;

  return (
    <View style={[styles.row, style]}>
      {Array.from({ length: DOT_COUNT }, (_, index) => (
        <Dot key={index} delay={index * 300} color={dotColor} size={size} />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: DOT_GAP,
  },
});

export default PulsatingDots;
