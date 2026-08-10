import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  cancelOrder,
  getMyOrders,
  getMyReviews,
  getOrderById,
  getOrderReturns,
  Order,
  OrderStatus,
} from '@/components/api';
import { useAuth } from '@/components/AuthContext';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import { canRequestReturn, ReturnRequestModal, SHOW_ORDER_RETURN_UI } from '@/components/ReturnRequestModal';
import { syncDeliveryLiveActivities } from '@/components/deliveryLiveActivity';
import { useLocale } from '@/components/LocaleContext';
import { useAppTheme, type AppUI } from '@/components/tema';
import { getAllProductReviews, reviewKey, saveProductReview } from '@/lib/localReviews';

type TranslateFn = (scope: string, options?: Record<string, unknown>) => string;

type DeliveryStep = {
  id: Exclude<OrderStatus, 'cancelled' | 'pending'>;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
};

function getSteps(t: TranslateFn, pickup = false): DeliveryStep[] {
  if (pickup) {
    return [
      { id: 'preparing', title: t('delivery.stepPickupPrep'), icon: 'cube-outline' },
      { id: 'picked', title: t('delivery.stepPickupReady'), icon: 'storefront-outline' },
      { id: 'delivered', title: t('delivery.stepPickupDone'), icon: 'checkmark-done-outline' },
    ];
  }
  return [
    { id: 'preparing', title: t('delivery.stepPrep'), icon: 'cube-outline' },
    { id: 'picked', title: t('delivery.stepPicked'), icon: 'hand-left-outline' },
    { id: 'on_way', title: t('delivery.stepOnWay'), icon: 'bicycle-outline' },
    { id: 'arrived', title: t('delivery.stepNear'), icon: 'location-outline' },
    { id: 'delivered', title: t('delivery.stepDone'), icon: 'checkmark-done-outline' },
  ];
}

const STATUS_INDEX: Record<string, number> = {
  pending: 0,
  preparing: 0,
  picked: 1,
  on_way: 2,
  arrived: 3,
  delivered: 4,
  cancelled: -1,
};

const PICKUP_STATUS_INDEX: Record<string, number> = {
  pending: 0,
  preparing: 0,
  picked: 1,
  on_way: 1,
  arrived: 1,
  delivered: 2,
  cancelled: -1,
};

const ACTIVE_STATUSES = new Set<OrderStatus>([
  'pending',
  'preparing',
  'picked',
  'on_way',
  'arrived',
]);

function formatCfa(value: number) {
  return `${value.toLocaleString('pt-PT')} CFA`;
}

function formatPlacedAt(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('pt-PT', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isPickupOrder(order: Order) {
  return order.fulfillment_method === 'recolha';
}

function statusLabel(status: OrderStatus, t: TranslateFn, pickup = false) {
  if (pickup) {
    switch (status) {
      case 'pending':
      case 'preparing':
        return t('delivery.statusPrep');
      case 'picked':
      case 'on_way':
      case 'arrived':
        return t('delivery.statusPickupReady');
      case 'delivered':
        return t('delivery.statusPickupDone');
      case 'cancelled':
        return t('delivery.statusCancelled');
      default:
        return status;
    }
  }
  switch (status) {
    case 'pending':
    case 'preparing':
      return t('delivery.statusPrep');
    case 'picked':
      return t('delivery.statusPicked');
    case 'on_way':
      return t('delivery.statusOnWay');
    case 'arrived':
      return t('delivery.statusNear');
    case 'delivered':
      return t('delivery.statusDone');
    case 'cancelled':
      return t('delivery.statusCancelled');
    default:
      return status;
  }
}

function statusTone(status: OrderStatus, ui: AppUI) {
  switch (status) {
    case 'delivered':
      return { bg: ui.successSoft, text: ui.success };
    case 'cancelled':
      return { bg: ui.dangerSoft, text: ui.danger };
    case 'on_way':
    case 'arrived':
      return { bg: ui.brandSoft, text: ui.brand };
    default:
      return { bg: ui.brandSoft, text: ui.brand };
  }
}

function useEntregaTheme() {
  const { ui, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(ui, isDark), [ui, isDark]);
  return { ui, isDark, styles };
}

function paymentLabel(method: Order['payment_method'], t: TranslateFn, pickup = false) {
  if (method === 'gpay') return 'GPay';
  return pickup ? t('delivery.payOnPickup') : t('delivery.payOnDelivery');
}

function canCancel(order: Order) {
  return order.status === 'pending' || order.status === 'preparing';
}

function asOrderList(data: unknown): Order[] {
  return Array.isArray(data) ? (data as Order[]) : [];
}

function firstItem(order: Order) {
  return (order.items || [])[0] || null;
}

function orderIsReviewed(order: Order, reviewedItemKeys: Set<string>) {
  if (order.status !== 'delivered') return false;
  const items = (order.items || []).filter((item) => item.product_id || item.id);
  if (!items.length) return false;
  return items.every((item) => {
    const candidates = [
      item.id && !String(item.id).includes(':') ? `item:${item.id}` : '',
      item.product_id ? `order:${order.id}:${item.product_id}` : '',
      item.product_id ? `product:${item.product_id}` : '',
    ].filter(Boolean);
    return candidates.some((key) => reviewedItemKeys.has(key));
  });
}

function GlassCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: object;
}) {
  const { styles } = useEntregaTheme();
  return (
    <View style={[styles.glassOuter, style]}>
      <View style={styles.glassInner}>{children}</View>
    </View>
  );
}

