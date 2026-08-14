import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import {
  getVisitorSupportConversation,
  type SupportConversation,
} from '@/components/api';

const DEVICE_KEY = '@gmarket:presence_device_id';
const VISITOR_TOKEN_KEY = '@gmarket:visitor_support_token';
const VISITOR_CONVO_KEY = '@gmarket:visitor_support_conversation';

export async function getOrCreateDeviceId(): Promise<string> {
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

export type VisitorSupportSession = {
  token: string;
  conversation: SupportConversation;
  display_name: string;
};

/** Abre (ou reutiliza) sessão de suporte como Visitante — sem conta. */
export async function ensureVisitorSupportSession(): Promise<
  | { ok: true; session: VisitorSupportSession }
  | { ok: false; message: string }
> {
  try {
    const cachedToken = await AsyncStorage.getItem(VISITOR_TOKEN_KEY);
    const cachedConvoRaw = await AsyncStorage.getItem(VISITOR_CONVO_KEY);
    if (cachedToken && cachedConvoRaw) {
      try {
        const conversation = JSON.parse(cachedConvoRaw) as SupportConversation;
        if (conversation?.id) {
          return {
            ok: true,
            session: {
              token: cachedToken,
              conversation,
              display_name: 'Visitante',
            },
          };
        }
      } catch {
        // refresh below
      }
    }

    const deviceId = await getOrCreateDeviceId();
    const result = await getVisitorSupportConversation(deviceId);
    if (!result.success || !result.data?.token || !result.data.conversation?.id) {
      return {
        ok: false,
        message: result.message || 'Não foi possível abrir o suporte como visitante.',
      };
    }

    await AsyncStorage.setItem(VISITOR_TOKEN_KEY, result.data.token);
    await AsyncStorage.setItem(VISITOR_CONVO_KEY, JSON.stringify(result.data.conversation));

    return {
      ok: true,
      session: {
        token: result.data.token,
        conversation: result.data.conversation,
        display_name: result.data.display_name || 'Visitante',
      },
    };
  } catch {
    return { ok: false, message: 'Sem ligação ao servidor.' };
  }
}
