import React, { useEffect, useState, type ComponentType } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import type { DOMProps } from 'expo/dom';

/** If the DOM WebView never reports load, still allow the success card. */
const LOAD_FALLBACK_MS = 4000;

type GlitterDomProps = {
  dom?: DOMProps;
};

type Props = {
  visible: boolean;
  prewarm?: boolean;
  variant?: 'cover' | 'portal';
  heatShift?: boolean;
  heatDurationMs?: number;
  children?: React.ReactNode;
};

/**
 * Android checkout cover: Originkit Glitter Wrap (Variant 1) via Expo DOM.
 * Dynamically imported only for `cover` so the home `portal` path never
 * evaluates the DOM module (same hang risk as TornadoVortex / WebGL).
 */
export default function TornadoOverlay({
  visible,
  prewarm = false,
  variant = 'cover',
  children,
}: Props) {
  const isCover = variant !== 'portal';
  const [ready, setReady] = useState(false);
  const [Glitter, setGlitter] = useState<ComponentType<GlitterDomProps> | null>(
    null,
  );
  const { width, height } = Dimensions.get('window');
  const mounted = isCover && (prewarm || visible);
  const showShell = isCover && visible;
  const revealContent = showShell && ready;

  useEffect(() => {
    if (!mounted) {
      setGlitter(null);
      setReady(false);
      return;
    }
    let cancelled = false;
    import('@/components/glitter/GlitterWrap.dom')
      .then((mod) => {
        if (!cancelled) setGlitter(() => mod.default);
      })
      .catch((err) => {
        console.warn('[TornadoOverlay.android] GlitterWrap load failed:', err);
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) {
      setReady(false);
      return;
    }
    if (ready) return;
    const fallback = setTimeout(() => setReady(true), LOAD_FALLBACK_MS);
    return () => clearTimeout(fallback);
  }, [mounted, ready]);

  useEffect(() => {
    if (visible && isCover) setReady(false);
  }, [visible, isCover]);

  if (!mounted) return null;

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
      {Glitter ? (
        <Glitter
          key={visible ? 'glitter-full' : 'glitter-warm'}
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
      ) : null}
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
