import {
  AccountDataKey,
  getAccountItem,
  setAccountItem,
} from '@/lib/accountStorage';
import {
  emptyStoreApplication,
  emptySupplierApplication,
  type SellerAdRequest,
  type SellerMe,
  type SellerProductDraft,
  type StoreApplication,
  type SupplierApplication,
} from '@/lib/seller/types';

async function readJson<T>(base: string): Promise<T | null> {
  try {
    const raw = await getAccountItem(base);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJson(base: string, value: unknown): Promise<void> {
  await setAccountItem(base, JSON.stringify(value));
}

export async function loadSupplierApplication(): Promise<SupplierApplication> {
  const stored = await readJson<SupplierApplication>(AccountDataKey.supplierApplication);
  return stored ? { ...emptySupplierApplication(), ...stored } : emptySupplierApplication();
}

export async function saveSupplierApplication(value: SupplierApplication): Promise<void> {
  await writeJson(AccountDataKey.supplierApplication, {
    ...value,
    updated_at: new Date().toISOString(),
  });
}

export async function loadStoreApplication(): Promise<StoreApplication> {
  const stored = await readJson<StoreApplication>(AccountDataKey.storeApplication);
  return stored ? { ...emptyStoreApplication(), ...stored } : emptyStoreApplication();
}

export async function saveStoreApplication(value: StoreApplication): Promise<void> {
  await writeJson(AccountDataKey.storeApplication, {
    ...value,
    updated_at: new Date().toISOString(),
  });
}

export async function loadStoreAdRequests(): Promise<SellerAdRequest[]> {
  return (await readJson<SellerAdRequest[]>(AccountDataKey.storeAdRequests)) || [];
}

export async function saveStoreAdRequests(value: SellerAdRequest[]): Promise<void> {
  await writeJson(AccountDataKey.storeAdRequests, value);
}

export async function loadStoreProductDrafts(): Promise<SellerProductDraft[]> {
  return (await readJson<SellerProductDraft[]>(AccountDataKey.storeProductDrafts)) || [];
}

export async function saveStoreProductDrafts(value: SellerProductDraft[]): Promise<void> {
  await writeJson(AccountDataKey.storeProductDrafts, value);
}

export async function loadLocalSellerMe(): Promise<Pick<SellerMe, 'supplier' | 'storeApplication' | 'ads' | 'products'>> {
  const [supplier, storeApplication, ads, products] = await Promise.all([
    loadSupplierApplication(),
    loadStoreApplication(),
    loadStoreAdRequests(),
    loadStoreProductDrafts(),
  ]);
  return { supplier, storeApplication, ads, products };
}
