import React, { useEffect, useState } from 'react';
import {
  Dimensions,
  Platform,
  StyleSheet,
  View,
} from 'react-native';

import TornadoVortex from '@/components/tornado/TornadoVortex';

/** If the DOM WebView never reports load, still allow reveal. */
const LOAD_FALLBACK_MS = 8000;

type Props = {
  visible: boolean;
  /** Keep a hidden instance mounted so the DOM bundle is already warm. */
  prewarm?: boolean;
  /**
   * `cover` — full-screen black (checkout).
   * `portal` — tornado behind home content so UI can fly into it.
   */
  variant?: 'cover' | 'portal';
  /** Ignite orange from bottom → top while shards are sucked (home magic). */
  heatShift?: boolean;
  heatDurationMs?: number;
  children?: React.ReactNode;
};

/** iOS / web — Android uses `TornadoOverlay.android.tsx` (no DOM WebView). */
export default function TornadoOverlay({
  visible,
  prewarm = false,
  variant = 'cover',
  heatShift = false,
  heatDurationMs = 10_000,
  children,
}: Props) {
  const [ready, setReady] = useState(false);
  const { width, height } = Dimensions.get('window');
  const mounted = prewarm || visible;
  const showShell = visible;
  const revealContent = visible && ready;
  const isPortal = variant === 'portal';

  useEffect(() => {
    if (!mounted) {
      setReady(false);
      return;
    }
    if (Platform.OS === 'web') {
      setReady(true);
      return;
    }
    if (ready) return;
    const fallback = setTimeout(() => setReady(true), LOAD_FALLBACK_MS);
    return () => clearTimeout(fallback);
  }, [mounted, ready]);

  // Remount DOM at full size on show — prewarm is 2×2 and breaks the canvas field.
  useEffect(() => {
    if (visible && Platform.OS !== 'web') setReady(false);
  }, [visible]);

  if (!mounted) return null;

  return (
    <View
      style={
        showShell
          ? [
              isPortal ? styles.portal : styles.reveal,
              { width, height },
            ]
          : styles.prewarm
      }
      pointerEvents={showShell ? (isPortal ? 'none' : 'auto') : 'none'}
      collapsable={false}
    >
      <TornadoVortex
        key={visible ? `vortex-full-${variant}` : 'vortex-warm'}
        heatShift={visible && heatShift}
        heatDurationMs={heatDurationMs}
        dom={{
          style: showShell
            ? {
                position: 'absolute',
                top: 0,
                left: 0,
                width,
                height,
                backgroundColor: '#000',
              }
            : {
                width: 2,
                height: 2,
                backgroundColor: '#000',
              },
          scrollEnabled: false,
          setSupportMultipleWindows: false,
          androidLayerType: 'hardware',
          onLoadEnd: () => setReady(true),
        }}
      />
      {revealContent && children ? (
        <View style={styles.foreground} pointerEvents="box-none">
          {children}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  prewarm: {
    position: 'absolute',
    width: 2,
    height: 2,
    opacity: 0,
    overflow: 'hidden',
    left: 0,
    bottom: 0,
    zIndex: -1,
  },
  reveal: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 1000,
    elevation: 1000,
  },
  /** Behind home UI — content flies into the vortex on top. */
  portal: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 1,
    elevation: 1,
  },
  foreground: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    elevation: 2,
  },
});
