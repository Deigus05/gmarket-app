import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type EventItem = {
  id: string;
  title: string;
  /** Nome do espaço / venue */
  venue: string;
  city: string;
  day: string;
  month: string;
  weekday: string;
  priceLabel: string;
  category: 'show' | 'festival' | 'atividade' | 'noite';
  age: string;
  image: string;
};

type Props = {
  event: EventItem;
  width: number;
  imageHeight: number;
  /** Cor do fundo da página (para os recortes do ticket) */
  pageBg?: string;
  isDark?: boolean;
  onPress?: (event: EventItem) => void;
};

const CATEGORY_LABEL: Record<EventItem['category'], string> = {
  show: 'Show',
  festival: 'Festival',
  atividade: 'Atividade',
  noite: 'Noite',
};

const YELLOW = '#F5C518';
/** Recorte suave no topo — maior, como na referência */
const TOP_NOTCH_R = 18;

/**
 * Ticket vertical:
 * - recorte suave grande no topo
 * - sem recorte lateral nem em baixo
 */
export const EventTicketCard = memo(function EventTicketCard({
  event,
  width,
  imageHeight,
  pageBg = '#1A1A1A',
  isDark = true,
  onPress,
}: Props) {
  const titleColor = isDark ? '#FFFFFF' : '#111111';
  const mutedColor = isDark ? '#9CA3AF' : '#6B7280';
  const venueColor = isDark ? '#D1D5DB' : '#374151';

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => onPress?.(event)}
      style={[styles.card, { width }]}
    >
      <View style={[styles.ticket, { width, height: imageHeight }]}>
        <Image
          source={{ uri: event.image }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={event.id}
        />

        {/* Recorte topo (centro) — suave e maior */}
        <View
          style={[
            styles.notch,
            {
              backgroundColor: pageBg,
              width: TOP_NOTCH_R * 2,
              height: TOP_NOTCH_R * 2,
              borderRadius: TOP_NOTCH_R,
              top: -TOP_NOTCH_R,
              left: width / 2 - TOP_NOTCH_R,
            },
          ]}
          pointerEvents="none"
        />

        {/* Badge de data */}
        <View style={styles.dateBadge}>
          <Text style={styles.dateMonth}>{event.month}</Text>
          <Text style={styles.dateDay}>{event.day}</Text>
          <Text style={styles.dateWeekday}>{event.weekday}</Text>
        </View>
      </View>

      <Text style={[styles.title, { color: titleColor }]} numberOfLines={1}>
        {event.title}
      </Text>
      <Text style={[styles.eventType, { color: mutedColor }]} numberOfLines={1}>
        {CATEGORY_LABEL[event.category]}
      </Text>
      <Text style={[styles.venue, { color: venueColor }]} numberOfLines={1}>
        {event.venue}
      </Text>
      <View style={styles.locationRow}>
        <Ionicons name="location-sharp" size={12} color={YELLOW} />
        <Text style={[styles.city, { color: mutedColor }]} numberOfLines={1}>
          {event.city}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'transparent',
  },
  ticket: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
  notch: {
    position: 'absolute',
    zIndex: 2,
  },
  dateBadge: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    minWidth: 42,
    borderRadius: 10,
    backgroundColor: YELLOW,
    paddingHorizontal: 6,
    paddingVertical: 5,
    alignItems: 'center',
    zIndex: 3,
  },
  dateMonth: {
    color: '#111',
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'lowercase',
    letterSpacing: 0.2,
  },
  dateDay: {
    color: '#111',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 20,
  },
  dateWeekday: {
    color: '#111',
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'lowercase',
  },
  title: {
    marginTop: 8,
    paddingHorizontal: 2,
    fontSize: 15,
    fontWeight: '800',
  },
  eventType: {
    marginTop: 3,
    paddingHorizontal: 2,
    fontSize: 12,
    fontWeight: '500',
  },
  venue: {
    marginTop: 2,
    paddingHorizontal: 2,
    fontSize: 12,
    fontWeight: '600',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 3,
    paddingHorizontal: 2,
  },
  city: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
  },
});
