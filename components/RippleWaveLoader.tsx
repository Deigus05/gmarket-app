import React, { memo, useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useAppTheme } from '@/components/tema';

const BAR_COUNT = 7;

type Size = 'small' | 'large';

type RippleWaveLoaderProps = {
  color?: string;
  size?: Size;
  style?: StyleProp<ViewStyle>;
};

const SIZE: Record<Size, { height: number; width: number; gap: number; lift: number }> = {
  small: { height: 14, width: 2.5, gap: 2, lift: 2 },
  large: { height: 32, width: 8, gap: 4, lift: 5 },
};

const Bar = memo(function Bar({
  delay,
  color,
  height,
  width,
  lift,
}: {
  delay: number;
  color: string;
  height: number;
  width: number;
  lift: number;
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
    const t = progress.value;
    const scaleY = 0.5 + t;
    const scaleX = 1 - t * 0.2;
    const translateY = -lift * t;
    return {
      transform: [{ translateY }, { scaleY }, { scaleX }],
    };
  });

  return (
    <Animated.View
      style={[
        styles.bar,
        {
          height,
          width,
          borderRadius: width,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
});

/** Loader em onda (barras), equivalente ao RippleWave com framer-motion. */
export const RippleWaveLoader = memo(function RippleWaveLoader({
  color,
  size = 'large',
  style,
}: RippleWaveLoaderProps) {
  const { ui } = useAppTheme();
  const dims = SIZE[size];
  const barColor = color ?? ui.brand;

  return (
    <View style={[styles.row, { gap: dims.gap }, style]}>
      {Array.from({ length: BAR_COUNT }, (_, index) => (
        <Bar
          key={index}
          delay={index * 100}
          color={barColor}
          height={dims.height}
          width={dims.width}
          lift={dims.lift}
        />
      ))}
    </View>
  );
});

/** Loader centrado para ecrãs / estados full-page. */
export function ScreenLoader({
  color,
  size = 'large',
  style,
}: RippleWaveLoaderProps) {
  return (
    <View style={[styles.centered, style]}>
      <RippleWaveLoader color={color} size={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: {
    backgroundColor: '#EF4444',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default RippleWaveLoader;
