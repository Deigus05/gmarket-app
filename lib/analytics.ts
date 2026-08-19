import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

export type AnalyticsEventName =
  | 'app_open'
  | 'session_start'
  | 'session_end'
  | 'product_view'
  | 'product_favorite'
  | 'product_unfavorite'
  | 'add_to_cart'
  | 'remove_from_cart'
  | 'checkout_start'
  | 'purchase'
  | 'event_view'
  | 'event_click'
  | 'event_share'
  | 'ad_impression'
  | 'ad_click'
  | 'search'
  | 'search_no_results'
  | 'share'
  | 'visit_store'
  | 'view_category'
  | 'api_error'
  | 'network_error'
  | 'checkout_error'
  | 'screen_slow';

export type AnalyticsPayload = {
  productId?: string | null;
  eventId?: string | null;
  adId?: string | null;
  sellerId?: string | null;
  categoryId?: string | null;
  searchTerm?: string | null;
  source?: string | null;
  resultCount?: number | null;
  metadata?: Record<string, unknown>;
};

const SESSION_KEY = '@gmarket:analytics_session';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const DEVICE_KEY = '@gmarket:presence_device_id';
const QUEUE_MAX = 20;

type SessionState = {
  id: string;
  startedAt: number;
  lastSeenAt: number;
};

let authToken: string | null = null;
let memorySession: SessionState | null = null;
let queue: Array<Record<string, unknown>> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let seenImpressions = new Set<string>();

export function setAnalyticsAuthToken(token: string | null) {
  authToken = token;
}

function platformLabel() {
  if (Platform.OS === 'ios') return 'iOS';
  if (Platform.OS === 'android') return 'Android';
  return 'Web';
}

function appVersion() {
  return Constants.expoConfig?.version || '1.0.0';
}

function osVersion() {
  return String(Platform.Version || Device.osVersion || '');
}

async function getDeviceId() {
  try {
    const stored = await AsyncStorage.getItem(DEVICE_KEY);
    if (stored) return stored;
  } catch {
    // ignore
  }
  const suffix = Device.modelId || Device.modelName || `${Date.now().toString(36)}`;
  const id = `gm-${Platform.OS}-${String(suffix).replace(/\s+/g, '_').slice(0, 80)}`;
  try {
    await AsyncStorage.setItem(DEVICE_KEY, id);
  } catch {
    // ignore
  }
  return id;
}

async function readSession(): Promise<SessionState | null> {
  if (memorySession) return memorySession;
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionState;
    if (parsed?.id && parsed.lastSeenAt) {
      memorySession = parsed;
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

async function writeSession(session: SessionState) {
  memorySession = session;
  try {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}

export async function ensureAnalyticsSession(opts?: { forceNew?: boolean }): Promise<{
  sessionId: string;
  isNew: boolean;
  deviceId: string;
}> {
  const now = Date.now();
  const deviceId = await getDeviceId();
  const current = await readSession();
  const expired = !current || now - current.lastSeenAt > SESSION_TIMEOUT_MS;
  if (!opts?.forceNew && current && !expired) {
    const next = { ...current, lastSeenAt: now };
    await writeSession(next);
    return { sessionId: next.id, isNew: false, deviceId };
  }

  const session: SessionState = {
    id: `ses-${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    startedAt: now,
    lastSeenAt: now,
  };
  await writeSession(session);
  seenImpressions = new Set();
  return { sessionId: session.id, isNew: true, deviceId };
}

async function getApiUrl() {
  const mod = await import('@/components/api');
  return mod.API_URL;
}

async function postJson(path: string, body: unknown) {
  const apiUrl = await getApiUrl();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

async function flushQueue() {
  if (!queue.length) return;
  const events = queue.splice(0, QUEUE_MAX);
  try {
    const session = await ensureAnalyticsSession();
    await postJson('/api/analytics/events', {
      session_id: session.sessionId,
      device_id: session.deviceId,
      platform: platformLabel(),
      app_version: appVersion(),
      os_version: osVersion(),
      events,
    });
  } catch {
    queue = events.concat(queue).slice(0, 80);
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushQueue();
  }, 400);
}

export function trackAnalytics(eventName: AnalyticsEventName, payload: AnalyticsPayload = {}) {
  queue.push({
    event_name: eventName,
    product_id: payload.productId || undefined,
    event_id: payload.eventId || undefined,
    ad_id: payload.adId || undefined,
    seller_id: payload.sellerId || undefined,
    category_id: payload.categoryId || undefined,
    search_term: payload.searchTerm || undefined,
    source: payload.source || undefined,
    result_count: payload.resultCount ?? undefined,
    metadata: payload.metadata || undefined,
  });
  if (queue.length >= 8) {
    void flushQueue();
    return;
  }
  scheduleFlush();
}

export async function pingAnalyticsSession(ended = false) {
  try {
    const session = await ensureAnalyticsSession();
    await postJson('/api/analytics/session', {
      session_id: session.sessionId,
      device_id: session.deviceId,
      platform: platformLabel(),
      app_version: appVersion(),
      os_version: osVersion(),
      ended,
    });
  } catch {
    // best-effort
  }
}

export async function startAnalyticsSession() {
  const session = await ensureAnalyticsSession();
  if (session.isNew) {
    trackAnalytics('session_start');
    trackAnalytics('app_open');
    try {
      const { trackAppAccess } = await import('@/components/api');
      await trackAppAccess(session.deviceId, platformLabel());
    } catch {
      // legacy access is best-effort
    }
  }
  await pingAnalyticsSession(false);
  return session;
}

export function trackAdImpressions(banners: Array<{ id: string }>, source?: string) {
  for (const banner of banners) {
    if (!banner?.id || seenImpressions.has(banner.id)) continue;
    seenImpressions.add(banner.id);
    trackAnalytics('ad_impression', { adId: banner.id, source: source || 'home' });
  }
}

export function trackAdClick(adId: string, title?: string, source?: string) {
  trackAnalytics('ad_click', { adId, source, metadata: title ? { title } : undefined });
}