function CompactOrderCard({
  order,
  onPress,
  onRate,
  index,
  showRateButton,
  isReviewed,
  animate = true,
}: {
  order: Order;
  onPress: () => void;
  onRate?: () => void;
  index: number;
  showRateButton?: boolean;
  isReviewed?: boolean;
  animate?: boolean;
}) {
  const { ui, styles } = useEntregaTheme();
  const { t } = useLocale();
  const item = firstItem(order);
  const tone = statusTone(order.status, ui);

  const body = (
    <GlassCard style={styles.compactCard}>
      <View style={styles.compactRow}>
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [styles.compactMainPress, pressed && { opacity: 0.88 }]}
        >
          {item?.image_url ? (
            <Image source={{ uri: item.image_url }} style={styles.productPhoto} contentFit="cover" />
          ) : (
            <View style={[styles.productPhoto, styles.productPhotoFallback]}>
              <Ionicons name="cube-outline" size={22} color={ui.brand} />
            </View>
          )}

          <View style={styles.compactInfo}>
            <Text style={styles.productName} numberOfLines={2}>
              {item?.title || `${t('delivery.headerOrder')} #${order.order_number}`}
            </Text>
            <View style={styles.compactMetaRow}>
              <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
                <View style={[styles.statusDot, { backgroundColor: tone.text }]} />
                <Text style={[styles.statusPillText, { color: tone.text }]}>
                  {statusLabel(order.status, t, isPickupOrder(order))}
                </Text>
              </View>
            </View>
          </View>
        </Pressable>

        {showRateButton ? (
          // Gesture-handler evita que o pager horizontal engula o toque do Avaliar.
          <View onStartShouldSetResponder={() => true} collapsable={false}>
            <GHTouchableOpacity
              onPress={() => onRate?.()}
              activeOpacity={0.85}
              hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
              style={styles.rateBtn}
              accessibilityRole="button"
              accessibilityLabel={isReviewed ? t('delivery.reavaliar') : t('delivery.avaliar')}
            >
              <Ionicons
                name={isReviewed ? 'star' : 'star-outline'}
                size={12}
                color={ui.brand}
              />
              <Text style={styles.rateBtnText}>
                {isReviewed ? t('delivery.reavaliar') : t('delivery.avaliar')}
              </Text>
            </GHTouchableOpacity>
          </View>
        ) : null}

        <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => pressed && { opacity: 0.7 }}>
          <Ionicons name="chevron-forward" size={18} color={ui.brand} />
        </Pressable>
      </View>
    </GlassCard>
  );

  if (!animate) return <View>{body}</View>;

  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 40).duration(280)}>
      {body}
    </Animated.View>
  );
}

const EMPTY_SCOOTER_LIGHT = require('../assets/images/empty-delivery-scooter-light.png');
const EMPTY_SCOOTER_DARK = require('../assets/images/empty-delivery-scooter-dark.png');
const EMPTY_FINISHED_LIGHT = require('../assets/images/empty-delivery-finished-light.png');
const EMPTY_FINISHED_DARK = require('../assets/images/empty-delivery-finished-dark.png');

function EmptyOrdersState({
  title,
  subtitle,
  variant = 'active',
}: {
  title: string;
  subtitle: string;
  variant?: 'active' | 'finished' | 'filter';
}) {
  const { styles, isDark } = useEntregaTheme();
  const useFinishedArt = variant === 'finished' || variant === 'filter';

  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyStateImageWrap}>
        {useFinishedArt ? (
          <>
            <Image
              source={EMPTY_FINISHED_LIGHT}
              style={[
                styles.emptyStateImage,
                !isDark ? styles.emptyStateImageVisible : styles.emptyStateImageHidden,
              ]}
              contentFit="contain"
            />
            <Image
              source={EMPTY_FINISHED_DARK}
              style={[
                styles.emptyStateImage,
                styles.emptyStateImageAbsolute,
                isDark ? styles.emptyStateImageVisible : styles.emptyStateImageHidden,
              ]}
              contentFit="contain"
            />
          </>
        ) : (
          <>
            <Image
              source={EMPTY_SCOOTER_LIGHT}
              style={[
                styles.emptyStateImage,
                !isDark ? styles.emptyStateImageVisible : styles.emptyStateImageHidden,
              ]}
              contentFit="contain"
            />
            <Image
              source={EMPTY_SCOOTER_DARK}
              style={[
                styles.emptyStateImage,
                styles.emptyStateImageAbsolute,
                isDark ? styles.emptyStateImageVisible : styles.emptyStateImageHidden,
              ]}
              contentFit="contain"
            />
          </>
        )}
      </View>
      <Text style={styles.emptyStateTitle}>{title}</Text>
      <Text style={styles.emptyStateSubtitle}>{subtitle}</Text>
    </View>
  );
}

type ListTab = 'active' | 'finished';
type FinishedFilter = 'all' | 'delivered' | 'cancelled' | 'reviewed' | 'unreviewed';

const TAB_SPRING = { damping: 18, stiffness: 220, mass: 0.7 };

