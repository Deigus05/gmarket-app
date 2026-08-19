import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/components/AuthContext';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import { useLocale } from '@/components/LocaleContext';
import { useAppTheme, type AppUI } from '@/components/tema';
import { compressImageForUpload } from '@/lib/imageOptimization';

function getInitials(nome: string, apelido: string) {
  const first = nome.trim().charAt(0);
  const last = apelido.trim().charAt(0);
  return `${first}${last}`.toUpperCase() || 'GM';
}

export default function DadosPessoaisScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ui } = useAppTheme();
  const { t } = useLocale();
  const styles = useMemo(() => createStyles(ui), [ui]);
  const { user, isLoggedIn, updatePhoto, removePhoto, deleteAccount, updateProfile } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [nome, setNome] = useState('');
  const [apelido, setApelido] = useState('');
  const [nameError, setNameError] = useState('');
  const accountDeletedRef = useRef(false);

  useEffect(() => {
    if (!isLoggedIn && !accountDeletedRef.current) {
      router.replace({ pathname: '/login', params: { redirect: 'dados-pessoais' } });
    }
  }, [isLoggedIn, router]);

  useEffect(() => {
    if (!user || editingName) return;
    setNome(user.nome);
    setApelido(user.apelido);
  }, [user, editingName]);

  const fullName = user ? `${user.nome} ${user.apelido}`.trim() : '';
  const genderLabel =
    user?.genero === 'masculino'
      ? t('profile.male')
      : user?.genero === 'feminino'
        ? t('profile.female')
        : '—';

  const startEditName = () => {
    if (!user) return;
    setNome(user.nome);
    setApelido(user.apelido);
    setNameError('');
    setEditingName(true);
  };

  const cancelEditName = () => {
    if (savingName) return;
    setNome(user?.nome || '');
    setApelido(user?.apelido || '');
    setNameError('');
    setEditingName(false);
  };

  const saveName = async () => {
    const nextNome = nome.trim();
    const nextApelido = apelido.trim();
    if (!nextNome || !nextApelido) {
      setNameError(t('register.errName'));
      return;
    }
    if (nextNome === (user?.nome || '') && nextApelido === (user?.apelido || '')) {
      setEditingName(false);
      setNameError('');
      return;
    }

    setSavingName(true);
    setNameError('');
    try {
      const result = await updateProfile({ nome: nextNome, apelido: nextApelido });
      if (!result.ok) {
        setNameError(result.message || t('profile.nameUpdateFail'));
        return;
      }
      setEditingName(false);
      Alert.alert(t('profile.editName'), t('profile.nameUpdated'));
    } catch {
      setNameError(t('profile.nameUpdateFail'));
    } finally {
      setSavingName(false);
    }
  };

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('profile.photoPermissionTitle'), t('profile.photoPermissionMessage'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (result.canceled || !result.assets?.[0]?.uri) return;

    setUploading(true);
    try {
      const compressed = await compressImageForUpload(result.assets[0].uri, 720, 0.8);
      await updatePhoto(compressed);
    } catch {
      Alert.alert(t('common.error'), t('profile.photoUploadError'));
    } finally {
      setUploading(false);
    }
  };

  const confirmRemovePhoto = () => {
    Alert.alert(t('profile.removePhotoTitle'), t('profile.removePhotoMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.removePhoto'),
        style: 'destructive',
        onPress: async () => {
          setUploading(true);
          try {
            const result = await removePhoto();
            if (!result.ok) {
              Alert.alert(t('common.error'), result.message || t('profile.photoRemoveError'));
            }
          } catch {
            Alert.alert(t('common.error'), t('profile.photoRemoveError'));
          } finally {
            setUploading(false);
          }
        },
      },
    ]);
  };

  const handlePhotoPress = () => {
    if (uploading) return;
    if (!user?.foto_url) {
      void pickPhoto();
      return;
    }
    Alert.alert(t('profile.changePhoto'), t('profile.photoHint'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.changePhoto'), onPress: () => void pickPhoto() },
      {
        text: t('profile.removePhoto'),
        style: 'destructive',
        onPress: confirmRemovePhoto,
      },
    ]);
  };

  const performDeleteAccount = async () => {
    setDeleting(true);
    accountDeletedRef.current = true;
    try {
      const result = await deleteAccount();
      if (!result.ok) {
        accountDeletedRef.current = false;
        Alert.alert(t('common.error'), result.message || t('profile.deleteAccountFail'));
        return;
      }
      Alert.alert(t('profile.deleteAccountSuccessTitle'), t('profile.deleteAccountSuccessMessage'), [
        {
          text: t('common.ok'),
          onPress: () => router.replace('/(tabs)/profile'),
        },
      ]);
    } catch {
      accountDeletedRef.current = false;
      Alert.alert(t('common.error'), t('profile.deleteAccountFail'));
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteAccount = () => {
    if (deleting) return;
    Alert.alert(t('profile.deleteAccountTitle'), t('profile.deleteAccountMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.deleteAccountConfirm'),
        style: 'destructive',
        onPress: () => {
          void performDeleteAccount();
        },
      },
    ]);
  };

  if (!user) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <RippleWaveLoader color={ui.brand} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={22} color={ui.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('profile.personalDataTitle')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        >
          <View style={styles.photoCard}>
            <TouchableOpacity
              style={styles.avatarWrap}
              onPress={handlePhotoPress}
              activeOpacity={0.85}
              disabled={uploading}
            >
              {user.foto_url ? (
                <Image source={{ uri: user.foto_url }} style={styles.avatarImage} contentFit="cover" />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarText}>{getInitials(user.nome, user.apelido)}</Text>
                </View>
              )}
              <View style={styles.cameraBadge}>
                {uploading ? (
                  <RippleWaveLoader size="small" color="#FFF" />
                ) : (
                  <Ionicons name="camera" size={16} color="#FFF" />
                )}
              </View>
            </TouchableOpacity>

            <Text style={styles.photoTitle}>
              {user.foto_url ? t('profile.changePhoto') : t('profile.addPhoto')}
            </Text>
            <Text style={styles.photoHint}>{t('profile.photoHint')}</Text>
            {user.foto_url ? (
              <TouchableOpacity
                style={styles.removePhotoBtn}
                onPress={confirmRemovePhoto}
                activeOpacity={0.85}
                disabled={uploading}
              >
                <Ionicons name="trash-outline" size={16} color={ui.danger} />
                <Text style={styles.removePhotoText}>{t('profile.removePhoto')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <Text style={styles.sectionLabel}>{t('profile.accountInfo')}</Text>
          <View style={styles.infoCard}>
            {editingName ? (
              <View style={styles.editBlock}>
                <Text style={styles.inputLabel}>{t('common.name')}</Text>
                <View style={styles.inputRow}>
                  <Ionicons name="person-outline" size={18} color={ui.muted} />
                  <TextInput
                    style={styles.input}
                    value={nome}
                    onChangeText={(value) => {
                      setNome(value);
                      if (nameError) setNameError('');
                    }}
                    placeholder={t('common.name')}
                    placeholderTextColor={ui.muted}
                    autoCapitalize="words"
                    autoCorrect={false}
                    editable={!savingName}
                  />
                </View>
                <Text style={styles.inputLabel}>{t('common.surname')}</Text>
                <View style={styles.inputRow}>
                  <Ionicons name="person-outline" size={18} color={ui.muted} />
                  <TextInput
                    style={styles.input}
                    value={apelido}
                    onChangeText={(value) => {
                      setApelido(value);
                      if (nameError) setNameError('');
                    }}
                    placeholder={t('common.surname')}
                    placeholderTextColor={ui.muted}
                    autoCapitalize="words"
                    autoCorrect={false}
                    editable={!savingName}
                  />
                </View>
                {nameError ? <Text style={styles.errorText}>{nameError}</Text> : null}
                <View style={styles.editActions}>
                  <TouchableOpacity
                    style={styles.editCancelBtn}
                    onPress={cancelEditName}
                    disabled={savingName}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.editCancelText}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.editSaveBtn, savingName && styles.editSaveBtnDisabled]}
                    onPress={() => void saveName()}
                    disabled={savingName}
                    activeOpacity={0.85}
                  >
                    {savingName ? (
                      <RippleWaveLoader size="small" color="#FFF" />
                    ) : (
                      <Text style={styles.editSaveText}>{t('common.save')}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <InfoRow
                styles={styles}
                ui={ui}
                icon="person-outline"
                label={t('profile.fullName')}
                value={fullName}
                actionLabel={t('common.edit')}
                onPress={startEditName}
              />
            )}
            <View style={styles.divider} />
            <InfoRow
              styles={styles}
              ui={ui}
              icon="call-outline"
              label={t('profile.phone')}
              value={user.telefone}
            />
            <View style={styles.divider} />
            <InfoRow
              styles={styles}
              ui={ui}
              icon="male-female-outline"
              label={t('profile.gender')}
              value={genderLabel}
            />
            {user.endereco ? (
              <>
                <View style={styles.divider} />
                <InfoRow
                  styles={styles}
                  ui={ui}
                  icon="location-outline"
                  label={t('profile.address')}
                  value={`${user.endereco.label}\n${user.endereco.details}`}
                />
              </>
            ) : null}
          </View>

          {!user.endereco ? (
            <TouchableOpacity
              style={styles.addAddressBtn}
              onPress={() => router.push('/adicionar-endereco')}
              activeOpacity={0.85}
            >
              <Ionicons name="add-circle-outline" size={18} color={ui.brand} />
              <Text style={styles.addAddressText}>{t('profile.addAddress')}</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={styles.deleteAccountBtn}
            onPress={handleDeleteAccount}
            activeOpacity={0.85}
            disabled={deleting || uploading || savingName}
          >
            {deleting ? (
              <RippleWaveLoader size="small" color={ui.danger} />
            ) : (
              <>
                <Ionicons name="trash-outline" size={18} color={ui.danger} />
                <Text style={styles.deleteAccountText}>{t('profile.deleteAccount')}</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function InfoRow({
  styles,
  ui,
  icon,
  label,
  value,
  actionLabel,
  onPress,
}: {
  styles: ReturnType<typeof createStyles>;
  ui: AppUI;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  actionLabel?: string;
  onPress?: () => void;
}) {
  const content = (
    <>
      <View style={styles.iconBox}>
        <Ionicons name={icon} size={18} color={ui.brand} />
      </View>
      <View style={styles.infoText}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
      {onPress ? (
        <View style={styles.rowAction}>
          <Text style={styles.rowActionText}>{actionLabel}</Text>
          <Ionicons name="pencil-outline" size={16} color={ui.brand} />
        </View>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity style={styles.infoRow} onPress={onPress} activeOpacity={0.75}>
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={styles.infoRow}>{content}</View>;
}

function createStyles(ui: AppUI) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: ui.bg },
    centered: { alignItems: 'center', justifyContent: 'center' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 12,
      gap: 10,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: ui.card,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: ui.border,
    },
    headerTitle: {
      flex: 1,
      fontSize: 18,
      fontWeight: '800',
      color: ui.text,
      letterSpacing: -0.3,
    },
    headerSpacer: { width: 40 },
    content: { paddingHorizontal: 16 },
    photoCard: {
      backgroundColor: ui.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: ui.border,
      paddingVertical: 28,
      paddingHorizontal: 16,
      alignItems: 'center',
      marginBottom: 22,
    },
    avatarWrap: {
      width: 108,
      height: 108,
      marginBottom: 14,
    },
    avatarImage: {
      width: 108,
      height: 108,
      borderRadius: 54,
      backgroundColor: ui.iconBox,
    },
    avatarFallback: {
      width: 108,
      height: 108,
      borderRadius: 54,
      backgroundColor: ui.brand,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: '#FFF', fontSize: 34, fontWeight: '800' },
    cameraBadge: {
      position: 'absolute',
      right: 2,
      bottom: 2,
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: ui.brand,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 3,
      borderColor: ui.card,
    },
    photoTitle: { fontSize: 16, fontWeight: '700', color: ui.text },
    photoHint: {
      fontSize: 13,
      color: ui.muted,
      textAlign: 'center',
      marginTop: 6,
      lineHeight: 18,
    },
    removePhotoBtn: {
      marginTop: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 14,
      height: 40,
      borderRadius: 12,
      backgroundColor: ui.card,
      borderWidth: 1,
      borderColor: ui.danger,
    },
    removePhotoText: { color: ui.danger, fontSize: 13, fontWeight: '700' },
    sectionLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: ui.muted,
      letterSpacing: 1,
      marginBottom: 8,
      paddingLeft: 4,
      textTransform: 'uppercase',
    },
    infoCard: {
      backgroundColor: ui.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: ui.border,
      overflow: 'hidden',
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 12,
    },
    iconBox: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: ui.iconBox,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    infoText: { flex: 1 },
    infoLabel: { fontSize: 12, color: ui.muted, fontWeight: '600', marginBottom: 3 },
    infoValue: { fontSize: 15, color: ui.text, fontWeight: '600', lineHeight: 20 },
    rowAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 8,
    },
    rowActionText: { fontSize: 13, fontWeight: '700', color: ui.brand },
    editBlock: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
    inputLabel: {
      fontSize: 12,
      color: ui.muted,
      fontWeight: '600',
      marginBottom: 8,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: ui.bg,
      borderWidth: 1,
      borderColor: ui.border,
      borderRadius: 14,
      paddingHorizontal: 14,
      height: 50,
      marginBottom: 12,
    },
    input: {
      flex: 1,
      fontSize: 15,
      color: ui.text,
      paddingVertical: 0,
    },
    errorText: {
      color: ui.danger,
      fontSize: 13,
      fontWeight: '600',
      marginBottom: 10,
      lineHeight: 18,
    },
    editActions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 4,
      marginBottom: 8,
    },
    editCancelBtn: {
      flex: 1,
      height: 46,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: ui.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    editCancelText: { color: ui.text, fontSize: 14, fontWeight: '700' },
    editSaveBtn: {
      flex: 1,
      height: 46,
      borderRadius: 14,
      backgroundColor: ui.brand,
      alignItems: 'center',
      justifyContent: 'center',
    },
    editSaveBtnDisabled: { opacity: 0.7 },
    editSaveText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
    divider: { height: 1, backgroundColor: ui.divider, marginLeft: 62 },
    addAddressBtn: {
      marginTop: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 50,
      borderRadius: 16,
      backgroundColor: ui.card,
      borderWidth: 1,
      borderColor: ui.brand,
    },
    addAddressText: { color: ui.brand, fontSize: 14, fontWeight: '700' },
    deleteAccountBtn: {
      marginTop: 28,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 50,
      borderRadius: 16,
      backgroundColor: ui.card,
      borderWidth: 1,
      borderColor: ui.danger,
    },
    deleteAccountText: { color: ui.danger, fontSize: 14, fontWeight: '700' },
  });
}
