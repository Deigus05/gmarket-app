import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  InteractionManager,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  createOrderBatch,
  getGcoinWallet,
  getProductById,
  syncCartToServer,
  validatePromoCode,
  type LiveStore,
  type PromoCodeValidation,
} from '@/components/api';
import { notifyAdminOfSale } from '@/lib/saleNotify';
import {
  clearCheckoutDraft,
  getCartJson,
  getCheckoutDraftJson,
  setCartJson,
  setCheckoutDraftJson,
} from '@/lib/cartStorage';
import { parseCartItems } from '@/lib/cartTypes';
import { useAuth } from '@/components/AuthContext';
import { KeyboardFormScrollView } from '@/components/KeyboardFormScrollView';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import { useLocale } from '@/components/LocaleContext';
import TornadoOverlay from '@/components/TornadoOverlay';
import { useAppTheme } from '@/components/tema';
import { trackAnalytics } from '@/lib/analytics';
import { confirmUser, notifyUser } from '@/lib/notify';
import {
  cartItemId,
  formatCfa,
  formatGcoin,
  normalizeVariantId,
  parseMoney,
  resolveUnitPrice,
} from '@/lib/productPricing';

const DEFAULT_DELIVERY_FEE = 1500;

type CheckoutPalette = {
  mist: string;
  soft: string;
  white: string;
  ink: string;
  muted: string;
  accent: string;
  accentDeep: string;
  line: string;
  gold: string;
  danger: string;
};

type PaymentMethod = 'entrega' | 'gpay';
type OrderMethod = 'entrega' | 'recolha';

type CheckoutLine = {
  productId: string;
  variantId?: string;
  title: string;
  image: string;
  price: string;
  regularPrice: string;
  gpayPrice: string;
  quantity: string;
  variantLabel?: string;
  maxStock?: string;
  cartItemId?: string;
};

type ProductDeliveryInfo = {
  fee: number;
  time: string | null;
};

function resolveDeliveryFee(raw: unknown): number {
  if (raw === null || raw === undefined || raw === '') return DEFAULT_DELIVERY_FEE;
  const fee = Number(raw);
  return Number.isFinite(fee) && fee >= 0 ? fee : DEFAULT_DELIVERY_FEE;
}

/** Params de rota (compra rápida) — um produto. */
type CheckoutParams = Omit<CheckoutLine, 'cartItemId'>;

type CheckoutDraftStored = CheckoutLine | { items: CheckoutLine[] };

function paramValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

function normalizeCheckoutLines(raw: unknown): CheckoutLine[] {
  if (!raw || typeof raw !== 'object') return [];
  const data = raw as CheckoutDraftStored;
  if ('items' in data && Array.isArray(data.items)) {
    return data.items
      .filter((item) => item?.productId && item?.title)
      .map(normalizeCheckoutLine);
  }
  const single = data as CheckoutLine;
  if (single.productId && single.title) return [normalizeCheckoutLine(single)];
  return [];
}

function normalizeCheckoutLine(line: CheckoutLine): CheckoutLine {
  const regularPrice = parseMoney(line.regularPrice, parseMoney(line.price));
  return {
    ...line,
    variantId: normalizeVariantId(line.variantId),
    price: String(regularPrice),
    regularPrice: String(regularPrice),
    gpayPrice: String(parseMoney(line.gpayPrice)),
    quantity: String(Math.max(1, Math.floor(parseMoney(line.quantity, 1)))),
  };
}

async function hydrateCheckoutLines(lines: CheckoutLine[]): Promise<CheckoutLine[]> {
  return Promise.all(
    lines.map(async (line) => {
      const product = await getProductById(line.productId).catch(() => null);
      if (!product) return normalizeCheckoutLine(line);
      const variantId = normalizeVariantId(line.variantId);
      const variant = variantId
        ? product.variants?.combinations?.find((item) => item.id === variantId)
        : product.variants?.combinations?.find((item) => item.is_default)
          ?? product.variants?.combinations?.[0];
      const regularPrice = parseMoney(variant?.preco ?? product.preco);
      const gpayPrice = parseMoney(variant?.preco_gpay ?? product.preco_gpay);
      const stock = variant?.stock ?? product.stock;
      return {
        ...line,
        variantId,
        price: String(regularPrice),
        regularPrice: String(regularPrice),
        gpayPrice: String(gpayPrice),
        maxStock: String(Math.max(0, Number(stock) || 0)),
      };
    }),
  );
}

function persistCheckoutLines(lines: CheckoutLine[]) {
  if (lines.length === 1) {
    return setCheckoutDraftJson(JSON.stringify(lines[0]));
  }
  return setCheckoutDraftJson(JSON.stringify({ items: lines }));
}

