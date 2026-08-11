import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
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
import { resolvePostAuthHref } from '@/lib/navigation';

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ui } = useAppTheme();
  const { t } = useLocale();
  const styles = useMemo(() => createStyles(ui), [ui]);
  const { login } = useAuth();
  const params = useLocalSearchParams<{
    redirect?: string;
    eventId?: string;
    qty?: string;
  }>();

  const [telefone, setTelefone] = useState('');
  const [senha, setSenha] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const goAfterAuth = () => {
    const target = resolvePostAuthHref(params.redirect, {
      eventId: params.eventId,
      qty: params.qty || '1',
    });
    router.replace(target || '/(tabs)/profile');
  };

  const handleLogin = async () => {
    setError('');
    if (!telefone.trim() || !senha) {
      setError(t('login.fillFields'));
      return;
    }

    setSubmitting(true);
    try {
      const result = await login(telefone.trim(), senha);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      goAfterAuth();
    } catch {
      setError('Sem ligação ao servidor. Verifique a rede e o backend.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity style={styles.backBtn} onPress={goBack}>
            <Ionicons name="arrow-back" size={22} color={ui.text} />
          </TouchableOpacity>

          <Text style={styles.brand}>GMarket</Text>
          <Text style={styles.title}>{t('login.title')}</Text>
          <Text style={styles.subtitle}>{t('login.subtitle')}</Text>

          <Text style={styles.label}>{t('login.phone')}</Text>
          <View style={styles.inputRow}>
            <Ionicons name="call-outline" size={18} color={ui.muted} />
            <TextInput
              style={styles.input}
              placeholder={t('login.phonePlaceholder')}
              placeholderTextColor={ui.muted}
              keyboardType="phone-pad"
              value={telefone}
              onChangeText={setTelefone}
              autoCapitalize="none"
            />
          </View>

          <Text style={styles.label}>{t('login.password')}</Text>
          <View style={styles.inputRow}>
            <Ionicons name="lock-closed-outline" size={18} color={ui.muted} />
            <TextInput
              style={styles.input}
              placeholder={t('login.passwordPlaceholder')}
              placeholderTextColor={ui.muted}
              secureTextEntry={!showPassword}
              value={senha}
              onChangeText={setSenha}
            />
            <TouchableOpacity onPress={() => setShowPassword((v) => !v)}>
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={ui.muted}
              />
            </TouchableOpacity>
          </View>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.primaryBtn, submitting && styles.disabled]}
            onPress={handleLogin}
            disabled={submitting}
          >
            {submitting ? (
              <RippleWaveLoader size="small" color="#FFF" />
            ) : (
              <Text style={styles.primaryBtnText}>{t('login.submit')}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() => {
              const target = resolvePostAuthHref(params.redirect, {
                eventId: params.eventId,
                qty: params.qty || '1',
              });
              router.push({
                pathname: '/register',
                params: target ? { redirect: String(target) } : undefined,
              });
            }}
          >
            <Text style={styles.linkText}>
              {t('login.noAccount')}{' '}
              <Text style={styles.linkStrong}>{t('login.createAccount')}</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(ui: AppUI) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: ui.bg },
    content: { paddingHorizontal: 24, paddingBottom: 40 },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: ui.card,
      borderWidth: 1,
      borderColor: ui.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
      marginBottom: 24,
    },
    brand: { fontSize: 14, fontWeight: '800', color: ui.brand, letterSpacing: 1 },
    title: { fontSize: 28, fontWeight: '900', color: ui.text, marginTop: 6 },
    subtitle: { fontSize: 14, color: ui.muted, marginTop: 8, marginBottom: 28, lineHeight: 20 },
    label: { fontSize: 13, fontWeight: '600', color: ui.text, marginBottom: 8 },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: ui.card,
      borderWidth: 1,
      borderColor: ui.border,
      borderRadius: 14,
      paddingHorizontal: 14,
      height: 52,
      marginBottom: 16,
      gap: 10,
    },
    input: { flex: 1, fontSize: 15, color: ui.text },
    error: {
      color: ui.danger,
      fontSize: 13,
      marginBottom: 12,
      backgroundColor: ui.dangerSoft,
      padding: 10,
      borderRadius: 10,
    },
    primaryBtn: {
      backgroundColor: ui.brand,
      height: 52,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    primaryBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
    disabled: { opacity: 0.7 },
    linkBtn: { marginTop: 22, alignItems: 'center' },
    linkText: { fontSize: 14, color: ui.muted },
    linkStrong: { color: ui.brand, fontWeight: '700' },
  });
}
