import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { submitOrderReturn, type Order, type OrderItem } from '@/components/api';
import { KeyboardFormScrollView } from '@/components/KeyboardFormScrollView';
import { useLocale } from '@/components/LocaleContext';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import { useAppTheme, type AppUI } from '@/components/tema';
import { compressImagesForUpload } from '@/lib/imageOptimization';

const RETURN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Liga/desliga o botão e fluxo de devolução no app. Backend/admin podem ficar ativos. */
export const SHOW_ORDER_RETURN_UI = false;

export function canRequestReturn(order: Order): boolean {
  if (!SHOW_ORDER_RETURN_UI) return false;
  if (order.status !== 'delivered') return false;
  const stamp = order.delivered_at || order.updated_at;
  const t = Date.parse(stamp);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= RETURN_WINDOW_MS;
}

export function ReturnRequestModal({
  visible,
  order,
  token,
  onClose,
  onSubmitted,
}: {
  visible: boolean;
  order: Order | null;
  token: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const { ui } = useAppTheme();
  const styles = useMemo(() => createStyles(ui), [ui]);

  const [itemId, setItemId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (!visible || !order) return;
    setItemId(order.items[0]?.id || null);
    setReason('');
    setPhotos([]);
    setSaving(false);
  }, [visible, order?.id]);

  const pickPhotos = async () => {
    const remaining = 3 - photos.length;
    if (remaining <= 0) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('delivery.returnPermTitle'), t('delivery.returnPermPhotos'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;
    const compressed = await compressImagesForUpload(
      result.assets.map((a) => a.uri).slice(0, remaining),
    );
    setPhotos((prev) => [...prev, ...compressed].slice(0, 3));
  };

  const submit = async () => {
    if (!order) return;
    if (reason.trim().length < 8) {
      Alert.alert(t('delivery.returnNeedReasonTitle'), t('delivery.returnNeedReason'));
      return;
    }
    if (!photos.length) {
      Alert.alert(t('delivery.returnNeedPhotoTitle'), t('delivery.returnNeedPhoto'));
      return;
    }
    setSaving(true);
    try {
      const result = await submitOrderReturn(token, order.id, {
        reason: reason.trim(),
        order_item_id: itemId || undefined,
        photo_uris: photos,
      });
      if (!result.success) {
        Alert.alert(t('delivery.returnFailTitle'), result.message || t('delivery.returnFail'));
        return;
      }
      Alert.alert(t('delivery.returnOkTitle'), t('delivery.returnOkMessage'));
      onSubmitted();
      onClose();
    } catch {
      Alert.alert(t('delivery.returnFailTitle'), t('delivery.returnFail'));
    } finally {
      setSaving(false);
    }
  };

  if (!order) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <Pressable style={styles.iconBtn} onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={22} color={ui.text} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{t('delivery.returnTitle')}</Text>
            <Text style={styles.headerSub}>#{order.order_number}</Text>
          </View>
          <View style={styles.iconBtnSpacer} />
        </View>

        <KeyboardFormScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.ruleCard}>
            <Ionicons name="information-circle-outline" size={20} color={ui.brand} />
            <Text style={styles.ruleText}>{t('delivery.returnRule')}</Text>
          </View>

          {order.items.length > 1 ? (
            <View style={{ gap: 8, marginBottom: 14 }}>
              <Text style={styles.label}>{t('delivery.returnSelectItem')}</Text>
              {order.items.map((item: OrderItem) => {
                const active = item.id === itemId;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => setItemId(item.id)}
                    style={[styles.itemChip, active && styles.itemChipActive]}
                  >
                    {item.image_url ? (
                      <Image source={{ uri: item.image_url }} style={styles.itemThumb} contentFit="cover" />
                    ) : (
                      <View style={[styles.itemThumb, styles.itemThumbFallback]}>
                        <Ionicons name="cube-outline" size={16} color={ui.brand} />
                      </View>
                    )}
                    <Text style={[styles.itemTitle, active && styles.itemTitleActive]} numberOfLines={2}>
                      {item.title}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <Text style={styles.label}>{t('delivery.returnReason')}</Text>
          <TextInput
            style={styles.input}
            value={reason}
            onChangeText={setReason}
            placeholder={t('delivery.returnReasonPlaceholder')}
            placeholderTextColor={ui.muted}
            multiline
            textAlignVertical="top"
          />

          <Text style={[styles.label, { marginTop: 14 }]}>{t('delivery.returnPhotos')}</Text>
          <View style={styles.photoRow}>
            {photos.map((uri) => (
              <View key={uri} style={styles.photoWrap}>
                <Image source={{ uri }} style={styles.photo} contentFit="cover" />
                <Pressable
                  style={styles.photoRemove}
                  onPress={() => setPhotos((prev) => prev.filter((p) => p !== uri))}
                >
                  <Ionicons name="close" size={14} color="#fff" />
                </Pressable>
              </View>
            ))}
            {photos.length < 3 ? (
              <Pressable style={styles.addPhoto} onPress={() => void pickPhotos()}>
                <Ionicons name="camera-outline" size={22} color={ui.brand} />
                <Text style={styles.addPhotoText}>{t('delivery.returnAddPhoto')}</Text>
              </Pressable>
            ) : null}
          </View>

          <Pressable
            style={[styles.submitBtn, saving && { opacity: 0.6 }]}
            disabled={saving}
            onPress={() => void submit()}
          >
            {saving ? (
              <RippleWaveLoader size="small" color="#fff" />
            ) : (
              <Text style={styles.submitText}>{t('delivery.returnSubmit')}</Text>
            )}
          </Pressable>
        </KeyboardFormScrollView>
      </View>
    </Modal>
  );
}

function createStyles(ui: AppUI) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: ui.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingBottom: 10,
    },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.card,
      borderWidth: 1,
      borderColor: ui.border,
    },
    iconBtnSpacer: { width: 40 },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 17, fontWeight: '800', color: ui.text },
    headerSub: { fontSize: 12, color: ui.muted, marginTop: 2 },
    ruleCard: {
      flexDirection: 'row',
      gap: 10,
      alignItems: 'flex-start',
      padding: 12,
      borderRadius: 14,
      backgroundColor: ui.card,
      borderWidth: 1,
      borderColor: ui.border,
      marginBottom: 16,
    },
    ruleText: { flex: 1, fontSize: 13, lineHeight: 18, color: ui.text, fontWeight: '600' },
    label: { fontSize: 13, fontWeight: '800', color: ui.text, marginBottom: 8 },
    input: {
      minHeight: 110,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: ui.border,
      backgroundColor: ui.card,
      padding: 12,
      fontSize: 15,
      color: ui.text,
    },
    itemChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: ui.border,
      backgroundColor: ui.card,
    },
    itemChipActive: { borderColor: ui.brand, backgroundColor: ui.brandSoft },
    itemThumb: { width: 40, height: 40, borderRadius: 8 },
    itemThumbFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: ui.bg },
    itemTitle: { flex: 1, fontSize: 13, color: ui.text, fontWeight: '600' },
    itemTitleActive: { color: ui.brand },
    photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    photoWrap: { width: 84, height: 84, borderRadius: 12, overflow: 'hidden' },
    photo: { width: '100%', height: '100%' },
    photoRemove: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    addPhoto: {
      width: 84,
      height: 84,
      borderRadius: 12,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: ui.brand,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      backgroundColor: ui.card,
    },
    addPhotoText: { fontSize: 10, color: ui.brand, fontWeight: '700' },
    submitBtn: {
      marginTop: 20,
      height: 48,
      borderRadius: 14,
      backgroundColor: ui.brand,
      alignItems: 'center',
      justifyContent: 'center',
    },
    submitText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  });
}