export default function CheckoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ui, colors, isDark } = useAppTheme();
  const C = useMemo<CheckoutPalette>(() => ({
    mist: ui.bg,
    soft: ui.bg,
    white: ui.card,
    ink: ui.text,
    muted: ui.muted,
    accent: colors.accent,
    accentDeep: colors.accent,
    line: ui.border,
    gold: '#D4A017',
    danger: ui.danger,
  }), [ui, colors.accent]);
  const styles = useMemo(() => createStyles(C, isDark), [C, isDark]);
  const { t } = useLocale();
  const { user, token, isLoggedIn, loading: authLoading, refreshUser } = useAuth();
  const params = useLocalSearchParams<CheckoutParams>();

  const [lines, setLines] = useState<CheckoutLine[]>([]);
  const [loadingDraft, setLoadingDraft] = useState(true);
  const [gpayBalance, setGpayBalance] = useState<number | null>(null);
  const [orderMethod, setOrderMethod] = useState<OrderMethod>('entrega');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('entrega');
  const [checkoutStore, setCheckoutStore] = useState<LiveStore | null>(null);
  const [checkoutStores, setCheckoutStores] = useState<LiveStore[]>([]);
  const [loadingCheckoutStore, setLoadingCheckoutStore] = useState(false);
  const [deliveryByProduct, setDeliveryByProduct] = useState<Record<string, ProductDeliveryInfo>>({});
  const [editingBuyer, setEditingBuyer] = useState(false);
  const [buyerNome, setBuyerNome] = useState('');
  const [buyerApelido, setBuyerApelido] = useState('');
  const [buyerTelefone, setBuyerTelefone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const mountedRef = useRef(true);
  const purchaseInFlightRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const [showTornado, setShowTornado] = useState(false);
  const [successOrder, setSuccessOrder] = useState<{
    id: string;
    orderNumber: string;
    orderNumbers: string[];
    chargedTotal: number;
  } | null>(null);
  const [promoInput, setPromoInput] = useState('');
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoApplying, setPromoApplying] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [appliedPromo, setAppliedPromo] = useState<PromoCodeValidation | null>(null);
  const checkScale = useSharedValue(0);
  const ringScale = useSharedValue(0.6);
  const ringOpacity = useSharedValue(0.5);

  useEffect(() => {
    mountedRef.current = true;
    trackAnalytics('checkout_start', { source: 'checkout' });
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!purchaseInFlightRef.current) idempotencyKeyRef.current = null;
  }, [
    appliedPromo?.code,
    buyerApelido,
    buyerNome,
    buyerTelefone,
    lines,
    orderMethod,
    paymentMethod,
  ]);

  const hydrateBuyer = useCallback(() => {
    if (!user) return;
    setBuyerNome(user.nome || '');
    setBuyerApelido(user.apelido || '');
    setBuyerTelefone(user.telefone || '');
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function load() {
        setLoadingDraft(true);
        // Atualiza user em paralelo — não bloqueia o primeiro paint
        void refreshUser();

        try {
          const fromParams: CheckoutLine = {
            productId: paramValue(params.productId),
            variantId: paramValue(params.variantId) || undefined,
            title: paramValue(params.title),
            image: paramValue(params.image),
            price: paramValue(params.price),
            regularPrice: paramValue(params.regularPrice) || paramValue(params.price),
            gpayPrice: paramValue(params.gpayPrice),
            quantity: paramValue(params.quantity) || '1',
            variantLabel: paramValue(params.variantLabel) || undefined,
            maxStock: paramValue(params.maxStock) || undefined,
          };

          if (fromParams.productId && fromParams.title) {
            const hydrated = await hydrateCheckoutLines([fromParams]);
            await persistCheckoutLines(hydrated);
            if (active) setLines(hydrated);
          } else {
            const stored = await getCheckoutDraftJson();
            let parsed: CheckoutLine[] = [];
            if (stored) {
              try {
                parsed = normalizeCheckoutLines(JSON.parse(stored));
              } catch {
                await clearCheckoutDraft();
              }
            }
            const hydrated = await hydrateCheckoutLines(parsed);
            if (JSON.stringify(parsed) !== JSON.stringify(hydrated)) {
              await persistCheckoutLines(hydrated);
            }
            if (active) setLines(hydrated);
          }
        } finally {
          if (active) setLoadingDraft(false);
        }

        if (!active) return;
        if (token) {
          const wallet = await getGcoinWallet(token);
          if (active) {
            setGpayBalance(wallet.success ? wallet.data.balance : null);
          }
        } else {
          setGpayBalance(null);
        }
      }

      load();
      return () => {
        active = false;
      };
    }, [
      params.productId,
      params.title,
      params.price,
      params.regularPrice,
      params.gpayPrice,
      params.quantity,
      params.image,
      refreshUser,
      token,
    ])
  );

  useFocusEffect(
    useCallback(() => {
      hydrateBuyer();
    }, [hydrateBuyer])
  );

  useEffect(() => {
    let active = true;
    const productIds = [...new Set(lines.map((line) => line.productId).filter(Boolean))];

    async function loadCheckoutMeta() {
      if (productIds.length === 0) {
        if (active) {
          setCheckoutStore(null);
          setCheckoutStores([]);
          setDeliveryByProduct({});
          setLoadingCheckoutStore(false);
        }
        return;
      }

      setLoadingCheckoutStore(true);
      try {
        const nextDelivery: Record<string, ProductDeliveryInfo> = {};
        let nextStore: LiveStore | null = null;
        const nextStores = new Map<string, LiveStore>();

        for (const productId of productIds) {
          const product = await getProductById(productId);
          if (!active) return;
          if (!product) {
            nextDelivery[productId] = { fee: DEFAULT_DELIVERY_FEE, time: null };
            continue;
          }

          nextDelivery[productId] = {
            fee: resolveDeliveryFee(product.delivery_fee),
            time: product.delivery_time?.trim() || null,
          };

          if (product.store?.id) {
            const store = product.store;
            const liveStore: LiveStore = {
              id: store.id,
              name: store.name,
              slug: store.slug || '',
              logo_url: store.logo_url ?? null,
              cover_url: store.cover_url ?? null,
              rating_avg: Number(store.rating_avg || 0),
              review_count: Number(store.review_count || 0),
              verified: Boolean(store.verified),
              address: store.address ?? null,
              phone: store.phone ?? null,
              opening_hours: store.opening_hours ?? null,
              fulfillment_mode: store.fulfillment_mode ?? 'ambos',
            };
            if (!nextStore) nextStore = liveStore;
            nextStores.set(liveStore.id, liveStore);
          }
        }

        if (active) {
          setDeliveryByProduct(nextDelivery);
          setCheckoutStore(nextStore);
          setCheckoutStores(Array.from(nextStores.values()));
        }
      } finally {
        if (active) setLoadingCheckoutStore(false);
      }
    }

    void loadCheckoutMeta();
    return () => {
      active = false;
    };
  }, [lines]);

  const allowsDelivery =
    checkoutStores.length === 0 ||
    checkoutStores.every(
      (store) =>
        (store.fulfillment_mode || 'ambos') === 'ambos' ||
        store.fulfillment_mode === 'entrega',
    );
  const allowsPickup =
    checkoutStores.length <= 1 &&
    (checkoutStores[0]?.fulfillment_mode || 'ambos') !== 'entrega';

  useEffect(() => {
    if (!allowsDelivery && allowsPickup && orderMethod !== 'recolha') {
      setOrderMethod('recolha');
      return;
    }
    if (!allowsPickup && allowsDelivery && orderMethod !== 'entrega') {
      setOrderMethod('entrega');
    }
  }, [allowsDelivery, allowsPickup, orderMethod]);

  const subtotal = lines.reduce((acc, line) => {
    const unitPrice = resolveUnitPrice(
      {
        regularPrice: parseMoney(line.regularPrice, parseMoney(line.price)),
        gpayPrice: parseMoney(line.gpayPrice),
      },
      paymentMethod,
    );
    const quantity = Math.max(1, Number(line.quantity || 1));
    return acc + unitPrice * quantity;
  }, 0);
  const deliveryFee =
    orderMethod === 'entrega'
      ? Object.values(deliveryByProduct).reduce(
          (acc, info) => acc + (info?.fee ?? DEFAULT_DELIVERY_FEE),
          0,
        )
      : 0;
  const promoItems = useMemo(
    () =>
      lines.map((line) => {
        const unitPrice = resolveUnitPrice(
          {
            regularPrice: parseMoney(line.regularPrice, parseMoney(line.price)),
            gpayPrice: parseMoney(line.gpayPrice),
          },
          paymentMethod,
        );
        const quantity = Math.max(1, Number(line.quantity || 1));
        return {
          productId: line.productId,
          subtotal: unitPrice * quantity,
        };
      }),
    [lines, paymentMethod],
  );
  const promoProductIds = useMemo(
    () => promoItems.map((item) => item.productId).filter(Boolean),
    [promoItems],
  );
  const discountAmount = Math.min(subtotal, Math.max(0, Number(appliedPromo?.discount_amount || 0)));
  const total = Math.max(0, subtotal + deliveryFee - discountAmount);
  const canPayWithGpay = gpayBalance !== null && gpayBalance >= total;
  const formatPaymentAmount = paymentMethod === 'gpay' ? formatGcoin : formatCfa;

  useEffect(() => {
    if (!appliedPromo) return;
    // Revalida o desconto se o carrinho mudar (quantidade/itens/elegibilidade).
    let cancelled = false;
    void (async () => {
      if (!token) return;
      const result = await validatePromoCode(token, {
        code: appliedPromo.code,
        subtotal,
        productIds: promoProductIds,
        items: promoItems,
      });
      if (cancelled) return;
      if (!result.success || !result.data) {
        setAppliedPromo(null);
        setPromoError(result.message || t('checkout.promoInvalid'));
        return;
      }
      setAppliedPromo(result.data);
      setPromoError(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [subtotal, token, promoProductIds, promoItems]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApplyPromo = async () => {
    const code = promoInput.trim();
    if (!code) {
      setPromoError(t('checkout.promoEmpty'));
      return;
    }
    if (!token) {
      router.push({ pathname: '/login', params: { redirect: 'checkout' } });
      return;
    }
    setPromoApplying(true);
    setPromoError(null);
    try {
      const result = await validatePromoCode(token, {
        code,
        subtotal,
        productIds: promoProductIds,
        items: promoItems,
      });
      if (!result.success || !result.data) {
        setAppliedPromo(null);
        setPromoError(result.message || t('checkout.promoInvalid'));
        return;
      }
      setAppliedPromo(result.data);
      setPromoInput(result.data.code);
      setPromoError(null);
    } finally {
      setPromoApplying(false);
    }
  };

  const handleRemovePromo = () => {
    setAppliedPromo(null);
    setPromoInput('');
    setPromoError(null);
  };

  const deliveryHintFee = useMemo(() => {
    if (lines.length === 0) return DEFAULT_DELIVERY_FEE;
    if (lines.length === 1) {
      return deliveryByProduct[lines[0].productId]?.fee ?? DEFAULT_DELIVERY_FEE;
    }
    return null;
  }, [deliveryByProduct, lines]);

  const deliveryTimes = useMemo(() => {
    const times = lines
      .map((line) => {
        const time = deliveryByProduct[line.productId]?.time;
        if (!time) return null;
        return lines.length > 1 ? `${line.title}: ${time}` : time;
      })
      .filter((value): value is string => Boolean(value));
    return [...new Set(times)];
  }, [deliveryByProduct, lines]);

  const addressLabel = user?.endereco?.label || t('checkout.noLocation');
  const addressDetails = user?.endereco?.details || t('checkout.addLocation');

  const paymentHint = useMemo(() => {
    if (paymentMethod === 'gpay') {
      if (gpayBalance === null) return t('checkout.gpayUnavailable');
      return canPayWithGpay
        ? t('checkout.gpayDebitHint')
        : t('checkout.gpayInsufficient');
    }
    return orderMethod === 'recolha' ? t('checkout.cashHintPickup') : t('checkout.cashHint');
  }, [paymentMethod, canPayWithGpay, gpayBalance, orderMethod, t]);

  const handleEditAddress = async () => {
    if (lines.length > 0) {
      await persistCheckoutLines(lines);
    }
    router.push({ pathname: '/adicionar-endereco', params: { redirect: 'checkout' } });
  };

  useEffect(() => {
    if (!successOrder) return;
    checkScale.value = withDelay(120, withSpring(1, { damping: 10, stiffness: 140 }));
    ringScale.value = withSequence(
      withTiming(1.35, { duration: 700, easing: Easing.out(Easing.cubic) }),
      withTiming(1.55, { duration: 500 }),
    );
    ringOpacity.value = withSequence(
      withTiming(0.45, { duration: 200 }),
      withTiming(0, { duration: 900 }),
    );
  }, [checkScale, ringOpacity, ringScale, successOrder]);

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  const closeSuccessFlow = useCallback(() => {
    setShowTornado(false);
    setSuccessOrder(null);
  }, []);

  const leaveCheckoutStack = useCallback(
    (next?: Href) => {
      closeSuccessFlow();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          InteractionManager.runAfterInteractions(() => {
            if (router.canDismiss()) {
              router.dismissTo('/(tabs)');
            } else {
              router.navigate('/(tabs)');
            }
            if (!next) return;
            requestAnimationFrame(() => {
              router.push(next);
            });
          });
        });
      });
    },
    [closeSuccessFlow, router],
  );

  const goToOrder = () => {
    if (!successOrder) return;
    const orderId = successOrder.id;
    leaveCheckoutStack({
      pathname: '/entrega',
      params: { orderId, fromPurchase: '1' },
    });
  };

  const goHome = () => {
    leaveCheckoutStack();
  };

  const successCard = successOrder ? (
    <Animated.View entering={FadeIn.duration(280)} style={styles.successCard}>
      <View style={styles.successIconWrap}>
        <Animated.View style={[styles.successRing, ringStyle]} />
        <Animated.View style={[styles.successCheck, checkStyle]}>
          <Ionicons name="checkmark" size={28} color="#FFF" />
        </Animated.View>
      </View>

      <Animated.Text entering={FadeInDown.delay(180).duration(360)} style={styles.successTitle}>
        {t('checkout.successTitle')}
      </Animated.Text>
      <Animated.Text entering={FadeInDown.delay(260).duration(360)} style={styles.successSubtitle}>
        {orderMethod === 'recolha'
          ? t('checkout.successSubtitlePickup')
          : t('checkout.successSubtitle')}
      </Animated.Text>

      <Animated.View entering={ZoomIn.delay(340).springify()} style={styles.orderNumberBox}>
        <Text style={styles.orderNumberLabel}>{t('checkout.orderNumber')}</Text>
        <Text style={styles.orderNumberValue}>
          {successOrder.orderNumbers.map((number) => `#${number}`).join('\n')}
        </Text>
        <Text style={styles.helperText}>
          {paymentMethod === 'gpay'
            ? formatGcoin(successOrder.chargedTotal)
            : formatCfa(successOrder.chargedTotal)}
        </Text>
      </Animated.View>

      <TouchableOpacity style={styles.successPrimaryBtn} onPress={goToOrder} activeOpacity={0.9}>
        <Ionicons
          name={orderMethod === 'recolha' ? 'storefront-outline' : 'bicycle-outline'}
          size={18}
          color={C.accent}
        />
        <Text style={styles.successPrimaryText}>
          {orderMethod === 'recolha' ? t('checkout.trackPickup') : t('checkout.trackDelivery')}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.successGhostBtn} onPress={goHome}>
        <Text style={styles.successGhostText}>{t('checkout.goHome')}</Text>
      </TouchableOpacity>
    </Animated.View>
  ) : null;

  const dismissTornado = useCallback(() => {
    setShowTornado(false);
    setSuccessOrder(null);
  }, []);

  const handleConfirmPurchase = async () => {
    if (purchaseInFlightRef.current) return;
    if (loadingCheckoutStore) {
      notifyUser(t('checkout.incompleteTitle'), t('checkout.preparing'));
      return;
    }
    if (!isLoggedIn || !token) {
      router.push({ pathname: '/login', params: { redirect: 'checkout' } });
      return;
    }
    if (lines.length === 0) {
      notifyUser(t('checkout.incompleteTitle'), t('checkout.incompleteMessage'));
      return;
    }
    if (!buyerNome.trim() || !buyerTelefone.trim()) {
      notifyUser(t('checkout.buyerTitle'), t('checkout.buyerFill'));
      setEditingBuyer(true);
      return;
    }
    if (orderMethod === 'entrega' && !user?.endereco?.details) {
      const edit = await confirmUser(
        t('checkout.locationTitle'),
        t('checkout.locationNeeded'),
        t('checkout.editLocation'),
      );
      if (edit) handleEditAddress();
      return;
    }
    purchaseInFlightRef.current = true;
    setSubmitting(true);
    try {
      const freshLines = await hydrateCheckoutLines(lines);
      const outOfStock = freshLines.find((line) => {
        const stock = Number(line.maxStock);
        return Number.isFinite(stock) && Math.max(1, Number(line.quantity || 1)) > stock;
      });
      if (outOfStock) {
        notifyUser(
          t('checkout.incompleteTitle'),
          t('checkout.stockUnavailable', { product: outOfStock.title }),
        );
        return;
      }
      setLines(freshLines);
      await persistCheckoutLines(freshLines);

      const freshPromoItems = freshLines.map((line) => {
        const unitPrice = resolveUnitPrice(
          {
            regularPrice: parseMoney(line.regularPrice, parseMoney(line.price)),
            gpayPrice: parseMoney(line.gpayPrice),
          },
          paymentMethod,
        );
        return {
          productId: line.productId,
          subtotal: unitPrice * Math.max(1, Number(line.quantity || 1)),
        };
      });
      const freshSubtotal = freshPromoItems.reduce((sum, item) => sum + item.subtotal, 0);
      let confirmedPromo = appliedPromo;
      if (appliedPromo) {
        const promoResult = await validatePromoCode(token, {
          code: appliedPromo.code,
          subtotal: freshSubtotal,
          productIds: freshPromoItems.map((item) => item.productId),
          items: freshPromoItems,
        });
        if (!promoResult.success || !promoResult.data) {
          setAppliedPromo(null);
          setPromoError(promoResult.message || t('checkout.promoInvalid'));
          notifyUser(t('checkout.incompleteTitle'), promoResult.message || t('checkout.promoInvalid'));
          return;
        }
        confirmedPromo = promoResult.data;
        setAppliedPromo(promoResult.data);
      }
      const confirmedDiscount = Math.min(
        freshSubtotal,
        Math.max(0, Number(confirmedPromo?.discount_amount || 0)),
      );
      const expectedTotal = Math.max(0, freshSubtotal + deliveryFee - confirmedDiscount);
      if (paymentMethod === 'gpay') {
        if (gpayBalance === null) {
          notifyUser(t('checkout.confirmFailTitle'), t('checkout.gpayUnavailable'));
          return;
        }
        if (gpayBalance < expectedTotal) {
          notifyUser(t('checkout.insufficientTitle'), t('checkout.insufficientMessage'));
          return;
        }
      }

      const idempotencyKey =
        idempotencyKeyRef.current ||
        `checkout-${user?.id || 'customer'}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      idempotencyKeyRef.current = idempotencyKey;
      const result = await createOrderBatch(token, {
        idempotency_key: idempotencyKey,
        items: freshLines.map((line) => ({
          productId: line.productId,
          variantId: normalizeVariantId(line.variantId),
          variantLabel: line.variantLabel,
          quantity: Math.max(1, Number(line.quantity || 1)),
        })),
        fulfillment_method: orderMethod,
        payment_method: paymentMethod,
        buyer_nome: buyerNome.trim(),
        buyer_apelido: buyerApelido.trim(),
        buyer_telefone: buyerTelefone.trim(),
        promo_code: confirmedPromo?.code,
      });

      if (!result.success) {
        dismissTornado();
        notifyUser(t('checkout.confirmFailTitle'), result.message);
        return;
      }

      const lastCreated = result.data.orders[result.data.orders.length - 1];
      const chargedTotal = Number(result.data.total || 0);
      const lastOrder = lastCreated
        ? {
            id: lastCreated.id,
            orderNumber: lastCreated.order_number,
            orderNumbers: result.data.orders.map((order) => order.order_number),
            chargedTotal,
          }
        : null;

      if (!lastOrder) {
        dismissTornado();
        notifyUser(t('common.error'), t('checkout.confirmFailMessage'));
        return;
      }

      if (paymentMethod === 'gpay' && token) {
        const wallet = await getGcoinWallet(token);
        if (wallet.success) setGpayBalance(wallet.data.balance);
      }

      const purchasedIds = new Set(
        freshLines.flatMap((line) => [
          cartItemId(line.productId, line.variantId),
          ...(line.cartItemId ? [line.cartItemId] : []),
        ]),
      );
      try {
        const cartRaw = await getCartJson();
        if (cartRaw) {
          const cartList = parseCartItems(cartRaw);
          const nextCart = cartList.filter((item) => {
            const key = item.id || cartItemId(item.productId || '', item.variantId);
            return !purchasedIds.has(key);
          });
          await setCartJson(JSON.stringify(nextCart));
          void syncCartToServer(token, nextCart);
        }
      } catch (error) {
        console.log('Erro ao limpar itens comprados do carrinho:', error);
      }

      await clearCheckoutDraft();
      idempotencyKeyRef.current = null;

      const itemLines = freshLines
        .map(
          (line) =>
            `• ${line.title || line.productId} × ${Math.max(1, Number(line.quantity || 1))}` +
            (line.variantLabel ? ` (${line.variantLabel})` : ''),
        )
        .join('\n');

      void notifyAdminOfSale({
        type: 'order',
        subject: `Nova encomenda GMarket #${lastOrder.orderNumber}`,
        summary: [
          `Encomenda #${lastOrder.orderNumber}`,
          `Cliente: ${buyerNome.trim()} ${buyerApelido.trim()}`.trim(),
          `Telefone: ${buyerTelefone.trim()}`,
          `Pagamento: ${paymentMethod === 'gpay' ? 'GPay' : 'Dinheiro na entrega'}`,
          `Fulfilled: ${orderMethod}`,
          `Total: ${
            paymentMethod === 'gpay' ? formatGcoin(chargedTotal) : formatCfa(chargedTotal)
          }`,
          '',
          'Itens:',
          itemLines,
        ].join('\n'),
        fields: {
          order_id: lastOrder.id,
          order_number: lastOrder.orderNumber,
          buyer_nome: `${buyerNome.trim()} ${buyerApelido.trim()}`.trim(),
          buyer_telefone: buyerTelefone.trim(),
          payment_method: paymentMethod,
          fulfillment: orderMethod,
          total: chargedTotal,
          total_unit: paymentMethod === 'gpay' ? 'GCoin' : 'CFA',
          items: itemLines,
        },
      });

      // Reveal tornado + success card together (tornado was prewarmed on this screen).
      setSuccessOrder(lastOrder);
      setShowTornado(true);
    } catch {
      dismissTornado();
      notifyUser(t('common.error'), t('checkout.confirmFailMessage'));
    } finally {
      purchaseInFlightRef.current = false;
      if (mountedRef.current) setSubmitting(false);
    }
  };

  if (authLoading || loadingDraft) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <RippleWaveLoader color={C.accent} />
        <Text style={styles.muted}>{t('checkout.preparing')}</Text>
      </View>
    );
  }

  if (!isLoggedIn) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top, paddingHorizontal: 24 }]}>
        <Ionicons name="person-circle-outline" size={56} color={C.accent} />
        <Text style={styles.emptyTitle}>{t('checkout.guestTitle')}</Text>
        <Text style={styles.muted}>{t('checkout.guestSubtitle')}</Text>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => router.push({ pathname: '/login', params: { redirect: 'checkout' } })}
        >
          <Text style={styles.primaryBtnText}>{t('common.login')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.ghostBtn} onPress={() => router.back()}>
          <Text style={styles.ghostBtnText}>{t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (lines.length === 0) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.emptyTitle}>{t('checkout.notFound')}</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.back()}>
          <Text style={styles.primaryBtnText}>{t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <LinearGradient colors={[C.soft, C.mist, C.white]} style={StyleSheet.absoluteFill} />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={C.ink} />
        </TouchableOpacity>
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle}>{t('checkout.title')}</Text>
          <Text style={styles.headerSubtitle}>{t('checkout.subtitle')}</Text>
        </View>
        <View style={styles.headerBtnPlaceholder} />
      </View>

      <KeyboardFormScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 + insets.bottom }}
        >
          {/* Produtos */}
          <View style={styles.card}>
            <Text style={styles.sectionEyebrow}>{t('checkout.sectionProduct')}</Text>
            {lines.map((line, index) => {
              const regularPrice = parseMoney(line.regularPrice, parseMoney(line.price));
              const unitPrice = resolveUnitPrice(
                { regularPrice, gpayPrice: parseMoney(line.gpayPrice) },
                paymentMethod,
              );
              const quantity = Math.max(1, Number(line.quantity || 1));
              const lineTotal = unitPrice * quantity;
              return (
                <View
                  key={line.cartItemId || `${line.productId}:${line.variantId || index}`}
                  style={[styles.productRow, index > 0 && styles.productRowSpaced]}
                >
                  <Image source={{ uri: line.image }} style={styles.productImage} contentFit="cover" />
                  <View style={styles.productInfo}>
                    <Text style={styles.productTitle} numberOfLines={2}>{line.title}</Text>
                    {!!line.variantLabel && (
                      <Text style={styles.productVariant} numberOfLines={2}>{line.variantLabel}</Text>
                    )}
                    <Text style={styles.productMeta}>
                      {quantity} × {formatCfa(regularPrice)}
                    </Text>
                    <Text style={styles.productPrice}>
                      {paymentMethod === 'gpay'
                        ? `GPay: ${formatGcoin(lineTotal)}`
                        : formatCfa(lineTotal)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Comprador */}
          <View style={styles.card}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionEyebrow}>{t('checkout.sectionBuyer')}</Text>
              <TouchableOpacity
                style={styles.editChip}
                onPress={() => setEditingBuyer((v) => !v)}
              >
                <Ionicons name={editingBuyer ? 'checkmark' : 'create-outline'} size={14} color={C.accent} />
                <Text style={styles.editChipText}>{editingBuyer ? t('common.ready') : t('common.edit')}</Text>
              </TouchableOpacity>
            </View>

            {editingBuyer ? (
              <View style={styles.editForm}>
                <Text style={styles.fieldLabel}>{t('common.name')}</Text>
                <TextInput
                  style={styles.input}
                  value={buyerNome}
                  onChangeText={setBuyerNome}
                  placeholder={t('common.name')}
                  placeholderTextColor="#9CA3AF"
                />
                <Text style={styles.fieldLabel}>{t('common.surname')}</Text>
                <TextInput
                  style={styles.input}
                  value={buyerApelido}
                  onChangeText={setBuyerApelido}
                  placeholder={t('common.surname')}
                  placeholderTextColor="#9CA3AF"
                />
                <Text style={styles.fieldLabel}>{t('common.phone')}</Text>
                <TextInput
                  style={styles.input}
                  value={buyerTelefone}
                  onChangeText={setBuyerTelefone}
                  keyboardType="phone-pad"
                  placeholder={t('common.phone')}
                  placeholderTextColor="#9CA3AF"
                />
                <Text style={styles.helperText}>
                  {t('checkout.buyerHint')}
                </Text>
              </View>
            ) : (
              <View style={styles.infoBlock}>
                <View style={styles.infoRow}>
                  <Ionicons name="person-outline" size={18} color={C.accent} />
                  <Text style={styles.infoText}>
                    {[buyerNome, buyerApelido].filter(Boolean).join(' ') || t('checkout.nameMissing')}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Ionicons name="call-outline" size={18} color={C.accent} />
                  <Text style={styles.infoText}>{buyerTelefone || t('checkout.phoneMissing')}</Text>
                </View>
              </View>
            )}
          </View>

          {/* Forma de pedido */}
          <View style={styles.card}>
            <Text style={styles.sectionEyebrow}>{t('checkout.sectionFulfillment')}</Text>
            {allowsDelivery && allowsPickup ? (
              <View style={styles.optionGrid}>
                <Pressable
                  style={[styles.optionCard, orderMethod === 'entrega' && styles.optionCardActive]}
                  onPress={() => setOrderMethod('entrega')}
                >
                  <Ionicons
                    name="bicycle-outline"
                    size={22}
                    color={orderMethod === 'entrega' ? C.accent : C.muted}
                  />
                  <Text style={[styles.optionTitle, orderMethod === 'entrega' && styles.optionTitleActive]}>
                    {t('checkout.delivery')}
                  </Text>
                  <Text style={styles.optionSub}>
                    {deliveryHintFee === null
                      ? t('checkout.deliveryFeePerProduct')
                      : deliveryHintFee <= 0
                        ? t('common.free')
                        : t('checkout.deliveryHint', { fee: deliveryHintFee.toLocaleString() })}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.optionCard, orderMethod === 'recolha' && styles.optionCardActive]}
                  onPress={() => setOrderMethod('recolha')}
                >
                  <Ionicons
                    name="storefront-outline"
                    size={22}
                    color={orderMethod === 'recolha' ? C.accent : C.muted}
                  />
                  <Text style={[styles.optionTitle, orderMethod === 'recolha' && styles.optionTitleActive]}>
                    {t('checkout.pickup')}
                  </Text>
                  <Text style={styles.optionSub}>{t('checkout.pickupHint')}</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.infoBlock}>
                <View style={styles.infoRow}>
                  <Ionicons
                    name={allowsPickup ? 'storefront-outline' : 'bicycle-outline'}
                    size={18}
                    color={C.accent}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoTitle}>
                      {allowsPickup ? t('checkout.pickupOnlyTitle') : t('checkout.deliveryOnlyTitle')}
                    </Text>
                    <Text style={styles.infoSub}>
                      {allowsPickup ? t('checkout.pickupOnlyHint') : t('checkout.deliveryOnlyHint')}
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* Entrega / Recolha */}
          {orderMethod === 'entrega' ? (
            <View style={styles.card}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionEyebrow}>{t('checkout.sectionDelivery')}</Text>
                <TouchableOpacity style={styles.editChip} onPress={handleEditAddress}>
                  <Ionicons name="create-outline" size={14} color={C.accent} />
                  <Text style={styles.editChipText}>{t('common.edit')}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.infoBlock}>
                <View style={styles.infoRow}>
                  <Ionicons name="location-outline" size={18} color={C.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoTitle}>{addressLabel}</Text>
                    <Text style={styles.infoSub}>{addressDetails}</Text>
                  </View>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.sectionEyebrow}>{t('checkout.sectionPickup')}</Text>
              {loadingCheckoutStore ? (
                <View style={styles.infoBlock}>
                  <RippleWaveLoader size="small" color={C.accent} />
                  <Text style={[styles.infoSub, { marginTop: 8 }]}>{t('checkout.pickupStoreLoading')}</Text>
                </View>
              ) : checkoutStore ? (
                <View style={styles.infoBlock}>
                  <View style={styles.infoRow}>
                    <Ionicons name="storefront-outline" size={18} color={C.accent} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.infoTitle}>{checkoutStore.name}</Text>
                    </View>
                  </View>
                  <View style={[styles.infoRow, { marginTop: 12 }]}>
                    <Ionicons name="location-outline" size={18} color={C.accent} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.infoTitle}>{t('checkout.pickupAddress')}</Text>
                      <Text style={styles.infoSub}>
                        {checkoutStore.address || t('checkout.pickupAddressMissing')}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.infoRow, { marginTop: 12 }]}>
                    <Ionicons name="call-outline" size={18} color={C.accent} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.infoTitle}>{t('checkout.pickupContact')}</Text>
                      <Text style={styles.infoSub}>
                        {checkoutStore.phone || t('checkout.pickupContactMissing')}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.infoRow, { marginTop: 12 }]}>
                    <Ionicons name="time-outline" size={18} color={C.accent} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.infoTitle}>{t('checkout.pickupHours')}</Text>
                      <Text style={styles.infoSub}>
                        {checkoutStore.opening_hours || t('checkout.pickupHoursMissing')}
                      </Text>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.infoBlock}>
                  <Text style={styles.infoSub}>{t('checkout.pickupStoreMissing')}</Text>
                </View>
              )}
            </View>
          )}

          {/* Pagamento */}
          <View style={styles.card}>
            <Text style={styles.sectionEyebrow}>{t('checkout.sectionPayment')}</Text>
            <Pressable
              style={[styles.payRow, paymentMethod === 'entrega' && styles.payRowActive]}
              onPress={() => setPaymentMethod('entrega')}
            >
              <View style={styles.payIcon}>
                <Ionicons name="cash-outline" size={20} color={C.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.payTitle}>
                  {orderMethod === 'recolha' ? t('checkout.payOnPickup') : t('checkout.payOnDelivery')}
                </Text>
                <Text style={styles.paySub}>
                  {orderMethod === 'recolha'
                    ? t('checkout.payOnPickupHint')
                    : t('checkout.payOnDeliveryHint')}
                </Text>
              </View>
              <Ionicons
                name={paymentMethod === 'entrega' ? 'radio-button-on' : 'radio-button-off'}
                size={22}
                color={paymentMethod === 'entrega' ? C.accent : '#C7C7CC'}
              />
            </Pressable>

            <Pressable
              style={[styles.payRow, paymentMethod === 'gpay' && styles.payRowActive, { marginTop: 10 }]}
              onPress={() => setPaymentMethod('gpay')}
            >
              <View style={[styles.payIcon, { backgroundColor: isDark ? 'rgba(212,160,23,0.2)' : '#FEF3C7' }]}>
                <Ionicons name="wallet-outline" size={20} color={isDark ? '#FBBF24' : C.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.payTitle}>{t('checkout.payGpay')}</Text>
                <Text style={styles.paySub}>
                  {t('checkout.gpayBalance', { balance: (gpayBalance ?? 0).toLocaleString() })}
                </Text>
              </View>
              <Ionicons
                name={paymentMethod === 'gpay' ? 'radio-button-on' : 'radio-button-off'}
                size={22}
                color={paymentMethod === 'gpay' ? C.accent : '#C7C7CC'}
              />
            </Pressable>

            <View style={styles.gpayBalanceBox}>
              <Text style={styles.gpayBalanceLabel}>{t('checkout.gpayLabel')}</Text>
              <Text style={styles.gpayBalanceValue}>
                {gpayBalance === null ? t('checkout.gpayUnavailable') : formatGcoin(gpayBalance)}
              </Text>
            </View>
            <Text style={[styles.helperText, paymentMethod === 'gpay' && !canPayWithGpay && styles.helperDanger]}>
              {paymentHint}
            </Text>
          </View>

          {/* Código promocional */}
          <View style={styles.card}>
            <Pressable
              style={styles.sectionHead}
              onPress={() => setPromoOpen((v) => !v)}
            >
              <Text style={styles.sectionEyebrow}>{t('checkout.sectionPromo')}</Text>
              <View style={styles.editChip}>
                <Ionicons
                  name={promoOpen || appliedPromo ? 'pricetag' : 'pricetag-outline'}
                  size={14}
                  color={C.accent}
                />
                <Text style={styles.editChipText}>
                  {appliedPromo ? appliedPromo.code : promoOpen ? t('common.ready') : t('checkout.promoApply')}
                </Text>
              </View>
            </Pressable>

            {(promoOpen || appliedPromo) ? (
              <View style={styles.promoBlock}>
                {appliedPromo ? (
                  <View style={styles.promoAppliedRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.promoAppliedTitle}>
                        {t('checkout.promoApplied', { code: appliedPromo.code })}
                      </Text>
                      {!!appliedPromo.description && (
                        <Text style={styles.helperText}>{appliedPromo.description}</Text>
                      )}
                    </View>
                    <TouchableOpacity onPress={handleRemovePromo} hitSlop={8}>
                      <Text style={styles.promoRemoveText}>{t('checkout.promoRemove')}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.promoInputRow}>
                    <TextInput
                      style={[styles.input, styles.promoInput]}
                      value={promoInput}
                      onChangeText={(value) => {
                        setPromoInput(value.toUpperCase());
                        if (promoError) setPromoError(null);
                      }}
                      placeholder={t('checkout.promoPlaceholder')}
                      placeholderTextColor="#9CA3AF"
                      autoCapitalize="characters"
                      autoCorrect={false}
                      returnKeyType="done"
                      onSubmitEditing={() => void handleApplyPromo()}
                    />
                    <TouchableOpacity
                      style={[styles.promoApplyBtn, promoApplying && { opacity: 0.6 }]}
                      disabled={promoApplying}
                      onPress={() => void handleApplyPromo()}
                    >
                      {promoApplying ? (
                        <RippleWaveLoader size="small" color="#FFF" />
                      ) : (
                        <Text style={styles.promoApplyBtnText}>{t('checkout.promoApply')}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
                {promoError ? <Text style={styles.helperDanger}>{promoError}</Text> : null}
              </View>
            ) : null}
          </View>

          {/* Valores */}
          <View style={styles.card}>
            <Text style={styles.sectionEyebrow}>{t('checkout.sectionTotals')}</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t('checkout.productSubtotal')}</Text>
              <Text style={styles.summaryValue}>{formatPaymentAmount(subtotal)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>
                {orderMethod === 'entrega' ? t('checkout.deliveryFee') : t('checkout.deliveryFeePickup')}
              </Text>
              <Text style={styles.summaryValue}>
                {deliveryFee > 0 ? formatPaymentAmount(deliveryFee) : t('common.free')}
              </Text>
            </View>
            {discountAmount > 0 ? (
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: C.accent }]}>
                  {t('checkout.promoDiscount')}
                  {appliedPromo ? ` (${appliedPromo.code})` : ''}
                </Text>
                <Text style={[styles.summaryValue, { color: C.accent }]}>
                  −{formatPaymentAmount(discountAmount)}
                </Text>
              </View>
            ) : null}
            {orderMethod === 'entrega' ? (
              <View style={[styles.summaryRow, { alignItems: 'flex-start' }]}>
                <Text style={styles.summaryLabel}>{t('checkout.deliveryTime')}</Text>
                <Text style={[styles.summaryValue, { flex: 1, textAlign: 'right' }]}>
                  {deliveryTimes.length
                    ? deliveryTimes.join('\n')
                    : t('checkout.deliveryTimeMissing')}
                </Text>
              </View>
            ) : null}
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}>
              <Text style={styles.totalLabel}>{t('checkout.totalToPay')}</Text>
              <Text style={styles.totalValue}>{formatPaymentAmount(total)}</Text>
            </View>
          </View>
      </KeyboardFormScrollView>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <View style={styles.bottomTotal}>
          <Text style={styles.bottomTotalLabel}>{t('common.total')}</Text>
          <Text style={styles.bottomTotalValue}>{formatPaymentAmount(total)}</Text>
        </View>
        <TouchableOpacity
          style={[
            styles.buyBtn,
            (submitting || loadingCheckoutStore || (paymentMethod === 'gpay' && !canPayWithGpay)) &&
              styles.buyBtnDisabled,
          ]}
          disabled={submitting || loadingCheckoutStore || (paymentMethod === 'gpay' && !canPayWithGpay)}
          onPress={handleConfirmPurchase}
          activeOpacity={0.9}
        >
          {submitting ? (
            <RippleWaveLoader size="small" color={isDark ? '#0E0E0E' : '#FFF'} />
          ) : (
            <>
              <Ionicons name="bag-check-outline" size={20} color={isDark ? '#0E0E0E' : '#FFF'} />
              <Text style={styles.buyBtnText}>{t('checkout.buy')}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {Platform.OS === 'web' ? (
        showTornado && successOrder ? (
          <View style={styles.webSuccessLayer} pointerEvents="box-none">
            {successCard}
          </View>
        ) : null
      ) : (
        <TornadoOverlay visible={showTornado} prewarm>
          {!!successOrder && (
            <View style={styles.successOverlay} pointerEvents="box-none">
              {successCard}
            </View>
          )}
        </TornadoOverlay>
      )}
    </View>
  );
}

