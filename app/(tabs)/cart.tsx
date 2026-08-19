import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/components/AuthContext';
import { TabBarScrollSpacer } from '@/components/FloatingGlassTabBar';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import { getLiveStores, getProductById, getStoreById, syncCartToServer, trackUserActivity } from '@/components/api';
import { StoreAvatar } from '@/components/StoreAvatar';
import { useLocale } from '@/components/LocaleContext';
import { useAppTheme, type AppUI } from '@/components/tema';
import { getCartJson, setCartJson, setCheckoutDraftJson } from '@/lib/cartStorage';
import { optimizedImageUrl } from '@/lib/imageOptimization';

const GOLD = '#D4A017';
const GOLD_LIGHT = '#F5D76E';

interface CartItem {
  id: string;
  title: string;
  price: number;
  image: string;
  quantity: number;
  selected: boolean;
  productId?: string;
  variantId?: string;
  variantLabel?: string;
  maxStock?: number;
  storeId?: string;
  storeName?: string;
  storeLogo?: string;
  storeCover?: string;
  storeVerified?: boolean;
}

type StoreGroup = {
  key: string;
  storeId?: string;
  storeName: string;
  storeLogo?: string;
  storeCover?: string;
  storeVerified?: boolean;
  items: CartItem[];
};

function productIdFromCartItem(item: CartItem): string | undefined {
  if (item.productId) return item.productId;
  const fromId = item.id?.split(':')[0];
  return fromId || undefined;
}

async function enrichCartStoreInfo(items: CartItem[]): Promise<CartItem[]> {
  if (items.length === 0) return items;

  const productIds = Array.from(
    new Set(items.map(productIdFromCartItem).filter((id): id is string => Boolean(id))),
  );

  const [liveStores, ...productEntries] = await Promise.all([
    getLiveStores().catch(() => [] as Awaited<ReturnType<typeof getLiveStores>>),
    ...productIds.map(async (id) => {
      try {
        const product = await getProductById(id);
        return [id, product] as const;
      } catch {
        return [id, null] as const;
      }
    }),
  ]);

  const productMap = new Map(productEntries);
  const storesByName = new Map(
    liveStores
      .filter((s) => Boolean(s?.name))
      .map((s) => [s.name.trim().toLowerCase(), s] as const),
  );

  const storeIds = new Set<string>();
  for (const item of items) {
    const product = productMap.get(productIdFromCartItem(item) || '');
    const byName = item.storeName
      ? storesByName.get(item.storeName.trim().toLowerCase())
      : undefined;
    const storeId =
      item.storeId || product?.store_id || product?.store?.id || byName?.id;
    if (storeId) storeIds.add(storeId);
  }

  // Incluir todas as lojas da lista (já trazem logo_url)
  for (const store of liveStores) {
    storeIds.add(store.id);
  }

  const storeMap = new Map(liveStores.map((s) => [s.id, s] as const));
  await Promise.all(
    Array.from(storeIds).map(async (id) => {
      if (storeMap.get(id)?.logo_url) return;
      try {
        const store = await getStoreById(id);
        if (store) storeMap.set(id, store);
      } catch {
        // ignore
      }
    }),
  );

  return items.map((item) => {
    const product = productMap.get(productIdFromCartItem(item) || '');
    const byName = item.storeName
      ? storesByName.get(item.storeName.trim().toLowerCase())
      : undefined;
    const storeId =
      item.storeId ||
      product?.store_id ||
      product?.store?.id ||
      byName?.id ||
      undefined;
    const store = (storeId ? storeMap.get(storeId) : undefined) ?? byName ?? null;

    const storeName =
      store?.name || product?.store?.name || item.storeName || undefined;
    const storeLogo =
      store?.logo_url || product?.store?.logo_url || item.storeLogo || undefined;
    const storeCover =
      store?.cover_url || product?.store?.cover_url || item.storeCover || undefined;
    const storeVerified =
      store?.verified ?? product?.store?.verified ?? item.storeVerified ?? undefined;

    if (
      storeId === item.storeId &&
      storeName === item.storeName &&
      storeLogo === item.storeLogo &&
      storeCover === item.storeCover &&
      storeVerified === item.storeVerified
    ) {
      return item;
    }

    return {
      ...item,
      storeId,
      storeName,
      storeLogo,
      storeCover,
      storeVerified,
    };
  });
}

