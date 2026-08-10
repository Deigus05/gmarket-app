import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useRef, useState } from 'react';
import {
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import type { EventTicketDto } from '@/components/api';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import { ShowTicketCard } from '@/components/eventos/ShowTicketCard';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const ACCENT = '#F5C518';
const ACCENT_NEON = '#E8FF00';
const DATE_CHIP_W = 168;
const DATE_CHIP_H = 68;
const BORDER = 1.15;
const RIM_STYLE = { transform: [{ rotate: '28deg' as const }] };

type Props = {
  tickets: EventTicketDto[];
  loading?: boolean;
  isDark?: boolean;
  pendingLabel: string;
  pendingHint: string;
  shareLabel: string;
  closeLabel: string;
};

function toTicketData(ticket: EventTicketDto) {
  const event = ticket.event!;
  return {
    typeLabel: event.typeLabel || 'Show',
    title: event.title,
    day: event.day,
    month: event.month,
    city: event.city,
    code: ticket.code,
    gate: event.gate || 'A01',
    startTime: event.startTime || '21:00',
    priceLabel: event.priceLabel,
    totalLabel:
      ticket.total > 0
        ? `${ticket.total.toLocaleString('pt-PT')} CFA`
        : event.priceLabel,
    imageUrl: event.images?.[0] || null,
  };
}

const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);

