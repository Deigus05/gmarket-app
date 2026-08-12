import React, { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';

import {
  GLITTER_DEFAULTS,
  buildGlitterHtml,
  type GlitterConfig,
} from '@/components/glitter/glitterHtml';

type Props = Partial<GlitterConfig> & {
  style?: StyleProp<ViewStyle>;
  /** Fired once the WebView finishes loading the canvas page. */
  onReady?: () => void;
};

/**
 * Glitter Wrap — Originkit starfield warp for native (Android WebView).
 * Avoids Expo DOM / `'use dom'` so checkout success can animate without
 * pulling the tornado WebGL path that hangs Android startup.
 */
export default function GlitterWrap({
  style,
  onReady,
  particleCount,
  color1,
  color2,
  color3,
  speed,
  density,
  starSize,
  focalDepth,
  turbulence,
  brightness,
  glitterIntensity,
  trailAmount,
  reverse,
  background,
}: Props) {
  const html = useMemo(
    () =>
      buildGlitterHtml({
        ...GLITTER_DEFAULTS,
        ...(particleCount != null ? { particleCount } : null),
        ...(color1 != null ? { color1 } : null),
        ...(color2 != null ? { color2 } : null),
        ...(color3 != null ? { color3 } : null),
        ...(speed != null ? { speed } : null),
        ...(density != null ? { density } : null),
        ...(starSize != null ? { starSize } : null),
        ...(focalDepth != null ? { focalDepth } : null),
        ...(turbulence != null ? { turbulence } : null),
        ...(brightness != null ? { brightness } : null),
        ...(glitterIntensity != null ? { glitterIntensity } : null),
        ...(trailAmount != null ? { trailAmount } : null),
        ...(reverse != null ? { reverse } : null),
        ...(background != null ? { background } : null),
      }),
    [
      particleCount,
      color1,
      color2,
      color3,
      speed,
      density,
      starSize,
      focalDepth,
      turbulence,
      brightness,
      glitterIntensity,
      trailAmount,
      reverse,
      background,
    ],
  );

  return (
    <View style={[styles.root, style]} pointerEvents="none" collapsable={false}>
      <WebView
        source={{ html }}
        originWhitelist={['*']}
        style={styles.webview}
        containerStyle={styles.webview}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        setSupportMultipleWindows={false}
        androidLayerType="hardware"
        javaScriptEnabled
        domStorageEnabled={false}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        onLoadEnd={onReady}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000000',
    opacity: 0.99, // Android: force hardware layer compositing
  },
});
