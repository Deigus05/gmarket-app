import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import React, { useMemo } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { useLocale } from '@/components/LocaleContext';
import type { AppUI } from '@/components/tema';
import { compressImagesForUpload } from '@/lib/imageOptimization';
import type { LocalImage } from '@/lib/seller/types';

export function createSellerStyles(ui: AppUI) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: ui.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: ui.border,
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: 16,
      fontWeight: '700',
      color: ui.text,
    },
    headerSpacer: { width: 40 },
    content: { paddingHorizontal: 16, paddingBottom: 40 },
    hero: { fontSize: 22, fontWeight: '800', color: ui.text, letterSpacing: -0.3 },
    heroSub: { marginTop: 6, fontSize: 14, lineHeight: 20, color: ui.muted, marginBottom: 16 },
    card: {
      backgroundColor: ui.card,
      borderRadius: 16,
      padding: 14,
      marginBottom: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: ui.border,
    },
    cardTitle: { fontSize: 15, fontWeight: '800', color: ui.text, marginBottom: 6 },
    cardBody: { fontSize: 13, lineHeight: 19, color: ui.muted },
    label: { fontSize: 12, fontWeight: '700', color: ui.text, marginBottom: 6, marginTop: 4 },
    input: {
      backgroundColor: ui.input,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 12,
      marginBottom: 10,
      color: ui.text,
      fontSize: 15,
    },
    inputMultiline: { minHeight: 88, textAlignVertical: 'top' as const },
    hint: { fontSize: 12, lineHeight: 17, color: ui.muted, marginBottom: 10 },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 16,
      backgroundColor: ui.input,
    },
    chipActive: { backgroundColor: ui.brand },
    chipText: { fontSize: 12, color: ui.muted, fontWeight: '600' },
    chipTextActive: { color: ui.onBrand },
    primaryBtn: {
      backgroundColor: ui.brand,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 8,
    },
    primaryBtnText: { color: ui.onBrand, fontWeight: '800', fontSize: 14 },
    secondaryBtn: {
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: ui.brand,
      marginTop: 10,
    },
    secondaryBtnText: { color: ui.brand, fontWeight: '800', fontSize: 14 },
    ghostBtn: { paddingVertical: 12, alignItems: 'center' },
    ghostBtnText: { color: ui.muted, fontWeight: '700' },
    footer: {
      padding: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: ui.border,
      backgroundColor: ui.bg,
    },
    footerRow: { flexDirection: 'row', gap: 10 },
    flexBtn: { flex: 1 },
    photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    photoTile: { width: 96, height: 96, borderRadius: 10, overflow: 'hidden' },
    photo: { width: '100%', height: '100%' },
    removeBtn: { position: 'absolute', top: 4, right: 4 },
    addTile: {
      width: 96,
      height: 96,
      borderRadius: 10,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: ui.brand,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.brandSoft,
    },
    addTileText: { fontSize: 11, fontWeight: '700', color: ui.brand, marginTop: 4, textAlign: 'center' },
    checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginVertical: 12 },
    checkBox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: ui.brand,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
      backgroundColor: ui.card,
    },
    checkBoxOn: { backgroundColor: ui.brand },
    checkText: { flex: 1, fontSize: 13, lineHeight: 19, color: ui.text },
    mutedLine: { fontSize: 13, color: ui.muted, marginBottom: 4 },
    strongLine: { fontSize: 15, fontWeight: '700', color: ui.text, marginBottom: 2 },
    statusPill: {
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      marginBottom: 10,
    },
    statusPillText: { fontSize: 12, fontWeight: '800' },
    hubGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    hubTile: {
      width: '48%',
      borderRadius: 16,
      padding: 14,
      backgroundColor: ui.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: ui.border,
      minHeight: 108,
    },
    hubIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: ui.brandSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    hubTileTitle: { fontSize: 14, fontWeight: '800', color: ui.text },
    hubTileSub: { fontSize: 11, color: ui.muted, marginTop: 4 },
    empty: { fontSize: 13, color: ui.muted, lineHeight: 19, textAlign: 'center', marginTop: 24 },
    adminBox: {
      backgroundColor: ui.brandSoft,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
    },
    adminBoxText: { fontSize: 13, lineHeight: 19, color: ui.text },
  });
}

export function SellerHeader({
  title,
  onBack,
  styles,
}: {
  title: string;
  onBack: () => void;
  styles: ReturnType<typeof createSellerStyles>;
}) {
  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={22} color="#8E8E93" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
  styles,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createSellerStyles>;
}) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress} activeOpacity={0.8}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  styles,
  multiline,
  keyboardType,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  styles: ReturnType<typeof createSellerStyles>;
  multiline?: boolean;
  keyboardType?: 'default' | 'phone-pad' | 'numeric' | 'email-address';
  editable?: boolean;
}) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline, !editable && { opacity: 0.7 }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8E8E93"
        multiline={multiline}
        keyboardType={keyboardType}
        editable={editable}
      />
    </View>
  );
}

export function CheckRow({
  checked,
  label,
  onPress,
  styles,
}: {
  checked: boolean;
  label: string;
  onPress: () => void;
  styles: ReturnType<typeof createSellerStyles>;
}) {
  return (
    <Pressable style={styles.checkRow} onPress={onPress}>
      <View style={[styles.checkBox, checked && styles.checkBoxOn]}>
        {checked ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
      </View>
      <Text style={styles.checkText}>{label}</Text>
    </Pressable>
  );
}

export function PhotoGrid({
  photos,
  onChange,
  max = 6,
  addLabel,
  square,
  styles,
}: {
  photos: LocalImage[];
  onChange: (next: LocalImage[]) => void;
  max?: number;
  addLabel: string;
  square?: boolean;
  styles: ReturnType<typeof createSellerStyles>;
}) {
  const { t } = useLocale();

  const pick = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('profile.photoPermissionTitle'), t('sell.photoPermission'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: !square && max > 1,
      allowsEditing: Boolean(square),
      aspect: square ? [1, 1] : undefined,
      quality: 0.8,
      selectionLimit: Math.max(1, max - photos.length),
    });
    if (result.canceled || !result.assets?.length) return;
    const compressed = await compressImagesForUpload(result.assets.map((asset) => asset.uri));
    onChange([...photos, ...compressed.map((uri) => ({ uri }))].slice(0, max));
  };

  return (
    <View style={styles.photoGrid}>
      {photos.map((photo) => (
        <View key={photo.uri} style={styles.photoTile}>
          <Image source={{ uri: photo.remote_url || photo.uri }} style={styles.photo} contentFit="cover" />
          <TouchableOpacity
            style={styles.removeBtn}
            onPress={() => onChange(photos.filter((item) => item.uri !== photo.uri))}
          >
            <Ionicons name="close-circle" size={20} color="#D32F2F" />
          </TouchableOpacity>
        </View>
      ))}
      {photos.length < max ? (
        <TouchableOpacity style={styles.addTile} onPress={pick} activeOpacity={0.8}>
          <Ionicons name="camera-outline" size={22} color="#0D47A1" />
          <Text style={styles.addTileText}>{addLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  styles,
  disabled,
  style,
  textStyle,
}: {
  label: string;
  onPress: () => void;
  styles: ReturnType<typeof createSellerStyles>;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  return (
    <TouchableOpacity
      style={[styles.primaryBtn, disabled && { opacity: 0.5 }, style]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
    >
      <Text style={[styles.primaryBtnText, textStyle]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function useSellerStyles(ui: AppUI) {
  return useMemo(() => createSellerStyles(ui), [ui]);
}
