import {
  AccountDataKey,
  getAccountItem,
  setAccountItem,
} from '@/lib/accountStorage';

export type SavedAddress = {
  id?: string;
  label: string;
  details: string;
  latitude?: number | null;
  longitude?: number | null;
};

export async function getSavedAddresses(): Promise<SavedAddress[]> {
  try {
    const raw = await getAccountItem(AccountDataKey.savedAddresses, { allowGuest: true });
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedAddress[]) : [];
  } catch {
    return [];
  }
}

export async function setSavedAddresses(addresses: SavedAddress[]): Promise<void> {
  await setAccountItem(
    AccountDataKey.savedAddresses,
    JSON.stringify(addresses),
    { allowGuest: true },
  );
}
