import { fetchSellerMe, submitStoreApplication, submitSupplierApplication } from '@/lib/seller/api';
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
  type LocalImage,
  type SellerApplicationStatus,
  type SellerMe,
  type SellerStoreSummary,
  type StoreApplication,
  type StoreDocument,
  type SupplierApplication,
} from '@/lib/seller/types';

const PUSHABLE = new Set<SellerApplicationStatus>(['submitted', 'under_review']);
let syncing = false;

function needsRemotePush(
  local: { status: SellerApplicationStatus; local_only?: boolean },
  remote?: { status: SellerApplicationStatus } | null,
) {
  if (!PUSHABLE.has(local.status)) return false;
  if (local.local_only) return true;
  return !remote || remote.status === 'none';
}

function remoteOnlyImages(photos: LocalImage[] | undefined) {
  return (photos || []).filter((photo) => {
    const uri = photo.remote_url || photo.uri;
    return Boolean(uri && /^https?:\/\//i.test(uri));
  }).map((photo) => ({
    uri: photo.remote_url || photo.uri,
    remote_url: photo.remote_url || photo.uri,
  }));
}

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

async function syncLocalApplications(
  token: string,
  supplier: SupplierApplication,
  storeApplication: StoreApplication,
) {
  if (syncing) return;
  syncing = true;
  try {
    if (needsRemotePush(supplier, null)) {
      const result = await submitSupplierApplication(token, {
        ...supplier,
        photos: remoteOnlyImages(supplier.photos),
      });
      if (result.success) {
        await saveSupplierApplication({
          ...supplier,
          ...result.data,
          status: result.data.status || 'submitted',
          local_only: false,
        });
      }
    }
    if (needsRemotePush(storeApplication, null)) {
      const docs: StoreDocument[] = [];
      for (const doc of storeApplication.documents || []) {
        const uri = doc.remote_url || doc.uri;
        if (!uri || !/^https?:\/\//i.test(uri)) continue;
        docs.push({ ...doc, uri, remote_url: uri });
      }
      const result = await submitStoreApplication(token, {
        ...storeApplication,
        logo: remoteOnlyImages(storeApplication.logo ? [storeApplication.logo] : [])[0] || null,
        cover: remoteOnlyImages(storeApplication.cover ? [storeApplication.cover] : [])[0] || null,
        space_photos: remoteOnlyImages(storeApplication.space_photos),
        documents: docs,
      });
      if (result.success) {
        await saveStoreApplication({
          ...storeApplication,
          ...result.data,
          status: result.data.status || 'submitted',
          local_only: false,
        });
      }
    }
  } catch {
    /* never block the app */
  } finally {
    syncing = false;
  }
}

export async function resolveSellerMe(token: string | null): Promise<SellerMe> {
  try {
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
    const supplier = remote.success
      ? preferRemoteStatus(local.supplier, remote.data.supplier)
      : local.supplier;
    const storeApplication = remote.success
      ? preferRemoteStatus(local.storeApplication, remote.data.storeApplication)
      : local.storeApplication;
    const store: SellerStoreSummary | null = (remote.success && remote.data.store) || base.store;
    const ads = remote.success && remote.data.ads.length ? remote.data.ads : local.ads;
    const products = remote.success && remote.data.products.length ? remote.data.products : local.products;

    if (
      needsRemotePush(supplier, remote.success ? remote.data.supplier : null)
      || needsRemotePush(storeApplication, remote.success ? remote.data.storeApplication : null)
    ) {
      void syncLocalApplications(token, supplier, storeApplication);
    }

    await Promise.all([
      saveSupplierApplication(supplier),
      saveStoreApplication(storeApplication),
      saveStoreAdRequests(ads),
      saveStoreProductDrafts(products),
    ]);

    return { supplier, storeApplication, store, ads, products };
  } catch {
    const local = await loadLocalSellerMe().catch(() => ({
      supplier: emptySupplierApplication(),
      storeApplication: emptyStoreApplication(),
      ads: [],
      products: [],
    }));
    return {
      supplier: local.supplier,
      storeApplication: local.storeApplication,
      store: null,
      ads: local.ads,
      products: local.products,
    };
  }
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
