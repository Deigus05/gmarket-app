import React, { useEffect, useState, type ComponentType } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import type { DOMProps } from 'expo/dom';

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
  const [Glitter, setGlitter] = useState<ComponentType<GlitterDomProps> | null>(
    null,
  );
  const { width, height } = Dimensions.get('window');
  const mounted = isCover && (prewarm || visible);
  const showShell = isCover && visible;

  useEffect(() => {
    if (!mounted) {
      setGlitter(null);
      return;
    }
    let cancelled = false;
    import('@/components/glitter/GlitterWrap.dom')
      .then((mod) => {
        if (!cancelled) setGlitter(() => mod.default);
      })
      .catch((err) => {
        console.warn('[TornadoOverlay.android] GlitterWrap load failed:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [mounted]);

  if (!mounted) return null;

  return (
    <View
      style={[styles.shell, { width, height }, !showShell && styles.prewarmHidden]}
      pointerEvents={showShell ? 'auto' : 'none'}
      collapsable={false}
    >
      {Glitter ? (
        <Glitter
          dom={{
            style: {
              position: 'absolute',
              top: 0,
              left: 0,
              width,
              height,
              backgroundColor: '#000',
            },
            scrollEnabled: false,
            setSupportMultipleWindows: false,
            androidLayerType: 'hardware',
          }}
        />
      ) : null}
      {showShell && children ? (
        <View style={styles.foreground} pointerEvents="box-none">
          {children}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  prewarmHidden: {
    opacity: 0,
    zIndex: -1,
    elevation: 0,
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
