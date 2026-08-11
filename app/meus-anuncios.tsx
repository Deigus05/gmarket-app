import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  deleteProperty,
  getMyProperties,
  Property,
  setPropertyVisibility,
} from '@/components/api';
import { useAuth } from '@/components/AuthContext';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import { useLocale } from '@/components/LocaleContext';
import { useAppTheme, type AppUI } from '@/components/tema';
import { formatPropertyPrice, propertyPurposeBadge } from '@/constants/propertyDisplay';
import { listImageUrl } from '@/lib/imageOptimization';

const COVER_FALLBACK =
  'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800';

function coverOf(item: Property) {
  return listImageUrl(item.image_urls, item.image_url, COVER_FALLBACK, 'card');
}

function statusLabel(
  item: Property,
  t: (scope: string, options?: Record<string, unknown>) => string,
) {
  if (item.is_visible === false) return t('myListings.invisible');
  switch (item.status) {
    case 'reservado':
      return t('myListings.reserved');
    case 'vendido':
      return t('myListings.sold');
    case 'arrendado':
      return t('myListings.rented');
    default:
      return t('myListings.visible');
  }
}

type ScreenStyles = ReturnType<typeof createStyles>;

export default function MeusAnunciosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const { ui } = useAppTheme();
  const styles = useMemo(() => createStyles(ui), [ui]);
  const { token, isLoggedIn, loading: authLoading } = useAuth();
  const loginRequestedRef = useRef(false);

  const [items, setItems] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!token) {
        setItems([]);
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      const result = await getMyProperties(token);
      if (result.success) setItems(result.data);
      else {
        setItems([]);
        if (!silent) Alert.alert(t('myListings.title'), result.message);
      }
      setLoading(false);
      setRefreshing(false);
    },
    [token, t],
  );

  useFocusEffect(
    useCallback(() => {
      if (authLoading) return;
      if (!isLoggedIn) {
        if (loginRequestedRef.current) return;
        loginRequestedRef.current = true;
        router.push({ pathname: '/login', params: { redirect: '/meus-anuncios' } });
        return;
      }
      loginRequestedRef.current = false;
      load();
    }, [authLoading, isLoggedIn, load, router]),
  );

  const toggleVisibility = (item: Property) => {
    if (!token) return;
    const nextVisible = item.is_visible === false;
    const title = nextVisible ? t('myListings.makeVisible') : t('myListings.makeInvisible');

    Alert.alert(title, '', [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: title,
        onPress: async () => {
          setBusyId(item.id);
          const result = await setPropertyVisibility(token, item.id, nextVisible);
          setBusyId(null);
          if (!result.success) {
            Alert.alert(t('myListings.updateFail'), result.message);
            return;
          }
          setItems((prev) =>
            prev.map((p) => (p.id === item.id ? { ...p, ...result.data, is_visible: nextVisible } : p)),
          );
        },
      },
    ]);
  };

  const confirmDelete = (item: Property) => {
    if (!token) return;
    Alert.alert(
      t('myListings.deleteTitle'),
      t('myListings.deleteMessage', { title: item.title }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            setBusyId(item.id);
            const result = await deleteProperty(token, item.id);
            setBusyId(null);
            if (!result.success) {
              Alert.alert(t('myListings.deleteFail'), result.message);
              return;
            }
            setItems((prev) => prev.filter((p) => p.id !== item.id));
          },
        },
      ],
    );
  };

  const showViews = (item: Property) => {
    const views = Number(item.view_count || 0);
    Alert.alert(
      t('myListings.viewsTitle'),
      views === 0
        ? t('myListings.viewsEmpty')
        : t('myListings.viewsCount', { n: views }),
    );
  };

  const renderItem = ({ item }: { item: Property }) => {
    const invisible = item.is_visible === false;
    const busy = busyId === item.id;

    return (
      <View style={[styles.card, invisible && styles.cardInvisible]}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push({ pathname: '/propertyDetail', params: { id: item.id } })}
        >
          <View style={styles.coverWrap}>
            <Image source={{ uri: coverOf(item) }} style={styles.cover} contentFit="cover" />
            {invisible ? (
              <View style={styles.invisibleBadge}>
                <Ionicons name="eye-off-outline" size={12} color="#FFF" />
                <Text style={styles.invisibleBadgeText}>{t('myListings.invisible')}</Text>
              </View>
            ) : (
              <View style={styles.purposeBadge}>
                <Text style={styles.purposeBadgeText}>{propertyPurposeBadge(item).toUpperCase()}</Text>
              </View>
            )}
          </View>

          <View style={styles.cardBody}>
            <Text style={styles.category} numberOfLines={1}>
              {item.category || t('myListings.fallbackTitle')} · {statusLabel(item, t)}
            </Text>
            <Text style={styles.title} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.location} numberOfLines={1}>
              {item.location || [item.bairro, item.region].filter(Boolean).join(', ')}
            </Text>
            <View style={styles.metaRow}>
              <Text style={styles.price}>{formatPropertyPrice(item)}</Text>
              <View style={styles.viewsChip}>
                <Ionicons name="eye-outline" size={14} color={ui.brand} />
                <Text style={styles.viewsText}>{Number(item.view_count || 0)}</Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.actions}>
          <ActionBtn
            icon="create-outline"
            label={t('common.edit')}
            disabled={busy}
            styles={styles}
            ui={ui}
            onPress={() => router.push({ pathname: '/editar-imovel', params: { id: item.id } })}
          />
          <ActionBtn
            icon={invisible ? 'eye-outline' : 'eye-off-outline'}
            label={invisible ? t('myListings.visible') : t('myListings.invisible')}
            disabled={busy}
            styles={styles}
            ui={ui}
            onPress={() => toggleVisibility(item)}
          />
          <ActionBtn
            icon="stats-chart-outline"
            label={t('myListings.views')}
            disabled={busy}
            styles={styles}
            ui={ui}
            onPress={() => showViews(item)}
          />
          <ActionBtn
            icon="trash-outline"
            label={t('common.delete')}
            danger
            disabled={busy}
            styles={styles}
            ui={ui}
            onPress={() => confirmDelete(item)}
          />
        </View>

        {busy ? (
          <View style={styles.busyOverlay}>
            <RippleWaveLoader color={ui.brand} />
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={ui.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{t('myListings.title')}</Text>
          <Text style={styles.headerSubtitle}>
            {items.length === 1 ? t('myListings.countOne') : t('myListings.countMany', { n: items.length })}
          </Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/anunciar-imovel')}>
          <Ionicons name="add" size={18} color="#FFF" />
          <Text style={styles.addBtnText}>{t('myListings.new')}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <RippleWaveLoader color={ui.brand} />
          <Text style={styles.loadingText}>{t('myListings.loading')}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load(true);
              }}
              tintColor={ui.brand}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <View style={styles.emptyIcon}>
                <Ionicons name="home-outline" size={32} color={ui.brand} />
              </View>
              <Text style={styles.emptyTitle}>{t('myListings.emptyTitle')}</Text>
              <Text style={styles.emptyText}>{t('myListings.emptySubtitle')}</Text>
              <TouchableOpacity style={styles.emptyCta} onPress={() => router.push('/anunciar-imovel')}>
                <Text style={styles.emptyCtaText}>{t('myListings.announce')}</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </View>
  );
}

