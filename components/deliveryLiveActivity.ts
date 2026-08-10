import { Platform } from 'react-native';

import type { Order, OrderStatus } from '@/components/api';
import {
  AccountDataKey,
  getAccountItem,
  removeAccountItem,
  setAccountItem,
} from '@/lib/accountStorage';

/** Estados em que a Dynamic Island fica ativa (a partir de "Pedido recolhido"). */
const LIVE_ACTIVE = new Set<OrderStatus>(['picked', 'on_way', 'arrived']);

/** Etapas mostradas na Live Activity (após recolha). */
const LIVE_STEPS: { id: OrderStatus; title: string; short: string }[] = [
  { id: 'picked', title: 'Pedido recolhido', short: 'Recolhido' },
  { id: 'on_way', title: 'A caminho', short: 'A caminho' },
  { id: 'arrived', title: 'Chegou perto', short: 'Chegou' },
  { id: 'delivered', title: 'Entregue', short: 'Entregue' },
];

type ActivityMap = Record<string, string>;

function isIosLiveActivitySupported() {
  return Platform.OS === 'ios';
}

async function loadActivityMap(): Promise<ActivityMap> {
  try {
    const raw = await getAccountItem(AccountDataKey.deliveryLiveActivities);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as ActivityMap;
  } catch {
    return {};
  }
}

async function saveActivityMap(map: ActivityMap) {
  await setAccountItem(AccountDataKey.deliveryLiveActivities, JSON.stringify(map));
}

function liveStepIndex(status: OrderStatus): number {
  const idx = LIVE_STEPS.findIndex((step) => step.id === status);
  return idx >= 0 ? idx : 0;
}

function truncate(value: string, max: number) {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function buildState(order: Order) {
  const idx = liveStepIndex(order.status);
  const step = LIVE_STEPS[Math.min(idx, LIVE_STEPS.length - 1)];
  const stepNumber = Math.min(idx + 1, LIVE_STEPS.length);
  const storeName = truncate(order.store?.name || 'GMarket', 22);

  return {
    title: step.title,
    subtitle: `Etapa ${stepNumber}/${LIVE_STEPS.length} · ${storeName} · #${order.order_number}`,
    progressBar: {
      progress: stepNumber / LIVE_STEPS.length,
    },
    imageName: 'delivery',
    dynamicIslandImageName: 'island',
  };
}

const ACTIVITY_CONFIG = {
  backgroundColor: '#0D47A1',
  titleColor: '#FFFFFF',
  subtitleColor: '#D6E4FF',
  progressViewTint: '#64B5F6',
  progressViewLabelColor: '#FFFFFF',
  timerType: 'circular' as const,
  padding: { horizontal: 16, top: 14, bottom: 14 },
  imagePosition: 'right' as const,
  imageAlign: 'center' as const,
  imageSize: { width: 44, height: 44 },
  contentFit: 'contain' as const,
};

async function getLiveActivityModule() {
  if (!isIosLiveActivitySupported()) return null;
  try {
    return await import('expo-live-activity');
  } catch (error) {
    console.log('Live Activity indisponível:', error);
    return null;
  }
}

async function startForOrder(order: Order): Promise<string | undefined> {
  const LiveActivity = await getLiveActivityModule();
  if (!LiveActivity) return undefined;

  try {
    const id = LiveActivity.startActivity(buildState(order), {
      ...ACTIVITY_CONFIG,
      deepLinkUrl: `/entrega?orderId=${order.id}`,
    });
    return typeof id === 'string' ? id : undefined;
  } catch (error) {
    console.log('Falha ao iniciar Live Activity:', error);
    return undefined;
  }
}

async function updateForOrder(activityId: string, order: Order) {
  const LiveActivity = await getLiveActivityModule();
  if (!LiveActivity) return;
  try {
    LiveActivity.updateActivity(activityId, buildState(order));
  } catch (error) {
    console.log('Falha ao atualizar Live Activity:', error);
  }
}

async function stopForOrder(activityId: string, order?: Order | null) {
  const LiveActivity = await getLiveActivityModule();
  if (!LiveActivity) return;

  const state =
    order?.status === 'cancelled'
      ? {
          title: 'Pedido cancelado',
          subtitle: `#${order.order_number}`,
          progressBar: { progress: 1 },
          imageName: 'delivery',
          dynamicIslandImageName: 'island',
        }
      : {
          title: 'Entregue',
          subtitle: order
            ? `Etapa ${LIVE_STEPS.length}/${LIVE_STEPS.length} · #${order.order_number}`
            : 'Obrigado por usar o GMarket',
          progressBar: { progress: 1 },
          imageName: 'delivery',
          dynamicIslandImageName: 'island',
        };

  try {
    LiveActivity.stopActivity(activityId, state);
  } catch (error) {
    console.log('Falha ao terminar Live Activity:', error);
  }
}

/**
 * Sincroniza Live Activities com os pedidos:
 * - inicia só a partir de `picked` (Pedido recolhido)
 * - atualiza em `on_way` / `arrived`
 * - termina em `delivered` / `cancelled` ou se o pedido deixar de estar ativo
 */
export async function syncDeliveryLiveActivities(orders: Order[]) {
  if (!isIosLiveActivitySupported()) return;

  const safeOrders = Array.isArray(orders) ? orders : [];
  const map = await loadActivityMap();
  const next: ActivityMap = { ...map };
  const byId = new Map(safeOrders.map((order) => [order.id, order]));

  for (const order of safeOrders) {
    const existingId = next[order.id];

    // Recolha na loja não usa a Dynamic Island de entrega
    if (order.fulfillment_method === 'recolha') {
      if (existingId) {
        await stopForOrder(existingId, order);
        delete next[order.id];
      }
      continue;
    }

    if (LIVE_ACTIVE.has(order.status)) {
      if (existingId) {
        await updateForOrder(existingId, order);
      } else {
        const activityId = await startForOrder(order);
        if (activityId) next[order.id] = activityId;
      }
      continue;
    }

    if (existingId) {
      await stopForOrder(existingId, order);
      delete next[order.id];
    }
  }

  // Limpar activities órfãs (pedido já não vem na lista)
  for (const orderId of Object.keys(next)) {
    if (byId.has(orderId)) continue;
    await stopForOrder(next[orderId], null);
    delete next[orderId];
  }

  await saveActivityMap(next);
}

/** Remove o mapeamento quando o utilizador descarta a Live Activity no sistema. */
export async function forgetLiveActivityId(activityId: string) {
  const map = await loadActivityMap();
  let changed = false;
  for (const [orderId, id] of Object.entries(map)) {
    if (id === activityId) {
      delete map[orderId];
      changed = true;
    }
  }
  if (changed) await saveActivityMap(map);
}

export async function clearAllDeliveryLiveActivities() {
  if (!isIosLiveActivitySupported()) {
    await removeAccountItem(AccountDataKey.deliveryLiveActivities);
    return;
  }

  const map = await loadActivityMap();
  for (const activityId of Object.values(map)) {
    await stopForOrder(activityId, null);
  }
  await removeAccountItem(AccountDataKey.deliveryLiveActivities);
}

export function shouldShowLiveActivity(status: OrderStatus) {
  return LIVE_ACTIVE.has(status);
}
