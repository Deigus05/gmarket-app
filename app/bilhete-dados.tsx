import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import {
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
import type { EventDto } from '@/components/api';
import { resolveEventDto } from '@/components/eventos/eventsData';
import { useLocale } from '@/components/LocaleContext';
import { useAppTheme } from '@/components/tema';

const ACCENT = '#F5C518';

export default function BilheteDadosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const { isDark } = useAppTheme();
  const { user, token, isLoggedIn, updateProfile } = useAuth();
  const params = useLocalSearchParams<{ eventId?: string; qty?: string }>();
  const eventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;
  const qty = Math.max(1, Number(Array.isArray(params.qty) ? params.qty[0] : params.qty) || 1);

  const [event, setEvent] = useState<EventDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [nome, setNome] = useState('');
  const [apelido, setApelido] = useState('');
  const [telefone, setTelefone] = useState('');
  const [genero, setGenero] = useState<'masculino' | 'feminino'>('masculino');

  const theme = useMemo(
    () =>
      isDark
        ? { bg: '#1A1A1A', ink: '#fff', muted: '#9A9A9A', card: '#121212', input: '#0F0F0F' }
        : { bg: '#fff', ink: '#111', muted: '#6B7280', card: '#F3F4F6', input: '#fff' },
    [isDark],
  );

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace({
        pathname: '/login',
        params: { redirect: 'bilhete-dados', eventId: eventId || '', qty: String(qty) },
      });
    }
  }, [isLoggedIn, eventId, qty, router]);

  useEffect(() => {
    if (user) {
      setNome(user.nome);
      setApelido(user.apelido);
      setTelefone(user.telefone);
      setGenero(user.genero);
    }
  }, [user]);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!eventId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const data = await resolveEventDto(eventId);
      if (active) {
        setEvent(data);
        setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [eventId]);

  const fullName = `${nome} ${apelido}`.trim();

  const onSaveEdit = async () => {
    if (!token) return;
    setSaving(true);
    setError('');
    const result = await updateProfile({ nome, apelido, telefone, genero });
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setEditing(false);
  };

  const onAdvance = () => {
    if (!eventId) return;
    router.push({
      pathname: '/bilhete-pagamento',
      params: {
        eventId,
        qty: String(qty),
        buyerNome: fullName,
        buyerTelefone: telefone,
        buyerGenero: genero,
      },
    });
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={theme.ink} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.ink }]}>{t('events.buyerTitle')}</Text>
        <View style={styles.iconBtn} />
      </View>

      {loading ? (
        <RippleWaveLoader style={{ marginTop: 40 }} color={ACCENT} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
          {event ? (
            <Text style={[styles.eventLine, { color: theme.muted }]}>
              {event.title} · ×{qty} · {event.priceLabel}
            </Text>
          ) : null}

          <View style={[styles.card, { backgroundColor: theme.card }]}>
            <View style={styles.cardHead}>
              <Text style={[styles.cardTitle, { color: theme.ink }]}>{t('events.accountData')}</Text>
              <TouchableOpacity onPress={() => setEditing((v) => !v)} activeOpacity={0.8}>
                <Text style={styles.editBtn}>
                  {editing ? t('events.cancelEdit') : t('events.editData')}
                </Text>
              </TouchableOpacity>
            </View>

            {editing ? (
              <>
                <Text style={[styles.label, { color: theme.muted }]}>{t('events.fullName')}</Text>
                <View style={styles.row}>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.input, color: theme.ink, flex: 1 }]}
                    value={nome}
                    onChangeText={setNome}
                    placeholder="Nome"
                    placeholderTextColor={theme.muted}
                  />
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.input, color: theme.ink, flex: 1 }]}
                    value={apelido}
                    onChangeText={setApelido}
                    placeholder="Apelido"
                    placeholderTextColor={theme.muted}
                  />
                </View>

                <Text style={[styles.label, { color: theme.muted }]}>{t('events.phone')}</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.input, color: theme.ink }]}
                  value={telefone}
                  onChangeText={setTelefone}
                  keyboardType="phone-pad"
                  placeholderTextColor={theme.muted}
                />

                <Text style={[styles.label, { color: theme.muted }]}>{t('events.gender')}</Text>
                <View style={styles.row}>
                  {(['masculino', 'feminino'] as const).map((g) => (
                    <TouchableOpacity
                      key={g}
                      style={[styles.genderChip, genero === g && styles.genderChipActive]}
                      onPress={() => setGenero(g)}
                    >
                      <Text style={[styles.genderText, genero === g && styles.genderTextActive]}>
                        {g === 'masculino' ? t('events.genderMale') : t('events.genderFemale')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={() => void onSaveEdit()}
                  disabled={saving}
                >
                  {saving ? (
                    <RippleWaveLoader size="small" color="#111" />
                  ) : (
                    <Text style={styles.saveBtnText}>{t('events.saveData')}</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Row label={t('events.fullName')} value={fullName} ink={theme.ink} muted={theme.muted} />
                <Row label={t('events.phone')} value={telefone} ink={theme.ink} muted={theme.muted} />
                <Row
                  label={t('events.gender')}
                  value={
                    genero === 'masculino' ? t('events.genderMale') : t('events.genderFemale')
                  }
                  ink={theme.ink}
                  muted={theme.muted}
                />
              </>
            )}
          </View>

          <TouchableOpacity
            style={[styles.advanceBtn, editing && { opacity: 0.45 }]}
            disabled={editing || !fullName || !telefone}
            onPress={onAdvance}
            activeOpacity={0.9}
          >
            <Text style={styles.advanceText}>{t('events.advance')}</Text>
            <Ionicons name="arrow-forward" size={18} color="#111" />
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

function Row({
  label,
  value,
  ink,
  muted,
}: {
  label: string;
  value: string;
  ink: string;
  muted: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.label, { color: muted, marginBottom: 2 }]}>{label}</Text>
      <Text style={[styles.value, { color: ink }]}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700' },
  eventLine: { fontSize: 13, marginBottom: 14, fontWeight: '600' },
  card: { borderRadius: 16, padding: 16, marginBottom: 18 },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: { fontSize: 17, fontWeight: '800' },
  editBtn: { color: ACCENT, fontWeight: '800', fontSize: 13 },
  label: { fontSize: 12, fontWeight: '600', marginTop: 10, marginBottom: 6 },
  value: { fontSize: 16, fontWeight: '700' },
  infoRow: { marginBottom: 10 },
  row: { flexDirection: 'row', gap: 8 },
  input: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(245,197,24,0.35)',
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    marginBottom: 4,
  },
  genderChip: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: 'rgba(0,0,0,0.06)',
    paddingVertical: 10,
    alignItems: 'center',
  },
  genderChipActive: { borderColor: ACCENT, backgroundColor: 'rgba(245,197,24,0.15)' },
  genderText: { fontWeight: '600', color: '#888' },
  genderTextActive: { color: ACCENT, fontWeight: '800' },
  saveBtn: {
    marginTop: 14,
    backgroundColor: ACCENT,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveBtnText: { color: '#111', fontWeight: '900' },
  error: { color: '#EF4444', marginTop: 8, fontSize: 13 },
  advanceBtn: {
    backgroundColor: '#E8FF00',
    borderRadius: 999,
    minHeight: 52,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  advanceText: { color: '#111', fontSize: 16, fontWeight: '900' },
});