function DateChip({
  day,
  month,
  weekday,
  typeLabel,
  title,
  isDark,
  onPress,
}: {
  day: string;
  month: string;
  weekday?: string;
  typeLabel: string;
  title: string;
  isDark: boolean;
  onPress: () => void;
}) {
  const fill = isDark ? '#0A0A0A' : '#FFFFFF';
  const ink = isDark ? '#FFFFFF' : '#111111';
  const muted = isDark ? '#A8A8A8' : '#555555';
  const rimColors = isDark
    ? ([
        'transparent',
        'rgba(255,255,255,0.12)',
        '#FFFFFF',
        'rgba(255,255,255,0.65)',
        'transparent',
        'rgba(255,255,255,0.22)',
        '#FFFFFF',
      ] as const)
    : ([
        'transparent',
        'rgba(0,0,0,0.1)',
        '#111111',
        'rgba(0,0,0,0.65)',
        'transparent',
        'rgba(0,0,0,0.18)',
        '#111111',
      ] as const);

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={styles.chipOuter}>
      <View style={[styles.chipFrame, { backgroundColor: isDark ? '#141414' : '#ECECEC' }]}>
        <AnimatedGradient
          colors={[...rimColors]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.chipRim, RIM_STYLE]}
        />
        <View
          style={[
            styles.chipInner,
            {
              backgroundColor: fill,
              shadowColor: isDark ? '#FFFFFF' : '#000000',
              shadowOpacity: isDark ? 0.16 : 0.14,
            },
          ]}
        >
          <View style={styles.dateCol}>
            <Text style={[styles.dateMonth, { color: muted }]}>{month.toUpperCase()}</Text>
            <Text style={[styles.dateDay, { color: ink }]}>{day}</Text>
            <Text style={[styles.dateWeek, { color: muted }]}>
              {weekday?.slice(0, 3)?.toUpperCase() || ''}
            </Text>
          </View>
          <View
            style={[
              styles.chipDivider,
              { backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)' },
            ]}
          />
          <View style={styles.infoCol}>
            <Text style={[styles.chipType, { color: ACCENT }]} numberOfLines={1}>
              {typeLabel}
            </Text>
            <Text style={[styles.chipTitle, { color: ink }]} numberOfLines={2}>
              {title}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export const HomeTicketStrip = memo(function HomeTicketStrip({
  tickets,
  loading: _loading,
  isDark = false,
  pendingLabel,
  pendingHint,
  shareLabel,
}: Props) {
  const insets = useSafeAreaInsets();
  const captureViewRef = useRef<View>(null);
  const [preview, setPreview] = useState<EventTicketDto | null>(null);
  const [sharing, setSharing] = useState(false);

  // Sem bilhetes: home normal (também no 1.º load — sem spinner).
  // Com bilhetes: mostra sempre, mesmo durante refresh (loading não esconde o chip).
  if (!tickets.length) return null;

  const pending = tickets.filter((t) => t.status === 'awaiting_confirmation');
  const confirmed = tickets.filter((t) => t.status === 'confirmed' && t.event);

  const shareTicket = async () => {
    if (!captureViewRef.current || !preview) return;
    setSharing(true);
    try {
      const uri = await captureRef(captureViewRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      await Share.share({
        url: Platform.OS === 'ios' ? uri : undefined,
        message:
          Platform.OS === 'android'
            ? uri
            : `${preview.event?.title || 'Bilhete'} · ${preview.code}`,
        title: preview.event?.title || 'Bilhete',
      });
    } catch (error) {
      console.log('Erro ao partilhar bilhete:', error);
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={styles.wrap}>
      {pending.map((ticket) => (
        <View key={ticket.id} style={styles.pendingCard}>
          <View style={styles.pendingIcon}>
            <Ionicons name="time-outline" size={22} color="#111" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.pendingTitle}>{pendingLabel}</Text>
            <Text style={styles.pendingEvent} numberOfLines={1}>
              {ticket.event?.title || 'Evento'} · {ticket.code}
            </Text>
            <Text style={styles.pendingHint}>{pendingHint}</Text>
          </View>
        </View>
      ))}

      {confirmed.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dateRow}
        >
          {confirmed.map((ticket) => {
            const event = ticket.event!;
            return (
              <DateChip
                key={ticket.id}
                day={event.day}
                month={event.month}
                weekday={event.weekday}
                typeLabel={event.typeLabel || 'Show'}
                title={event.title}
                isDark={isDark}
                onPress={() => setPreview(ticket)}
              />
            );
          })}
        </ScrollView>
      ) : null}

      <Modal
        visible={!!preview}
        transparent
        animationType="fade"
        onRequestClose={() => setPreview(null)}
      >
        <View style={styles.modalRoot}>
          <BlurView
            intensity={30}
            tint="dark"
            experimentalBlurMethod="dimezisBlurView"
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.overlayDim} />

          <View style={[styles.overlayTop, { paddingTop: insets.top + 8 }]}>
            <Text style={styles.overlayTitle} numberOfLines={1}>
              {preview?.event?.title || ''}
            </Text>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setPreview(null)}>
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          <Pressable style={styles.overlayCenter} onPress={() => setPreview(null)}>
            {preview?.event ? (
              <View
                ref={captureViewRef}
                collapsable={false}
                style={styles.captureBox}
                onStartShouldSetResponder={() => true}
              >
                <ShowTicketCard
                  width={Math.min(SCREEN_W - 16, 456)}
                  ticket={toTicketData(preview)}
                />
              </View>
            ) : null}
          </Pressable>

          <TouchableOpacity
            style={[styles.shareBtn, { marginBottom: Math.max(insets.bottom, 16) }]}
            onPress={() => void shareTicket()}
            disabled={sharing}
            activeOpacity={0.9}
          >
            {sharing ? (
              <RippleWaveLoader size="small" color="#111" />
            ) : (
              <>
                <Ionicons name="share-outline" size={18} color="#111" />
                <Text style={styles.shareText}>{shareLabel}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 10,
    gap: 10,
  },
  pendingCard: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    backgroundColor: ACCENT,
    borderRadius: 16,
    padding: 14,
  },
  pendingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingTitle: {
    color: '#111',
    fontSize: 14,
    fontWeight: '900',
  },
  pendingEvent: {
    color: '#222',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  pendingHint: {
    color: '#333',
    fontSize: 12,
    marginTop: 3,
  },
  dateRow: {
    gap: 10,
    paddingVertical: 2,
    paddingRight: 8,
  },
  chipOuter: {
    width: DATE_CHIP_W,
    height: DATE_CHIP_H,
  },
  chipFrame: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRim: {
    position: 'absolute',
    width: DATE_CHIP_W * 1.7,
    height: DATE_CHIP_W * 1.7,
  },
  chipInner: {
    ...StyleSheet.absoluteFillObject,
    margin: BORDER,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 2,
  },
  dateCol: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateMonth: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  dateDay: {
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 22,
  },
  dateWeek: {
    fontSize: 9,
    fontWeight: '700',
  },
  chipDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginHorizontal: 8,
  },
  infoCol: {
    flex: 1,
    justifyContent: 'center',
    gap: 3,
    minWidth: 0,
  },
  chipType: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  chipTitle: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
  },
  modalRoot: {
    flex: 1,
    backgroundColor: 'transparent',
    minHeight: SCREEN_H,
  },
  overlayDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  overlayTop: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 2,
  },
  overlayTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureBox: {
    padding: 8,
  },
  shareBtn: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: ACCENT_NEON,
    borderRadius: 999,
    paddingHorizontal: 22,
    paddingVertical: 14,
    zIndex: 2,
  },
  shareText: {
    color: '#111',
    fontWeight: '900',
    fontSize: 15,
  },
});
