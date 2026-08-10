import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import { useEffect, useRef } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { useAuth } from '@/components/AuthContext';
import { sendPresenceHeartbeat, sendPresenceLeave } from '@/components/api';

const DEVICE_KEY = '@gmarket:presence_device_id';
const HEARTBEAT_MS = 30_000;

function platformLabel() {
  if (Platform.OS === 'ios') return 'iOS';
  if (Platform.OS === 'android') return 'Android';
  return 'Web';
}

async function resolveDeviceId(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(DEVICE_KEY);
    if (stored) return stored;
  } catch {
    // ignore
  }

  const suffix =
    Device.modelId ||
    Device.modelName ||
    Device.osInternalBuildId ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const id = `gm-${Platform.OS}-${String(suffix).replace(/\s+/g, '_').slice(0, 80)}`;

  try {
    await AsyncStorage.setItem(DEVICE_KEY, id);
  } catch {
    // ignore
  }
  return id;
}

/**
 * Mantém o utilizador como "online" enquanto o app está em primeiro plano.
 * O painel admin lê o contador via /api/admin/dashboard.
 */
export function PresenceBootstrap() {
  const { token } = useAuth();
  const deviceIdRef = useRef<string | null>(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const activeRef = useRef(AppState.currentState === 'active');

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const beat = async () => {
      if (!activeRef.current || cancelled) return;
      if (!deviceIdRef.current) {
        deviceIdRef.current = await resolveDeviceId();
      }
      await sendPresenceHeartbeat({
        device_id: deviceIdRef.current,
        plataforma: platformLabel(),
        token: tokenRef.current,
      });
    };

    const start = () => {
      void beat();
      if (interval) clearInterval(interval);
      interval = setInterval(() => {
        void beat();
      }, HEARTBEAT_MS);
    };

    const stop = (leave: boolean) => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      if (leave && deviceIdRef.current) {
        void sendPresenceLeave(deviceIdRef.current);
      }
    };

    const onAppState = (state: AppStateStatus) => {
      activeRef.current = state === 'active';
      if (state === 'active') start();
      else stop(true);
    };

    void resolveDeviceId().then((id) => {
      if (cancelled) return;
      deviceIdRef.current = id;
      if (AppState.currentState === 'active') start();
    });

    const sub = AppState.addEventListener('change', onAppState);
    return () => {
      cancelled = true;
      sub.remove();
      stop(true);
    };
  }, []);

  // Quando o utilizador faz login, refresca o heartbeat com o token.
  useEffect(() => {
    if (AppState.currentState !== 'active') return;
    void (async () => {
      if (!deviceIdRef.current) {
        deviceIdRef.current = await resolveDeviceId();
      }
      await sendPresenceHeartbeat({
        device_id: deviceIdRef.current,
        plataforma: platformLabel(),
        token,
      });
    })();
  }, [token]);

  return null;
}
