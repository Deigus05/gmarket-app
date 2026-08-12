// components/LocalizacaoModal.tsx
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/components/LocaleContext';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import SafeMapView from '@/components/SafeMapView';
import { useAppTheme, type AppUI } from '@/components/tema';
import { getSavedAddresses, setSavedAddresses } from '@/lib/savedAddresses';

const { height } = Dimensions.get('window');

/** MapView nativo dentro de Modal + New Arch crasha em vários Androids. */
const USE_NATIVE_MAP = Platform.OS !== 'android';

type SavedAddress = { id: string; label: string; details: string };

type Coordinate = {
  latitude: number;
  longitude: number;
};

const BISSAU_REGION = {
  latitude: 11.8632,
  longitude: -15.5841,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
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

interface LocalizacaoModalProps {
  visivel: boolean;
  onFechar: () => void;
  onSelecionarEndereco: (endereco: string) => void;
}

export default function LocalizacaoModal({ visivel, onFechar, onSelecionarEndereco }: LocalizacaoModalProps) {
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const { ui } = useAppTheme();
  const styles = useMemo(() => createStyles(ui), [ui]);

  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [telaAtual, setTelaAtual] = useState<'lista' | 'mapa'>('lista');
  const [buscandoLocalizacao, setBuscandoLocalizacao] = useState(false);
  const [enderecoDoMapa, setEnderecoDoMapa] = useState('');
  const mapRef = useRef<MapView>(null);

  const labelOptions = [t('common.home'), t('common.work'), t('common.other')];
  const [label, setLabel] = useState(t('common.other'));
  const [bairro, setBairro] = useState('');
  const [descricao, setDescricao] = useState('');
  const [regiao, setRegion] = useState(BISSAU_REGION);

  useEffect(() => {
    if (visivel) return;
    setTelaAtual('lista');
    setBuscandoLocalizacao(false);
    setEnderecoDoMapa('');
  }, [visivel]);

  useEffect(() => {
    if (!visivel) return;
    let cancelled = false;
    (async () => {
      try {
        const parsed = await getSavedAddresses();
        if (cancelled || !parsed.length) return;
        setAddresses(
          parsed.filter(
            (item): item is SavedAddress =>
              !!item &&
              typeof item.id === 'string' &&
              typeof item.label === 'string' &&
              typeof item.details === 'string',
          ),
        );
      } catch {
        // ignore corrupt cache
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visivel]);

  const persistAddresses = async (next: SavedAddress[]) => {
    setAddresses(next);
    try {
      await setSavedAddresses(next);
    } catch (error) {
      console.log('Erro ao guardar endereços:', error);
    }
  };

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

  const buscarLocalizacaoAtual = async (selecionarAoEncontrar = false) => {
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
          t('locationModal.permMessage'),
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
      const address = await reverseGeocode(coordinate);
      const nextRegion = { ...coordinate, latitudeDelta: 0.01, longitudeDelta: 0.01 };

      setRegion(nextRegion);
      if (USE_NATIVE_MAP) {
        mapRef.current?.animateToRegion(nextRegion, 600);
      }

      if (selecionarAoEncontrar) {
        onSelecionarEndereco(t('locationModal.currentPrefix', { label: address }));
        onFechar();
      }
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

  const handleSalvarEndereco = () => {
    if (!bairro.trim() || !descricao.trim()) {
      Alert.alert(t('locationModal.fillError'));
      return;
    }

    const details = [
      bairro.trim(),
      descricao.trim(),
      enderecoDoMapa || 'Bissau',
    ].filter(Boolean).join(', ');

    const novoEnd: SavedAddress = {
      id: String(Date.now()),
      label,
      details,
    };

    void persistAddresses([novoEnd, ...addresses]);
    onSelecionarEndereco(`${novoEnd.label}: ${novoEnd.details}`);
    setTelaAtual('lista');
    setBairro('');
    setDescricao('');
    setEnderecoDoMapa('');
    onFechar();
  };

  const handleClose = () => {
    setTelaAtual('lista');
    onFechar();
  };

  return (
    <Modal
      visible={visivel}
      animationType="slide"
      transparent={false}
      onRequestClose={handleClose}
      statusBarTranslucent={Platform.OS === 'android'}
    >
      <View style={[styles.modalContainer, { paddingTop: Math.max(insets.top, 16) }]}>

        {telaAtual === 'lista' && (
          <View style={{ flex: 1 }}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={handleClose} hitSlop={12}>
                <Ionicons name="close" size={24} color={ui.text} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{t('locationModal.title')}</Text>
              <View style={{ width: 24 }} />
            </View>

            <FlatList
              data={addresses}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
              ListHeaderComponent={(
                <TouchableOpacity
                  style={[styles.currentLocationButton, buscandoLocalizacao && styles.disabledButton]}
                  onPress={() => void buscarLocalizacaoAtual(true)}
                  disabled={buscandoLocalizacao}
                >
                  {buscandoLocalizacao
                    ? <RippleWaveLoader size="small" color={ui.brand} />
                    : <Ionicons name="locate" size={20} color={ui.brand} />}
                  <Text style={styles.currentLocationButtonText}>
                    {buscandoLocalizacao ? t('locationModal.locating') : t('locationModal.useCurrent')}
                  </Text>
                </TouchableOpacity>
              )}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.addressCard}
                  onPress={() => {
                    onSelecionarEndereco(`${item.label}: ${item.details}`);
                    handleClose();
                  }}
                >
                  <Ionicons name={item.label === t('common.home') ? 'home-outline' : item.label === t('common.work') ? 'briefcase-outline' : 'location-outline'} size={20} color={ui.brand} />
                  <View style={styles.addressInfo}>
                    <Text style={styles.addressLabel}>{item.label}</Text>
                    <Text style={styles.addressDetails} numberOfLines={2}>{item.details}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={ui.muted} />
                </TouchableOpacity>
              )}
            />

            <TouchableOpacity
              style={[styles.addAddressButton, { marginBottom: Math.max(insets.bottom, 16) }]}
              onPress={() => setTelaAtual('mapa')}
            >
              <Ionicons name="add-circle-outline" size={20} color="#FFF" />
              <Text style={styles.addAddressButtonText}>{t('locationModal.addNew')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {telaAtual === 'mapa' && (
          <View style={{ flex: 1 }}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setTelaAtual('lista')} hitSlop={12}>
                <Ionicons name="arrow-back" size={24} color={ui.text} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>
                {USE_NATIVE_MAP ? t('locationModal.markOnMap') : t('locationModal.addNew')}
              </Text>
              <View style={{ width: 24 }} />
            </View>

            {USE_NATIVE_MAP ? (
              <View style={styles.mapWrapper} collapsable={false}>
                <SafeMapView
                  ref={mapRef}
                  key="localizacao-map"
                  style={styles.map}
                  initialRegion={regiao}
                  onPress={(event) => void handleMapPress(event.nativeEvent.coordinate)}
                  loaderColor={ui.brand}
                >
                  <Marker
                    coordinate={{ latitude: regiao.latitude, longitude: regiao.longitude }}
                    title={t('locationModal.marker')}
                    draggable
                    onDragEnd={(event) => void handleMapPress(event.nativeEvent.coordinate)}
                  />
                </SafeMapView>

                <TouchableOpacity
                  style={[styles.gpsButton, buscandoLocalizacao && styles.disabledButton]}
                  onPress={() => void buscarLocalizacaoAtual()}
                  disabled={buscandoLocalizacao}
                >
                  {buscandoLocalizacao
                    ? <RippleWaveLoader size="small" color={ui.brand} />
                    : <Ionicons name="locate" size={22} color={ui.brand} />}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.formOnlyBanner}>
                <Ionicons name="navigate-circle-outline" size={28} color={ui.brand} />
                <Text style={styles.formOnlyText}>{t('locationModal.formOnlyHint')}</Text>
                <TouchableOpacity
                  style={[styles.currentLocationButton, buscandoLocalizacao && styles.disabledButton, { marginBottom: 0 }]}
                  onPress={() => void buscarLocalizacaoAtual(false)}
                  disabled={buscandoLocalizacao}
                >
                  {buscandoLocalizacao
                    ? <RippleWaveLoader size="small" color={ui.brand} />
                    : <Ionicons name="locate" size={20} color={ui.brand} />}
                  <Text style={styles.currentLocationButtonText}>
                    {buscandoLocalizacao ? t('locationModal.locating') : t('locationModal.useGps')}
                  </Text>
                </TouchableOpacity>
                {!!enderecoDoMapa && (
                  <Text style={styles.resolvedAddress}>
                    {t('locationModal.coordsReady', {
                      lat: regiao.latitude.toFixed(5),
                      lng: regiao.longitude.toFixed(5),
                    })}
                  </Text>
                )}
              </View>
            )}

            <ScrollView
              style={styles.formContainer}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) }}
              keyboardShouldPersistTaps="handled"
            >
              {USE_NATIVE_MAP ? (
                <Text style={styles.mapHint}>{t('locationModal.mapHint')}</Text>
              ) : null}
              {!!enderecoDoMapa ? (
                <Text style={styles.resolvedAddress}>{enderecoDoMapa}</Text>
              ) : null}
              <Text style={styles.label}>{t('locationModal.saveAs')}</Text>
              <View style={styles.selectorRow}>
                {labelOptions.map((l) => (
                  <TouchableOpacity key={l} style={[styles.selectBtn, label === l && styles.selectBtnActive]} onPress={() => setLabel(l)}>
                    <Text style={[styles.selectBtnText, label === l && styles.selectBtnTextActive]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>{t('locationModal.neighborhood')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('address.neighborhoodPlaceholder')}
                placeholderTextColor={ui.muted}
                value={bairro}
                onChangeText={setBairro}
              />

              <Text style={styles.label}>{t('locationModal.houseDescription')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('address.housePlaceholder')}
                placeholderTextColor={ui.muted}
                value={descricao}
                onChangeText={setDescricao}
                multiline
              />

              <TouchableOpacity style={styles.submitButton} onPress={handleSalvarEndereco}>
                <Text style={styles.submitButtonText}>{t('locationModal.confirm')}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

      </View>
    </Modal>
  );
}

function createStyles(ui: AppUI) {
  return StyleSheet.create({
    modalContainer: { flex: 1, backgroundColor: ui.bg },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: ui.border },
    modalTitle: { fontSize: 17, fontWeight: 'bold', color: ui.text },
    addressCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: ui.divider },
    addressInfo: { flex: 1, marginLeft: 12, paddingRight: 8 },
    addressLabel: { fontSize: 14, fontWeight: 'bold', color: ui.text },
    addressDetails: { fontSize: 12, color: ui.muted, marginTop: 2 },
    currentLocationButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: ui.brandSoft, borderRadius: 12, marginBottom: 12, paddingHorizontal: 16 },
    currentLocationButtonText: { color: ui.brand, fontSize: 14, fontWeight: 'bold', marginLeft: 8 },
    disabledButton: { opacity: 0.6 },
    addAddressButton: { flexDirection: 'row', backgroundColor: ui.brand, marginHorizontal: 16, marginTop: 8, padding: 14, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    addAddressButtonText: { color: '#FFF', fontSize: 15, fontWeight: 'bold', marginLeft: 6 },
    mapWrapper: { width: '100%', height: height * 0.35, position: 'relative', backgroundColor: ui.input, overflow: 'hidden' },
    map: { width: '100%', height: '100%' },
    gpsButton: { position: 'absolute', bottom: 16, right: 16, backgroundColor: ui.card, width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3, elevation: 3 },
    formOnlyBanner: {
      marginHorizontal: 16,
      marginTop: 8,
      marginBottom: 4,
      padding: 16,
      borderRadius: 14,
      backgroundColor: ui.brandSoft,
      borderWidth: 1,
      borderColor: ui.border,
      gap: 12,
    },
    formOnlyText: { fontSize: 13, color: ui.text, lineHeight: 19 },
    formContainer: { padding: 16, flex: 1 },
    mapHint: { fontSize: 12, color: ui.muted, marginBottom: 8 },
    resolvedAddress: { fontSize: 13, color: ui.brand, fontWeight: '600', backgroundColor: ui.brandSoft, borderRadius: 8, padding: 10, marginBottom: 8 },
    label: { fontSize: 13, fontWeight: '600', color: ui.text, marginBottom: 6, marginTop: 8 },
    input: { backgroundColor: ui.input, borderRadius: 10, padding: 12, fontSize: 14, color: ui.text, marginBottom: 12 },
    selectorRow: { flexDirection: 'row', marginBottom: 10 },
    selectBtn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: ui.input, borderRadius: 20, marginRight: 8 },
    selectBtnActive: { backgroundColor: ui.brandSoft, borderWidth: 1, borderColor: ui.brand },
    selectBtnText: { fontSize: 13, color: ui.muted },
    selectBtnTextActive: { color: ui.brand, fontWeight: 'bold' },
    submitButton: { backgroundColor: ui.brand, paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 10, marginBottom: 30 },
    submitButtonText: { color: '#FFF', fontSize: 15, fontWeight: 'bold' },
  });
}
