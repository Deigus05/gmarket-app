import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnnounceStepIndicator } from '@/components/AnnounceStepIndicator';
import { KeyboardFormScrollView } from '@/components/KeyboardFormScrollView';
import { useAuth } from '@/components/AuthContext';
import { PropertyMapPickerModal } from '@/components/PropertyMapPickerModal';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import { StepPageTransition } from '@/components/StepPageTransition';
import {
  createProperty,
  getGbLocations,
  getMyPropertyQuota,
  getPropertyTypes,
  GbRegion,
  PropertyAttribute,
  PropertyRoom,
  PropertyType,
} from '@/components/api';
import { useLocale } from '@/components/LocaleContext';
import { useAppTheme, type AppUI } from '@/components/tema';
import { propertyPriceFieldLabel } from '@/constants/propertyDisplay';
import { compressImagesForUpload } from '@/lib/imageOptimization';
import {
  FALLBACK_GB_REGIONS,
  FALLBACK_PROPERTY_TYPES,
  PROPERTY_PURPOSES,
  RENTAL_PERIODS,
} from '@/constants/propertySchema';
import type { PropertyRentalPeriod } from '@/components/api';

const STEP_COUNT = 6;

export default function AnunciarImovelScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const { ui } = useAppTheme();
  const styles = useMemo(() => createStyles(ui), [ui]);
  const { isLoggedIn, token, user, loading: authLoading } = useAuth();
  const loginRequestedRef = useRef(false);

  const steps = useMemo(
    () => [
      t('announce.stepType'),
      t('announce.stepGeneral'),
      t('announce.stepLocation'),
      t('announce.stepGallery'),
      t('announce.stepDetails'),
      t('announce.stepContact'),
    ],
    [t],
  );

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [types, setTypes] = useState<PropertyType[]>(FALLBACK_PROPERTY_TYPES);
  const [regions, setRegions] = useState<GbRegion[]>(FALLBACK_GB_REGIONS as GbRegion[]);
  const [submitting, setSubmitting] = useState(false);
  const [quotaLabel, setQuotaLabel] = useState('');

  const [subcategory, setSubcategory] = useState('casa');
  const [purpose, setPurpose] = useState('arrendamento');
  const [rentalPeriod, setRentalPeriod] = useState<PropertyRentalPeriod>('mensal');
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [negotiable, setNegotiable] = useState(false);
  const [description, setDescription] = useState('');

  const [region, setRegion] = useState('Bissau');
  const [sector, setSector] = useState('');
  const [bairro, setBairro] = useState('');
  const [tabanca, setTabanca] = useState('');
  const [rua, setRua] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [showOnMap, setShowOnMap] = useState(true);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [hasMapPin, setHasMapPin] = useState(false);

  const [photos, setPhotos] = useState<string[]>([]);
  const [compressingMedia, setCompressingMedia] = useState(false);
  const [videos, setVideos] = useState<string[]>([]);
  const [virtualTour, setVirtualTour] = useState('');

  const [attrValues, setAttrValues] = useState<Record<string, string | boolean>>({});
  const [rooms, setRooms] = useState<PropertyRoom[]>([]);

  const [ownerName, setOwnerName] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');

  const selectedType = useMemo(
    () => types.find((t) => t.slug === subcategory) || types[0],
    [types, subcategory],
  );

  const sectorOptions = useMemo(() => {
    const match = regions.find((r) => r.name === region || r.slug === region.toLowerCase());
    return match?.sectors || [];
  }, [regions, region]);

  useEffect(() => {
    if (authLoading) return;
    if (isLoggedIn) {
      loginRequestedRef.current = false;
      return;
    }
    if (loginRequestedRef.current) return;
    loginRequestedRef.current = true;
    router.push({ pathname: '/login', params: { redirect: '/anunciar-imovel' } });
  }, [authLoading, isLoggedIn, router]);

  useEffect(() => {
    async function boot() {
      const [remoteTypes, remoteRegions] = await Promise.all([getPropertyTypes(), getGbLocations()]);
      if (remoteTypes.length) setTypes(remoteTypes);
      if (remoteRegions.length) {
        setRegions(remoteRegions);
        setRegion(remoteRegions[0]?.name || 'Bissau');
      }
      if (token) {
        const quota = await getMyPropertyQuota(token);
        if (quota) {
          setQuotaLabel(
            quota.unlimited
              ? t('announce.agencyUnlimited')
              : t('announce.quotaUsed', { used: quota.count, max: quota.limit }),
          );
        }
      }
      if (user) {
        setOwnerName(`${user.nome} ${user.apelido}`.trim());
        setPhone(user.telefone || '');
        setWhatsapp(user.telefone || '');
        if (user.agency?.nome) setAgencyName(user.agency.nome);
      }
    }
    boot();
  }, [token, user, t]);

  const setAttr = (key: string, value: string | boolean) => {
    setAttrValues((prev) => ({ ...prev, [key]: value }));
  };

  const pickPhotos = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('profile.pushPermissionTitle'), t('announce.permPhotos'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      // Lightweight pick; final resize/JPEG happens in compressImagesForUpload.
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.length) {
      setCompressingMedia(true);
      try {
        const compressed = await compressImagesForUpload(result.assets.map((a) => a.uri));
        setPhotos((prev) => [...prev, ...compressed]);
      } finally {
        setCompressingMedia(false);
      }
    }
  };

  const pickVideos = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('profile.pushPermissionTitle'), t('announce.permVideos'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsMultipleSelection: true,
      // Cap duration/quality for weak mobile networks (Guiné-Bissau).
      videoMaxDuration: 30,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    });
    if (!result.canceled && result.assets?.length) {
      setVideos((prev) => [...prev, ...result.assets.map((a) => a.uri)]);
    }
  };

  const addRoom = () => {
    setRooms((prev) => [
      ...prev,
      { name: `Quarto ${prev.length + 1}`, price_per_night: 0, guests: 2, beds: 1, bathrooms: 1, available: true },
    ]);
  };

  const updateRoom = (index: number, patch: Partial<PropertyRoom>) => {
    setRooms((prev) => prev.map((room, i) => (i === index ? { ...room, ...patch } : room)));
  };

  const validateStep = (): boolean => {
    if (step === 0 && !subcategory) {
      Alert.alert(t('announce.pickSubcategory'));
      return false;
    }
    if (step === 0 && purpose === 'arrendamento' && !rentalPeriod) {
      Alert.alert(t('announce.rentalTypeTitle'), t('announce.rentalTypePick'));
      return false;
    }
    if (step === 1) {
      if (!title.trim() || !price.trim()) {
        Alert.alert(t('announce.missingFields'), t('announce.fillTitlePrice'));
        return false;
      }
    }
    if (step === 2) {
      if (!region.trim() || !bairro.trim()) {
        Alert.alert(t('announce.missingFields'), t('announce.fillRegion'));
        return false;
      }
      if (showOnMap && (!hasMapPin || latitude == null || longitude == null)) {
        Alert.alert(t('announce.mapRequiredTitle'), t('announce.mapRequiredMessage'));
        return false;
      }
    }
    if (step === 3 && photos.length === 0) {
      Alert.alert(t('announce.photosMissing'), t('announce.photosNeedOne'));
      return false;
    }
    if (step === 4) {
      const required = (selectedType?.attributes || []).filter((a) => a.required);
      for (const attr of required) {
        const value = attrValues[attr.key];
        if (value === undefined || value === '' || value === false) {
          if (attr.input_type === 'boolean') continue;
          Alert.alert(t('announce.requiredField'), t('announce.fillField', { field: attr.label }));
          return false;
        }
      }
    }
    if (step === 5) {
      if (!ownerName.trim() || !phone.trim()) {
        Alert.alert(t('announce.contactTitle'), t('announce.contactNeed'));
        return false;
      }
    }
    return true;
  };

  const goNext = () => {
    if (!validateStep()) return;
    if (step < STEP_COUNT - 1) {
      setDirection(1);
      setStep(step + 1);
    } else {
      publish();
    }
  };

  const goPrev = () => {
    if (step === 0) {
      router.back();
      return;
    }
    setDirection(-1);
    setStep((prev) => Math.max(prev - 1, 0));
  };

  const publish = async () => {
    if (!token) {
      if (!loginRequestedRef.current) {
        loginRequestedRef.current = true;
        router.push({ pathname: '/login', params: { redirect: '/anunciar-imovel' } });
      }
      return;
    }
    setSubmitting(true);
    try {
      const attributes = Object.entries(attrValues).map(([key, value]) => ({ key, value }));
      const result = await createProperty(token, {
        fields: {
          title: title.trim(),
          subcategory_slug: subcategory,
          purpose,
          rental_period: purpose === 'arrendamento' ? rentalPeriod : '',
          price: Number(price) || 0,
          negotiable,
          description: description.trim(),
          country: 'Guiné-Bissau',
          region,
          sector,
          bairro: bairro.trim(),
          tabanca: tabanca.trim(),
          rua: rua.trim(),
          referencia: '',
          latitude: showOnMap && latitude != null ? latitude : '',
          longitude: showOnMap && longitude != null ? longitude : '',
          show_on_map: showOnMap,
          virtual_tour_url: virtualTour.trim(),
          owner_name: ownerName.trim(),
          agency_name: agencyName.trim(),
          phone: phone.trim(),
          whatsapp: (whatsapp || phone).trim(),
          email: email.trim(),
          status: 'disponivel',
          is_visible: true,
        },
        attributes,
        rooms: subcategory === 'hotel' ? rooms : [],
        imageUris: photos.slice(0, 10),
        videoUris: videos.slice(0, 1),
      });

      if (!result.success) {
        Alert.alert(t('announce.publishFail'), result.message);
        return;
      }

      Alert.alert(t('announce.publishedTitle'), t('announce.publishedMessage'), [
        {
          text: t('announce.viewListing'),
          onPress: () =>
            router.replace({ pathname: '/propertyDetail', params: { id: result.data.id } }),
        },
        {
          text: t('announce.viewFeed'),
          onPress: () => router.replace('/(tabs)/imoveis'),
        },
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  const renderAttrField = (attr: PropertyAttribute) => {
    if (attr.input_type === 'boolean') {
      return (
        <View key={attr.key} style={styles.switchRow}>
          <Text style={styles.label}>{attr.label}</Text>
          <Switch
            value={Boolean(attrValues[attr.key])}
            onValueChange={(v) => setAttr(attr.key, v)}
            trackColor={{ true: ui.brand }}
          />
        </View>
      );
    }
    if (attr.input_type === 'select') {
      return (
        <View key={attr.key} style={{ marginBottom: 10 }}>
          <Text style={styles.label}>{attr.label}{attr.required ? ' *' : ''}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {attr.options.map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[styles.chip, attrValues[attr.key] === opt && styles.chipActive]}
                onPress={() => setAttr(attr.key, opt)}
              >
                <Text style={[styles.chipText, attrValues[attr.key] === opt && styles.chipTextActive]}>{opt}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      );
    }
    return (
      <View key={attr.key} style={{ marginBottom: 10 }}>
        <Text style={styles.label}>
          {attr.label}
          {attr.unit ? ` (${attr.unit})` : ''}
          {attr.required ? ' *' : ''}
        </Text>
        <TextInput
          style={styles.input}
          value={String(attrValues[attr.key] ?? '')}
          onChangeText={(text) => setAttr(attr.key, text)}
          keyboardType={attr.input_type === 'number' ? 'numeric' : 'default'}
          placeholder={attr.label}
        />
      </View>
    );
  };

  const infoAttrs = (selectedType?.attributes || []).filter((a) => a.attr_group === 'info');
  const amenityAttrs = (selectedType?.attributes || []).filter((a) =>
    a.attr_group === 'amenity' || a.attr_group === 'structure' || a.attr_group === 'service',
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goPrev}>
          <Ionicons name="arrow-back" size={22} color={ui.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>{t('announce.title')}</Text>
          {!!quotaLabel && <Text style={styles.quota}>{quotaLabel}</Text>}
        </View>
      </View>

      <AnnounceStepIndicator currentStep={step} steps={steps} ui={ui} />

      <StepPageTransition step={step} direction={direction}>
        <KeyboardFormScrollView
          style={styles.pageScroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {step === 0 && (
          <>
            <Text style={styles.section}>{t('announce.subcategory')}</Text>
            <View style={styles.wrap}>
              {types.map((type) => (
                <TouchableOpacity
                  key={type.slug}
                  style={[styles.chip, subcategory === type.slug && styles.chipActive]}
                  onPress={() => {
                    setSubcategory(type.slug);
                    setAttrValues({});
                    setRooms([]);
                  }}
                >
                  <Text style={[styles.chipText, subcategory === type.slug && styles.chipTextActive]}>{type.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.section}>{t('announce.purpose')}</Text>
            <View style={styles.wrap}>
              {PROPERTY_PURPOSES.map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.chip, purpose === item.key && styles.chipActive]}
                  onPress={() => {
                    setPurpose(item.key);
                    if (item.key === 'arrendamento' && !rentalPeriod) {
                      setRentalPeriod('mensal');
                    }
                  }}
                >
                  <Text style={[styles.chipText, purpose === item.key && styles.chipTextActive]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {purpose === 'arrendamento' && (
              <>
                <Text style={styles.section}>{t('announce.rentalType')}</Text>
                <View style={styles.wrap}>
                  {RENTAL_PERIODS.map((item) => (
                    <TouchableOpacity
                      key={item.key}
                      style={[styles.chip, rentalPeriod === item.key && styles.chipActive]}
                      onPress={() => setRentalPeriod(item.key)}
                    >
                      <Text style={[styles.chipText, rentalPeriod === item.key && styles.chipTextActive]}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <Text style={styles.label}>{t('announce.listingTitle')}</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder={t('announce.titlePlaceholder')} />
            <Text style={styles.label}>{propertyPriceFieldLabel(purpose, rentalPeriod)} *</Text>
            <TextInput style={styles.input} value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="0" />
            <View style={styles.switchRow}>
              <Text style={styles.label}>{t('announce.negotiable')}</Text>
              <Switch value={negotiable} onValueChange={setNegotiable} trackColor={{ true: ui.brand }} />
            </View>
            <Text style={styles.label}>{t('announce.fullDescription')}</Text>
            <TextInput
              style={[styles.input, { minHeight: 110, textAlignVertical: 'top' }]}
              value={description}
              onChangeText={setDescription}
              multiline
              placeholder={t('announce.descriptionPlaceholder')}
            />
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.label}>{t('announce.country')}</Text>
            <TextInput style={[styles.input, styles.inputDisabled]} editable={false} value="Guiné-Bissau" />
            <Text style={styles.label}>{t('announce.region')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              {regions.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  style={[styles.chip, region === r.name && styles.chipActive]}
                  onPress={() => {
                    setRegion(r.name);
                    setSector(r.sectors[0]?.name || '');
                  }}
                >
                  <Text style={[styles.chipText, region === r.name && styles.chipTextActive]}>{r.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {!!sectorOptions.length && (
              <>
                <Text style={styles.label}>{t('announce.sector')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  {sectorOptions.map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.chip, sector === s.name && styles.chipActive]}
                      onPress={() => setSector(s.name)}
                    >
                      <Text style={[styles.chipText, sector === s.name && styles.chipTextActive]}>{s.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}
            <Text style={styles.label}>{t('announce.neighborhood')}</Text>
            <TextInput style={styles.input} value={bairro} onChangeText={setBairro} placeholder={t('announce.neighborhoodPlaceholder')} />
            <Text style={styles.label}>{t('announce.tabanca')}</Text>
            <TextInput style={styles.input} value={tabanca} onChangeText={setTabanca} />
            <Text style={styles.label}>{t('announce.street')}</Text>
            <TextInput style={styles.input} value={rua} onChangeText={setRua} />

            <View style={styles.switchRow}>
              <Text style={styles.label}>{t('announce.showOnMap')}</Text>
              <Switch
                value={showOnMap}
                onValueChange={(value) => {
                  setShowOnMap(value);
                  if (!value) {
                    setHasMapPin(false);
                  }
                }}
                trackColor={{ true: ui.brand }}
              />
            </View>

            {showOnMap ? (
              <TouchableOpacity
                style={styles.mapPickBtn}
                onPress={() => setMapPickerOpen(true)}
                activeOpacity={0.85}
              >
                <View style={styles.mapPickIcon}>
                  <Ionicons name="map-outline" size={22} color={ui.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.mapPickTitle}>
                    {hasMapPin ? t('announce.locationMarked') : t('announce.markOnMap')}
                  </Text>
                  <Text style={styles.mapPickSubtitle}>
                    {hasMapPin && latitude != null && longitude != null
                      ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
                      : t('announce.mapPickHint')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={ui.muted} />
              </TouchableOpacity>
            ) : null}
          </>
        )}

        {step === 3 && (
          <>
            <Text style={styles.section}>{t('announce.photos', { count: photos.length })}</Text>
            <Text style={styles.hint}>{t('announce.photosHint')}</Text>
            {compressingMedia ? (
              <View style={styles.compressRow}>
                <RippleWaveLoader color={ui.brand} />
                <Text style={styles.hint}>{t('announce.optimizing')}</Text>
              </View>
            ) : null}
            <View style={styles.photoGrid}>
              {photos.map((uri) => (
                <View key={uri} style={styles.photoTile}>
                  <Image source={{ uri }} style={styles.photo} />
                  <TouchableOpacity style={styles.removeBtn} onPress={() => setPhotos((p) => p.filter((x) => x !== uri))}>
                    <Ionicons name="close-circle" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                style={[styles.addTile, compressingMedia && { opacity: 0.5 }]}
                onPress={pickPhotos}
                disabled={compressingMedia}
              >
                <Ionicons name="images-outline" size={24} color={ui.brand} />
                <Text style={styles.addTileText}>{t('announce.photosLabel')}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.section}>{t('announce.videos', { count: videos.length })}</Text>
            <TouchableOpacity style={styles.secondaryBtn} onPress={pickVideos}>
              <Ionicons name="videocam-outline" size={18} color={ui.brand} />
              <Text style={styles.secondaryBtnText}>{t('announce.addVideo')}</Text>
            </TouchableOpacity>
            {videos.map((uri) => (
              <Text key={uri} style={styles.videoUri} numberOfLines={1}>{uri}</Text>
            ))}
            <Text style={styles.label}>{t('announce.virtualTour')}</Text>
            <TextInput style={styles.input} value={virtualTour} onChangeText={setVirtualTour} placeholder="https://..." autoCapitalize="none" />
          </>
        )}

        {step === 4 && (
          <>
            <Text style={styles.section}>{t('announce.infoFor', { type: selectedType?.name })}</Text>
            {infoAttrs.map(renderAttrField)}
            {!!amenityAttrs.length && (
              <>
                <Text style={styles.section}>{t('announce.amenities')}</Text>
                {amenityAttrs.map(renderAttrField)}
              </>
            )}
            {subcategory === 'hotel' && (
              <>
                <Text style={styles.section}>{t('announce.roomTypes')}</Text>
                {rooms.map((room, index) => (
                  <View key={`room-${index}`} style={styles.roomCard}>
                    <TextInput
                      style={styles.input}
                      value={room.name}
                      onChangeText={(text) => updateRoom(index, { name: text })}
                      placeholder={t('announce.roomName')}
                    />
                    <View style={styles.row}>
                      <TextInput
                        style={[styles.input, { flex: 1 }]}
                        value={String(room.price_per_night || '')}
                        onChangeText={(text) => updateRoom(index, { price_per_night: Number(text) || 0 })}
                        keyboardType="numeric"
                        placeholder={t('announce.priceNight')}
                      />
                      <View style={{ width: 8 }} />
                      <TextInput
                        style={[styles.input, { flex: 1 }]}
                        value={String(room.guests || '')}
                        onChangeText={(text) => updateRoom(index, { guests: Number(text) || 1 })}
                        keyboardType="numeric"
                        placeholder={t('announce.guests')}
                      />
                    </View>
                    <View style={styles.row}>
                      <TextInput
                        style={[styles.input, { flex: 1 }]}
                        value={String(room.beds || '')}
                        onChangeText={(text) => updateRoom(index, { beds: Number(text) || 0 })}
                        keyboardType="numeric"
                        placeholder={t('announce.beds')}
                      />
                      <View style={{ width: 8 }} />
                      <TextInput
                        style={[styles.input, { flex: 1 }]}
                        value={String(room.bathrooms || '')}
                        onChangeText={(text) => updateRoom(index, { bathrooms: Number(text) || 0 })}
                        keyboardType="numeric"
                        placeholder={t('announce.bathrooms')}
                      />
                    </View>
                  </View>
                ))}
                <TouchableOpacity style={styles.secondaryBtn} onPress={addRoom}>
                  <Ionicons name="add" size={18} color={ui.brand} />
                  <Text style={styles.secondaryBtnText}>{t('announce.addRoomType')}</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}

        {step === 5 && (
          <>
            <Text style={styles.label}>{t('announce.owner')}</Text>
            <TextInput style={styles.input} value={ownerName} onChangeText={setOwnerName} />
            <Text style={styles.label}>{t('announce.agency')}</Text>
            <TextInput style={styles.input} value={agencyName} onChangeText={setAgencyName} />
            <Text style={styles.label}>{t('announce.phone')}</Text>
            <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <Text style={styles.label}>{t('announce.whatsapp')}</Text>
            <TextInput style={styles.input} value={whatsapp} onChangeText={setWhatsapp} keyboardType="phone-pad" />
            <Text style={styles.label}>{t('announce.email')}</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          </>
          )}
        </KeyboardFormScrollView>
      </StepPageTransition>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.footerRow}>
          {step > 0 ? (
            <TouchableOpacity
              style={styles.secondaryNavBtn}
              onPress={goPrev}
              disabled={submitting || compressingMedia}
            >
              <Text style={styles.secondaryNavBtnText}>{t('announce.previous')}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={goNext}
            disabled={submitting || compressingMedia}
          >
            {submitting || compressingMedia ? (
              <View style={styles.publishingRow}>
                <RippleWaveLoader size="small" color="#fff" />
                <Text style={styles.primaryBtnText}>
                  {compressingMedia ? t('announce.optimizing') : t('announce.publishing')}
                </Text>
              </View>
            ) : (
              <Text style={styles.primaryBtnText}>
                {step === STEP_COUNT - 1 ? t('announce.publish') : t('announce.continue')}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <PropertyMapPickerModal
        visible={mapPickerOpen}
        initial={
          hasMapPin && latitude != null && longitude != null
            ? { latitude, longitude }
            : null
        }
        onClose={() => setMapPickerOpen(false)}
        onConfirm={(coordinate) => {
          setLatitude(coordinate.latitude);
          setLongitude(coordinate.longitude);
          setHasMapPin(true);
          setShowOnMap(true);
          setMapPickerOpen(false);
        }}
      />
    </View>
  );
}

function createStyles(ui: AppUI) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: ui.bg },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 8 },
    headerTitle: { fontSize: 18, fontWeight: '800', color: ui.text },
    quota: { fontSize: 11, color: ui.brand, marginTop: 2, fontWeight: '600' },
    pageScroll: { flex: 1 },
    content: { paddingHorizontal: 16, paddingBottom: 120 },
    section: { fontSize: 15, fontWeight: '800', color: ui.text, marginTop: 8, marginBottom: 10 },
    hint: { fontSize: 12, color: ui.muted, marginBottom: 10, lineHeight: 17 },
    compressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    label: { fontSize: 12, fontWeight: '700', color: ui.text, marginBottom: 6 },
    input: { backgroundColor: ui.input, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, marginBottom: 10, color: ui.text },
    inputDisabled: { color: ui.muted },
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: ui.input, marginRight: 6, marginBottom: 6 },
    chipActive: { backgroundColor: ui.brand },
    chipText: { fontSize: 12, color: ui.muted, fontWeight: '600' },
    chipTextActive: { color: '#FFF' },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    mapPickBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: ui.brandSoft,
      borderRadius: 14,
      padding: 14,
      marginBottom: 12,
      borderWidth: 1.5,
      borderColor: ui.brand,
    },
    mapPickIcon: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: ui.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mapPickTitle: { fontSize: 14, fontWeight: '800', color: ui.text },
    mapPickSubtitle: { fontSize: 12, color: ui.muted, marginTop: 2, lineHeight: 16 },
    row: { flexDirection: 'row', alignItems: 'center' },
    photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    photoTile: { width: 96, height: 96, borderRadius: 10, overflow: 'hidden' },
    photo: { width: '100%', height: '100%' },
    removeBtn: { position: 'absolute', top: 4, right: 4 },
    addTile: { width: 96, height: 96, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: ui.brand, alignItems: 'center', justifyContent: 'center', backgroundColor: ui.brandSoft },
    addTileText: { fontSize: 11, fontWeight: '700', color: ui.brand, marginTop: 4 },
    secondaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, marginBottom: 10 },
    secondaryBtnText: { color: ui.brand, fontWeight: '700' },
    videoUri: { fontSize: 11, color: ui.muted, marginBottom: 4 },
    roomCard: { backgroundColor: ui.input, borderRadius: 12, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: ui.border },
    footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, backgroundColor: ui.bg, borderTopWidth: 1, borderTopColor: ui.border },
    footerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    secondaryNavBtn: {
      flex: 1,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: 'center',
      backgroundColor: ui.brand,
    },
    secondaryNavBtnText: { color: ui.onBrand, fontWeight: '800', fontSize: 14 },
    primaryBtn: { flex: 1, backgroundColor: ui.brand, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
    primaryBtnText: { color: ui.onBrand, fontWeight: '800' },
    publishingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  });
}
