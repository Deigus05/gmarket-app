import React, { forwardRef, useEffect, useState } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { PROVIDER_GOOGLE, type MapViewProps } from 'react-native-maps';

import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import { useAppTheme } from '@/components/tema';

type SafeMapViewProps = Omit<MapViewProps, 'showsUserLocation' | 'showsMyLocationButton'> & {
  /** Atrasa a montagem no Android (Modal / layout race). */
  deferMs?: number;
  /** Cor do loader enquanto o mapa não monta. */
  loaderColor?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * MapView seguro para Android:
 * - Atrasa a montagem (evita ecrã branco / crash em Modal)
 * - Nunca activa `showsUserLocation` (FusedLocation + GMS pode matar o processo)
 * - Usa Google Maps no Android quando disponível
 */
const SafeMapView = forwardRef<MapView, SafeMapViewProps>(function SafeMapView(
  {
    deferMs = Platform.OS === 'android' ? 250 : 0,
    loaderColor,
    style,
    children,
    provider,
    ...rest
  },
  ref,
) {
  const { ui } = useAppTheme();
  const [ready, setReady] = useState(deferMs <= 0);

  useEffect(() => {
    if (deferMs <= 0) {
      setReady(true);
      return;
    }
    setReady(false);
    const timer = setTimeout(() => setReady(true), deferMs);
    return () => clearTimeout(timer);
  }, [deferMs]);

  if (!ready) {
    return (
      <View style={[styles.placeholder, style]}>
        <RippleWaveLoader size="small" color={loaderColor ?? ui.brand} />
      </View>
    );
  }

  return (
    <MapView
      ref={ref}
      style={style}
      provider={provider ?? (Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined)}
      showsUserLocation={false}
      showsMyLocationButton={false}
      {...rest}
    >
      {children}
    </MapView>
  );
});

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
});

export default SafeMapView;
