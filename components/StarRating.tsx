import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const GOLD = '#C9A227';
const GOLD_MUTED = 'rgba(201, 162, 39, 0.35)';

type Props = {
  value: number;
  size?: number;
  gap?: number;
  interactive?: boolean;
  showValue?: boolean;
  valueColor?: string;
  onChange?: (rating: number) => void;
};

function DisplayStar({ fill, size }: { fill: number; size: number }) {
  const clipped = Math.max(0, Math.min(1, fill));
  return (
    <View style={{ width: size, height: size }} collapsable={false}>
      <Ionicons name="star-outline" size={size} color={GOLD} style={styles.starBase} />
      <View style={[styles.fillClip, { width: size * clipped, height: size }]} collapsable={false}>
        <Ionicons name="star" size={size} color={GOLD} />
      </View>
    </View>
  );
}

export function StarRating({
  value,
  size = 22,
  gap = 4,
  interactive = false,
  showValue = false,
  valueColor = '#A8A8A8',
  onChange,
}: Props) {
  const stars = useMemo(() => {
    return [1, 2, 3, 4, 5].map((n) => {
      const fill = Math.max(0, Math.min(1, value - (n - 1)));
      return { n, fill };
    });
  }, [value]);

  return (
    <View style={[styles.row, { gap }]} collapsable={false}>
      {stars.map(({ n, fill }) =>
        interactive ? (
          <Pressable
            key={n}
            onPress={() => onChange?.(n)}
            hitSlop={{ top: 14, bottom: 14, left: 6, right: 6 }}
            style={({ pressed }) => [
              styles.starHit,
              { width: size + 8, height: size + 8 },
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${n} estrelas`}
            accessibilityState={{ selected: value >= n }}
          >
            <Ionicons
              name={value >= n ? 'star' : 'star-outline'}
              size={size}
              color={GOLD}
            />
          </Pressable>
        ) : (
          <DisplayStar key={n} fill={fill} size={size} />
        ),
      )}
      {showValue ? (
        <Text style={[styles.value, { color: valueColor, fontSize: Math.max(13, size * 0.72) }]}>
          {Number(value || 0).toFixed(1)}
        </Text>
      ) : null}
    </View>
  );
}

export const STAR_GOLD = GOLD;
export const STAR_GOLD_MUTED = GOLD_MUTED;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  starHit: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  starBase: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  fillClip: {
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.94 }],
  },
  value: {
    marginLeft: 6,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
