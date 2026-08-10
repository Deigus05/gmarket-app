import React, { forwardRef } from 'react';
import { StyleSheet, Text, View, type ViewProps } from 'react-native';

type LatLng = { latitude: number; longitude: number };
type Region = LatLng & { latitudeDelta: number; longitudeDelta: number };

type MapViewProps = ViewProps & {
  region?: Region;
  initialRegion?: Region;
  onRegionChangeComplete?: (region: Region) => void;
  onPress?: (event: { nativeEvent: { coordinate: LatLng } }) => void;
  showsUserLocation?: boolean;
  showsMyLocationButton?: boolean;
  pitchEnabled?: boolean;
  rotateEnabled?: boolean;
  scrollEnabled?: boolean;
  zoomEnabled?: boolean;
  children?: React.ReactNode;
};

type MarkerProps = ViewProps & {
  coordinate: LatLng;
  title?: string;
  description?: string;
  pinColor?: string;
  children?: React.ReactNode;
};

const MapView = forwardRef<View, MapViewProps>(function MapView(
  { style, children, ...rest },
  ref,
) {
  return (
    <View ref={ref} style={[styles.map, style]} {...rest}>
      <Text style={styles.hint}>Mapa disponível no app</Text>
      {children}
    </View>
  );
});

function Marker({ title, style, children }: MarkerProps) {
  return (
    <View style={[styles.marker, style]}>
      {children ?? <Text style={styles.markerText}>{title ?? '📍'}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8EEF5',
    overflow: 'hidden',
  },
  hint: {
    color: '#5A6B7D',
    fontSize: 14,
    fontWeight: '600',
  },
  marker: {
    position: 'absolute',
  },
  markerText: {
    fontSize: 20,
  },
});

export type { LatLng, Region };
export { Marker };
export default MapView;
