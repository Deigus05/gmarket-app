import { Image } from 'expo-image';
import React, { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export type ShowTicketData = {
  typeLabel: string;
  title: string;
  day: string;
  month: string;
  city: string;
  code: string;
  gate: string;
  startTime: string;
  priceLabel: string;
  totalLabel?: string;
  /** Foto principal do evento (stub amarelo) */
  imageUrl?: string | null;
};

type Props = {
  ticket: ShowTicketData;
  width?: number;
  compact?: boolean;
};

const YELLOW = '#F5C518';
const LIME = '#E8FF00';

function hashBits(input: string, count: number): boolean[] {
  const bits: boolean[] = [];
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  for (let i = 0; i < count; i++) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    bits.push((h & 1) === 1);
  }
  return bits;
}

function Barcode({ value }: { value: string }) {
  const bars = useMemo(() => hashBits(value, 42), [value]);
  return (
    <View style={styles.barcode}>
      {bars.map((thick, i) => (
        <View
          key={i}
          style={{
            width: thick ? 2.5 : 1.2,
            height: 36,
            backgroundColor: '#fff',
            marginRight: 1,
            opacity: i % 5 === 0 ? 1 : 0.85,
          }}
        />
      ))}
    </View>
  );
}

export const ShowTicketCard = memo(function ShowTicketCard({
  ticket,
  width = 408,
  compact = false,
}: Props) {
  const height = compact ? 178 : 202;
  const stubW = Math.round(width * 0.28);
  const mainW = width - stubW;
  const price = ticket.totalLabel || ticket.priceLabel;
  const imageUrl = ticket.imageUrl || null;

  return (
    <View style={[styles.wrap, { width, height }]}>
      <View style={[styles.main, { width: mainW, height }]}>
        <View style={styles.leftNotch} />
        <View style={styles.mainPad}>
          <View style={styles.topRow}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={styles.type}>{ticket.typeLabel.toUpperCase()}</Text>
              <Text style={styles.title} numberOfLines={2}>
                {ticket.title.startsWith('Show ') || ticket.typeLabel === 'Show'
                  ? ticket.title.startsWith('Show')
                    ? ticket.title
                    : `Show ${ticket.title} ao Vivo`
                  : ticket.title}
              </Text>
            </View>
            <View style={styles.dateBadge}>
              <Text style={styles.dateText}>
                {ticket.day} {ticket.month.toUpperCase()}
              </Text>
            </View>
          </View>

          <View style={styles.dash} />

          <Text style={styles.label}>LOCAL</Text>
          <Text style={styles.city}>{ticket.city.toUpperCase()}</Text>
          <Text style={styles.codeLine}>
            CODE <Text style={styles.codeAccent}>{ticket.code}</Text>
          </Text>

          <View style={styles.dash} />

          <View style={styles.bottomRow}>
            <Barcode value={ticket.code} />
            <View style={styles.metaGrid}>
              <View style={styles.metaCell}>
                <Text style={styles.metaLabel}>GATE</Text>
                <Text style={styles.metaValue}>{ticket.gate}</Text>
              </View>
              <View style={styles.metaCell}>
                <Text style={styles.metaLabel}>TIME</Text>
                <Text style={styles.metaValue}>{ticket.startTime}</Text>
              </View>
              <View style={styles.metaCell}>
                <Text style={styles.metaLabel}>CITY</Text>
                <Text style={styles.metaValue}>{ticket.city.toUpperCase()}</Text>
              </View>
              <View style={styles.metaCell}>
                <Text style={styles.metaLabel}>FROM</Text>
                <Text style={styles.metaValue}>{price.replace(/ CFA$/i, '')}</Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      <View style={[styles.stub, { width: stubW, height }]}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: YELLOW }]} />
        )}
        {Array.from({ length: 7 }).map((_, i) => (
          <View
            key={i}
            style={[styles.scallop, { top: 10 + i * ((height - 20) / 7) }]}
          />
        ))}
        <View style={styles.stubDots} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    borderRadius: 14,
    overflow: 'hidden',
  },
  main: {
    backgroundColor: '#0B0B0B',
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderColor: YELLOW,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
    overflow: 'hidden',
  },
  leftNotch: {
    position: 'absolute',
    left: -12,
    top: '50%',
    marginTop: -12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'transparent',
    borderWidth: 12,
    borderColor: 'rgba(255,255,255,0.08)',
    zIndex: 2,
  },
  mainPad: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  type: {
    color: LIME,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  title: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
    lineHeight: 17,
  },
  dateBadge: {
    borderWidth: 1,
    borderColor: YELLOW,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: '#111',
  },
  dateText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  dash: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderColor: '#3A3A3A',
    marginVertical: 7,
  },
  label: {
    color: '#8A8A8A',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  city: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 1,
  },
  codeLine: {
    color: '#CFCFCF',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  codeAccent: {
    color: LIME,
    fontWeight: '900',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  barcode: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 36,
    flexShrink: 0,
  },
  metaGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 4,
  },
  metaCell: {
    width: '50%',
  },
  metaLabel: {
    color: '#8A8A8A',
    fontSize: 8,
    fontWeight: '700',
  },
  metaValue: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  stub: {
    backgroundColor: YELLOW,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
    overflow: 'hidden',
  },
  stubDots: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 2,
    borderStyle: 'dotted',
    borderLeftWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    zIndex: 2,
  },
  scallop: {
    position: 'absolute',
    right: -7,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.45)',
    zIndex: 2,
  },
});
