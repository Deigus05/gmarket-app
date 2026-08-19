import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useAuth } from '@/components/AuthContext';
import {
  pingAnalyticsSession,
  setAnalyticsAuthToken,
  startAnalyticsSession,
} from '@/lib/analytics';

/**
 * Inicia sessão de Analytics só quando o app passa a primeiro plano
 * (não conta cada ecrã como abertura).
 */
export function AnalyticsBootstrap() {
  const { token } = useAuth();
  const activeRef = useRef(AppState.currentState === 'active');

  useEffect(() => {
    setAnalyticsAuthToken(token);
  }, [token]);

  useEffect(() => {
    let cancelled = false;

    const start = () => {
      if (cancelled || !activeRef.current) return;
      void startAnalyticsSession();
    };

    const onState = (state: AppStateStatus) => {
      activeRef.current = state === 'active';
      if (state === 'active') start();
      else void pingAnalyticsSession(false);
    };

    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', onState);
    const ping = setInterval(() => {
      if (activeRef.current) void pingAnalyticsSession(false);
    }, 60_000);

    return () => {
      cancelled = true;
      sub.remove();
      clearInterval(ping);
    };
  }, []);

  return null;
}