function createStyles(C: CheckoutPalette, isDark: boolean) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.mist },
  centered: {
    flex: 1,
    backgroundColor: C.mist,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  muted: { color: C.muted, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: C.ink, marginTop: 8 },
  primaryBtn: {
    marginTop: 12,
    backgroundColor: C.accent,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 14,
  },
  primaryBtnText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  ghostBtn: { marginTop: 8, padding: 10 },
  ghostBtnText: { color: C.muted, fontWeight: '600' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.line,
  },
  headerBtnPlaceholder: { width: 40, height: 40 },
  headerTitles: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: C.ink, letterSpacing: -0.3 },
  headerSubtitle: { fontSize: 12, color: C.muted, marginTop: 2 },

  card: {
    backgroundColor: C.white,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.line,
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: C.accent,
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  editChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: isDark ? C.mist : C.soft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: isDark ? 1 : 0,
    borderColor: C.line,
  },
  editChipText: { color: C.accent, fontSize: 12, fontWeight: '700' },

  productRow: { flexDirection: 'row', gap: 12 },
  productRowSpaced: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.line,
  },
  productImage: {
    width: 88,
    height: 88,
    borderRadius: 16,
    backgroundColor: isDark ? C.mist : '#F3F4F6',
  },
  productInfo: { flex: 1, justifyContent: 'center' },
  productTitle: { fontSize: 15, fontWeight: '800', color: C.ink, lineHeight: 20 },
  productVariant: { fontSize: 12, color: C.muted, marginTop: 4 },
  productMeta: { fontSize: 12, color: C.muted, marginTop: 6 },
  productPrice: { fontSize: 16, fontWeight: '900', color: C.ink, marginTop: 4 },

  infoBlock: { gap: 12, marginTop: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  infoText: { flex: 1, fontSize: 14, color: C.ink, fontWeight: '600' },
  infoTitle: { fontSize: 14, color: C.ink, fontWeight: '800' },
  infoSub: { fontSize: 13, color: C.muted, marginTop: 2, lineHeight: 18 },

  editForm: { marginTop: 8, gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: C.muted, marginTop: 6 },
  input: {
    backgroundColor: C.mist,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: C.ink,
  },
  helperText: { fontSize: 11, color: C.muted, marginTop: 10, lineHeight: 16 },
  helperDanger: { color: C.danger, fontWeight: '600', marginTop: 8 },
  promoBlock: { marginTop: 8, gap: 4 },
  promoInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  promoInput: {
    flex: 1,
    marginBottom: 0,
    letterSpacing: 1,
    fontWeight: '700',
  },
  promoApplyBtn: {
    backgroundColor: C.accent,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoApplyBtnText: { color: '#FFF', fontWeight: '800', fontSize: 13 },
  promoAppliedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: isDark ? 'rgba(94,234,212,0.12)' : C.soft,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: C.accent,
  },
  promoAppliedTitle: { fontSize: 13, fontWeight: '800', color: C.ink },
  promoRemoveText: { fontSize: 12, fontWeight: '700', color: C.danger },

  optionGrid: { flexDirection: 'row', gap: 10 },
  optionCard: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: C.line,
    borderRadius: 16,
    padding: 14,
    backgroundColor: C.mist,
    gap: 4,
  },
  optionCardActive: {
    borderColor: C.accent,
    backgroundColor: isDark ? 'rgba(94,234,212,0.12)' : C.soft,
  },
  optionTitle: { fontSize: 14, fontWeight: '800', color: C.ink, marginTop: 4 },
  optionTitleActive: { color: C.accent },
  optionSub: { fontSize: 11, color: C.muted, lineHeight: 15 },

  payRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderColor: C.line,
    borderRadius: 16,
    padding: 12,
    backgroundColor: C.mist,
  },
  payRowActive: {
    borderColor: C.accent,
    backgroundColor: isDark ? 'rgba(94,234,212,0.12)' : C.soft,
  },
  payIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: isDark ? C.mist : C.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payTitle: { fontSize: 14, fontWeight: '800', color: C.ink },
  paySub: { fontSize: 12, color: C.muted, marginTop: 2 },
  gpayBalanceBox: {
    marginTop: 12,
    backgroundColor: isDark ? 'rgba(212,160,23,0.16)' : '#FFFBEB',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(253,230,138,0.35)' : '#FDE68A',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gpayBalanceLabel: { fontSize: 12, fontWeight: '700', color: isDark ? '#FBBF24' : C.gold },
  gpayBalanceValue: { fontSize: 16, fontWeight: '900', color: C.ink },

  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  summaryLabel: { fontSize: 13, color: C.muted },
  summaryValue: { fontSize: 13, fontWeight: '700', color: C.ink },
  summaryDivider: { height: 1, backgroundColor: C.line, marginVertical: 6 },
  totalLabel: { fontSize: 15, fontWeight: '800', color: C.ink },
  totalValue: { fontSize: 18, fontWeight: '900', color: C.accent },

  bottomBar: {
    position: Platform.OS === 'web' ? 'fixed' : 'absolute',
    zIndex: 30,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: isDark ? 'rgba(26,26,26,0.98)' : 'rgba(255,255,255,0.96)',
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  bottomTotal: { minWidth: 110 },
  bottomTotalLabel: { fontSize: 11, color: C.muted, fontWeight: '600' },
  bottomTotalValue: { fontSize: 18, fontWeight: '900', color: C.ink },
  buyBtn: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    backgroundColor: C.accentDeep,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buyBtnDisabled: { opacity: 0.45 },
  buyBtnText: { color: isDark ? '#0E0E0E' : '#FFF', fontSize: 16, fontWeight: '800' },

  successOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  webSuccessLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    backgroundColor: 'rgba(11,18,32,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  successCard: {
    width: '100%',
    maxWidth: 300,
    backgroundColor: C.white,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.line,
    shadowColor: '#000',
    shadowOpacity: isDark ? 0.45 : 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  successIconWrap: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  successRing: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: isDark ? 'rgba(94,234,212,0.18)' : 'rgba(15,118,110,0.22)',
  },
  successCheck: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: C.ink,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  successSubtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: C.muted,
    textAlign: 'center',
  },
  orderNumberBox: {
    marginTop: 12,
    width: '100%',
    borderRadius: 12,
    backgroundColor: isDark ? C.mist : C.soft,
    borderWidth: 1,
    borderColor: isDark ? C.line : '#CDEADF',
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  orderNumberLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: C.accent,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  orderNumberValue: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: '800',
    color: C.ink,
    letterSpacing: -0.2,
  },
  successPrimaryBtn: {
    marginTop: 14,
    width: '100%',
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: isDark ? 'rgba(94,234,212,0.14)' : C.soft,
    borderWidth: 1.5,
    borderColor: C.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  successPrimaryText: { color: C.accent, fontSize: 13, fontWeight: '800' },
  successGhostBtn: { marginTop: 8, paddingVertical: 6 },
  successGhostText: { color: C.muted, fontSize: 12, fontWeight: '600' },
});
}

