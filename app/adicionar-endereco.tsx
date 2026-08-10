import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/components/AuthContext';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import { useLocale } from '@/components/LocaleContext';
import { useAppTheme, type AppUI } from '@/components/tema';

const { height } = Dimensions.get('window');

const BISSAU_REGION = {
  latitude: 11.8632,
  longitude: -15.5841,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

type Coordinate = {
  latitude: number;
  longitude: number;
};

function formatAddress(address: Location.LocationGeocodedAddress | undefined, coordinate: Coordinate) {
  if (!address) {
    return `${coordinate.latitude.toFixed(6)}, ${coordinate.longitude.toFixed(6)}`;
  }

  const street = [address.street, address.streetNumber].filter(Boolean).join(', ');
  const parts = [
    address.name !== street ? address.name : null,
    street,
    address.district,
    address.city,
    address.region,
    address.country,
  ].filter((part, index, all): part is string => Boolean(part) && all.indexOf(part) === index);

  return parts.length > 0
    ? parts.join(', ')
    : `${coordinate.latitude.toFixed(6)}, ${coordinate.longitude.toFixed(6)}`;
}

export default function AdicionarEnderecoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const { ui } = useAppTheme();
  const styles = useMemo(() => createStyles(ui), [ui]);
  const { saveAddress, user } = useAuth();
  const params = useLocalSearchParams<{ redirect?: string }>();
  const mapRef = useRef<MapView>(null);

  const labelOptions = [t('common.home'), t('common.work'), t('common.other')];
  const [label, setLabel] = useState(t('common.home'));
  const [bairro, setBairro] = useState('');
  const [descricao, setDescricao] = useState('');
  const [enderecoDoMapa, setEnderecoDoMapa] = useState('');
  const [regiao, setRegion] = useState(BISSAU_REGION);
  const [buscandoLocalizacao, setBuscandoLocalizacao] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const reverseGeocode = async (coordinate: Coordinate) => {
    try {
      const result = await Location.reverseGeocodeAsync(coordinate);
      const formatted = formatAddress(result[0], coordinate);
      setEnderecoDoMapa(formatted);
      if (result[0]?.district || result[0]?.city) {
        setBairro(result[0].district || result[0].city || '');
      }
      return formatted;
    } catch {
      const fallback = formatAddress(undefined, coordinate);
      setEnderecoDoMapa(fallback);
      return fallback;
    }
  };

  const buscarLocalizacaoAtual = async () => {
    setBuscandoLocalizacao(true);
    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        Alert.alert(t('address.locDisabledTitle'), t('address.locDisabledMessage'));
        return;
      }

      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        Alert.alert(
          t('address.permTitle'),
          t('address.permMessage'),
        );
        return;
      }

      const lastKnown = await Location.getLastKnownPositionAsync({
        maxAge: 60_000,
        requiredAccuracy: 100,
      });
      const current = lastKnown ?? await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coordinate = {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      };
      await reverseGeocode(coordinate);
      const nextRegion = { ...coordinate, latitudeDelta: 0.01, longitudeDelta: 0.01 };
      setRegion(nextRegion);
      mapRef.current?.animateToRegion(nextRegion, 600);
    } catch {
      Alert.alert(t('address.locateFailTitle'), t('address.locateFailMessage'));
    } finally {
      setBuscandoLocalizacao(false);
    }
  };

  const handleMapPress = async (coordinate: Coordinate) => {
    setRegion((current) => ({ ...current, ...coordinate }));
    await reverseGeocode(coordinate);
  };

  const finishFlow = () => {
    if (params.redirect === 'cart') {
      router.replace('/(tabs)/cart');
      return;
    }
    if (params.redirect === 'checkout') {
      router.replace('/checkout');
      return;
    }
    router.replace('/(tabs)/profile');
  };

  const handleSalvar = async () => {
    setError('');
    if (!bairro.trim() || !descricao.trim()) {
      setError(t('address.fillError'));
      return;
    }

    const details = [
      bairro.trim(),
      descricao.trim(),
      enderecoDoMapa || 'Bissau',
    ].filter(Boolean).join(', ');

    setSubmitting(true);
    const result = await saveAddress({
      label,
      details,
      latitude: regiao.latitude,
      longitude: regiao.longitude,
    });
    setSubmitting(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    finishFlow();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={finishFlow}>
          <Ionicons name="close" size={22} color={ui.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t('address.title')}</Text>
          <Text style={styles.subtitle}>
            {user
              ? t('address.whereDeliverNamed', { name: user.nome })
              : t('address.whereDeliver')}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.mapWrapper}>
          <MapView
            ref={mapRef}
            style={styles.map}
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
            initialRegion={regiao}
            onPress={(event) => handleMapPress(event.nativeEvent.coordinate)}
            showsUserLocation
          >
            <Marker
              coordinate={{ latitude: regiao.latitude, longitude: regiao.longitude }}
              draggable
              onDragEnd={(event) => handleMapPress(event.nativeEvent.coordinate)}
            />
          </MapView>
          <TouchableOpacity
            style={[styles.gpsButton, buscandoLocalizacao && styles.disabled]}
            onPress={buscarLocalizacaoAtual}
            disabled={buscandoLocalizacao}
          >
            {buscandoLocalizacao
              ? <RippleWaveLoader size="small" color={ui.brand} />
              : <Ionicons name="locate" size={22} color={ui.brand} />}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.form}
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.hint}>{t('address.mapHint')}</Text>
          {!!enderecoDoMapa && <Text style={styles.resolved}>{enderecoDoMapa}</Text>}

          <Text style={styles.label}>{t('address.saveAs')}</Text>
          <View style={styles.selectorRow}>
            {labelOptions.map((item) => (
              <TouchableOpacity
                key={item}
                style={[styles.selectBtn, label === item && styles.selectBtnActive]}
                onPress={() => setLabel(item)}
              >
                <Text style={[styles.selectBtnText, label === item && styles.selectBtnTextActive]}>
                  {item}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>{t('address.neighborhood')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('address.neighborhoodPlaceholder')}
            placeholderTextColor={ui.muted}
            value={bairro}
            onChangeText={setBairro}
          />

          <Text style={styles.label}>{t('address.houseDescription')}</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder={t('address.housePlaceholder')}
            placeholderTextColor={ui.muted}
            value={descricao}
            onChangeText={setDescricao}
            multiline
          />

          {!!error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.primaryBtn, submitting && styles.disabled]}
            onPress={handleSalvar}
            disabled={submitting}
          >
            {submitting ? (
              <RippleWaveLoader size="small" color="#FFF" />
            ) : (
              <Text style={styles.primaryBtnText}>{t('address.save')}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.skipBtn} onPress={finishFlow}>
            <Text style={styles.skipText}>{t('address.later')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(ui: AppUI) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: ui.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: ui.card,
      borderWidth: 1,
      borderColor: ui.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { fontSize: 20, fontWeight: '900', color: ui.text },
    subtitle: { fontSize: 13, color: ui.muted, marginTop: 2 },
    mapWrapper: { width: '100%', height: height * 0.32, position: 'relative' },
    map: { width: '100%', height: '100%' },
    gpsButton: {
      position: 'absolute',
      bottom: 16,
      right: 16,
      backgroundColor: ui.card,
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 3,
    },
    form: { flex: 1, paddingHorizontal: 16, paddingTop: 14 },
    hint: { fontSize: 12, color: ui.muted, marginBottom: 8 },
    resolved: {
      fontSize: 13,
      color: ui.brand,
      fontWeight: '600',
      backgroundColor: ui.brandSoft,
      borderRadius: 10,
      padding: 10,
      marginBottom: 12,
    },
    label: { fontSize: 13, fontWeight: '600', color: ui.text, marginBottom: 8 },
    selectorRow: { flexDirection: 'row', marginBottom: 14, gap: 8 },
    selectBtn: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: ui.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: ui.border,
    },
    selectBtnActive: { backgroundColor: ui.brandSoft, borderColor: ui.brand },
    selectBtnText: { fontSize: 13, color: ui.muted, fontWeight: '600' },
    selectBtnTextActive: { color: ui.brand },
    input: {
      backgroundColor: ui.card,
      borderWidth: 1,
      borderColor: ui.border,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: ui.text,
      marginBottom: 14,
    },
    multiline: { minHeight: 80, textAlignVertical: 'top' },
    error: {
      color: ui.danger,
      fontSize: 13,
      marginBottom: 12,
      backgroundColor: ui.dangerSoft,
      padding: 10,
      borderRadius: 10,
    },
    primaryBtn: {
      backgroundColor: ui.brand,
      height: 52,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
    disabled: { opacity: 0.7 },
    skipBtn: { alignItems: 'center', marginTop: 16 },
    skipText: { color: ui.muted, fontSize: 14, fontWeight: '600' },
  });
}
