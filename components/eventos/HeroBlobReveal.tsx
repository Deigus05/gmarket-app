import { Image } from 'expo-image';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

type Props = {
  uri: string;
  width: number;
  height: number;
  /** Duração em ms */
  durationMs?: number;
  borderRadius?: number;
  onComplete?: () => void;
};

/** Janelas circulares que crescem e revelam a mesma foto (sem MaskedView). */
const BLOBS = [
  { x: 0.5, y: 0.5, delay: 0 },
  { x: 0.28, y: 0.36, delay: 0.06 },
  { x: 0.72, y: 0.38, delay: 0.1 },
  { x: 0.35, y: 0.68, delay: 0.14 },
  { x: 0.66, y: 0.7, delay: 0.18 },
  { x: 0.5, y: 0.22, delay: 0.12 },
] as const;

/**
 * Blob reveal nativo: a foto já em cache aparece através de círculos
 * que se expandem durante `durationMs` (default 5s).
 */
export function HeroBlobReveal({
  uri,
  width,
  height,
  durationMs = 10000,
  borderRadius = 0,
  onComplete,
}: Props) {
  const [done, setDone] = useState(false);
  const progress = useSharedValue(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    setDone(false);
    progress.value = 0;
    const finish = () => {
      setDone(true);
      onCompleteRef.current?.();
    };
    progress.value = withTiming(
      1,
      { duration: durationMs, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(finish)();
      },
    );
  }, [uri, durationMs, progress]);

  if (done) {
    return (
      <Image
        source={{ uri }}
        style={{ width, height, borderRadius }}
        contentFit="cover"
        cachePolicy="memory-disk"
        priority="high"
        transition={0}
      />
    );
  }

  const diag = Math.sqrt(width * width + height * height);

  return (
    <View
      style={{
        width,
        height,
        borderRadius,
        backgroundColor: '#111',
        overflow: 'hidden',
      }}
    >
      {BLOBS.map((blob, index) => (
        <BlobWindow
          key={index}
          progress={progress}
          blob={blob}
          uri={uri}
          width={width}
          height={height}
          maxSize={diag * 1.15}
        />
      ))}
    </View>
  );
}

function BlobWindow({
  progress,
  blob,
  uri,
  width,
  height,
  maxSize,
}: {
  progress: SharedValue<number>;
  blob: (typeof BLOBS)[number];
  uri: string;
  width: number;
  height: number;
  maxSize: number;
}) {
  const windowStyle = useAnimatedStyle(() => {
    const span = Math.max(0.001, 1 - blob.delay);
    const local = Math.min(1, Math.max(0, (progress.value - blob.delay) / span));
    const eased = local * local * (3 - 2 * local);
    const size = Math.max(8, eased * maxSize);
    const left = blob.x * width - size / 2;
    const top = blob.y * height - size / 2;
    return {
      width: size,
      height: size,
      borderRadius: size / 2,
      left,
      top,
      opacity: eased > 0.001 ? 1 : 0,
    };
  });

  const imageStyle = useAnimatedStyle(() => {
    const span = Math.max(0.001, 1 - blob.delay);
    const local = Math.min(1, Math.max(0, (progress.value - blob.delay) / span));
    const eased = local * local * (3 - 2 * local);
    const size = Math.max(8, eased * maxSize);
    const left = blob.x * width - size / 2;
    const top = blob.y * height - size / 2;
    return {
      position: 'absolute' as const,
      width,
      height,
      transform: [{ translateX: -left }, { translateY: -top }],
    };
  });

  return (
    <Animated.View style={[styles.window, windowStyle]}>
      <Animated.View style={imageStyle}>
        <Image
          source={{ uri }}
          style={{ width, height }}
          contentFit="cover"
          cachePolicy="memory-disk"
          priority="high"
          transition={0}
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  window: {
    position: 'absolute',
    overflow: 'hidden',
  },
});