function groupCartByStore(items: CartItem[], unknownLabel: string): StoreGroup[] {
  const map = new Map<string, StoreGroup>();

  for (const item of items) {
    const key = (item.storeId || '').trim() || '__unknown__';
    const existing = map.get(key);

    if (existing) {
      existing.items.push(item);
      if (!existing.storeName && item.storeName) existing.storeName = item.storeName;
      if (!existing.storeLogo && item.storeLogo) existing.storeLogo = item.storeLogo;
      if (!existing.storeCover && item.storeCover) existing.storeCover = item.storeCover;
      if (existing.storeVerified == null && item.storeVerified != null) {
        existing.storeVerified = item.storeVerified;
      }
      if (!existing.storeId && item.storeId) existing.storeId = item.storeId;
    } else {
      map.set(key, {
        key,
        storeId: item.storeId,
        storeName: item.storeName || unknownLabel,
        storeLogo: item.storeLogo,
        storeCover: item.storeCover,
        storeVerified: item.storeVerified,
        items: [item],
      });
    }
  }

  return Array.from(map.values());
}

function CartBuyBar({
  disabled,
  onPress,
  styles,
  isDark,
  totalLabel,
  amount,
  buyLabel,
}: {
  disabled: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  isDark: boolean;
  totalLabel: string;
  amount: string;
  buyLabel: string;
}) {
  const spin = useSharedValue(0);

  useEffect(() => {
    if (!isDark || disabled) {
      cancelAnimation(spin);
      spin.value = 0;
      return;
    }
    spin.value = 0;
    spin.value = withRepeat(
      withTiming(360, { duration: 2800, easing: Easing.linear }),
      -1,
      false
    );
    return () => {
      cancelAnimation(spin);
    };
  }, [disabled, isDark, spin]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }],
  }));

  const content = (
    <>
      <View style={styles.buyBarSide}>
        <Text style={styles.buyBarLabel} numberOfLines={1}>
          {totalLabel}
        </Text>
        <Text style={styles.buyBarAmount} numberOfLines={1}>
          {amount}
        </Text>
      </View>
      <View style={styles.buyBarDivider} />
      <View style={styles.buyBarSide}>
        <Text style={styles.buyBarAction}>{buyLabel}</Text>
      </View>
    </>
  );

  if (!isDark) {
    return (
      <TouchableOpacity
        style={[styles.buyBar, disabled && styles.buyBarDisabled]}
        activeOpacity={0.85}
        disabled={disabled}
        onPress={onPress}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.buyBarGlowWrap, disabled && styles.buyBarDisabled]}
      activeOpacity={0.85}
      disabled={disabled}
      onPress={onPress}
    >
      <View style={styles.buyBarGlowOuter}>
        <Animated.View style={[styles.buyBarSpin, spinStyle]} pointerEvents="none">
          <LinearGradient
            colors={[
              'transparent',
              'transparent',
              GOLD,
              GOLD_LIGHT,
              GOLD,
              'transparent',
              'transparent',
            ]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.buyBarSpinGradient}
          />
        </Animated.View>
        <View style={styles.buyBarInner}>{content}</View>
      </View>
    </TouchableOpacity>
  );
}

