import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/components/AuthContext';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import {
  createTicketOrder,
  getGcoinWallet,
  type EventDto,
  type EventTicketDto,
  type TicketPaymentMethod,
} from '@/components/api';
import { resolveEventDto } from '@/components/eventos/eventsData';
import { useLocale } from '@/components/LocaleContext';
import { useAppTheme } from '@/components/tema';
import { saveLocalTicket } from '@/lib/localTickets';
import { createReturnPath } from '@/lib/navigation';
import { notifyAdminOfSale } from '@/lib/saleNotify';
import { openWhatsAppTo, getSupportWhatsApp, getTransferPhone } from '@/lib/support';

const ACCENT = '#F5C518';
const ACCENT_NEON = '#E8FF00';

function param(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

/** Preço unitário: usa priceCfa ou extrai do priceLabel (ex.: "desde 3.000 CFA"). */
function resolveUnitPrice(event: { priceCfa?: number | null; priceLabel?: string | null }): number {
  const raw = Number(event.priceCfa);
  if (Number.isFinite(raw) && raw > 0) return Math.round(raw);

  const label = String(event.priceLabel || '');
  if (/gratu/i.test(label)) return 0;

  const digits = label.replace(/\s/g, '').match(/(\d[\d.]*)/);
  if (!digits) return Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : 0;

  // "3.000" (pt) → 3000 ; "3.000,50" → 3000
  const normalized = digits[1].includes(',')
    ? digits[1].replace(/\./g, '').replace(',', '.')
    : digits[1].replace(/\./g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

export default function BilhetePagamentoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const { isDark } = useAppTheme();
  const { token, isLoggedIn, user, loading: authLoading } = useAuth();
  const loginRequestedRef = useRef(false);
  const params = useLocalSearchParams<{
    eventId?: string;
    qty?: string;
    buyerNome?: string;
    buyerTelefone?: string;
    buyerGenero?: string;
  }>();

  const eventId = param(params.eventId);
  const qty = Math.max(1, Number(param(params.qty)) || 1);
  const buyerNome = param(params.buyerNome) || `${user?.nome || ''} ${user?.apelido || ''}`.trim();
  const buyerTelefone = param(params.buyerTelefone) || user?.telefone || '';
  const buyerGenero = (param(params.buyerGenero) || user?.genero || 'masculino') as
    | 'masculino'
    | 'feminino';

  const [event, setEvent] = useState<EventDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<TicketPaymentMethod>('gpay');
  const [gpayBalance, setGpayBalance] = useState(0);
  const [receiptShared, setReceiptShared] = useState(false);
  const [fallbackPhone, setFallbackPhone] = useState('');

  const theme = useMemo(
    () =>
      isDark
        ? {
            bg: '#1A1A1A',
            ink: '#fff',
            muted: '#9A9A9A',
            card: '#121212',
            mist: '#1F1F1F',
            line: '#2A2A2A',
            danger: '#F87171',
            gold: '#FBBF24',
          }
        : {
            bg: '#fff',
            ink: '#111',
            muted: '#6B7280',
            card: '#F3F4F6',
            mist: '#F9FAFB',
            line: '#E5E7EB',
            danger: '#DC2626',
            gold: '#D4A017',
          },
    [isDark],
  );

  useEffect(() => {
    if (authLoading) return;
    if (isLoggedIn) {
      loginRequestedRef.current = false;
      return;
    }
    if (loginRequestedRef.current) return;
    loginRequestedRef.current = true;
    router.push({
      pathname: '/login',
      params: {
        redirect: createReturnPath('/bilhete-pagamento', {
          eventId,
          qty,
          buyerNome: param(params.buyerNome),
          buyerTelefone: param(params.buyerTelefone),
          buyerGenero: param(params.buyerGenero),
        }),
      },
    });
  }, [
    authLoading,
    eventId,
    isLoggedIn,
    params.buyerGenero,
    params.buyerNome,
    params.buyerTelefone,
    qty,
    router,
  ]);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!eventId) {
        if (active) setLoading(false);
        return;
      }
      if (active) setLoading(true);
      const data = await resolveEventDto(eventId);
      if (!active) return;
      setEvent(data);
      setLoading(false);
    }
    void load();
    return () => {
      active = false;
    };
  }, [eventId]);

  useEffect(() => {
    let active = true;
    async function loadFallbackPhone() {
      const transfer = await getTransferPhone();
      const support = transfer ? '' : await getSupportWhatsApp();
      if (!active) return;
      setFallbackPhone(transfer || support);
    }
    void loadFallbackPhone();
    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      async function loadWallet() {
        if (!token) return;
        const wallet = await getGcoinWallet(token);
        if (!active) return;
        if (wallet.success) setGpayBalance(wallet.data.balance);
      }
      void loadWallet();
      return () => {
        active = false;
      };
    }, [token]),
  );

  const unitPrice = event ? resolveUnitPrice(event) : 0;
  const total = unitPrice * qty;
  const isFree = total <= 0;
  const totalLabel =
    isFree ? t('events.free') : `${total.toLocaleString('pt-PT')} CFA`;
  const paymentPhone = event?.paymentPhone || fallbackPhone;
  const canPayWithGpay = isFree || gpayBalance >= total;
  const finalizeDisabled =
    submitting ||
    (paymentMethod === 'gpay' && !canPayWithGpay) ||
    (paymentMethod === 'transfer' && !isFree && !receiptShared);

  const copyPhone = async () => {
    if (!paymentPhone) return;
    try {
      await Share.share({ message: paymentPhone });
    } catch {
      Alert.alert(t('events.copiedTitle'), paymentPhone);
    }
  };

  const openWhatsApp = async () => {
    if (!event || !paymentPhone) return;
    const msg = t('events.whatsappPrefill')
      .replace('{title}', event.title)
      .replace('{qty}', String(qty))
      .replace('{total}', totalLabel)
      .replace('{name}', buyerNome)
      .replace('{phone}', buyerTelefone);
    await openWhatsAppTo(paymentPhone, msg);
    setReceiptShared(true);
  };

  const onFinalize = async () => {
    if (!eventId || !event) return;

    if (paymentMethod === 'gpay' && !canPayWithGpay) {
      Alert.alert(t('checkout.insufficientTitle'), t('events.gpayInsufficient'));
      return;
    }

    if (paymentMethod === 'transfer' && !isFree && !receiptShared) {
      Alert.alert(t('events.receiptRequiredTitle'), t('events.receiptRequiredBody'));
      return;
    }

    setSubmitting(true);

    let ticket: EventTicketDto | null = null;
    let serverEventId = eventId;

    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        eventId,
      );
    if (token && !isUuid) {
      try {
        const { getEvents } = await import('@/components/api');
        const list = await getEvents();
        const match = list.find(
          (e) => e.title.trim().toLowerCase() === event.title.trim().toLowerCase(),
        );
        if (match) serverEventId = match.id;
      } catch {
        // mantém eventId
      }
    }

    const method: TicketPaymentMethod = isFree ? 'transfer' : paymentMethod;

    if (token) {
      const result = await createTicketOrder(token, {
        eventId: serverEventId,
        qty,
        buyerNome,
        buyerTelefone,
        buyerGenero,
        payment_method: method,
      });
      if (result.success) {
        ticket = {
          ...result.data,
          payment_method: result.data.payment_method || method,
          event: result.data.event || {
            id: event.id,
            title: event.title,
            typeLabel: event.typeLabel,
            category: event.category,
            age: event.age,
            venue: event.venue,
            city: event.city,
            day: event.day,
            month: event.month,
            weekday: event.weekday,
            priceLabel: event.priceLabel,
            images: event.images,
            gate: event.gate,
            startTime: event.startTime,
          },
        };
        if (method === 'gpay') {
          const wallet = await getGcoinWallet(token);
          if (wallet.success) setGpayBalance(wallet.data.balance);
        }
      } else if (method === 'gpay') {
        setSubmitting(false);
        Alert.alert(t('events.purchaseErrorTitle'), result.message);
        return;
      }
    }

    // Fallback local se o servidor falhar (só transferência — GPay precisa do servidor)
    if (!ticket) {
      if (method === 'gpay') {
        setSubmitting(false);
        Alert.alert(t('events.purchaseErrorTitle'), t('events.gpayServerRequired'));
        return;
      }
      const code = `LOC${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      ticket = {
        id: `local-${Date.now()}`,
        eventId: serverEventId,
        customerId: user?.id || 'local',
        qty,
        unitPrice,
        total,
        buyerNome,
        buyerTelefone,
        buyerGenero,
        payment_method: method,
        status: 'awaiting_confirmation',
        code,
        qrPayload: `GMKT-TICKET:${code}:${serverEventId}`,
        created_at: new Date().toISOString(),
        event: {
          id: event.id,
          title: event.title,
          typeLabel: event.typeLabel,
          category: event.category,
          age: event.age,
          venue: event.venue,
          city: event.city,
          day: event.day,
          month: event.month,
          weekday: event.weekday,
          priceLabel: event.priceLabel,
          images: event.images,
          gate: event.gate,
          startTime: event.startTime,
        },
      };
    }

    await saveLocalTicket(ticket);

    void notifyAdminOfSale({
      type: 'ticket',
      subject: `Novo bilhete GMarket — ${event.title}`,
      summary: [
        `Bilhete: ${ticket.code}`,
        `Evento: ${event.title}`,
        `Cliente: ${buyerNome}`,
        `Telefone: ${buyerTelefone}`,
        `Qtd: ${qty}`,
        `Total: ${total.toLocaleString()} CFA`,
        `Pagamento: ${method}`,
        `Estado: ${ticket.status}`,
      ].join('\n'),
      fields: {
        ticket_code: ticket.code,
        ticket_id: ticket.id,
        event_title: event.title,
        event_id: serverEventId,
        buyer_nome: buyerNome,
        buyer_telefone: buyerTelefone,
        qty,
        total_cfa: total,
        payment_method: method,
        status: ticket.status,
      },
    });

    setSubmitting(false);
    const isConfirmed = ticket.status === 'confirmed';
    const isCancelled = ticket.status === 'cancelled';
    const isGpayPending = method === 'gpay' && !isConfirmed && !isCancelled;
    Alert.alert(
      isConfirmed
        ? t('events.gpaySuccessTitle')
        : isCancelled
          ? t('events.purchaseErrorTitle')
          : isGpayPending
            ? t('events.gpayPendingTitle')
            : t('events.finalizeTitle'),
      isConfirmed
        ? t('events.gpaySuccessBody')
        : isCancelled
          ? t('delivery.statusCancelled')
          : isGpayPending
            ? t('events.gpayPendingBody')
            : t('events.finalizeBody'),
      [
        {
          text: t('events.purchaseOk'),
          onPress: () => router.replace('/(tabs)'),
        },
      ],
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={theme.ink} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.ink }]}>{t('events.paymentTitle')}</Text>
        <View style={styles.iconBtn} />
      </View>

      {loading ? (
        <RippleWaveLoader style={{ marginTop: 40 }} color={ACCENT} />
      ) : !event ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: theme.ink }]}>{t('events.notFound')}</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>{t('events.backToEvents')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[styles.body, { paddingBottom: 24 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <Text style={[styles.label, { color: theme.muted }]}>{t('events.orderSummary')}</Text>
              <Text style={[styles.summaryTitle, { color: theme.ink }]}>{event.title}</Text>
              <Text style={[styles.summaryLine, { color: theme.muted }]}>
                {buyerNome} · {buyerTelefone}
              </Text>
              <Text style={[styles.summaryTotal, { color: theme.ink }]}>
                ×{qty} · {totalLabel}
              </Text>
            </View>

            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <Text style={[styles.label, { color: theme.muted }]}>
                {t('events.sectionPayment') || 'Método de pagamento'}
              </Text>

              {isFree ? (
                <Text style={[styles.hint, { color: theme.muted, marginTop: 0 }]}>
                  {t('events.free')} — {t('events.finalizeAwait')}
                </Text>
              ) : (
                <>
                  <TouchableOpacity
                    style={[
                      styles.payRow,
                      {
                        borderColor: paymentMethod === 'gpay' ? ACCENT : theme.line,
                        backgroundColor:
                          paymentMethod === 'gpay'
                            ? isDark
                              ? 'rgba(245,197,24,0.12)'
                              : 'rgba(245,197,24,0.08)'
                            : theme.mist,
                      },
                    ]}
                    onPress={() => setPaymentMethod('gpay')}
                    activeOpacity={0.85}
                  >
                    <View
                      style={[
                        styles.payIcon,
                        { backgroundColor: isDark ? 'rgba(212,160,23,0.2)' : '#FEF3C7' },
                      ]}
                    >
                      <Ionicons name="wallet-outline" size={20} color={theme.gold} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.payTitle, { color: theme.ink }]}>
                        {t('events.payGpay') || 'Pagar com GPay'}
                      </Text>
                      <Text style={[styles.paySub, { color: theme.muted }]}>
                        {t('events.gpayBalance', {
                          balance: gpayBalance.toLocaleString('pt-PT'),
                        }) || `Saldo: ${gpayBalance.toLocaleString('pt-PT')} GCoin`}
                      </Text>
                    </View>
                    <Ionicons
                      name={paymentMethod === 'gpay' ? 'radio-button-on' : 'radio-button-off'}
                      size={22}
                      color={paymentMethod === 'gpay' ? ACCENT : '#C7C7CC'}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.payRow,
                      {
                        marginTop: 10,
                        borderColor: paymentMethod === 'transfer' ? ACCENT : theme.line,
                        backgroundColor:
                          paymentMethod === 'transfer'
                            ? isDark
                              ? 'rgba(245,197,24,0.12)'
                              : 'rgba(245,197,24,0.08)'
                            : theme.mist,
                      },
                    ]}
                    onPress={() => setPaymentMethod('transfer')}
                    activeOpacity={0.85}
                  >
                    <View
                      style={[styles.payIcon, { backgroundColor: isDark ? theme.mist : '#ECFDF5' }]}
                    >
                      <Ionicons name="phone-portrait-outline" size={20} color={ACCENT} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.payTitle, { color: theme.ink }]}>
                        {t('events.payTransfer') || 'Enviar para o número'}
                      </Text>
                      <Text style={[styles.paySub, { color: theme.muted }]}>
                        {t('events.payTransferHint') || 'Mobile Money + comprovante no WhatsApp'}
                      </Text>
                    </View>
                    <Ionicons
                      name={paymentMethod === 'transfer' ? 'radio-button-on' : 'radio-button-off'}
                      size={22}
                      color={paymentMethod === 'transfer' ? ACCENT : '#C7C7CC'}
                    />
                  </TouchableOpacity>

                  {paymentMethod === 'gpay' && (
                    <>
                      <View
                        style={[
                          styles.gpayBalanceBox,
                          {
                            backgroundColor: isDark ? 'rgba(212,160,23,0.16)' : '#FFFBEB',
                            borderColor: isDark ? 'rgba(253,230,138,0.35)' : '#FDE68A',
                          },
                        ]}
                      >
                        <Text style={[styles.gpayBalanceLabel, { color: theme.gold }]}>
                          {t('events.gpayLabel') || 'Saldo GCoin'}
                        </Text>
                        <Text style={[styles.gpayBalanceValue, { color: theme.ink }]}>
                          {gpayBalance.toLocaleString('pt-PT')} GCoin
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.hint,
                          { color: canPayWithGpay ? theme.muted : theme.danger },
                        ]}
                      >
                        {canPayWithGpay
                          ? t('events.gpayDebitHint')
                          : t('events.gpayInsufficient')}
                      </Text>
                    </>
                  )}

                  {paymentMethod === 'transfer' && (
                    <>
                      <Text style={[styles.label, { color: theme.muted, marginTop: 14 }]}>
                        {t('events.payTo')}
                      </Text>
                      <Text style={[styles.payLabel, { color: theme.ink }]}>
                        {event.paymentLabel || 'Mobile Money'}
                      </Text>
                      <TouchableOpacity
                        style={styles.phoneRow}
                        onPress={() => void copyPhone()}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.phone}>{paymentPhone || '—'}</Text>
                        <Ionicons name="copy-outline" size={18} color={ACCENT} />
                      </TouchableOpacity>
                      <Text style={[styles.hint, { color: theme.muted }]}>{t('events.payHint')}</Text>
                    </>
                  )}
                </>
              )}
            </View>
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
            {paymentMethod === 'transfer' && !isFree && (
              <TouchableOpacity
                style={styles.waBtn}
                onPress={() => void openWhatsApp()}
                activeOpacity={0.9}
              >
                <Ionicons name="logo-whatsapp" size={22} color="#fff" />
                <Text style={styles.waText}>
                  {receiptShared ? t('events.sendWhatsAppAgain') : t('events.sendWhatsApp')}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.receiptBtn, finalizeDisabled && styles.receiptBtnDisabled]}
              onPress={() => void onFinalize()}
              disabled={finalizeDisabled}
              activeOpacity={0.9}
            >
              {submitting ? (
                <RippleWaveLoader size="small" color="#111" />
              ) : (
                <Text style={styles.receiptText}>
                  {paymentMethod === 'gpay' && !isFree
                    ? t('events.payGpayNow')
                    : t('events.finalizeAwait')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700' },
  body: { padding: 16, gap: 14 },
  card: { borderRadius: 16, padding: 16 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  payLabel: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(245,197,24,0.12)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: ACCENT,
  },
  phone: { color: ACCENT, fontSize: 22, fontWeight: '900', letterSpacing: 0.5 },
  hint: { marginTop: 10, fontSize: 13, lineHeight: 18 },
  summaryTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  summaryLine: { fontSize: 13, marginBottom: 6 },
  summaryTotal: { fontSize: 18, fontWeight: '900' },
  payRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 12,
  },
  payIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payTitle: { fontSize: 14, fontWeight: '800' },
  paySub: { fontSize: 12, marginTop: 2 },
  gpayBalanceBox: {
    marginTop: 12,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gpayBalanceLabel: { fontSize: 12, fontWeight: '700' },
  gpayBalanceValue: { fontSize: 16, fontWeight: '900' },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 10,
  },
  waBtn: {
    backgroundColor: '#25D366',
    borderRadius: 999,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  waText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  receiptBtn: {
    backgroundColor: ACCENT_NEON,
    borderRadius: 999,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptBtnDisabled: { opacity: 0.45 },
  receiptText: { color: '#111', fontSize: 15, fontWeight: '900' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  emptyText: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  backBtn: {
    backgroundColor: ACCENT,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  backBtnText: { color: '#111', fontWeight: '800' },
});
