import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/components/AuthContext';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import { useLocale } from '@/components/LocaleContext';
import { useAppTheme, type AppUI } from '@/components/tema';

export default function SegurancaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ui } = useAppTheme();
  const { t } = useLocale();
  const styles = useMemo(() => createStyles(ui), [ui]);
  const { isLoggedIn, changePassword } = useAuth();

  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const checkScale = useSharedValue(0);
  const ringScale = useSharedValue(0.6);
  const ringOpacity = useSharedValue(0);

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace({ pathname: '/login', params: { redirect: 'seguranca' } });
    }
  }, [isLoggedIn, router]);

  useEffect(() => {
    if (!success) return;
    checkScale.value = 0;
    ringScale.value = 0.6;
    ringOpacity.value = 0;
    checkScale.value = withDelay(120, withSpring(1, { damping: 10, stiffness: 140 }));
    ringScale.value = withSequence(
      withTiming(1.35, { duration: 700, easing: Easing.out(Easing.cubic) }),
      withTiming(1.55, { duration: 500 }),
    );
    ringOpacity.value = withSequence(
      withTiming(0.45, { duration: 200 }),
      withTiming(0, { duration: 900 }),
    );
  }, [checkScale, ringOpacity, ringScale, success]);

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  const handleChangePassword = async () => {
    setError('');

    if (!senhaAtual || !novaSenha || !confirmarSenha) {
      setError(t('profile.passwordFillFields'));
      return;
    }
    if (novaSenha.length < 6) {
      setError(t('register.errPasswordLen'));
      return;
    }
    if (novaSenha !== confirmarSenha) {
      setError(t('register.errPasswordMatch'));
      return;
    }
    if (senhaAtual === novaSenha) {
      setError(t('profile.passwordSameAsOld'));
      return;
    }

    setSubmitting(true);
    const result = await changePassword({ senhaAtual, novaSenha });
    setSubmitting(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    setSenhaAtual('');
    setNovaSenha('');
    setConfirmarSenha('');
    setSuccess(true);
  };

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
        <Text style={styles.headerTitle}>{t('profile.security')}</Text>
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
          <Text style={styles.sectionHint}>{t('profile.securityHint')}</Text>

          <Text style={styles.sectionLabel}>{t('profile.changePassword')}</Text>
          <View style={styles.formCard}>
            <Text style={styles.label}>{t('profile.currentPassword')}</Text>
            <View style={styles.inputRow}>
              <Ionicons name="lock-closed-outline" size={18} color={ui.muted} />
              <TextInput
                style={styles.input}
                placeholder={t('profile.currentPasswordPlaceholder')}
                placeholderTextColor={ui.muted}
                secureTextEntry={!showPasswords}
                value={senhaAtual}
                onChangeText={setSenhaAtual}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowPasswords((v) => !v)}>
                <Ionicons
                  name={showPasswords ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={ui.muted}
                />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>{t('profile.newPassword')}</Text>
            <View style={styles.inputRow}>
              <Ionicons name="key-outline" size={18} color={ui.muted} />
              <TextInput
                style={styles.input}
                placeholder={t('profile.newPasswordPlaceholder')}
                placeholderTextColor={ui.muted}
                secureTextEntry={!showPasswords}
                value={novaSenha}
                onChangeText={setNovaSenha}
                autoCapitalize="none"
              />
            </View>

            <Text style={styles.label}>{t('profile.confirmNewPassword')}</Text>
            <View style={styles.inputRow}>
              <Ionicons name="shield-checkmark-outline" size={18} color={ui.muted} />
              <TextInput
                style={styles.input}
                placeholder={t('profile.confirmNewPasswordPlaceholder')}
                placeholderTextColor={ui.muted}
                secureTextEntry={!showPasswords}
                value={confirmarSenha}
                onChangeText={setConfirmarSenha}
                autoCapitalize="none"
              />
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
              onPress={handleChangePassword}
              disabled={submitting}
              activeOpacity={0.9}
            >
              {submitting ? (
                <RippleWaveLoader size="small" color="#FFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#FFF" />
                  <Text style={styles.submitBtnText}>{t('profile.savePassword')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={success} animationType="fade" transparent statusBarTranslucent>
        <View style={styles.successOverlay}>
          <LinearGradient
            colors={['rgba(11,95,88,0.92)', 'rgba(15,118,110,0.96)', '#0B5F58']}
            style={StyleSheet.absoluteFill}
          />
          <Animated.View entering={FadeIn.duration(280)} style={styles.successCard}>
            <View style={styles.successIconWrap}>
              <Animated.View style={[styles.successRing, ringStyle]} />
              <Animated.View style={[styles.successCheck, checkStyle]}>
                <Ionicons name="checkmark" size={42} color="#FFF" />
              </Animated.View>
            </View>

            <Animated.Text entering={FadeInDown.delay(180).duration(360)} style={styles.successTitle}>
              {t('profile.passwordChangedTitle')}
            </Animated.Text>
            <Animated.Text
              entering={FadeInDown.delay(260).duration(360)}
              style={styles.successSubtitle}
            >
              {t('profile.passwordChangedSubtitle')}
            </Animated.Text>

            <TouchableOpacity
              style={styles.successBtn}
              onPress={() => {
                setSuccess(false);
                router.back();
              }}
              activeOpacity={0.9}
            >
              <Text style={styles.successBtnText}>{t('common.ready')}</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(ui: AppUI) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: ui.bg },
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
    sectionHint: {
      fontSize: 14,
      color: ui.muted,
      lineHeight: 20,
      marginBottom: 20,
      paddingHorizontal: 4,
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: ui.muted,
      letterSpacing: 1,
      marginBottom: 8,
      paddingLeft: 4,
      textTransform: 'uppercase',
    },
    formCard: {
      backgroundColor: ui.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: ui.border,
      padding: 18,
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: ui.text,
      marginBottom: 8,
      marginTop: 4,
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
      marginBottom: 14,
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
    submitBtn: {
      marginTop: 4,
      height: 52,
      borderRadius: 16,
      backgroundColor: ui.brand,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    submitBtnDisabled: { opacity: 0.6 },
    submitBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
    successOverlay: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    successCard: {
      width: '100%',
      maxWidth: 400,
      backgroundColor: 'rgba(255,255,255,0.97)',
      borderRadius: 28,
      paddingHorizontal: 22,
      paddingVertical: 28,
      alignItems: 'center',
    },
    successIconWrap: {
      width: 96,
      height: 96,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 18,
    },
    successRing: {
      position: 'absolute',
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: 'rgba(15,118,110,0.22)',
    },
    successCheck: {
      width: 78,
      height: 78,
      borderRadius: 39,
      backgroundColor: ui.brand,
      alignItems: 'center',
      justifyContent: 'center',
    },
    successTitle: {
      fontSize: 22,
      fontWeight: '900',
      color: '#111',
      textAlign: 'center',
      letterSpacing: -0.4,
    },
    successSubtitle: {
      marginTop: 8,
      fontSize: 14,
      lineHeight: 20,
      color: '#667',
      textAlign: 'center',
    },
    successBtn: {
      marginTop: 24,
      width: '100%',
      height: 52,
      borderRadius: 16,
      backgroundColor: ui.brand,
      alignItems: 'center',
      justifyContent: 'center',
    },
    successBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  });
}