function DeliverySegmentTabs({
  value,
  onChange,
  activeCount,
  finishedCount,
}: {
  value: ListTab;
  onChange: (tab: ListTab) => void;
  activeCount: number;
  finishedCount: number;
}) {
  const { ui, styles } = useEntregaTheme();
  const { t } = useLocale();
  const trackWidth = useSharedValue(0);
  const index = useSharedValue(value === 'active' ? 0 : 1);

  React.useEffect(() => {
    index.value = withSpring(value === 'active' ? 0 : 1, TAB_SPRING);
  }, [value, index]);

  const onTrackLayout = (e: LayoutChangeEvent) => {
    trackWidth.value = e.nativeEvent.layout.width;
  };

  const pillStyle = useAnimatedStyle(() => {
    const inner = Math.max(trackWidth.value - 8, 0);
    const w = inner / 2;
    return {
      width: w,
      transform: [{ translateX: 4 + index.value * w }],
    };
  });

  const tabs = [
    {
      key: 'active' as const,
      label: t('delivery.inProgress'),
      count: activeCount,
      icon: 'bicycle-outline' as const,
    },
    {
      key: 'finished' as const,
      label: t('delivery.finished'),
      count: finishedCount,
      icon: 'checkmark-done-outline' as const,
    },
  ];

  return (
    <View style={styles.tabs} onLayout={onTrackLayout}>
      <Animated.View style={[styles.tabPill, pillStyle]} />
      {tabs.map((tab) => {
        const active = value === tab.key;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={styles.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Ionicons
              name={tab.icon}
              size={15}
              color={active ? ui.brand : ui.muted}
            />
            <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>
              {tab.label}
            </Text>
            <View style={[styles.tabCount, active && styles.tabCountActive]}>
              <Text style={[styles.tabCountText, active && styles.tabCountTextActive]}>
                {tab.count}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function EntregaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ui, isDark, styles } = useEntregaTheme();
  const { t } = useLocale();
  const { token, isLoggedIn, loading: authLoading } = useAuth();
  const params = useLocalSearchParams<{ orderId?: string }>();
  const orderIdRaw = Array.isArray(params.orderId) ? params.orderId[0] : params.orderId;
  // setParams pode deixar string vazia; tratar como "sem deep-link".
  const orderIdParam =
    typeof orderIdRaw === 'string' && orderIdRaw.trim().length > 0 ? orderIdRaw.trim() : undefined;
  const pageWidth = Dimensions.get('window').width;
  const pagerRef = useRef<ScrollView>(null);

  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [listTab, setListTab] = useState<ListTab>('active');
  const [finishedFilter, setFinishedFilter] = useState<FinishedFilter>('all');
  const [reviewedItemKeys, setReviewedItemKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [hasPendingReturn, setHasPendingReturn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedOrderRef = useRef<Order | null>(null);
  selectedOrderRef.current = selectedOrder;
  const selectedOrderIdRef = useRef<string | null>(null);
  selectedOrderIdRef.current = selectedOrder?.id ?? null;
  const ordersRef = useRef<Order[]>([]);
  ordersRef.current = orders;
  const orderIdParamRef = useRef(orderIdParam);
  orderIdParamRef.current = orderIdParam;

  const loadOrders = useCallback(async (
    keepSelectedId?: string | null,
    options?: { silent?: boolean },
  ) => {
    if (!token) {
      setOrders([]);
      setSelectedOrder(null);
      setLoading(false);
      return;
    }

    const silent = Boolean(options?.silent);
    if (!silent) setError(null);

    try {
      if (orderIdParam && !keepSelectedId) {
        const result = await getOrderById(token, orderIdParam);
        if (!result.success || !result.data) {
          if (!silent) {
            setError(result.message || t('delivery.loadError'));
            setSelectedOrder(null);
          }
          return;
        }
        setSelectedOrder(result.data);
        // Also load full list in background for organized view after back
        const list = await getMyOrders(token);
        if (list.success) {
          const ordersList = asOrderList(list.data);
          setOrders(ordersList);
          void syncDeliveryLiveActivities(ordersList);
        } else {
          setOrders([result.data]);
          void syncDeliveryLiveActivities([result.data]);
        }
        return;
      }

      const result = await getMyOrders(token);
      if (!result.success) {
        if (!silent) {
          setError(result.message || t('delivery.loadError'));
          setOrders([]);
          if (!keepSelectedId) setSelectedOrder(null);
        }
        return;
      }

      const ordersList = asOrderList(result.data);
      setOrders(ordersList);
      void syncDeliveryLiveActivities(ordersList);

      if (keepSelectedId) {
        const fresh = ordersList.find((o) => o.id === keepSelectedId) || null;
        setSelectedOrder(fresh);
      } else if (orderIdParam) {
        const fromParam = ordersList.find((o) => o.id === orderIdParam) || null;
        setSelectedOrder(fromParam);
      }
    } catch (error) {
      console.log('Erro ao carregar entregas:', error);
      if (!silent) {
        setError(t('delivery.loadError'));
        setOrders([]);
        if (!keepSelectedId) setSelectedOrder(null);
      }
    } finally {
      if (!silent) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [orderIdParam, t, token]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const hasCachedOrders = ordersRef.current.length > 0;
      if (!hasCachedOrders) setLoading(true);

      // On first open from checkout with orderId → show detail once
      // On normal Entrega open → show organized list
      if (orderIdParam) {
        loadOrders(null, { silent: hasCachedOrders });
      } else {
        setSelectedOrder(null);
        loadOrders(null, { silent: hasCachedOrders });
      }

      void (async () => {
        if (token) {
          const remote = await getMyReviews(token);
          if (remote.success && remote.data?.products?.length) {
            for (const r of remote.data.products) {
              if (!r?.product_id) continue;
              await saveProductReview({
                id: r.id,
                product_id: r.product_id,
                order_id: r.order_id || '',
                order_item_id: r.order_item_id || '',
                store_id: r.store_id || null,
                store_name: r.store_name || 'Loja',
                product_title: r.product_title || 'Produto',
                product_image: r.product_image || null,
                user_name: r.user_name || 'Cliente',
                user_avatar: r.user_avatar || null,
                rating: r.rating,
                comment: r.comment ?? null,
                photo_uris: r.photo_urls || [],
              });
            }
          }
        }
        const reviews = await getAllProductReviews();
        if (!active) return;
        const keys = new Set<string>();
        for (const r of reviews) {
          keys.add(reviewKey(r));
          if (r.product_id) keys.add(`product:${r.product_id}`);
          if (r.order_id && r.product_id) keys.add(`order:${r.order_id}:${r.product_id}`);
        }
        setReviewedItemKeys(keys);
      })();

      const interval = setInterval(() => {
        if (!active) return;
        loadOrders(selectedOrderIdRef.current, { silent: true });
      }, 4000);

      return () => {
        active = false;
        clearInterval(interval);
      };
    }, [loadOrders, orderIdParam, token])
  );

  const activeOrders = useMemo(
    () => orders.filter((order) => ACTIVE_STATUSES.has(order.status)),
    [orders],
  );
  const finishedOrders = useMemo(
    () =>
      orders
        .filter((order) => order.status === 'delivered' || order.status === 'cancelled')
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
    [orders],
  );
  const filteredFinishedOrders = useMemo(() => {
    return finishedOrders.filter((order) => {
      const reviewed = orderIsReviewed(order, reviewedItemKeys);
      switch (finishedFilter) {
        case 'delivered':
          return order.status === 'delivered';
        case 'cancelled':
          return order.status === 'cancelled';
        case 'reviewed':
          return order.status === 'delivered' && reviewed;
        case 'unreviewed':
          return order.status === 'delivered' && !reviewed;
        default:
          return true;
      }
    });
  }, [finishedFilter, finishedOrders, reviewedItemKeys]);

  const finishedFilters = useMemo(
    () =>
      [
        { key: 'all' as const, label: t('delivery.filterAll') },
        { key: 'delivered' as const, label: t('delivery.filterDelivered') },
        { key: 'cancelled' as const, label: t('delivery.filterCancelled') },
        { key: 'reviewed' as const, label: t('delivery.filterReviewed') },
        { key: 'unreviewed' as const, label: t('delivery.filterUnreviewed') },
      ] as const,
    [t],
  );

  const scrollPagerTo = useCallback(
    (tab: ListTab, animated = true) => {
      pagerRef.current?.scrollTo({
        x: tab === 'active' ? 0 : pageWidth,
        animated,
      });
    },
    [pageWidth],
  );

  const changeListTab = useCallback(
    (tab: ListTab) => {
      setListTab(tab);
      scrollPagerTo(tab, true);
    },
    [scrollPagerTo],
  );

  const onPagerScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const page = Math.round(e.nativeEvent.contentOffset.x / Math.max(pageWidth, 1));
      const next: ListTab = page >= 1 ? 'finished' : 'active';
      setListTab((prev) => (prev === next ? prev : next));
    },
    [pageWidth],
  );

  const openOrder = useCallback((order: Order) => {
    setListTab(ACTIVE_STATUSES.has(order.status) ? 'active' : 'finished');
    setSelectedOrder(order);
  }, []);

  /** Sai do detalhe (se aberto) e abre avaliação — sem replace/beforeRemove no native-stack. */
  const goRateOrder = useCallback(
    (order: Order) => {
      const item = firstItem(order);
      selectedOrderRef.current = null;
      selectedOrderIdRef.current = null;
      setSelectedOrder(null);
      setError(null);
      if (orderIdParamRef.current) {
        // Limpar deep-link sem replace (replace remonta e dispara useDismissedRouteError).
        router.setParams({ orderId: '' });
      }
      router.push({
        pathname: '/avaliacao',
        params: {
          orderId: order.id,
          productId: item?.product_id || '',
        },
      });
    },
    [router],
  );

  const refreshList = useCallback(() => {
    setRefreshing(true);
    void loadOrders(null);
  }, [loadOrders]);

  const renderOrderCards = (ordersList: Order[], tab: ListTab, animate = true) => {
    if (ordersList.length === 0) {
      if (tab === 'active') {
        return (
          <EmptyOrdersState
            variant="active"
            title={t('delivery.noInProgress')}
            subtitle={t('delivery.noInProgressSubtitle')}
          />
        );
      }
      if (finishedOrders.length === 0) {
        return (
          <EmptyOrdersState
            variant="finished"
            title={t('delivery.noFinished')}
            subtitle={t('delivery.noFinishedSubtitle')}
          />
        );
      }
      return (
        <EmptyOrdersState
          variant="filter"
          title={t('delivery.noFilterResults')}
          subtitle={t('delivery.noFilterResultsSubtitle')}
        />
      );
    }
    return ordersList.map((order, index) => {
      const reviewed = orderIsReviewed(order, reviewedItemKeys);
      return (
        <CompactOrderCard
          key={order.id}
          order={order}
          index={index}
          animate={animate}
          showRateButton={tab === 'finished' && order.status === 'delivered'}
          isReviewed={reviewed}
          onPress={() => openOrder(order)}
          onRate={() => goRateOrder(order)}
        />
      );
    });
  };

  const pickup = selectedOrder ? isPickupOrder(selectedOrder) : false;
  const currentStep = selectedOrder
    ? (pickup ? PICKUP_STATUS_INDEX : STATUS_INDEX)[selectedOrder.status] ?? 0
    : 0;
  const cancelled = selectedOrder?.status === 'cancelled';
  const itemsTotal = useMemo(
    () =>
      selectedOrder
        ? (selectedOrder.items || []).reduce((sum, item) => sum + (item.line_total || 0), 0)
        : 0,
    [selectedOrder],
  );

  const handleCancel = () => {
    if (!selectedOrder || !token || !canCancel(selectedOrder)) return;

    Alert.alert(
      t('delivery.cancelTitle'),
      t('delivery.cancelMessage', { id: selectedOrder.order_number }),
      [
        { text: t('common.keep'), style: 'cancel' },
        {
          text: t('delivery.cancelAction'),
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            try {
              const result = await cancelOrder(token, selectedOrder.id);
              if (!result.success) {
                Alert.alert(t('common.error'), result.message);
                return;
              }

              setSelectedOrder(result.data);
              setListTab('finished');
              setOrders((prev) =>
                prev.map((order) => (order.id === result.data.id ? result.data : order)),
              );
              Alert.alert(
                t('delivery.cancelledTitle'),
                t('delivery.cancelledMessage', { id: result.data.order_number }),
              );
            } finally {
              setCancelling(false);
            }
          },
        },
      ],
    );
  };

  useEffect(() => {
    let cancelled = false;
    if (!selectedOrder || !token || selectedOrder.status !== 'delivered') {
      setHasPendingReturn(false);
      return;
    }
    void getOrderReturns(token, selectedOrder.id).then((res) => {
      if (cancelled) return;
      if (!res.success) {
        setHasPendingReturn(false);
        return;
      }
      setHasPendingReturn(
        (res.data || []).some((r) => r.status === 'pending' || r.status === 'approved'),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [selectedOrder?.id, selectedOrder?.status, token]);

  /** Fecha o detalhe e fica na lista Entrega (não sai para a home). */
  const dismissOrderDetail = useCallback(() => {
    const order = selectedOrderRef.current;
    if (!order) return false;
    const tab = ACTIVE_STATUSES.has(order.status) ? 'active' : 'finished';
    selectedOrderRef.current = null;
    selectedOrderIdRef.current = null;
    setSelectedOrder(null);
    setError(null);
    setListTab(tab);
    requestAnimationFrame(() => scrollPagerTo(tab, false));
    if (orderIdParamRef.current) {
      // Evitar router.replace — remonta/dismiss nativo e dispara useDismissedRouteError.
      router.setParams({ orderId: '' });
    }
    return true;
  }, [router, scrollPagerTo]);

  const goBack = useCallback(() => {
    if (dismissOrderDetail()) return;
    router.back();
  }, [dismissOrderDetail, router]);

  // Soft-back só com botão custom + Android back focado.
  // Não usar beforeRemove/preventDefault nem toggle de gestureEnabled (dessincroniza native-stack).
  useFocusEffect(
    useCallback(() => {
      if (!selectedOrder) return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        dismissOrderDetail();
        return true;
      });
      return () => sub.remove();
    }, [dismissOrderDetail, selectedOrder]),
  );

  if (authLoading || loading) {
    return (
      <View style={[styles.root, styles.centered]}>
        <Stack.Screen options={{ headerShown: false }} />
        <RippleWaveLoader color={ui.brand} />
        <Text style={styles.emptySub}>{t('delivery.loading')}</Text>
      </View>
    );
  }

  if (!isLoggedIn || !token) {
    return (
      <View style={[styles.root, styles.centered, { paddingHorizontal: 28 }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <GlassCard style={{ width: '100%', paddingVertical: 28 }}>
          <View style={{ alignItems: 'center', gap: 8, paddingHorizontal: 12 }}>
            <Ionicons name="bicycle-outline" size={48} color={ui.brand} />
            <Text style={styles.emptyTitle}>{t('delivery.guestTitle')}</Text>
            <Text style={styles.emptySub}>{t('delivery.guestSubtitle')}</Text>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => router.push({ pathname: '/login', params: { redirect: 'entrega' } })}
            >
              <Text style={styles.primaryBtnText}>{t('common.login')}</Text>
            </Pressable>
            <Pressable style={styles.ghostBtn} onPress={() => router.back()}>
              <Text style={styles.ghostBtnText}>{t('common.back')}</Text>
            </Pressable>
          </View>
        </GlassCard>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.backBtn} onPress={goBack}>
          <View style={styles.backBtnInner}>
            <BlurView intensity={28} tint={isDark ? 'dark' : 'light'} style={styles.backBtnBlur}>
              <Ionicons name="arrow-back" size={20} color={isDark ? '#FFFFFF' : '#111111'} />
            </BlurView>
          </View>
        </Pressable>
        <Text style={styles.brand}>
          {selectedOrder
            ? t('delivery.headerOrder')
            : t('delivery.headerDelivery')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {error || selectedOrder ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 28, paddingHorizontal: 18 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void loadOrders(selectedOrder?.id);
              }}
              tintColor={ui.brand}
            />
          }
        >
          {error ? (
            <GlassCard style={styles.emptyGlass}>
              <Ionicons name="cloud-offline-outline" size={40} color={ui.brand} />
              <Text style={styles.emptyTitle}>{t('delivery.loadError')}</Text>
              <Text style={styles.emptySub}>{error}</Text>
              <Pressable
                style={styles.primaryBtn}
                onPress={() => {
                  setLoading(true);
                  void loadOrders(selectedOrder?.id);
                }}
              >
                <Text style={styles.primaryBtnText}>{t('common.tryAgain')}</Text>
              </Pressable>
            </GlassCard>
          ) : (
            <OrderDetail
              order={selectedOrder!}
              currentStep={currentStep}
              cancelled={cancelled}
              itemsTotal={itemsTotal}
              cancelling={cancelling}
              onCancel={handleCancel}
              canReturn={
                SHOW_ORDER_RETURN_UI
                && Boolean(token)
                && canRequestReturn(selectedOrder!)
                && !hasPendingReturn
              }
              returnPending={SHOW_ORDER_RETURN_UI && hasPendingReturn}
              onReturn={() => setReturnOpen(true)}
              onBackToList={goBack}
              isReviewed={orderIsReviewed(selectedOrder!, reviewedItemKeys)}
              onRate={() => goRateOrder(selectedOrder!)}
            />
          )}
        </ScrollView>
      ) : (
        <View style={styles.listRoot}>
          <View style={styles.tabsWrap}>
            <DeliverySegmentTabs
              value={listTab}
              onChange={changeListTab}
              activeCount={activeOrders.length}
              finishedCount={finishedOrders.length}
            />
          </View>

          {listTab === 'finished' ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
              style={styles.filterBar}
              keyboardShouldPersistTaps="handled"
            >
              {finishedFilters.map((filter) => {
                const selected = finishedFilter === filter.key;
                return (
                  <Pressable
                    key={filter.key}
                    onPress={() => setFinishedFilter(filter.key)}
                    style={[styles.filterChip, selected && styles.filterChipActive]}
                  >
                    <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>
                      {filter.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          <ScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onPagerScrollEnd}
            scrollEventThrottle={16}
            style={styles.pager}
            keyboardShouldPersistTaps="handled"
          >
            <ScrollView
              style={{ width: pageWidth }}
              contentContainerStyle={[
                styles.pageContent,
                styles.pageContentGrow,
                { paddingBottom: insets.bottom + 28 },
              ]}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={refreshList}
                  tintColor={ui.brand}
                />
              }
            >
              {renderOrderCards(activeOrders, 'active', true)}
            </ScrollView>

            <ScrollView
              style={{ width: pageWidth }}
              contentContainerStyle={[
                styles.pageContent,
                styles.pageContentGrow,
                { paddingBottom: insets.bottom + 28 },
              ]}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={refreshList}
                  tintColor={ui.brand}
                />
              }
            >
              {renderOrderCards(filteredFinishedOrders, 'finished', false)}
            </ScrollView>
          </ScrollView>
        </View>
      )}

      {SHOW_ORDER_RETURN_UI ? (
        <ReturnRequestModal
          visible={returnOpen}
          order={selectedOrder}
          token={token || ''}
          onClose={() => setReturnOpen(false)}
          onSubmitted={() => {
            setHasPendingReturn(true);
            void loadOrders(selectedOrder?.id, { silent: true });
          }}
        />
      ) : null}
    </View>
  );
}

function OrderDetail({
  order,
  currentStep,
  cancelled,
  itemsTotal,
  cancelling,
  onCancel,
  canReturn,
  returnPending,
  onReturn,
  onBackToList,
  onRate,
  isReviewed,
}: {
  order: Order;
  currentStep: number;
  cancelled: boolean;
  itemsTotal: number;
  cancelling: boolean;
  onCancel: () => void;
  canReturn: boolean;
  returnPending: boolean;
  onReturn: () => void;
  onBackToList: () => void;
  onRate?: () => void;
  isReviewed?: boolean;
}) {
  const { ui, styles } = useEntregaTheme();
  const { t } = useLocale();
  const pickup = isPickupOrder(order);
  const steps = useMemo(() => getSteps(t, pickup), [t, pickup]);
  const item = firstItem(order);
  const tone = statusTone(order.status, ui);

  return (
    <Animated.View entering={FadeInDown.duration(380)} style={{ gap: 12 }}>
      <GlassCard>
        <View style={styles.detailHero}>
          {item?.image_url ? (
            <Image source={{ uri: item.image_url }} style={styles.detailPhoto} contentFit="cover" />
          ) : (
            <View style={[styles.detailPhoto, styles.productPhotoFallback]}>
              <Ionicons name="cube-outline" size={28} color={ui.brand} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.detailProductName} numberOfLines={2}>
              {item?.title || `${t('delivery.headerOrder')} #${order.order_number}`}
            </Text>
            <Text style={styles.detailOrderNumber}>#{order.order_number}</Text>
            <View style={[styles.statusPill, { backgroundColor: tone.bg, marginTop: 8 }]}>
              <View style={[styles.statusDot, { backgroundColor: tone.text }]} />
              <Text style={[styles.statusPillText, { color: tone.text }]}>
                {statusLabel(order.status, t, pickup)}
              </Text>
            </View>
          </View>
        </View>
      </GlassCard>

      <GlassCard>
        <Text style={styles.blockTitle}>{t('delivery.orderData')}</Text>
        <View style={styles.infoBlock}>
          <View style={styles.infoIcon}>
            <Ionicons name="calendar-outline" size={16} color={ui.brand} />
          </View>
          <View style={styles.infoTextCol}>
            <Text style={styles.infoLabel}>{t('delivery.placedAt')}</Text>
            <Text style={styles.infoValue}>{formatPlacedAt(order.created_at)}</Text>
          </View>
        </View>

        <View style={styles.infoBlock}>
          <View style={styles.infoIcon}>
            <Ionicons name="storefront-outline" size={16} color={ui.brand} />
          </View>
          <View style={styles.infoTextCol}>
            <Text style={styles.infoLabel}>{t('delivery.store')}</Text>
            <Text style={styles.infoValue}>{order.store?.name || t('delivery.pickupInfoMissing')}</Text>
          </View>
        </View>

        {pickup ? (
          <>
            <View style={styles.infoBlock}>
              <View style={styles.infoIcon}>
                <Ionicons name="bag-handle-outline" size={16} color={ui.brand} />
              </View>
              <View style={styles.infoTextCol}>
                <Text style={styles.infoLabel}>{t('delivery.modality')}</Text>
                <Text style={styles.infoValue}>{t('delivery.pickupAtStore')}</Text>
              </View>
            </View>
            <View style={styles.infoBlock}>
              <View style={styles.infoIcon}>
                <Ionicons name="location-outline" size={16} color={ui.brand} />
              </View>
              <View style={styles.infoTextCol}>
                <Text style={styles.infoLabel}>{t('delivery.pickupAddress')}</Text>
                <Text style={styles.infoValue}>
                  {order.store?.address || t('delivery.pickupInfoMissing')}
                </Text>
              </View>
            </View>
            <View style={styles.infoBlock}>
              <View style={styles.infoIcon}>
                <Ionicons name="call-outline" size={16} color={ui.brand} />
              </View>
              <View style={styles.infoTextCol}>
                <Text style={styles.infoLabel}>{t('delivery.pickupContact')}</Text>
                <Text style={styles.infoValue}>
                  {order.store?.phone || t('delivery.pickupInfoMissing')}
                </Text>
              </View>
            </View>
            <View style={styles.infoBlock}>
              <View style={styles.infoIcon}>
                <Ionicons name="time-outline" size={16} color={ui.brand} />
              </View>
              <View style={styles.infoTextCol}>
                <Text style={styles.infoLabel}>{t('delivery.pickupHours')}</Text>
                <Text style={styles.infoValue}>
                  {order.store?.opening_hours || t('delivery.pickupInfoMissing')}
                </Text>
              </View>
            </View>
          </>
        ) : order.delivery ? (
          <View style={styles.infoBlock}>
            <View style={styles.infoIcon}>
              <Ionicons name="location-outline" size={16} color={ui.brand} />
            </View>
            <View style={styles.infoTextCol}>
              <Text style={styles.infoLabel}>
                {t('delivery.deliverTo', { label: order.delivery.label || '' })}
              </Text>
              <Text style={styles.infoValue}>{order.delivery.address}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.infoBlock}>
            <View style={styles.infoIcon}>
              <Ionicons name="bag-handle-outline" size={16} color={ui.brand} />
            </View>
            <View style={styles.infoTextCol}>
              <Text style={styles.infoLabel}>{t('delivery.modality')}</Text>
              <Text style={styles.infoValue}>{t('delivery.pickupAtStore')}</Text>
            </View>
          </View>
        )}

        <View style={[styles.infoBlock, { marginBottom: 0 }]}>
          <View style={styles.infoIcon}>
            <Ionicons name="person-outline" size={16} color={ui.brand} />
          </View>
          <View style={styles.infoTextCol}>
            <Text style={styles.infoLabel}>{t('delivery.buyer')}</Text>
            <Text style={styles.infoValue}>
              {[order.buyer?.nome, order.buyer?.apelido].filter(Boolean).join(' ')}
            </Text>
            <Text style={styles.infoSub}>{order.buyer?.telefone}</Text>
          </View>
        </View>
      </GlassCard>

      <GlassCard>
        <Text style={styles.blockTitle}>{t('delivery.items')}</Text>
        {(order.items || []).map((line) => (
          <View key={line.id} style={styles.itemRow}>
            {line.image_url ? (
              <Image source={{ uri: line.image_url }} style={styles.itemImage} contentFit="cover" />
            ) : (
              <View style={[styles.itemImage, styles.productPhotoFallback]}>
                <Ionicons name="image-outline" size={16} color={ui.brand} />
              </View>
            )}
            <View style={styles.itemInfo}>
              <Text style={styles.itemTitle} numberOfLines={2}>{line.title}</Text>
              {!!line.variant_label && (
                <Text style={styles.itemMeta} numberOfLines={1}>{line.variant_label}</Text>
              )}
              <Text style={styles.itemMeta}>{t('delivery.qty', { n: line.quantity })}</Text>
            </View>
            <Text style={styles.itemPrice}>{formatCfa(line.line_total)}</Text>
          </View>
        ))}

        <View style={styles.totalsBox}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{t('delivery.subtotal')}</Text>
            <Text style={styles.totalValue}>{formatCfa(itemsTotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{t('delivery.deliveryFee')}</Text>
            <Text style={styles.totalValue}>
              {order.delivery_fee > 0 ? formatCfa(order.delivery_fee) : t('common.free')}
            </Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{t('delivery.payment')}</Text>
            <Text style={styles.totalValue}>{paymentLabel(order.payment_method, t, pickup)}</Text>
          </View>
          <View style={[styles.totalRow, styles.totalRowFinal]}>
            <Text style={styles.totalFinalLabel}>{t('common.total')}</Text>
            <Text style={styles.totalFinalValue}>{formatCfa(order.total)}</Text>
          </View>
        </View>
      </GlassCard>

      {!cancelled && (
        <GlassCard>
          <Text style={styles.blockTitle}>
            {pickup ? t('delivery.pickupStatus') : t('delivery.deliveryStatus')}
          </Text>
          {steps.map((step, index) => {
            const done = index < currentStep;
            const active = index === currentStep;
            return (
              <View key={step.id} style={styles.stepRow}>
                <View style={styles.timelineCol}>
                  <View
                    style={[
                      styles.stepNode,
                      (done || active) && styles.stepNodeActive,
                      done && styles.stepNodeDone,
                    ]}
                  >
                    <Ionicons
                      name={done ? 'checkmark' : step.icon}
                      size={14}
                      color={done || active ? '#FFF' : ui.brand}
                    />
                  </View>
                  {index < steps.length - 1 && (
                    <View style={[styles.stepLine, done && styles.stepLineDone]} />
                  )}
                </View>
                <View style={[styles.stepContent, active && styles.stepContentActive]}>
                  <Text style={[styles.stepTitle, (done || active) && styles.stepTitleActive]}>
                    {step.title}
                  </Text>
                  {active && (
                    <View style={styles.livePill}>
                      <View style={styles.liveDot} />
                      <Text style={styles.liveText}>{t('delivery.current')}</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </GlassCard>
      )}

      {canCancel(order) && (
        <Pressable
          style={[styles.cancelBtn, cancelling && { opacity: 0.55 }]}
          disabled={cancelling}
          onPress={onCancel}
        >
          {cancelling ? (
            <RippleWaveLoader size="small" color={ui.danger} />
          ) : (
            <>
              <Ionicons name="close-circle-outline" size={20} color={ui.danger} />
              <Text style={styles.cancelBtnText}>{t('delivery.cancelOrder')}</Text>
            </>
          )}
        </Pressable>
      )}

      {order.status === 'delivered' && onRate ? (
        <Pressable style={styles.rateDetailBtn} onPress={onRate}>
          <Ionicons
            name={isReviewed ? 'star' : 'star-outline'}
            size={20}
            color={ui.brand}
          />
          <Text style={styles.rateDetailBtnText}>
            {isReviewed ? t('delivery.reavaliar') : t('delivery.avaliar')}
          </Text>
        </Pressable>
      ) : null}

      {canReturn ? (
        <Pressable style={styles.returnBtn} onPress={onReturn}>
          <Ionicons name="return-down-back-outline" size={20} color={ui.brand} />
          <Text style={styles.returnBtnText}>{t('delivery.returnProduct')}</Text>
        </Pressable>
      ) : null}

      {returnPending ? (
        <View style={styles.returnPendingBanner}>
          <Ionicons name="time-outline" size={18} color={ui.brand} />
          <Text style={styles.returnPendingText}>{t('delivery.returnPending')}</Text>
        </View>
      ) : null}

      {cancelled && (
        <View style={styles.cancelledBanner}>
          <Ionicons name="information-circle-outline" size={18} color={ui.danger} />
          <Text style={styles.cancelledBannerText}>
            {t('delivery.orderCancelled')}
            {order.cancelled_at ? ` · ${formatPlacedAt(order.cancelled_at)}` : ''}
          </Text>
        </View>
      )}

      <Pressable style={styles.seeAllBtn} onPress={onBackToList}>
        <Text style={styles.seeAllText}>{t('delivery.seeAll')}</Text>
      </Pressable>
    </Animated.View>
  );
}

function createStyles(ui: AppUI, isDark: boolean) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: ui.bg },
  centered: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 18 },
  header: {
    paddingHorizontal: 18,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
  },
  backBtnInner: {
    ...StyleSheet.absoluteFillObject,
    margin: 1.5,
    borderRadius: 18,
    overflow: 'hidden',
  },
  backBtnBlur: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
    color: isDark ? '#FFFFFF' : '#111111',
  },
  headerSpacer: { width: 40 },

  glassOuter: {
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: ui.border,
    backgroundColor: ui.card,
    marginBottom: 10,
  },
  glassInner: { padding: 14 },

  listRoot: {
    flex: 1,
  },
  tabsWrap: {
    paddingHorizontal: 18,
    marginBottom: 4,
  },
  pager: {
    flex: 1,
  },
  pageContent: {
    paddingHorizontal: 18,
    flexGrow: 1,
  },
  pageContentGrow: {
    flexGrow: 1,
  },
  emptyState: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 48,
    minHeight: 360,
  },
  emptyStateImageWrap: {
    width: 240,
    height: 200,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateImage: {
    width: 240,
    height: 200,
  },
  emptyStateImageAbsolute: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  emptyStateImageVisible: {
    opacity: 1,
  },
  emptyStateImageHidden: {
    opacity: 0,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: ui.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: ui.muted,
    textAlign: 'center',
    maxWidth: 280,
  },
  listIntro: { marginBottom: 8, marginTop: 2 },
  listHint: {
    fontSize: 13,
    color: ui.muted,
    fontWeight: '500',
  },
  filterBar: {
    flexGrow: 0,
    marginBottom: 10,
    paddingLeft: 18,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 18,
    paddingVertical: 2,
  },
  filterChip: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)',
    backgroundColor: isDark ? '#2A2A2A' : '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: isDark ? 'rgba(100,181,246,0.22)' : 'rgba(13,71,161,0.12)',
    borderColor: isDark ? 'rgba(100,181,246,0.85)' : 'rgba(13,71,161,0.55)',
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: isDark ? '#FFFFFF' : '#111111',
  },
  filterChipTextActive: {
    fontWeight: '700',
    color: isDark ? '#FFFFFF' : '#111111',
  },
  compactMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  rateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ui.brand,
    backgroundColor: ui.brandSoft,
  },
  rateBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: ui.brand,
  },
  tabs: {
    flexDirection: 'row',
    marginBottom: 14,
    padding: 4,
    borderRadius: 18,
    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    position: 'relative',
    overflow: 'hidden',
  },
  tabPill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 0,
    borderRadius: 14,
    backgroundColor: ui.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    shadowColor: '#000',
    shadowOpacity: isDark ? 0.35 : 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    zIndex: 1,
  },
  tabActive: {},
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: ui.muted,
    letterSpacing: 0.1,
  },
  tabTextActive: {
    color: ui.text,
    fontWeight: '800',
  },
  tabCount: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
  },
  tabCountActive: {
    backgroundColor: ui.brandSoft,
  },
  tabCountText: {
    fontSize: 10,
    fontWeight: '800',
    color: ui.muted,
  },
  tabCountTextActive: {
    color: ui.brand,
  },

  section: { marginBottom: 18 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: ui.text,
  },
  countPill: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(13,71,161,0.1)',
  },
  countPillText: { fontSize: 12, fontWeight: '800', color: ui.brand },
  sectionEmpty: {
    fontSize: 13,
    color: ui.muted,
    paddingVertical: 18,
    paddingHorizontal: 4,
    textAlign: 'center',
  },

  compactCard: { marginBottom: 10 },
  compactRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  compactMainPress: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  productPhoto: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: 'rgba(13,71,161,0.08)',
  },
  productPhotoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactInfo: { flex: 1, gap: 8, minWidth: 0 },
  productName: {
    fontSize: 13,
    fontWeight: '700',
    color: ui.text,
    lineHeight: 17,
  },
  statusPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { fontSize: 12, fontWeight: '700' },

  emptyGlass: { alignItems: 'center', gap: 8, paddingVertical: 28, marginTop: 40 },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: ui.text,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 13,
    lineHeight: 19,
    color: ui.muted,
    textAlign: 'center',
  },
  primaryBtn: {
    marginTop: 10,
    backgroundColor: ui.brand,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
  },
  primaryBtnText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  ghostBtn: { marginTop: 4, padding: 10 },
  ghostBtnText: { color: ui.muted, fontWeight: '600' },

  detailHero: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  detailPhoto: {
    width: 78,
    height: 78,
    borderRadius: 18,
    backgroundColor: 'rgba(13,71,161,0.08)',
  },
  detailProductName: {
    fontSize: 17,
    fontWeight: '800',
    color: ui.text,
    lineHeight: 22,
  },
  detailOrderNumber: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '700',
    color: ui.brand,
  },

  blockTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: ui.text,
    marginBottom: 12,
  },
  infoBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  infoIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(13,71,161,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  infoTextCol: { flex: 1 },
  infoLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: ui.muted,
    marginBottom: 2,
  },
  infoValue: { fontSize: 14, fontWeight: '700', color: ui.text },
  infoSub: {
    marginTop: 2,
    fontSize: 12,
    color: ui.muted,
    lineHeight: 16,
  },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  itemImage: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(13,71,161,0.08)',
  },
  itemInfo: { flex: 1, marginHorizontal: 10 },
  itemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: ui.text,
    lineHeight: 18,
  },
  itemMeta: {
    marginTop: 3,
    fontSize: 12,
    color: ui.muted,
    fontWeight: '500',
  },
  itemPrice: { fontSize: 13, fontWeight: '800', color: ui.text },

  totalsBox: {
    marginTop: 4,
    borderRadius: 16,
    backgroundColor: ui.divider,
    padding: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  totalRowFinal: {
    marginBottom: 0,
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(13,71,161,0.1)',
  },
  totalLabel: { fontSize: 12, color: ui.muted, fontWeight: '500' },
  totalValue: { fontSize: 12, fontWeight: '700', color: ui.text },
  totalFinalLabel: { fontSize: 14, fontWeight: '800', color: ui.text },
  totalFinalValue: { fontSize: 15, fontWeight: '900', color: ui.brand },

  stepRow: { flexDirection: 'row', minHeight: 58 },
  timelineCol: { width: 30, alignItems: 'center' },
  stepNode: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: 'rgba(13,71,161,0.25)',
    backgroundColor: ui.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNodeActive: {
    backgroundColor: ui.brand,
    borderColor: ui.brand,
  },
  stepNodeDone: {
    backgroundColor: ui.brand,
    borderColor: ui.brand,
  },
  stepLine: {
    width: 3,
    flex: 1,
    marginVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(13,71,161,0.12)',
  },
  stepLineDone: { backgroundColor: ui.brand },
  stepContent: {
    flex: 1,
    marginLeft: 12,
    paddingBottom: 14,
    justifyContent: 'center',
  },
  stepContentActive: {
    backgroundColor: 'rgba(13,71,161,0.05)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.muted,
  },
  stepTitleActive: { color: ui.text },
  livePill: {
    marginTop: 6,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(13,71,161,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: ui.brand,
  },
  liveText: { fontSize: 11, fontWeight: '700', color: ui.brand },

  cancelBtn: {
    marginTop: 4,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(185,28,28,0.35)',
    backgroundColor: 'rgba(254,226,226,0.75)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  cancelBtnText: { color: ui.danger, fontSize: 15, fontWeight: '800' },
  rateDetailBtn: {
    marginTop: 4,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: ui.brand,
    backgroundColor: ui.brandSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  rateDetailBtnText: { color: ui.brand, fontSize: 15, fontWeight: '800' },
  returnBtn: {
    marginTop: 4,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: ui.brand,
    backgroundColor: ui.brandSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  returnBtnText: { color: ui.brand, fontSize: 15, fontWeight: '800' },
  returnPendingBanner: {
    marginTop: 4,
    borderRadius: 14,
    backgroundColor: ui.brandSoft,
    borderWidth: 1,
    borderColor: ui.border,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  returnPendingText: {
    flex: 1,
    color: ui.brand,
    fontSize: 13,
    fontWeight: '700',
  },
  cancelledBanner: {
    marginTop: 4,
    borderRadius: 14,
    backgroundColor: 'rgba(254,226,226,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(185,28,28,0.2)',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cancelledBannerText: {
    flex: 1,
    color: ui.danger,
    fontSize: 13,
    fontWeight: '700',
  },
  seeAllBtn: {
    marginTop: 6,
    alignItems: 'center',
    paddingVertical: 12,
  },
  seeAllText: { color: ui.brand, fontWeight: '700', fontSize: 14 },
});
}

