import type { Property } from '@/components/api';
import {
  AccountDataKey,
  getAccountItem,
  setAccountItem,
  subscribeAccountScope,
} from '@/lib/accountStorage';

type FavListener = (properties: Property[]) => void;
const listeners = new Set<FavListener>();

function notify(properties: Property[]) {
  listeners.forEach((listener) => listener(properties));
}

export function subscribePropertyFavorites(listener: FavListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

subscribeAccountScope(() => {
  notify([]);
});

export async function getFavoriteProperties(): Promise<Property[]> {
  try {
    const raw = await getAccountItem(AccountDataKey.favProperties, { allowGuest: true });
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Property[]) : [];
  } catch {
    return [];
  }
}

export async function setFavoriteProperties(properties: Property[]): Promise<void> {
  await setAccountItem(
    AccountDataKey.favProperties,
    JSON.stringify(properties),
    { allowGuest: true },
  );
  notify(properties);
}

export async function isPropertyFavorite(propertyId: string): Promise<boolean> {
  const list = await getFavoriteProperties();
  return list.some((p) => p.id === propertyId);
}

export async function togglePropertyFavorite(property: Property): Promise<{
  properties: Property[];
  isFavorite: boolean;
}> {
  const current = await getFavoriteProperties();
  const exists = current.some((p) => p.id === property.id);
  const next = exists
    ? current.filter((p) => p.id !== property.id)
    : [...current, property];
  await setFavoriteProperties(next);
  return { properties: next, isFavorite: !exists };
}

export async function removePropertyFavorite(propertyId: string): Promise<Property[]> {
  const next = (await getFavoriteProperties()).filter((p) => p.id !== propertyId);
  await setFavoriteProperties(next);
  return next;
}
