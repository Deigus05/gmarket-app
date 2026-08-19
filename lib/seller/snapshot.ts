import { fetchSellerMe } from '@/lib/seller/api';
import {
  loadLocalSellerMe,
  loadStoreAdRequests,
  loadStoreApplication,
  loadStoreProductDrafts,
  loadSupplierApplication,
  saveStoreAdRequests,
  saveStoreApplication,
  saveStoreProductDrafts,
  saveSupplierApplication,
} from '@/lib/seller/storage';
import {
  emptyStoreApplication,
  emptySupplierApplication,
  isBlockingStatus,
  type SellerMe,
  type SellerStoreSummary,
  type StoreApplication,
  type SupplierApplication,
} from '@/lib/seller/types';

function preferRemoteStatus<T extends { status: string; updated_at?: string }>(
  local: T,
  remote: T | undefined,
): T {
  if (!remote || remote.status === 'none') return local;
  const localTime = local.updated_at ? Date.parse(local.updated_at) : 0;
  const remoteTime = remote.updated_at ? Date.parse(remote.updated_at) : 0;
  if (local.status === 'draft' && (remote.status === 'none' || !remote.status)) return local;
  if (localTime > remoteTime && local.status === 'draft' && remote.status === 'draft') return local;
  return { ...local, ...remote };
}

export async function resolveSellerMe(token: string | null): Promise<SellerMe> {
  const local = await loadLocalSellerMe();
  const base: SellerMe = {
    supplier: local.supplier,
    storeApplication: local.storeApplication,
    store: local.storeApplication.status === 'approved' && local.storeApplication.store_id
      ? {
          id: local.storeApplication.store_id,
          name: local.storeApplication.trade_name,
          slug: local.storeApplication.store_slug || local.storeApplication.store_id,
          verified: local.storeApplication.store_verified,
          phone: local.storeApplication.store_phone,
          address: [local.storeApplication.neighborhood, local.storeApplication.address_details]
            .filter(Boolean)
            .join(', '),
          opening_hours: local.storeApplication.opening_hours,
          fulfillment_mode: local.storeApplication.fulfillment_mode || null,
        }
      : null,
    ads: local.ads,
    products: local.products,
  };

  if (!token) return base;

  const remote = await fetchSellerMe(token);
  if (!remote.success) return base;

  const supplier = preferRemoteStatus(local.supplier, remote.data.supplier);
  const storeApplication = preferRemoteStatus(local.storeApplication, remote.data.storeApplication);
  const store: SellerStoreSummary | null = remote.data.store || base.store;
  const ads = remote.data.ads.length ? remote.data.ads : local.ads;
  const products = remote.data.products.length ? remote.data.products : local.products;

  await Promise.all([
    saveSupplierApplication(supplier),
    saveStoreApplication(storeApplication),
    saveStoreAdRequests(ads),
    saveStoreProductDrafts(products),
  ]);

  return { supplier, storeApplication, store, ads, products };
}

export async function markSupplierSubmitted(application: SupplierApplication): Promise<SupplierApplication> {
  const next: SupplierApplication = {
    ...application,
    status: 'submitted',
    submitted_at: new Date().toISOString(),
    local_only: true,
  };
  await saveSupplierApplication(next);
  return next;
}

export async function markStoreSubmitted(application: StoreApplication): Promise<StoreApplication> {
  const next: StoreApplication = {
    ...application,
    status: 'submitted',
    submitted_at: new Date().toISOString(),
    local_only: true,
  };
  await saveStoreApplication(next);
  return next;
}

export { emptyStoreApplication, emptySupplierApplication, isBlockingStatus };
export { loadStoreApplication, loadSupplierApplication, saveStoreApplication, saveSupplierApplication };