function ActionBtn({
  icon,
  label,
  onPress,
  danger,
  disabled,
  styles,
  ui,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
  styles: ScreenStyles;
  ui: AppUI;
}) {
  return (
    <TouchableOpacity
      style={styles.actionBtn}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <Ionicons name={icon} size={18} color={danger ? ui.danger : ui.brand} />
      <Text style={[styles.actionLabel, danger && styles.actionLabelDanger]}>{label}</Text>
    </TouchableOpacity>
  );
}

function createStyles(ui: AppUI) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: ui.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 12,
      gap: 10,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: ui.card,
      borderWidth: 1,
      borderColor: ui.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: { fontSize: 20, fontWeight: '800', color: ui.text },
    headerSubtitle: { fontSize: 12, color: ui.muted, marginTop: 2 },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: ui.brand,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
    },
    addBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingText: { marginTop: 12, fontSize: 13, color: ui.muted },
    list: { paddingHorizontal: 16, paddingBottom: 40 },
    card: {
      backgroundColor: ui.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: ui.border,
      marginBottom: 14,
      overflow: 'hidden',
    },
    cardInvisible: { opacity: 0.88, borderColor: ui.border },
    coverWrap: { position: 'relative' },
    cover: { width: '100%', height: 150, backgroundColor: ui.input },
    purposeBadge: {
      position: 'absolute',
      top: 10,
      left: 10,
      backgroundColor: ui.brand,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    purposeBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
    invisibleBadge: {
      position: 'absolute',
      top: 10,
      left: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(60,60,67,0.85)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    invisibleBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
    cardBody: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 },
    category: {
      fontSize: 11,
      fontWeight: '700',
      color: ui.brand,
      textTransform: 'uppercase',
    },
    title: { fontSize: 15, fontWeight: '700', color: ui.text, marginTop: 4 },
    location: { fontSize: 12, color: ui.muted, marginTop: 4 },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
    },
    price: { fontSize: 15, fontWeight: '800', color: ui.text },
    viewsChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: ui.brandSoft,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },
    viewsText: { fontSize: 12, fontWeight: '700', color: ui.brand },
    actions: {
      flexDirection: 'row',
      borderTopWidth: 1,
      borderTopColor: ui.divider,
    },
    actionBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      gap: 3,
    },
    actionLabel: { fontSize: 11, fontWeight: '600', color: ui.brand },
    actionLabelDanger: { color: ui.danger },
    busyOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: ui.overlay,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyBox: {
      alignItems: 'center',
      paddingTop: 48,
      paddingHorizontal: 24,
    },
    emptyIcon: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: ui.brandSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    emptyTitle: { fontSize: 18, fontWeight: '800', color: ui.text },
    emptyText: {
      fontSize: 14,
      color: ui.muted,
      textAlign: 'center',
      lineHeight: 20,
      marginTop: 8,
      marginBottom: 20,
    },
    emptyCta: {
      backgroundColor: ui.brand,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 14,
    },
    emptyCtaText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  });
}