export default function CartScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ui, isDark } = useAppTheme();
  const { t } = useLocale();
  const styles = useMemo(() => createStyles(ui, isDark), [ui, isDark]);
  const { isLoggedIn, loading: authLoading, token } = useAuth();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [authPromptVisible, setAuthPromptVisible] = useState(false);
  const hasLoadedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      async function loadCart() {
        try {
          const storedCart = await getCartJson();
          if (!active) return;
          if (!storedCart) {
            setCartItems([]);
            return;
          }

          const parsedValue: unknown = JSON.parse(storedCart);
          if (!Array.isArray(parsedValue)) throw new Error('Carrinho local inválido');
          const parsed = parsedValue as CartItem[];
          setCartItems(parsed);
          hasLoadedRef.current = true;
          if (active) setLoading(false);

          const enriched = await enrichCartStoreInfo(parsed);
          if (!active) return;

          setCartItems(enriched);

          const changed = JSON.stringify(parsed) !== JSON.stringify(enriched);
          if (changed) {
            await setCartJson(JSON.stringify(enriched));
          }
        } catch (error) {
          console.log('Erro ao carregar carrinho local:', error);
          await setCartJson('[]');
          if (active) setCartItems([]);
        } finally {
          if (active) {
            hasLoadedRef.current = true;
            setLoading(false);
          }
        }
      }
      if (!hasLoadedRef.current) setLoading(true);
      loadCart();
      return () => {
        active = false;
      };
    }, [])
  );

  const saveCartToStorage = async (newItems: CartItem[]) => {
    try {
      await setCartJson(JSON.stringify(newItems));
      if (isLoggedIn && token) {
        void syncCartToServer(token, newItems);
      }
    } catch (error) {
      console.log('Erro ao guardar carrinho no iPhone:', error);
    }
  };

  const toggleSelect = (id: string) => {
    const updated = cartItems.map((item) =>
      item.id === id ? { ...item, selected: !item.selected } : item
    );
    setCartItems(updated);
    saveCartToStorage(updated);
  };

  const updateQuantity = (id: string, type: 'plus' | 'minus') => {
    const updated = cartItems.map((item) => {
      if (item.id !== id) return item;
      if (type === 'plus' && item.maxStock !== undefined && item.quantity >= item.maxStock) {
        return item;
      }
      const newQty = type === 'plus' ? item.quantity + 1 : item.quantity - 1;
      return { ...item, quantity: newQty < 1 ? 1 : newQty };
    });
    setCartItems(updated);
    saveCartToStorage(updated);
  };

  const removeItem = (id: string) => {
    const removed = cartItems.find((item) => item.id === id);
    const updated = cartItems.filter((item) => item.id !== id);
    setCartItems(updated);
    saveCartToStorage(updated);
    if (removed) {
      void trackUserActivity(token, {
        action: 'remove_cart',
        productId: removed.productId || removed.id,
        storeId: removed.storeId,
      });
    }
  };

  const storeGroups = useMemo(
    () => groupCartByStore(cartItems, t('cart.unknownStore')),
    [cartItems, t]
  );

  const openStore = (group: StoreGroup) => {
    if (!group.storeId) return;
    router.push({
      pathname: '/loja',
      params: {
        id: group.storeId,
        name: group.storeName,
        logo: group.storeLogo || '',
        cover: group.storeCover || '',
        verified: group.storeVerified ? '1' : '0',
      },
    });
  };

  const selectedItems = useMemo(
    () => cartItems.filter((item) => item.selected),
    [cartItems]
  );

  const valorTotal = selectedItems.reduce(
    (acc, item) => acc + item.price * item.quantity,
    0
  );

  const totalItensSelecionados = selectedItems.length;

  const startCheckout = async () => {
    if (selectedItems.length === 0 || authLoading) return;

    const items = selectedItems.map((item) => {
      const productId = item.productId || item.id.split(':')[0];
      const variantId =
        item.variantId && !item.variantId.startsWith('legacy-')
          ? item.variantId
          : undefined;

      return {
        productId,
        variantId,
        title: item.title,
        image: item.image,
        price: String(item.price),
        quantity: String(item.quantity),
        variantLabel: item.variantLabel || '',
        maxStock: item.maxStock != null ? String(item.maxStock) : undefined,
        cartItemId: item.id,
      };
    });

    try {
      await setCheckoutDraftJson(JSON.stringify({ items }));

      if (!isLoggedIn) {
        setAuthPromptVisible(true);
        return;
      }

      router.push('/checkout');
    } catch (error) {
      console.log('Erro ao iniciar checkout:', error);
      alert(t('cart.checkoutStartFail'));
    }
  };

  if (loading) {
    return (
      <View style={[styles.mainWrapper, styles.centered]}>
        <RippleWaveLoader color={ui.brand} />
      </View>
    );
  }

  return (
    <View
      style={[styles.mainWrapper, { paddingTop: Math.max(insets.top, 16) }]}
      collapsable={false}
    >
      <View style={styles.topHeader}>
        <Text style={styles.headerTitle}>{t('cart.title')}</Text>
        <Text style={styles.headerSubtitle}>
          {t('cart.selectedCount', {
            selected: totalItensSelecionados,
            total: cartItems.length,
          })}
        </Text>
      </View>

      {cartItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="basket-outline" size={36} color={ui.muted} />
          </View>
          <Text style={styles.emptyText}>{t('cart.empty')}</Text>
          <Text style={styles.emptyHint}>{t('cart.emptyHint')}</Text>
        </View>
      ) : (
        <View style={styles.content} collapsable={false}>
          <ScrollView
            style={styles.list}
            contentInsetAdjustmentBehavior="never"
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {storeGroups.map((group) => (
              <View key={group.key} style={styles.storeCard}>
                <TouchableOpacity
                  style={styles.storeHeader}
                  activeOpacity={group.storeId ? 0.7 : 1}
                  disabled={!group.storeId}
                  onPress={() => openStore(group)}
                >
                  <StoreAvatar
                    storeId={group.storeId}
                    logoUrl={group.storeLogo}
                    size={42}
                    borderRadius={10}
                  />
                  <View style={styles.storeHeaderText}>
                    <View style={styles.storeNameRow}>
                      <Text style={styles.storeName} numberOfLines={1}>
                        {group.storeName}
                      </Text>
                      {group.storeId ? (
                        <Ionicons
                          name="chevron-forward"
                          size={16}
                          color={ui.muted}
                          style={styles.storeChevron}
                        />
                      ) : null}
                    </View>
                    <Text style={styles.storeLabel}>{t('cart.storeLabel')}</Text>
                  </View>
                </TouchableOpacity>

                {group.items.map((item, index) => {
                  const atMax =
                    item.maxStock !== undefined && item.quantity >= item.maxStock;
                  return (
                    <View
                      key={item.id}
                      style={[
                        styles.productRow,
                        index < group.items.length - 1 && styles.productRowBorder,
                      ]}
                    >
                      <TouchableOpacity
                        style={styles.checkboxHit}
                        onPress={() => toggleSelect(item.id)}
                        hitSlop={8}
                      >
                        <View
                          style={[
                            styles.checkbox,
                            item.selected && styles.checkboxChecked,
                          ]}
                        >
                          {item.selected ? (
                            <Ionicons name="checkmark" size={14} color="#FFF" />
                          ) : null}
                        </View>
                      </TouchableOpacity>

                      <Image
                        source={{ uri: optimizedImageUrl(item.image, 'thumb') }}
                        style={styles.productImg}
                      />

                      <View style={styles.productInfo}>
                        <Text style={styles.productTitle} numberOfLines={2}>
                          {item.title}
                        </Text>
                        {!!item.variantLabel && (
                          <Text style={styles.variantLabel} numberOfLines={1}>
                            {item.variantLabel}
                          </Text>
                        )}
                        <Text style={styles.productPrice}>
                          {(item.price * item.quantity).toLocaleString()} CFA
                        </Text>

                        <View style={styles.productActions}>
                          <View style={styles.quantitySelector}>
                            <TouchableOpacity
                              style={styles.qtyBtn}
                              onPress={() => updateQuantity(item.id, 'minus')}
                            >
                              <Ionicons name="remove" size={14} color={ui.text} />
                            </TouchableOpacity>
                            <Text style={styles.qtyText}>{item.quantity}</Text>
                            <TouchableOpacity
                              style={[styles.qtyBtn, atMax && styles.qtyBtnDisabled]}
                              disabled={atMax}
                              onPress={() => updateQuantity(item.id, 'plus')}
                            >
                              <Ionicons
                                name="add"
                                size={14}
                                color={atMax ? ui.muted : ui.text}
                              />
                            </TouchableOpacity>
                          </View>

                          <TouchableOpacity
                            style={styles.deleteBtn}
                            onPress={() => removeItem(item.id)}
                          >
                            <Ionicons name="trash-outline" size={15} color={ui.danger} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
          </ScrollView>

          <View style={styles.buyBarWrap}>
            <CartBuyBar
              disabled={totalItensSelecionados === 0 || authLoading}
              onPress={() => {
                void startCheckout();
              }}
              styles={styles}
              isDark={isDark}
              totalLabel={t('cart.totalValue')}
              amount={`${valorTotal.toLocaleString()} CFA`}
              buyLabel={t('cart.buy')}
            />
            <TabBarScrollSpacer extra={8} />
          </View>
        </View>
      )}

      <Modal
        visible={authPromptVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAuthPromptVisible(false)}
      >
        <View style={styles.authOverlay}>
          <View style={styles.authCard}>
            <View style={styles.authIcon}>
              <Ionicons name="person-circle-outline" size={40} color={ui.brand} />
            </View>
            <Text style={styles.authTitle}>{t('cart.authTitle')}</Text>
            <Text style={styles.authSubtitle}>{t('cart.authSubtitle')}</Text>

            <TouchableOpacity
              style={styles.authPrimaryBtn}
              onPress={() => {
                setAuthPromptVisible(false);
                router.push({ pathname: '/login', params: { redirect: 'checkout' } });
              }}
            >
              <Text style={styles.authPrimaryText}>{t('cart.authLogin')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.authSecondaryBtn}
              onPress={() => {
                setAuthPromptVisible(false);
                router.push({ pathname: '/register', params: { redirect: 'checkout' } });
              }}
            >
              <Text style={styles.authSecondaryText}>{t('cart.authRegister')}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setAuthPromptVisible(false)}>
              <Text style={styles.authCancel}>{t('cart.authLater')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(ui: AppUI, isDark: boolean) {
  const storeCardBg = isDark ? '#242424' : '#EEEEF0';
  const avatarBg = isDark ? '#2C2C2E' : '#E0E0E5';

  return StyleSheet.create({
    mainWrapper: { flex: 1, backgroundColor: ui.bg },
    centered: { justifyContent: 'center', alignItems: 'center' },
    content: { flex: 1 },
    list: { flex: 1 },
    topHeader: {
      paddingHorizontal: 20,
      paddingBottom: 14,
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: '800',
      color: ui.text,
      letterSpacing: -0.5,
    },
    headerSubtitle: {
      fontSize: 13,
      color: ui.muted,
      marginTop: 4,
      fontWeight: '500',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
      marginTop: -40,
    },
    emptyIconWrap: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: storeCardBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    emptyText: {
      fontSize: 17,
      color: ui.text,
      fontWeight: '700',
    },
    emptyHint: {
      fontSize: 13,
      color: ui.muted,
      marginTop: 6,
      textAlign: 'center',
    },
    listContent: {
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 16,
      gap: 14,
    },
    storeCard: {
      backgroundColor: storeCardBg,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingTop: 14,
      paddingBottom: 4,
    },
    storeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingBottom: 10,
      paddingHorizontal: 2,
    },
    storeAvatar: {
      width: 42,
      height: 42,
      borderRadius: 10,
      backgroundColor: avatarBg,
    },
    storeAvatarFallback: {
      width: 42,
      height: 42,
      borderRadius: 10,
      backgroundColor: avatarBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    storeHeaderText: {
      flex: 1,
      minWidth: 0,
      justifyContent: 'center',
    },
    storeNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    storeName: {
      fontSize: 17,
      fontWeight: '700',
      color: ui.text,
      letterSpacing: -0.2,
      flexShrink: 1,
    },
    storeChevron: {
      marginTop: 1,
    },
    storeLabel: {
      fontSize: 13,
      color: isDark ? '#A1A1A6' : '#9A9AA0',
      fontWeight: '400',
      marginTop: 1,
    },
    productRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      gap: 10,
    },
    productRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    },
    checkboxHit: {
      paddingVertical: 4,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 7,
      borderWidth: 1.5,
      borderColor: ui.muted,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    checkboxChecked: {
      backgroundColor: ui.brand,
      borderColor: ui.brand,
    },
    productImg: {
      width: 72,
      height: 72,
      borderRadius: 14,
      resizeMode: 'cover',
      backgroundColor: isDark ? '#1A1A1A' : '#FFFFFF',
    },
    productInfo: {
      flex: 1,
      minWidth: 0,
    },
    productTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: ui.text,
      lineHeight: 19,
    },
    variantLabel: {
      fontSize: 11,
      color: ui.brand,
      fontWeight: '600',
      marginTop: 2,
    },
    productPrice: {
      fontSize: 15,
      fontWeight: '800',
      color: ui.text,
      marginTop: 4,
    },
    productActions: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 8,
      gap: 10,
    },
    quantitySelector: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#1A1A1A' : '#FFFFFF',
      borderRadius: 10,
      padding: 2,
    },
    qtyBtn: {
      width: 30,
      height: 28,
      justifyContent: 'center',
      alignItems: 'center',
    },
    qtyBtnDisabled: { opacity: 0.4 },
    qtyText: {
      fontSize: 13,
      fontWeight: '700',
      color: ui.text,
      minWidth: 22,
      textAlign: 'center',
    },
    deleteBtn: {
      width: 32,
      height: 32,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: ui.dangerSoft,
      borderRadius: 10,
    },
    buyBarWrap: {
      paddingHorizontal: 16,
      paddingTop: 10,
      backgroundColor: ui.bg,
      zIndex: 30,
    },
    buyBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: ui.brand,
      borderRadius: 28,
      minHeight: 56,
      paddingVertical: 10,
      paddingHorizontal: 8,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    buyBarGlowWrap: {
      borderRadius: 28,
      shadowColor: GOLD,
      shadowOpacity: 0.45,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 0 },
      elevation: 8,
    },
    buyBarGlowOuter: {
      borderRadius: 28,
      overflow: 'hidden',
      minHeight: 56,
      justifyContent: 'center',
    },
    buyBarSpin: {
      position: 'absolute',
      width: 320,
      height: 320,
      top: '50%',
      left: '50%',
      marginLeft: -160,
      marginTop: -160,
    },
    buyBarSpinGradient: {
      width: '100%',
      height: '100%',
    },
    buyBarInner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#000000',
      borderRadius: 26.5,
      minHeight: 53,
      margin: 1.5,
      paddingVertical: 10,
      paddingHorizontal: 8,
    },
    buyBarDisabled: {
      opacity: 0.45,
    },
    buyBarSide: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    buyBarLabel: {
      color: 'rgba(255,255,255,0.85)',
      fontSize: 12,
      fontWeight: '600',
    },
    buyBarAmount: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '800',
      marginTop: 1,
      letterSpacing: -0.2,
    },
    buyBarDivider: {
      width: StyleSheet.hairlineWidth,
      alignSelf: 'stretch',
      marginVertical: 10,
      backgroundColor: isDark ? 'rgba(212,160,23,0.55)' : 'rgba(255,255,255,0.45)',
    },
    buyBarAction: {
      color: '#FFFFFF',
      fontSize: 17,
      fontWeight: '800',
      letterSpacing: -0.2,
    },
    authOverlay: {
      flex: 1,
      backgroundColor: ui.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    authCard: {
      width: '100%',
      backgroundColor: ui.card,
      borderRadius: 24,
      padding: 24,
      alignItems: 'center',
    },
    authIcon: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: ui.brandSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    authTitle: { fontSize: 18, fontWeight: '800', color: ui.text },
    authSubtitle: {
      fontSize: 14,
      color: ui.muted,
      textAlign: 'center',
      lineHeight: 20,
      marginTop: 8,
      marginBottom: 20,
    },
    authPrimaryBtn: {
      width: '100%',
      height: 48,
      borderRadius: 14,
      backgroundColor: ui.brand,
      alignItems: 'center',
      justifyContent: 'center',
    },
    authPrimaryText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
    authSecondaryBtn: {
      width: '100%',
      height: 48,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: ui.brand,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 10,
    },
    authSecondaryText: { color: ui.brand, fontSize: 15, fontWeight: '700' },
    authCancel: { marginTop: 16, color: ui.muted, fontSize: 14, fontWeight: '600' },
  });
}
