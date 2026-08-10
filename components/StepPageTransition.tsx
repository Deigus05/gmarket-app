import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

type StepPageTransitionProps = {
  step: number;
  /** 1 = avançar, -1 = voltar */
  direction: 1 | -1;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

const DURATION = 400;
const ease = Easing.bezier(0.22, 1, 0.36, 1);

type PageShot = {
  key: number;
  node: React.ReactNode;
};

/**
 * Duas páginas ao mesmo tempo: a atual sai e a nova entra
 * com slide horizontal (efeito de mudar de ecrã).
 */
export function StepPageTransition({
  step,
  direction,
  children,
  style,
}: StepPageTransitionProps) {
  const { width } = useWindowDimensions();

  const [current, setCurrent] = useState<PageShot>({ key: step, node: children });
  const [outgoing, setOutgoing] = useState<PageShot | null>(null);

  const prevStepRef = useRef(step);
  const displayedRef = useRef(children);
  const childrenRef = useRef(children);
  const busyRef = useRef(false);

  childrenRef.current = children;

  const progress = useSharedValue(1);
  const dirSV = useSharedValue<number>(direction);
  const widthSV = useSharedValue(width);

  useEffect(() => {
    widthSV.value = width;
  }, [width, widthSV]);

  const clearOutgoing = () => {
    setOutgoing(null);
    busyRef.current = false;
  };

  useEffect(() => {
    if (prevStepRef.current === step) return;

    busyRef.current = true;
    dirSV.value = direction;

    setOutgoing({ key: prevStepRef.current, node: displayedRef.current });
    setCurrent({ key: step, node: childrenRef.current });
    displayedRef.current = childrenRef.current;
    prevStepRef.current = step;

    progress.value = 0;
    progress.value = withTiming(1, { duration: DURATION, easing: ease }, (finished) => {
      if (finished) runOnJS(clearOutgoing)();
    });
  }, [step, direction, dirSV, progress]);

  useEffect(() => {
    if (!busyRef.current && prevStepRef.current === step) {
      setCurrent({ key: step, node: children });
      displayedRef.current = children;
    }
  }, [children, step]);

  const incomingStyle = useAnimatedStyle(() => {
    const start = dirSV.value * widthSV.value;
    return {
      transform: [{ translateX: start * (1 - progress.value) }],
      opacity: 0.45 + 0.55 * progress.value,
    };
  });

  const outgoingStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -dirSV.value * widthSV.value * progress.value }],
    opacity: 1 - 0.5 * progress.value,
  }));

  return (
    <View style={[styles.clip, style]}>
      {outgoing ? (
        <Animated.View pointerEvents="none" style={[styles.outgoing, outgoingStyle]}>
          {outgoing.node}
        </Animated.View>
      ) : null}
      <Animated.View style={[styles.incoming, incomingStyle]}>{current.node}</Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    flex: 1,
    overflow: 'hidden',
  },
  incoming: {
    flex: 1,
  },
  outgoing: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
});
