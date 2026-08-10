import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getPropertyById, PropertyStatus, updateProperty } from '@/components/api';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import { useAuth } from '@/components/AuthContext';
import { useLocale } from '@/components/LocaleContext';
import { useAppTheme, type AppUI } from '@/components/tema';
import { propertyPriceFieldLabel } from '@/constants/propertyDisplay';

const STATUS_KEYS: PropertyStatus[] = ['disponivel', 'reservado', 'vendido', 'arrendado'];

export default function EditarImovelScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const { ui } = useAppTheme();
  const styles = useMemo(() => createStyles(ui), [ui]);
  const params = useLocalSearchParams();
  const propertyId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { token, isLoggedIn } = useAuth();

  const statuses = useMemo(
    () =>
      STATUS_KEYS.map((key) => ({
        key,
        label:
          key === 'disponivel'
            ? t('editProperty.available')
            : key === 'reservado'
              ? t('editProperty.reserved')
              : key === 'vendido'
                ? t('editProperty.sold')
                : t('editProperty.rented'),
      })),
    [t],
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [purpose, setPurpose] = useState<string>('arrendamento');
  const [rentalPeriod, setRentalPeriod] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [negotiable, setNegotiable] = useState(false);
  const [status, setStatus] = useState<PropertyStatus>('disponivel');
  const [isVisible, setIsVisible] = useState(true);
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace({ pathname: '/login', params: { redirect: `/editar-imovel?id=${propertyId || ''}` } });
    }
  }, [isLoggedIn, propertyId, router]);

  useEffect(() => {
    async function boot() {
      if (!propertyId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const data = await getPropertyById(String(propertyId), token);
      if (!data) {
        Alert.alert(t('editProperty.title'), t('editProperty.loadFail'), [
          { text: t('common.ok'), onPress: () => router.back() },
        ]);
        setLoading(false);
        return;
      }
      setTitle(data.title || '');
      setPrice(String(data.price ?? ''));
      setDescription(data.description || data.details || '');
      setNegotiable(Boolean(data.negotiable));
      setStatus((data.status as PropertyStatus) || 'disponivel');
      setIsVisible(data.is_visible !== false);
      setOwnerName(data.owner_name || '');
      setPhone(data.phone || '');
      setWhatsapp(data.whatsapp || '');
      setEmail(data.email || '');
      setPurpose(data.purpose || 'arrendamento');
      setRentalPeriod(data.rental_period || null);
      setLoading(false);
    }
    boot();
  }, [propertyId, router, token, t]);

  const save = async () => {
    if (!token || !propertyId) return;
    if (!title.trim() || !price.trim()) {
      Alert.alert(t('editProperty.missingFields'), t('editProperty.fillTitlePrice'));
      return;
    }
    setSaving(true);
    const result = await updateProperty(token, String(propertyId), {
      title: title.trim(),
      price: Number(price) || 0,
      description: description.trim(),
      negotiable,
      status,
      is_visible: isVisible,
      owner_name: ownerName.trim(),
      phone: phone.trim(),
      whatsapp: (whatsapp || phone).trim(),
      email: email.trim(),
    });
    setSaving(false);

    if (!result.success) {
      Alert.alert(t('editProperty.saveFail'), result.message);
      return;
    }

    Alert.alert(t('editProperty.savedTitle'), t('editProperty.savedMessage'), [
      { text: t('common.ok'), onPress: () => router.back() },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <RippleWaveLoader color={ui.brand} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={ui.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('editProperty.title')}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>{t('editProperty.titleLabel')}</Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder={t('editProperty.titleLabel')} placeholderTextColor={ui.muted} />

        <Text style={styles.label}>{propertyPriceFieldLabel(purpose, rentalPeriod)} *</Text>
        <TextInput
          style={styles.input}
          value={price}
          onChangeText={setPrice}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={ui.muted}
        />

        <View style={styles.switchRow}>
          <Text style={styles.label}>{t('editProperty.negotiable')}</Text>
          <Switch value={negotiable} onValueChange={setNegotiable} trackColor={{ true: ui.brand }} />
        </View>

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{t('editProperty.visibleFeed')}</Text>
            <Text style={styles.hint}>{t('editProperty.visibleHint')}</Text>
          </View>
          <Switch value={isVisible} onValueChange={setIsVisible} trackColor={{ true: ui.brand }} />
        </View>

        <Text style={styles.label}>{t('editProperty.status')}</Text>
        <View style={styles.wrap}>
          {statuses.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={[styles.chip, status === item.key && styles.chipActive]}
              onPress={() => setStatus(item.key)}
            >
              <Text style={[styles.chipText, status === item.key && styles.chipTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>{t('editProperty.description')}</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          multiline
          placeholder={t('editProperty.descriptionPlaceholder')}
          placeholderTextColor={ui.muted}
        />

        <Text style={styles.section}>{t('editProperty.contact')}</Text>
        <Text style={styles.label}>{t('editProperty.owner')}</Text>
        <TextInput style={styles.input} value={ownerName} onChangeText={setOwnerName} placeholderTextColor={ui.muted} />
        <Text style={styles.label}>{t('common.phone')}</Text>
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholderTextColor={ui.muted} />
        <Text style={styles.label}>{t('announce.whatsapp')}</Text>
        <TextInput style={styles.input} value={whatsapp} onChangeText={setWhatsapp} keyboardType="phone-pad" placeholderTextColor={ui.muted} />
        <Text style={styles.label}>{t('common.email')}</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholderTextColor={ui.muted}
        />

        <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
          {saving ? (
            <RippleWaveLoader size="small" color="#FFF" />
          ) : (
            <Text style={styles.saveBtnText}>{t('editProperty.save')}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function createStyles(ui: AppUI) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: ui.bg },
    centered: { alignItems: 'center', justifyContent: 'center' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 10,
    },
    headerTitle: { fontSize: 18, fontWeight: '800', color: ui.text },
    content: { paddingHorizontal: 16, paddingBottom: 40 },
    section: {
      fontSize: 13,
      fontWeight: '800',
      color: ui.brand,
      marginTop: 8,
      marginBottom: 8,
      textTransform: 'uppercase',
    },
    label: { fontSize: 13, fontWeight: '600', color: ui.text, marginBottom: 6, marginTop: 10 },
    hint: { fontSize: 11, color: ui.muted, marginTop: 2 },
    input: {
      borderWidth: 1,
      borderColor: ui.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 14,
      color: ui.text,
      backgroundColor: ui.input,
    },
    textArea: { minHeight: 110, textAlignVertical: 'top' },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 12,
      gap: 12,
    },
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: ui.input,
      borderWidth: 1,
      borderColor: ui.border,
    },
    chipActive: { backgroundColor: ui.brand, borderColor: ui.brand },
    chipText: { fontSize: 12, fontWeight: '600', color: ui.muted },
    chipTextActive: { color: '#FFF' },
    saveBtn: {
      marginTop: 24,
      height: 52,
      borderRadius: 14,
      backgroundColor: ui.brand,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  });
}
