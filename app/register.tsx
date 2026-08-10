import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
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

export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const fieldY = useRef<Record<string, number>>({});
  const { ui } = useAppTheme();
  const { t } = useLocale();
  const styles = useMemo(() => createStyles(ui), [ui]);
  const { register } = useAuth();
  const params = useLocalSearchParams<{ redirect?: string }>();

  const [nome, setNome] = useState('');
  const [apelido, setApelido] = useState('');
  const [genero, setGenero] = useState<'masculino' | 'feminino' | null>(null);
  const [telefone, setTelefone] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const scrollFieldIntoView = (key: string) => {
    const y = fieldY.current[key];
    if (y == null) return;
    // Wait for keyboard/KAV to settle, then nudge just enough — not to the end.
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 20), animated: true });
    }, 80);
  };

  const handleRegister = async () => {
    setError('');

    if (!nome.trim() || !apelido.trim()) {
      setError(t('register.errName'));
      return;
    }
    if (!genero) {
      setError(t('register.errGender'));
      return;
    }
    if (telefone.trim().length < 7) {
      setError(t('register.errPhone'));
      return;
    }
    if (senha.length < 6) {
      setError(t('register.errPasswordLen'));
      return;
    }
    if (senha !== confirmarSenha) {
      setError(t('register.errPasswordMatch'));
      return;
    }

    setSubmitting(true);
    const result = await register({
      nome: nome.trim(),
      apelido: apelido.trim(),
      genero,
      telefone: telefone.trim(),
      senha,
    });
    setSubmitting(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    router.replace({
      pathname: '/adicionar-endereco',
      params: params.redirect ? { redirect: params.redirect } : undefined,
    });
  };

  return (
    // Modal presentation already sits below the status bar — avoid double top inset.
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={ui.text} />
          </TouchableOpacity>

          <Text style={styles.brand}>GMarket</Text>
          <Text style={styles.title}>{t('register.title')}</Text>
          <Text style={styles.subtitle}>
            {t('register.subtitle')}
          </Text>

          <View style={styles.row}>
            <View style={styles.half}>
              <Text style={styles.label}>{t('register.name')}</Text>
              <TextInput
                style={styles.plainInput}
                placeholder={t('register.name')}
                placeholderTextColor={ui.muted}
                value={nome}
                onChangeText={setNome}
              />
            </View>
            <View style={styles.half}>
              <Text style={styles.label}>{t('register.surname')}</Text>
              <TextInput
                style={styles.plainInput}
                placeholder={t('register.surname')}
                placeholderTextColor={ui.muted}
                value={apelido}
                onChangeText={setApelido}
              />
            </View>
          </View>

          <Text style={styles.label}>{t('register.gender')}</Text>
          <View style={styles.genderRow}>
            {([
              { key: 'masculino' as const, label: t('register.male'), icon: 'male' as const },
              { key: 'feminino' as const, label: t('register.female'), icon: 'female' as const },
            ]).map((option) => {
              const active = genero === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[styles.genderBtn, active && styles.genderBtnActive]}
                  onPress={() => setGenero(option.key)}
                >
                  <Ionicons
                    name={option.icon}
                    size={18}
                    color={active ? ui.brand : ui.muted}
                  />
                  <Text style={[styles.genderText, active && styles.genderTextActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.label}>{t('register.phone')}</Text>
          <View style={styles.inputRow}>
            <Ionicons name="call-outline" size={18} color={ui.muted} />
            <TextInput
              style={styles.input}
              placeholder={t('register.phonePlaceholder')}
              placeholderTextColor={ui.muted}
              keyboardType="phone-pad"
              value={telefone}
              onChangeText={setTelefone}
            />
          </View>

          <View
            onLayout={(e) => {
              fieldY.current.password = e.nativeEvent.layout.y;
            }}
          >
            <Text style={styles.label}>{t('register.password')}</Text>
            <View style={styles.inputRow}>
              <Ionicons name="lock-closed-outline" size={18} color={ui.muted} />
              <TextInput
                style={styles.input}
                placeholder={t('register.passwordPlaceholder')}
                placeholderTextColor={ui.muted}
                secureTextEntry={!showPassword}
                value={senha}
                onChangeText={setSenha}
                onFocus={() => scrollFieldIntoView('password')}
              />
              <TouchableOpacity onPress={() => setShowPassword((v) => !v)}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={ui.muted}
                />
              </TouchableOpacity>
            </View>
          </View>

          <View
            onLayout={(e) => {
              fieldY.current.confirm = e.nativeEvent.layout.y;
            }}
          >
            <Text style={styles.label}>{t('register.confirmPassword')}</Text>
            <View style={styles.inputRow}>
              <Ionicons name="lock-closed-outline" size={18} color={ui.muted} />
              <TextInput
                style={styles.input}
                placeholder={t('register.confirmPasswordPlaceholder')}
                placeholderTextColor={ui.muted}
                secureTextEntry={!showPassword}
                value={confirmarSenha}
                onChangeText={setConfirmarSenha}
                onFocus={() => scrollFieldIntoView('confirm')}
                returnKeyType="done"
              />
            </View>
          </View>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.primaryBtn, submitting && styles.disabled]}
            onPress={handleRegister}
            disabled={submitting}
          >
            {submitting ? (
              <RippleWaveLoader size="small" color="#FFF" />
            ) : (
              <Text style={styles.primaryBtnText}>{t('register.submit')}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() =>
              router.push({
                pathname: '/login',
                params: params.redirect ? { redirect: params.redirect } : undefined,
              })
            }
          >
            <Text style={styles.linkText}>
              {t('register.hasAccount')} <Text style={styles.linkStrong}>{t('register.login')}</Text>
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
    content: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40 },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: ui.card,
      borderWidth: 1,
      borderColor: ui.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    brand: { fontSize: 14, fontWeight: '800', color: ui.brand, letterSpacing: 1 },
    title: { fontSize: 28, fontWeight: '900', color: ui.text, marginTop: 6 },
    subtitle: { fontSize: 14, color: ui.muted, marginTop: 6, marginBottom: 16, lineHeight: 20 },
    row: { flexDirection: 'row', gap: 12 },
    half: { flex: 1 },
    label: { fontSize: 13, fontWeight: '600', color: ui.text, marginBottom: 8 },
    plainInput: {
      backgroundColor: ui.card,
      borderWidth: 1,
      borderColor: ui.border,
      borderRadius: 14,
      height: 52,
      paddingHorizontal: 14,
      fontSize: 15,
      color: ui.text,
      marginBottom: 16,
    },
    genderRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    genderBtn: {
      flex: 1,
      height: 48,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: ui.border,
      backgroundColor: ui.card,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    genderBtnActive: { borderColor: ui.brand, backgroundColor: ui.brandSoft },
    genderText: { fontSize: 14, color: ui.muted, fontWeight: '600' },
    genderTextActive: { color: ui.brand },
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
