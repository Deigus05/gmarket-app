import React, { useEffect, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';

import GlitterWrap from '@/components/glitter/GlitterWrap';

/** If the WebView never reports load, still allow the success card. */
const LOAD_FALLBACK_MS = 2500;

type Props = {
  visible: boolean;
  prewarm?: boolean;
  variant?: 'cover' | 'portal';
  heatShift?: boolean;
  heatDurationMs?: number;
  children?: React.ReactNode;
};

/**
 * Android checkout cover: Glitter Wrap starfield (canvas WebView).
 * Never imports TornadoVortex (`'use dom'` / WebGL) — that path can hang
 * Android startup when evaluated from the home tab.
 */
export default function TornadoOverlay({
  visible,
  prewarm = false,
  variant = 'cover',
  children,
}: Props) {
  const [ready, setReady] = useState(false);
  const { width, height } = Dimensions.get('window');
  const mounted = prewarm || visible;
  const showShell = visible && variant !== 'portal';
  const revealContent = showShell && ready;

  useEffect(() => {
    if (!mounted || variant === 'portal') {
      setReady(false);
      return;
    }
    if (ready) return;
    const fallback = setTimeout(() => setReady(true), LOAD_FALLBACK_MS);
    return () => clearTimeout(fallback);
  }, [mounted, ready, variant]);

  useEffect(() => {
    if (visible) setReady(false);
  }, [visible]);

  if (!mounted || variant === 'portal') return null;

  return (
    <View
      style={
        showShell
          ? [styles.shell, { width, height }]
          : styles.prewarm
      }
      pointerEvents={showShell ? 'auto' : 'none'}
      collapsable={false}
    >
      <GlitterWrap
        key={visible ? 'glitter-full' : 'glitter-warm'}
        onReady={() => setReady(true)}
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
