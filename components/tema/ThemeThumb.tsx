import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { HomePalette } from './themes';

type Props = {
  name: string;
  colors: HomePalette;
  selected: boolean;
  onPress: () => void;
};

/** Miniatura estilo galeria de temas (como no exemplo). */
export function ThemeThumb({ name, colors, selected, onPress }: Props) {
  return (
    <TouchableOpacity
      style={[styles.wrap, selected && styles.wrapSelected]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <LinearGradient
        colors={[colors.deep, colors.mid, colors.soft]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, selected && { borderColor: colors.accent }]}
      >
        <View style={[styles.bubbleIn, { backgroundColor: colors.surface }]} />
        <View style={[styles.bubbleOut, { backgroundColor: colors.accent }]} />
        <View style={styles.patternDotA} />
        <View style={styles.patternDotB} />
        <View style={styles.patternLine} />
      </LinearGradient>
      <Text style={[styles.label, selected && { color: colors.accent }]} numberOfLines={1}>
        {name}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 92,
    marginRight: 12,
  },
  wrapSelected: {
    transform: [{ scale: 1.02 }],
  },
  card: {
    height: 118,
    borderRadius: 18,
    padding: 12,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  bubbleIn: {
    width: 46,
    height: 18,
    borderRadius: 10,
    marginBottom: 8,
    opacity: 0.95,
  },
  bubbleOut: {
    alignSelf: 'flex-end',
    width: 52,
    height: 18,
    borderRadius: 10,
    opacity: 0.95,
  },
  patternDotA: {
    position: 'absolute',
    top: 14,
    right: 16,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  patternDotB: {
    position: 'absolute',
    top: 28,
    right: 28,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  patternLine: {
    position: 'absolute',
    top: 18,
    left: 14,
    width: 22,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.35)',
    transform: [{ rotate: '-18deg' }],
  },
  label: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'center',
  },
});
