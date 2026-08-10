import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/components/LocaleContext';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import { useAppTheme, type AppUI } from '@/components/tema';

const { height } = Dimensions.get('window');

const BISSAU: Region = {
  latitude: 11.8632,
  longitude: -15.5841,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

export type MapCoordinate = {
  latitude: number;
  longitude: number;
};

type PropertyMapPickerModalProps = {
  visible: boolean;
  initial?: MapCoordinate | null;
  onClose: () => void;
  onConfirm: (coordinate: MapCoordinate) => void;
};

export function PropertyMapPickerModal({
  visible,
  initial,
  onClose,
  onConfirm,
}: PropertyMapPickerModalProps) {
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const { ui } = useAppTheme();
  const styles = useMemo(() => createStyles(ui), [ui]);
  const mapRef = useRef<MapView>(null);

  const [region, setRegion] = useState<Region>(() =>
    initial
      ? { ...BISSAU, ...initial, latitudeDelta: 0.01, longitudeDelta: 0.01 }
      : BISSAU,
  );
  const [pin, setPin] = useState<MapCoordinate>(
    initial ?? { latitude: BISSAU.latitude, longitude: BISSAU.longitude },
  );
  const [locating, setLocating] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!visible) {
      setMapReady(false);
      return;
    }
    const timer = setTimeout(() => setMapReady(true), Platform.OS === 'android' ? 250 : 0);
    return () => clearTimeout(timer);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const next = initial ?? { latitude: BISSAU.latitude, longitude: BISSAU.longitude };
    setPin(next);
    const nextRegion = { ...BISSAU, ...next, latitudeDelta: 0.01, longitudeDelta: 0.01 };
    setRegion(nextRegion);
    requestAnimationFrame(() => {
      mapRef.current?.animateToRegion(nextRegion, 400);
    });
  }, [visible, initial]);

  const movePin = (coordinate: MapCoordinate) => {
    setPin(coordinate);
    setRegion((prev) => ({ ...prev, ...coordinate }));
  };

  const goToMyLocation = async () => {
    setLocating(true);
    try {
      const enabled = await Location.hasServicesEnabledAsync();
      if (!enabled) {
        Alert.alert(t('address.locDisabledTitle'), t('address.locDisabledMessage'));
        return;
      }
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        Alert.alert(t('address.permTitle'), t('announce.mapPermMessage'));
        return;
      }
      const lastKnown = await Location.getLastKnownPositionAsync({
        maxAge: 60_000,
        requiredAccuracy: 100,
      });
      const current =
        lastKnown ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      const coordinate = {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      };
      movePin(coordinate);
      const nextRegion = { ...coordinate, latitudeDelta: 0.01, longitudeDelta: 0.01 };
      setRegion(nextRegion);
      mapRef.current?.animateToRegion(nextRegion, 600);
    } catch {
      Alert.alert(t('address.locateFailTitle'), t('address.locateFailMessage'));
    } finally {
      setLocating(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color={ui.text} />
          </TouchableOpacity>
          <Text style={styles.title}>{t('announce.markOnMap')}</Text>
          <View style={{ width: 24 }} />
        </View>

        <Text style={styles.hint}>{t('announce.mapPickHint')}</Text>

        <View style={styles.mapWrap} collapsable={false}>
          {mapReady ? (
            <MapView
              ref={mapRef}
              key="property-map-picker"
              style={styles.map}
              provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
              initialRegion={region}
              onPress={(e) => movePin(e.nativeEvent.coordinate)}
              showsUserLocation
              showsMyLocationButton={false}
            >
              <Marker
                coordinate={pin}
                draggable
                onDragEnd={(e) => movePin(e.nativeEvent.coordinate)}
                title={t('announce.mapMarker')}
              />
            </MapView>
          ) : (
            <View style={[styles.map, styles.mapPlaceholder]}>
              <RippleWaveLoader size="small" color={ui.brand} />
            </View>
          )}

          <TouchableOpacity
            style={[styles.gpsBtn, locating && styles.gpsDisabled]}
            onPress={goToMyLocation}
            disabled={locating}
          >
            {locating ? (
              <RippleWaveLoader size="small" color={ui.brand} />
            ) : (
              <Ionicons name="locate" size={22} color={ui.brand} />
            )}
          </TouchableOpacity>
        </View>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Text style={styles.coords}>
            {pin.latitude.toFixed(5)}, {pin.longitude.toFixed(5)}
          </Text>
          <TouchableOpacity
            style={styles.confirmBtn}
            onPress={() => onConfirm(pin)}
          >
            <Text style={styles.confirmText}>{t('announce.confirmLocation')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(ui: AppUI) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: ui.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 10,
    },
    title: { fontSize: 17, fontWeight: '800', color: ui.text },
    hint: {
      fontSize: 13,
      color: ui.muted,
      paddingHorizontal: 16,
      marginBottom: 10,
      lineHeight: 18,
    },
    mapWrap: {
      flex: 1,
      marginHorizontal: 16,
      borderRadius: 16,
      overflow: 'hidden',
      minHeight: height * 0.45,
      backgroundColor: ui.input,
    },
    map: { width: '100%', height: '100%' },
    mapPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    gpsBtn: {
      position: 'absolute',
      right: 14,
      bottom: 14,
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: ui.card,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 4,
      elevation: 3,
    },
    gpsDisabled: { opacity: 0.6 },
    footer: { paddingHorizontal: 16, paddingTop: 14 },
    coords: {
      textAlign: 'center',
      fontSize: 12,
      color: ui.muted,
      fontWeight: '600',
      marginBottom: 10,
    },
    confirmBtn: {
      backgroundColor: ui.brand,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
    },
    confirmText: { color: ui.onBrand, fontWeight: '800', fontSize: 15 },
  });
}
