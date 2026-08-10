import React, { memo, useMemo } from 'react';
import {
  Dimensions,
  Image,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const VORTEX_X = SCREEN_W / 2;
const VORTEX_Y = SCREEN_H * 0.42;

/** 10 irregular tiles covering the full screen (normalized 0–1). */
export const HOME_SHARDS: ReadonlyArray<{ x: number; y: number; w: number; h: number }> = [
  { x: 0, y: 0, w: 0.52, h: 0.2 },
  { x: 0.52, y: 0, w: 0.48, h: 0.2 },
  { x: 0, y: 0.2, w: 0.34, h: 0.24 },
  { x: 0.34, y: 0.2, w: 0.33, h: 0.24 },
  { x: 0.67, y: 0.2, w: 0.33, h: 0.24 },
  { x: 0, y: 0.44, w: 0.48, h: 0.26 },
  { x: 0.48, y: 0.44, w: 0.52, h: 0.26 },
  { x: 0, y: 0.7, w: 0.36, h: 0.3 },
  { x: 0.36, y: 0.7, w: 0.32, h: 0.3 },
  { x: 0.68, y: 0.7, w: 0.32, h: 0.3 },
];

type ShardProps = {
  index: number;
  uri: string;
  progress: SharedValue<number>;
  layout: { x: number; y: number; w: number; h: number };
};

const HomeShard = memo(function HomeShard({ index, uri, progress, layout }: ShardProps) {
  const homeX = layout.x * SCREEN_W;
  const homeY = layout.y * SCREEN_H;
  const homeW = layout.w * SCREEN_W;
  const homeH = layout.h * SCREEN_H;
  const ox = homeX + homeW / 2;
  const oy = homeY + homeH / 2;
  const dx0 = ox - VORTEX_X;
  const dy0 = oy - VORTEX_Y;
  const dist0 = Math.hypot(dx0, dy0) || 1;
  const nx = dx0 / dist0;
  const ny = dy0 / dist0;
  const spinDir = index % 2 === 0 ? 1 : -1;
  const gapBoost = 36 + (index % 4) * 16;
  const stagger = Math.min(index * 0.035, 0.28);

  const animatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    // 0→stagger+0.12: crack apart · then fly straight into the vortex
    const local = interpolate(p, [stagger, 1], [0, 1], Extrapolation.CLAMP);
    const crack = interpolate(local, [0, 0.18], [0, 1], Extrapolation.CLAMP);
    const suck = interpolate(local, [0.18, 1], [0, 1], Extrapolation.CLAMP);

    const outward = crack * gapBoost * (1 - suck);
    const toward = suck;
    const tx = nx * outward + (VORTEX_X - ox) * toward;
    const ty = ny * outward + (VORTEX_Y - oy) * toward;
    const rotate = spinDir * interpolate(local, [0, 1], [0, 520], Extrapolation.CLAMP);
    const scale = interpolate(local, [0, 0.2, 1], [1, 0.92, 0.02], Extrapolation.CLAMP);
    const opacity = interpolate(local, [0.75, 1], [1, 0], Extrapolation.CLAMP);

    return {
      opacity,
      zIndex: 10 + index,
      transform: [
        { translateX: tx },
        { translateY: ty },
        { rotate: `${rotate}deg` },
        { scale },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      collapsable={false}
      style={[
        styles.shard,
        {
          left: homeX,
          top: homeY,
          width: homeW,
          height: homeH,
        },
        animatedStyle,
      ]}
    >
      <Image
        source={{ uri }}
        style={{
          position: 'absolute',
          width: SCREEN_W,
          height: SCREEN_H,
          left: -homeX,
          top: -homeY,
        }}
        resizeMode="cover"
      />
    </Animated.View>
  );
});

type Props = {
  uri: string;
  progress: SharedValue<number>;
};

/** Home screenshot split into 10 shards that crack apart then get sucked into the tornado. */
export default function HomeDisintegrate({ uri, progress }: Props) {
  const shards = useMemo(() => HOME_SHARDS, []);

  return (
    <View style={styles.layer} pointerEvents="none">
      {shards.map((layout, index) => (
        <HomeShard
          key={`shard-${index}`}
          index={index}
          uri={uri}
          progress={progress}
          layout={layout}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    elevation: 50,
  },
  shard: {
    position: 'absolute',
    overflow: 'hidden',
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.25)',
  },
});
