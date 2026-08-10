import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getGbLocations, getLiveProperties, GbRegion } from '@/components/api';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import { useLocale } from '@/components/LocaleContext';
import { useAppTheme, type AppUI } from '@/components/tema';
import { propertyPriceFieldLabel } from '@/constants/propertyDisplay';
import {
  BEDROOM_FILTER_OPTIONS,
  FALLBACK_GB_REGIONS,
  PROPERTY_PURPOSES,
  RENTAL_PERIODS,
} from '@/constants/propertySchema';

const SUBCATEGORY_DEFS = [
  { slug: '', key: 'allTypes' as const },
  { slug: 'casa', key: 'house' as const },
  { slug: 'apartamento', key: 'apartment' as const },
  { slug: 'hotel', key: 'hotel' as const },
  { slug: 'espaco-eventos', key: 'eventSpace' as const },
  { slug: 'terreno', key: 'land' as const },
  { slug: 'escritorio', key: 'office' as const },
  { slug: 'loja-comercial', key: 'shop' as const },
  { slug: 'armazem', key: 'warehouse' as const },
];

function paramStr(value: string | string[] | undefined, fallback = ''): string {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

function parseDateParam(value: string): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toDateParam(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDisplayDate(value: string): string {
  const d = parseDateParam(value);
  if (!d) return '';
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function FiltrosImoveisScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const { ui } = useAppTheme();
  const styles = useMemo(() => createStyles(ui), [ui]);
  const params = useLocalSearchParams();

  const subcategories = useMemo(
    () => SUBCATEGORY_DEFS.map((item) => ({ slug: item.slug, label: t(`filters.${item.key}`) })),
    [t],
  );

  const [purpose, setPurpose] = useState(paramStr(params.purpose, ''));
  const [rentalPeriod, setRentalPeriod] = useState(paramStr(params.rental_period, ''));
  const [subcategory, setSubcategory] = useState(paramStr(params.subcategory, ''));
  const [region, setRegion] = useState(paramStr(params.region, ''));
  const [sector, setSector] = useState(paramStr(params.sector, ''));
  const [bedrooms, setBedrooms] = useState(paramStr(params.bedrooms, ''));
  const [minPrice, setMinPrice] = useState(paramStr(params.min_price, ''));
  const [maxPrice, setMaxPrice] = useState(paramStr(params.max_price, ''));
  const [checkIn, setCheckIn] = useState(paramStr(params.check_in, ''));
  const [checkOut, setCheckOut] = useState(paramStr(params.check_out, ''));
  const [regions, setRegions] = useState<GbRegion[]>(FALLBACK_GB_REGIONS as GbRegion[]);
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [pickingField, setPickingField] = useState<'check_in' | 'check_out'>('check_in');
  const [pickerDate, setPickerDate] = useState(new Date());

  const isArrendamento = purpose === 'arrendamento';
  const isDiaria = isArrendamento && rentalPeriod === 'diaria';
  const priceLabel = propertyPriceFieldLabel(purpose || undefined, rentalPeriod || undefined);

  const sectorOptions = useMemo(() => {
    const match = regions.find((r) => r.name === region || r.slug === region.toLowerCase());
    return match?.sectors || [];
  }, [regions, region]);

  const selectedFilters = useMemo(() => {
    const items: string[] = [];
    if (purpose) {
      items.push(PROPERTY_PURPOSES.find((p) => p.key === purpose)?.label || purpose);
    }
    if (isArrendamento && rentalPeriod) {
      items.push(RENTAL_PERIODS.find((p) => p.key === rentalPeriod)?.label || rentalPeriod);
    }
    if (subcategory) {
      items.push(subcategories.find((s) => s.slug === subcategory)?.label || subcategory);
    }
    if (bedrooms) {
      items.push(bedrooms === '5' ? '5+ quartos' : `${bedrooms} quarto${bedrooms === '1' ? '' : 's'}`);
    }
    if (region) items.push(region);
    if (sector) items.push(sector);
    if (isDiaria && checkIn && checkOut) {
      items.push(`${formatDisplayDate(checkIn)} → ${formatDisplayDate(checkOut)}`);
    }
    if (minPrice) items.push(t('filters.minPrice', { price: Number(minPrice).toLocaleString() }));
    if (maxPrice) items.push(t('filters.maxPrice', { price: Number(maxPrice).toLocaleString() }));
    return items;
  }, [purpose, rentalPeriod, isArrendamento, subcategory, subcategories, bedrooms, region, sector, isDiaria, checkIn, checkOut, minPrice, maxPrice, t]);

  useEffect(() => {
    getGbLocations().then((data) => {
      if (data.length) setRegions(data);
    });
  }, []);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setCounting(true);
      const data = await getLiveProperties({
        purpose: purpose || undefined,
        rental_period: isArrendamento && rentalPeriod ? rentalPeriod : undefined,
        subcategory: subcategory || undefined,
        region: region || undefined,
        sector: sector || undefined,
        bedrooms: bedrooms || undefined,
        min_price: minPrice || undefined,
        max_price: maxPrice || undefined,
        check_in: isDiaria ? checkIn || undefined : undefined,
        check_out: isDiaria ? checkOut || undefined : undefined,
        status: 'disponivel',
      });
      if (active) {
        setMatchCount(data.length);
        setCounting(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [purpose, rentalPeriod, isArrendamento, subcategory, region, sector, bedrooms, minPrice, maxPrice, isDiaria, checkIn, checkOut]);

  const clearAll = () => {
    setPurpose('');
    setRentalPeriod('');
    setSubcategory('');
    setRegion('');
    setSector('');
    setBedrooms('');
    setMinPrice('');
    setMaxPrice('');
    setCheckIn('');
    setCheckOut('');
  };

  const selectPurpose = (key: string) => {
    if (purpose === key) {
      setPurpose('');
      setRentalPeriod('');
      setCheckIn('');
      setCheckOut('');
      return;
    }
    setPurpose(key);
    if (key !== 'arrendamento') {
      setRentalPeriod('');
      setCheckIn('');
      setCheckOut('');
    } else if (!rentalPeriod) {
      setRentalPeriod('mensal');
    }
  };

  const selectRentalPeriod = (key: string) => {
    const next = rentalPeriod === key ? '' : key;
    setRentalPeriod(next);
    if (next !== 'diaria') {
      setCheckIn('');
      setCheckOut('');
    }
  };

  const openCalendar = () => {
    setPickingField('check_in');
    setPickerDate(parseDateParam(checkIn) || new Date());
    setCalendarOpen(true);
  };

  const advanceToCheckOut = (selected: Date) => {
    const value = toDateParam(selected);
    setCheckIn(value);
    if (checkOut && parseDateParam(checkOut) && parseDateParam(checkOut)! <= selected) {
      setCheckOut('');
    }
    setPickingField('check_out');
    const nextMin = new Date(selected);
    nextMin.setDate(nextMin.getDate() + 1);
    const existingOut = parseDateParam(checkOut);
    setPickerDate(existingOut && existingOut > selected ? existingOut : nextMin);
  };

  const onPickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      if (event.type === 'dismissed') {
        setCalendarOpen(false);
        return;
      }
      if (!selected) return;
      if (pickingField === 'check_in') {
        setCalendarOpen(false);
        advanceToCheckOut(selected);
        setTimeout(() => setCalendarOpen(true), 250);
        return;
      }
      setCheckOut(toDateParam(selected));
      setCalendarOpen(false);
      return;
    }
    if (selected) setPickerDate(selected);
  };

  const confirmDates = () => {
    if (pickingField === 'check_in') {
      advanceToCheckOut(pickerDate);
      return;
    }
    setCheckOut(toDateParam(pickerDate));
    setCalendarOpen(false);
  };

  const confirm = () => {
    router.replace({
      pathname: '/(tabs)/imoveis',
      params: {
        purpose,
        rental_period: isArrendamento ? rentalPeriod : '',
        subcategory,
        region,
        sector,
        bedrooms,
        min_price: minPrice,
        max_price: maxPrice,
        check_in: isDiaria ? checkIn : '',
        check_out: isDiaria ? checkOut : '',
        applied: '1',
      },
    });
  };

  const confirmLabel = counting
    ? t('filters.counting')
    : t('filters.confirm', { count: matchCount ?? 0, filters: selectedFilters.length });

  const dateRangeLabel =
    checkIn && checkOut
      ? `${formatDisplayDate(checkIn)} → ${formatDisplayDate(checkOut)}`
      : checkIn
        ? `${formatDisplayDate(checkIn)} ${t('filters.toCheckout')}`
        : t('filters.selectDates');

  const minPickerDate =
    pickingField === 'check_out' && checkIn
      ? (() => {
          const d = parseDateParam(checkIn) || new Date();
          const next = new Date(d);
          next.setDate(next.getDate() + 1);
          return next;
        })()
      : new Date();

  return (
    <View style={[styles.screen, { paddingTop: Math.max(insets.top - 8, 4) }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Ionicons name="close" size={22} color={ui.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('filters.title')}</Text>
        <TouchableOpacity onPress={clearAll}>
          <Text style={styles.clearText}>{t('common.clear')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.section}>{t('filters.purpose')}</Text>
        <View style={styles.wrap}>
          {PROPERTY_PURPOSES.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={[styles.chip, purpose === item.key && styles.chipActive]}
              onPress={() => selectPurpose(item.key)}
            >
              <Text style={[styles.chipText, purpose === item.key && styles.chipTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {isArrendamento && (
          <>
            <Text style={styles.section}>{t('filters.rentalType')}</Text>
            <View style={styles.wrap}>
              {RENTAL_PERIODS.map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.chip, rentalPeriod === item.key && styles.chipActive]}
                  onPress={() => selectRentalPeriod(item.key)}
                >
                  <Text style={[styles.chipText, rentalPeriod === item.key && styles.chipTextActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {isDiaria && (
          <>
            <Text style={styles.section}>{t('filters.checkInOut')}</Text>
            <TouchableOpacity style={styles.dateBtn} onPress={openCalendar} activeOpacity={0.8}>
              <Ionicons name="calendar-outline" size={18} color={ui.brand} />
              <Text style={[styles.dateBtnText, !(checkIn && checkOut) && styles.dateBtnPlaceholder]}>
                {dateRangeLabel}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={ui.muted} />
            </TouchableOpacity>
          </>
        )}

        <Text style={styles.section}>{t('filters.bedrooms')}</Text>
        <View style={styles.wrap}>
          {BEDROOM_FILTER_OPTIONS.map((item) => (
            <TouchableOpacity
              key={item.key || 'all'}
              style={[styles.chip, bedrooms === item.key && styles.chipActive]}
              onPress={() => setBedrooms(item.key)}
            >
              <Text style={[styles.chipText, bedrooms === item.key && styles.chipTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.section}>{t('filters.propertyType')}</Text>
        <View style={styles.wrap}>
          {subcategories.map((item) => (
            <TouchableOpacity
              key={item.slug || 'all'}
              style={[styles.chip, subcategory === item.slug && styles.chipActive]}
              onPress={() => setSubcategory(item.slug)}
            >
              <Text style={[styles.chipText, subcategory === item.slug && styles.chipTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.section}>{t('filters.region')}</Text>
        <View style={styles.wrap}>
          <TouchableOpacity
            style={[styles.chip, region === '' && styles.chipActive]}
            onPress={() => {
              setRegion('');
              setSector('');
            }}
          >
            <Text style={[styles.chipText, region === '' && styles.chipTextActive]}>{t('filters.all')}</Text>
          </TouchableOpacity>
          {regions.map((r) => (
            <TouchableOpacity
              key={r.id}
              style={[styles.chip, region === r.name && styles.chipActive]}
              onPress={() => {
                setRegion(r.name);
                setSector('');
              }}
            >
              <Text style={[styles.chipText, region === r.name && styles.chipTextActive]}>{r.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {!!sectorOptions.length && (
          <>
            <Text style={styles.section}>{t('filters.sector')}</Text>
            <View style={styles.wrap}>
              {sectorOptions.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.chip, sector === s.name && styles.chipActive]}
                  onPress={() => setSector(sector === s.name ? '' : s.name)}
                >
                  <Text style={[styles.chipText, sector === s.name && styles.chipTextActive]}>{s.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <Text style={styles.section}>{priceLabel}</Text>
        <View style={styles.priceRow}>
          <View style={styles.priceBox}>
            <Text style={styles.priceLabel}>{t('filters.min')}</Text>
            <TextInput
              style={styles.input}
              value={minPrice}
              onChangeText={setMinPrice}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={ui.muted}
            />
          </View>
          <View style={styles.priceBox}>
            <Text style={styles.priceLabel}>{t('filters.max')}</Text>
            <TextInput
              style={styles.input}
              value={maxPrice}
              onChangeText={setMaxPrice}
              keyboardType="numeric"
              placeholder={t('filters.noLimit')}
              placeholderTextColor={ui.muted}
            />
          </View>
        </View>

        {!!selectedFilters.length && (
          <>
            <Text style={styles.section}>{t('filters.selected')}</Text>
            <View style={styles.wrap}>
              {selectedFilters.map((label) => (
                <View key={label} style={styles.selectedChip}>
                  <Text style={styles.selectedChipText}>{label}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity style={styles.confirmBtn} onPress={confirm} disabled={counting}>
          {counting ? (
            <RippleWaveLoader size="small" color="#FFF" />
          ) : (
            <Text style={styles.confirmText} numberOfLines={2}>
              {confirmLabel}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {calendarOpen && Platform.OS === 'android' && (
        <DateTimePicker
          value={pickerDate}
          mode="date"
          display="calendar"
          minimumDate={minPickerDate}
          onChange={onPickerChange}
        />
      )}

      {Platform.OS === 'ios' && (
        <Modal visible={calendarOpen} transparent animationType="slide" onRequestClose={() => setCalendarOpen(false)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setCalendarOpen(false)}>
                  <Text style={styles.modalCancel}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>
                  {pickingField === 'check_in' ? t('filters.checkIn') : t('filters.checkOut')}
                </Text>
                <TouchableOpacity onPress={confirmDates}>
                  <Text style={styles.modalDone}>
                    {pickingField === 'check_in' ? t('common.next') : t('common.ok')}
                  </Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={pickerDate}
                mode="date"
                display="inline"
                minimumDate={minPickerDate}
                onChange={(_, selected) => {
                  if (selected) setPickerDate(selected);
                }}
                style={{ alignSelf: 'center' }}
              />
            </View>
          </View>
        </Modal>
      )}
    </View>
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
      paddingTop: 4,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: ui.border,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: ui.input,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: { fontSize: 17, fontWeight: '800', color: ui.text },
    clearText: { fontSize: 13, fontWeight: '700', color: ui.brand },
    content: { padding: 16, paddingTop: 10, paddingBottom: 120 },
    section: { fontSize: 14, fontWeight: '800', color: ui.text, marginTop: 6, marginBottom: 8 },
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 18,
      backgroundColor: ui.input,
      borderWidth: 1,
      borderColor: ui.border,
    },
    chipActive: { backgroundColor: ui.brandSoft, borderColor: ui.brand },
    chipText: { fontSize: 13, fontWeight: '600', color: ui.muted },
    chipTextActive: { color: ui.brand, fontWeight: '800' },
    selectedChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 14,
      backgroundColor: ui.brandSoft,
      borderWidth: 1,
      borderColor: ui.brand,
    },
    selectedChipText: { fontSize: 12, fontWeight: '700', color: ui.brand },
    dateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: ui.input,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: ui.border,
      paddingHorizontal: 14,
      paddingVertical: 14,
      marginBottom: 8,
    },
    dateBtnText: { flex: 1, fontSize: 14, fontWeight: '700', color: ui.text },
    dateBtnPlaceholder: { color: ui.muted, fontWeight: '600' },
    priceRow: { flexDirection: 'row', gap: 10 },
    priceBox: { flex: 1 },
    priceLabel: { fontSize: 12, fontWeight: '700', color: ui.muted, marginBottom: 6 },
    input: {
      backgroundColor: ui.input,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 11,
      fontSize: 14,
      color: ui.text,
      borderWidth: 1,
      borderColor: ui.border,
    },
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 16,
      paddingTop: 10,
      backgroundColor: ui.bg,
      borderTopWidth: 1,
      borderTopColor: ui.border,
    },
    confirmBtn: {
      backgroundColor: ui.brand,
      borderRadius: 14,
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    confirmText: { color: '#FFF', fontWeight: '800', fontSize: 14, textAlign: 'center' },
    modalBackdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: ui.overlay,
    },
    modalSheet: {
      backgroundColor: ui.card,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      paddingTop: 12,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    modalCancel: { fontSize: 15, color: ui.muted, fontWeight: '600' },
    modalTitle: { fontSize: 15, fontWeight: '800', color: ui.text },
    modalDone: { fontSize: 15, color: ui.brand, fontWeight: '800' },
  });
}
