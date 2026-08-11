import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  InteractionManager,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/components/AuthContext';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import { getGcoinWallet, type GcoinTransaction } from '@/components/api';
import { useLocale } from '@/components/LocaleContext';
import { useAppTheme, type AppUI } from '@/components/tema';
import {
  authenticateGPayAccess,
  shouldRequireGPayBiometrics,
} from '@/lib/gpayBiometrics';

const PAD = 18;
const GAP = 12;

function formatGCoin(value: number) {
  return `${Number(value || 0).toLocaleString('pt-PT')} GCoin`;
}

function formatGCoinParts(value: number) {
  return {
    amount: Number(value || 0).toLocaleString('pt-PT'),
    unit: 'GCoin',
  };
}

function formatTxDate(value: string) {
  try {
    return new Date(value).toLocaleString('pt-PT', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

function txMeta(type: string, ui: AppUI) {
  switch (type) {
    case 'cashback':
    case 'promo':
    case 'refund':
    case 'deposit':
    case 'admin_credit':
      return { color: ui.success, bg: ui.successSoft, icon: 'arrow-down-circle-outline' as const };
    case 'purchase':
    case 'admin_debit':
      return { color: ui.brand, bg: ui.brandSoft, icon: 'cart-outline' as const };
    default:
      return { color: ui.muted, bg: ui.iconBox, icon: 'swap-horizontal-outline' as const };
  }
}

function txTitle(type: string, reason: string | null, t: (k: string) => string) {
  if (reason) return reason;
  const map: Record<string, string> = {
    deposit: t('gpay.deposit'),
    cashback: t('gpay.cashback'),
    promo: t('gpay.cashback'),
    purchase: t('gpay.buy'),
    refund: t('gpay.refunded'),
    admin_credit: t('gpay.deposit'),
    admin_debit: t('gpay.paid'),
    adjustment: t('gpay.history'),
  };
  return map[type] || type;
}

function ActionBlock({
  title,
  hint,
  value,
  icon,
  onPress,
  styles,
  brand,
}: {
  title: string;
  hint: string;
  value?: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  brand: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.actionBlock, pressed && { opacity: 0.88, transform: [{ scale: 0.985 }] }]}
    >
      <View style={[styles.actionBlockIcon, styles.actionBlockIconSpaced]}>
        <Ionicons name={icon} size={20} color={brand} />
      </View>
      <Text style={styles.actionBlockTitle}>{title}</Text>
      {value ? <Text style={styles.actionBlockValue}>{value}</Text> : null}
      <Text style={styles.actionBlockHint}>{hint}</Text>
    </Pressable>
  );
}

export default function GPayScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const { ui, isDark, setAppearance } = useAppTheme();
  const { token, isLoggedIn } = useAuth();
  const styles = useMemo(() => createStyles(ui, isDark), [ui, isDark]);
  const requiresFaceId = shouldRequireGPayBiometrics();

  const [balance, setBalance] = useState(0);
  const [cashbackTotal, setCashbackTotal] = useState(0);
  const [transactions, setTransactions] = useState<GcoinTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(!requiresFaceId);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  const authenticatingRef = useRef(false);
  const unlockCancelledRef = useRef(false);
  const unlockWithFaceIdRef = useRef<() => Promise<void>>(async () => {});
  const mountedRef = useRef(true);
  const focusedRef = useRef(false);
  const walletGenerationRef = useRef(0);
  const authGenerationRef = useRef(0);
  const refreshInFlightRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      focusedRef.current = false;
      walletGenerationRef.current += 1;
      authGenerationRef.current += 1;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      refreshInFlightRef.current = false;
      setRefreshing(false);
      return () => {
        focusedRef.current = false;
        walletGenerationRef.current += 1;
        authGenerationRef.current += 1;
        refreshInFlightRef.current = false;
      };
    }, []),
  );

  const loadWallet = useCallback(async () => {
    const generation = ++walletGenerationRef.current;
    const isCurrent = () =>
      mountedRef.current &&
      focusedRef.current &&
      walletGenerationRef.current === generation;

    if (!isCurrent()) return false;
    if (!token || !isLoggedIn) {
      setBalance(0);
      setCashbackTotal(0);
      setTransactions([]);
      setError(null);
      setLoading(false);
      hasLoadedRef.current = true;
      return true;
    }

    setError(null);
    const result = await getGcoinWallet(token);
    if (!isCurrent()) return false;
    if (!result.success) {
      setError(result.message || t('gpay.loadError'));
      setBalance(0);
      setCashbackTotal(0);
      setTransactions([]);
      setLoading(false);
      hasLoadedRef.current = true;
      return true;
    }

    setBalance(result.data.balance);
    setCashbackTotal(result.data.cashback_total);
    setTransactions(result.data.transactions || []);
    setLoading(false);
    hasLoadedRef.current = true;
    return true;
  }, [token, isLoggedIn, t]);

  const unlockWithFaceId = useCallback(async () => {
    if (
      !requiresFaceId ||
      authenticatingRef.current ||
      !mountedRef.current ||
      !focusedRef.current
    ) {
      return;
    }
    const generation = ++authGenerationRef.current;
    const isCurrent = () =>
      mountedRef.current &&
      focusedRef.current &&
      authGenerationRef.current === generation;
    authenticatingRef.current = true;
    setAuthBusy(true);
    setAuthError(null);
    try {
      const result = await authenticateGPayAccess({
        promptMessage: t('gpay.faceIdPrompt'),
        cancelLabel: t('gpay.faceIdCancel'),
        fallbackLabel: t('gpay.faceIdFallback'),
      });
      if (unlockCancelledRef.current || !isCurrent()) return;
      if (result.success) {
        setUnlocked(true);
        return;
      }
      if (result.error === 'not_available' || result.error === 'missing_usage_description') {
        setAuthError(t('gpay.faceIdUnavailable'));
        Alert.alert(t('gpay.faceIdTitle'), t('gpay.faceIdUnavailable'));
        return;
      }
      if (result.error === 'user_cancel' || result.error === 'system_cancel' || result.error === 'app_cancel') {
        setUnlocked(false);
        return;
      }
      setUnlocked(false);
    } finally {
      if (isCurrent()) {
        authenticatingRef.current = false;
        if (!unlockCancelledRef.current) setAuthBusy(false);
      }
    }
  }, [requiresFaceId, t]);

  useEffect(() => {
    unlockWithFaceIdRef.current = unlockWithFaceId;
  }, [unlockWithFaceId]);

  useFocusEffect(
    useCallback(() => {
      if (!requiresFaceId) return;

      unlockCancelledRef.current = false;
      setUnlocked(false);
      setAuthError(null);
      setAuthBusy(false);

      let timer: ReturnType<typeof setTimeout> | null = null;
      // Espera a transição de ecrã terminar — Face ID falha se disparar cedo demais.
      const interaction = InteractionManager.runAfterInteractions(() => {
        timer = setTimeout(() => {
          if (!unlockCancelledRef.current) void unlockWithFaceIdRef.current();
        }, 280);
      });

      return () => {
        unlockCancelledRef.current = true;
        authGenerationRef.current += 1;
        authenticatingRef.current = false;
        interaction.cancel?.();
        if (timer) clearTimeout(timer);
        setUnlocked(false);
        setAuthBusy(false);
      };
    }, [requiresFaceId]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!unlocked) return;
      if (!hasLoadedRef.current) setLoading(true);
      loadWallet();
    }, [loadWallet, unlocked]),
  );

  const onRefresh = async () => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    setRefreshing(true);
    try {
      const applied = await loadWallet();
      if (applied && mountedRef.current && focusedRef.current) setRefreshing(false);
    } finally {
      refreshInFlightRef.current = false;
    }
  };

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [router]);

  const heroColors = isDark
    ? (['#1E4F96', '#0B3A7A', '#061F45'] as const)
    : (['#2A63B8', '#0D47A1', '#072F6E'] as const);

  const toggleTheme = () => setAppearance(isDark ? 'light' : 'dark');

  if (requiresFaceId && !unlocked) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
          <Pressable style={styles.headerBtn} onPress={goBack}>
            <Ionicons name="arrow-back" size={20} color={ui.brand} />
          </Pressable>
          <Text style={styles.brandTitle}>GPay</Text>
          <View style={styles.headerBtnPlaceholder} />
        </View>
        <View style={[styles.lockWrap, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.lockIcon}>
            <Ionicons name="scan-outline" size={34} color={ui.brand} />
          </View>
          <Text style={styles.lockTitle}>{t('gpay.faceIdTitle')}</Text>
          <Text style={styles.lockHint}>{authError || t('gpay.faceIdHint')}</Text>
          <Pressable
            style={[styles.primaryBtn, styles.lockBtn, authBusy && { opacity: 0.7 }]}
            onPress={unlockWithFaceId}
            disabled={authBusy}
          >
            <Text style={styles.primaryBtnText}>
              {authBusy ? '…' : t('gpay.faceIdUnlock')}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable style={styles.headerBtn} onPress={goBack}>
          <Ionicons name="arrow-back" size={20} color={ui.brand} />
        </Pressable>
        <Text style={styles.brandTitle}>GPay</Text>
        <Pressable style={styles.headerBtn} onPress={toggleTheme}>
          <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={20} color={ui.brand} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ui.brand} />
        }
      >
        <Animated.View entering={FadeInDown.duration(420)} style={styles.heroStage}>
          <View style={styles.heroShadow} />
          <View style={styles.heroOuter}>
            <LinearGradient
              colors={[...heroColors]}
              locations={[0, 0.45, 1]}
              start={{ x: 0.05, y: 0 }}
              end={{ x: 0.95, y: 1 }}
              style={styles.heroFace}
            >
              <LinearGradient
                colors={['rgba(255,255,255,0.26)', 'rgba(255,255,255,0.05)', 'transparent']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.heroGloss}
                pointerEvents="none"
              />
              <View style={styles.heroBottomShade} pointerEvents="none" />

              <View style={styles.heroTop}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={styles.heroLabel}>{t('gpay.balance')}</Text>
                  <Text style={styles.heroAccount}>{t('gpay.account')}</Text>
                </View>
                <View style={styles.chip}>
                  <Ionicons name="diamond" size={12} color="#FFF" />
                  <Text style={styles.chipText}>{t('gpay.currency')}</Text>
                </View>
              </View>

              {loading ? (
                <RippleWaveLoader color="#FFF" style={{ marginTop: 28, marginBottom: 12 }} />
              ) : (
                <>
                  <View style={styles.heroValueRow}>
                    <Text style={styles.heroValue}>{formatGCoinParts(balance).amount}</Text>
                    <Text style={styles.heroUnit}>{formatGCoinParts(balance).unit}</Text>
                  </View>
                  <Text style={styles.heroHint}>{t('gpay.ready')}</Text>
                  <View style={styles.eqPill}>
                    <Text style={styles.eqText}>{t('gpay.equivalence')}</Text>
                  </View>
                </>
              )}
            </LinearGradient>
          </View>
        </Animated.View>

        {!isLoggedIn ? (
          <Animated.View entering={FadeInUp.delay(60).duration(400)} style={styles.emptyCard}>
            <Text style={styles.emptyText}>{t('gpay.loginRequired')}</Text>
            <Pressable style={styles.primaryBtn} onPress={() => router.push('/login')}>
              <Text style={styles.primaryBtnText}>{t('gpay.loginCta')}</Text>
            </Pressable>
          </Animated.View>
        ) : error ? (
          <Animated.View entering={FadeInUp.delay(60).duration(400)} style={styles.emptyCard}>
            <Text style={styles.emptyText}>{error}</Text>
            <Pressable style={styles.primaryBtn} onPress={loadWallet}>
              <Text style={styles.primaryBtnText}>{t('gpay.retry')}</Text>
            </Pressable>
          </Animated.View>
        ) : (
          <>
            <Animated.View entering={FadeInUp.delay(50).duration(400)} style={styles.depositBlockWrap}>
              <Pressable
                onPress={() => Alert.alert(t('gpay.deposit'), t('gpay.depositSoon'))}
                style={({ pressed }) => [
                  styles.depositBlock,
                  pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] },
                ]}
              >
                <View style={styles.depositLeft}>
                  <View style={styles.actionBlockIcon}>
                    <Ionicons name="arrow-down-circle-outline" size={22} color={ui.brand} />
                  </View>
                  <View style={styles.depositTextCol}>
                    <Text style={styles.actionBlockTitle}>{t('gpay.deposit')}</Text>
                    <Text style={styles.actionBlockHint}>{t('gpay.depositHint')}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={ui.muted} />
              </Pressable>
            </Animated.View>

            <Animated.View entering={FadeInUp.delay(80).duration(400)} style={styles.blocksRow}>
              <ActionBlock
                title={t('gpay.buy')}
                hint={t('gpay.buyHint')}
                icon="bag-handle-outline"
                onPress={() => router.push('/(tabs)')}
                styles={styles}
                brand={ui.brand}
              />
              <ActionBlock
                title={t('gpay.cashback')}
                hint={t('gpay.cashbackHint')}
                value={formatGCoin(cashbackTotal)}
                icon="gift-outline"
                onPress={() => Alert.alert(t('gpay.cashback'), t('gpay.cashbackSoon'))}
                styles={styles}
                brand={ui.brand}
              />
            </Animated.View>
          </>
        )}

        <Animated.View entering={FadeInUp.delay(100).duration(400)} style={styles.legalCard}>
          <Text style={styles.legalHeading}>{t('gpay.legalTitle')}</Text>

          <Pressable
            style={({ pressed }) => [styles.legalRow, pressed && { opacity: 0.75 }]}
            onPress={() => router.push('/regulamento-gcoin')}
          >
            <View style={styles.legalIcon}>
              <Ionicons name="wallet-outline" size={18} color={ui.brand} />
            </View>
            <Text style={styles.legalLabel}>{t('gpay.regulationLink')}</Text>
            <Ionicons name="chevron-forward" size={18} color={ui.muted} />
          </Pressable>

          <View style={styles.legalLine} />

          <Pressable
            style={({ pressed }) => [styles.legalRow, pressed && { opacity: 0.75 }]}
            onPress={() => router.push('/termos')}
          >
            <View style={styles.legalIcon}>
              <Ionicons name="document-text-outline" size={18} color={ui.brand} />
            </View>
            <Text style={styles.legalLabel}>{t('gpay.termsLink')}</Text>
            <Ionicons name="chevron-forward" size={18} color={ui.muted} />
          </Pressable>
        </Animated.View>

        {isLoggedIn && !error ? (
          <Animated.View entering={FadeInUp.delay(140).duration(420)} style={styles.historySection}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>{t('gpay.history')}</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{transactions.length}</Text>
              </View>
            </View>

            {!loading && transactions.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>{t('gpay.emptyHistory')}</Text>
              </View>
            ) : null}

            {transactions.map((item, index) => {
              const meta = txMeta(item.type, ui);
              const isCredit = item.amount >= 0;

              return (
                <Animated.View
                  key={item.id}
                  entering={FadeInUp.delay(160 + index * 30).duration(360)}
                  style={styles.txCard}
                >
                  <View style={[styles.txIcon, { backgroundColor: meta.bg }]}>
                    <Ionicons name={meta.icon} size={18} color={meta.color} />
                  </View>
                  <View style={styles.txInfo}>
                    <Text style={styles.txTitle} numberOfLines={1}>
                      {txTitle(item.type, item.reason, t)}
                    </Text>
                    <Text style={styles.txStore}>{item.type}</Text>
                    <Text style={styles.txDate}>{formatTxDate(item.created_at)}</Text>
                  </View>
                  <View style={styles.txRight}>
                    <Text style={[styles.txAmount, isCredit && styles.txCredit]}>
                      {isCredit ? '+' : ''}
                      {formatGCoin(item.amount)}
                    </Text>
                    <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                      <Text style={[styles.statusText, { color: meta.color }]}>
                        {isCredit ? t('gpay.refunded') : t('gpay.paid')}
                      </Text>
                    </View>
                  </View>
                </Animated.View>
              );
            })}
          </Animated.View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function createStyles(ui: AppUI, isDark: boolean) {
  const glassBlock = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(120, 130, 145, 0.12)';
  const glassBorder = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(120, 130, 145, 0.18)';
  const iconSoft = isDark ? 'rgba(100,181,246,0.16)' : 'rgba(13,71,161,0.1)';

  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: isDark ? ui.bg : '#FFFFFF',
    },
    header: {
      paddingHorizontal: PAD,
      paddingBottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.card,
      borderWidth: 1,
      borderColor: ui.border,
    },
    headerBtnPlaceholder: {
      width: 40,
      height: 40,
    },
    brandTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: 18,
      fontWeight: '800',
      letterSpacing: -0.2,
      color: ui.text,
    },
    lockWrap: {
      flex: 1,
      paddingHorizontal: PAD,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    lockIcon: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.brandSoft,
      marginBottom: 8,
    },
    lockTitle: {
      fontSize: 22,
      fontWeight: '800',
      letterSpacing: -0.3,
      color: ui.text,
      textAlign: 'center',
    },
    lockHint: {
      fontSize: 15,
      lineHeight: 22,
      color: ui.muted,
      textAlign: 'center',
      marginBottom: 12,
      maxWidth: 300,
    },
    lockBtn: {
      minWidth: 220,
      alignItems: 'center',
    },
    content: {
      paddingHorizontal: PAD,
      paddingTop: 4,
    },
    heroStage: {
      marginTop: 4,
      marginBottom: 8,
      paddingBottom: 10,
    },
    heroShadow: {
      position: 'absolute',
      left: 20,
      right: 20,
      bottom: 0,
      height: 16,
      borderRadius: 28,
      backgroundColor: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(4, 30, 74, 0.2)',
    },
    heroOuter: {
      borderRadius: 28,
      overflow: 'hidden',
      backgroundColor: '#0D47A1',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.35)',
      shadowColor: isDark ? '#000' : '#041E4A',
      shadowOpacity: isDark ? 0.5 : 0.26,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 10 },
      elevation: 8,
    },
    heroFace: {
      padding: 20,
      minHeight: 168,
      borderRadius: 28,
      overflow: 'hidden',
    },
    heroGloss: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: '52%',
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
    },
    heroBottomShade: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: '28%',
      backgroundColor: 'rgba(0,0,0,0.12)',
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
    },
    heroTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
    },
    heroLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: 'rgba(255,255,255,0.72)',
    },
    heroAccount: {
      marginTop: 2,
      fontSize: 15,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: 'rgba(255,255,255,0.16)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.28)',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
    },
    chipText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    heroValueRow: {
      marginTop: 16,
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 6,
    },
    heroValue: {
      fontSize: 24,
      fontWeight: '800',
      color: '#FFFFFF',
      letterSpacing: -0.6,
    },
    heroUnit: {
      fontSize: 13,
      fontWeight: '700',
      color: 'rgba(255,255,255,0.78)',
    },
    heroHint: {
      marginTop: 6,
      fontSize: 12,
      fontWeight: '500',
      color: 'rgba(255,255,255,0.7)',
    },
    eqPill: {
      alignSelf: 'flex-start',
      marginTop: 12,
      backgroundColor: 'rgba(255,255,255,0.14)',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
    },
    eqText: {
      fontSize: 11,
      fontWeight: '700',
      color: 'rgba(255,255,255,0.9)',
    },
    blocksRow: {
      marginTop: 12,
      flexDirection: 'row',
      gap: GAP,
    },
    depositBlockWrap: {
      marginTop: 14,
    },
    depositBlock: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: 18,
      paddingVertical: 16,
      paddingHorizontal: 14,
      backgroundColor: glassBlock,
      borderWidth: 1,
      borderColor: glassBorder,
    },
    depositLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
      paddingRight: 8,
    },
    depositTextCol: {
      flex: 1,
    },
    actionBlockIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: iconSoft,
      marginBottom: 0,
    },
    actionBlockTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: ui.text,
    },
    actionBlockValue: {
      marginTop: 4,
      fontSize: 14,
      fontWeight: '700',
      color: ui.brand,
    },
    actionBlockHint: {
      marginTop: 2,
      fontSize: 12,
      fontWeight: '500',
      color: ui.muted,
    },
    actionBlock: {
      flex: 1,
      borderRadius: 20,
      paddingVertical: 18,
      paddingHorizontal: 14,
      backgroundColor: glassBlock,
      borderWidth: 1,
      borderColor: glassBorder,
    },
    actionBlockIconSpaced: {
      marginBottom: 12,
    },
    emptyCard: {
      marginTop: 14,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: ui.border,
      backgroundColor: ui.card,
      padding: 18,
      alignItems: 'center',
      gap: 12,
    },
    emptyText: {
      fontSize: 14,
      fontWeight: '600',
      color: ui.muted,
      textAlign: 'center',
    },
    primaryBtn: {
      backgroundColor: ui.brand,
      borderRadius: 12,
      paddingHorizontal: 18,
      paddingVertical: 12,
    },
    primaryBtnText: {
      color: ui.onBrand,
      fontSize: 14,
      fontWeight: '800',
    },
    legalCard: {
      marginTop: 14,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: ui.border,
      backgroundColor: ui.card,
      padding: 14,
    },
    legalHeading: {
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.5,
      color: ui.muted,
      marginBottom: 6,
      marginLeft: 2,
      textTransform: 'uppercase',
    },
    legalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      gap: 12,
    },
    legalIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: iconSoft,
    },
    legalLabel: {
      flex: 1,
      fontSize: 15,
      fontWeight: '700',
      color: ui.text,
    },
    legalLine: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: ui.divider,
      marginLeft: 48,
    },
    historySection: {
      marginTop: 22,
    },
    historyHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    historyTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: ui.text,
    },
    countBadge: {
      minWidth: 28,
      height: 28,
      borderRadius: 14,
      paddingHorizontal: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.brandSoft,
    },
    countText: {
      fontSize: 12,
      fontWeight: '800',
      color: ui.brand,
    },
    txCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      borderRadius: 16,
      marginBottom: 10,
      backgroundColor: ui.card,
      borderWidth: 1,
      borderColor: ui.border,
    },
    txIcon: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    txInfo: {
      flex: 1,
      paddingRight: 8,
    },
    txTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: ui.text,
    },
    txStore: {
      marginTop: 2,
      fontSize: 12,
      fontWeight: '500',
      color: ui.muted,
    },
    txDate: {
      marginTop: 2,
      fontSize: 11,
      color: ui.muted,
    },
    txRight: {
      alignItems: 'flex-end',
      gap: 6,
    },
    txAmount: {
      fontSize: 12,
      fontWeight: '800',
      color: ui.text,
    },
    txCredit: {
      color: ui.success,
    },
    statusPill: {
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    statusText: {
      fontSize: 10,
      fontWeight: '800',
    },
  });
}
