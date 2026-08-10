import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { AppUI } from '@/components/tema';

type AnnounceStepIndicatorProps = {
  currentStep: number;
  steps: string[];
  ui: AppUI;
};

const DOT = 28;
const LINE_H = 6;
const LINE_MS = 480;
const ease = Easing.out(Easing.cubic);

export function AnnounceStepIndicator({
  currentStep,
  steps,
  ui,
}: AnnounceStepIndicatorProps) {
  const label = steps[currentStep] ?? '';
  const lastIndex = Math.max(steps.length - 1, 1);
  const ratio = currentStep / lastIndex;

  const trackWidth = useSharedValue(0);
  const fillWidth = useSharedValue(0);

  useEffect(() => {
    fillWidth.value = withTiming(ratio * trackWidth.value, {
      duration: LINE_MS,
      easing: ease,
    });
  }, [ratio, fillWidth, trackWidth]);

  // Quando o trilho mede pela 1.ª vez, posiciona a linha sem saltar
  // se já houver progresso (ex.: voltar ao ecrã).
  const onTrackLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    const prev = trackWidth.value;
    trackWidth.value = w;
    if (prev === 0) {
      fillWidth.value = ratio * w;
    } else {
      fillWidth.value = withTiming(ratio * w, { duration: LINE_MS, easing: ease });
    }
  };

  const fillStyle = useAnimatedStyle(() => ({
    width: fillWidth.value,
  }));

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.trackWrap} pointerEvents="none" onLayout={onTrackLayout}>
          <View style={[styles.track, { backgroundColor: ui.border }]} />
          <Animated.View
            style={[styles.fill, { backgroundColor: ui.brand }, fillStyle]}
          />
        </View>

        {steps.map((stepLabel, index) => {
          const done = index < currentStep;
          const active = index <= currentStep;
          return (
            <View key={`${stepLabel}-${index}`} style={styles.dotCol}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: active ? ui.brand : ui.input },
                ]}
              >
                {done ? (
                  <Ionicons name="checkmark-circle" size={17} color={ui.onBrand} />
                ) : (
                  <Ionicons
                    name="ellipse"
                    size={10}
                    color={active ? ui.onBrand : ui.muted}
                  />
                )}
              </View>
            </View>
          );
        })}
      </View>

      <Text style={[styles.label, { color: ui.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    position: 'relative',
  },
  trackWrap: {
    position: 'absolute',
    left: DOT / 2,
    right: DOT / 2,
    height: LINE_H,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  track: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: LINE_H / 2,
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: LINE_H / 2,
  },
  dotCol: {
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
});
