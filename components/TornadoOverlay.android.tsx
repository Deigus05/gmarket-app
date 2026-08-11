import React from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';

type Props = {
  visible: boolean;
  prewarm?: boolean;
  variant?: 'cover' | 'portal';
  heatShift?: boolean;
  heatDurationMs?: number;
  children?: React.ReactNode;
};

/**
 * Android stub: never import TornadoVortex (`'use dom'` / WebGL WebView).
 * That module was pulled in via the shared overlay and could hang startup
 * when the home tab evaluated its imports — leaving the native splash stuck.
 */
export default function TornadoOverlay({
  visible,
  variant = 'cover',
  children,
}: Props) {
  if (!visible || variant === 'portal') return null;

  const { width, height } = Dimensions.get('window');

  return (
    <View
      style={[styles.shell, { width, height }]}
      pointerEvents="auto"
    >
      {children ? (
        <View style={styles.foreground} pointerEvents="box-none">
          {children}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    zIndex: 1000,
    elevation: 1000,
  },
  foreground: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    elevation: 2,
  },
});
