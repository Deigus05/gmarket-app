import {
  API_URL,
  apiFetch,
  type ApiResult,
  type LiveStore,
  type Order,
  type Product,
} from '@/components/api';
import type {
  SellerAdRequest,
  SellerMe,
  SellerProductDraft,
  SellerStoreSummary,
  StoreApplication,
  SupplierApplication,
} from '@/lib/seller/types';
import { emptyStoreApplication, emptySupplierApplication } from '@/lib/seller/types';

function asMessage(result: unknown, fallback: string) {
  if (result && typeof result === 'object' && typeof (result as { message?: unknown }).message === 'string') {
    return (result as { message: string }).message;
  }
  return fallback;
}

async function parseSellerResponse<T>(response: Response, fallback: string): Promise<ApiResult<T>> {
  const result = await response.json().catch(() => ({}));
  if (response.ok && result && result.success !== false && (result.data !== undefined || result.success === true)) {
    return { success: true, data: (result.data ?? result) as T, message: result.message };
  }
  if (response.status === 404) {
    return { success: false, reason: 'other', message: 'not_found' };
  }
  if (response.status === 401 || response.status === 403) {
    return {
      success: false,
      reason: 'unauthorized',
      message: asMessage(result, 'Sessão inválida ou expirada.'),
    };
  }
  if (response.status >= 500 || response.status === 408 || response.status === 429) {
    return { success: false, reason: 'network', message: 'Sem ligação ao servidor.' };
  }
  return { success: false, reason: 'other', message: asMessage(result, fallback) };
}

function appendImage(
  form: FormData,
  field: string,
  uri: string | undefined | null,
  namePrefix: string,
) {
  if (!uri || uri.startsWith('http://') || uri.startsWith('https://')) return;
  const rawName = uri.split('/').pop() || `${namePrefix}.jpg`;
  const name = rawName.replace(/\.\w+$/, '') + '.jpg';
  form.append(field, {
    uri,
    name,
    type: 'image/jpeg',
  } as unknown as Blob);
}

function toStoreSummary(store: LiveStore | SellerStoreSummary | null | undefined): SellerStoreSummary | null {
  if (!store?.id) return null;
  return {
    id: store.id,
    name: store.name,
    slug: store.slug,
    logo_url: store.logo_url,
    cover_url: store.cover_url,
    verified: store.verified,
    address: store.address,
    phone: store.phone,
    opening_hours: store.opening_hours,
    fulfillment_mode: store.fulfillment_mode,
  };
}

function normalizeMe(raw: Partial<SellerMe> & {
  supplier?: Partial<SupplierApplication>;
  store_application?: Partial<StoreApplication>;
  storeApplication?: Partial<StoreApplication>;
  store?: LiveStore | SellerStoreSummary | null;
  ads?: SellerAdRequest[];
  products?: SellerProductDraft[];
}): SellerMe {
  return {
    supplier: { ...emptySupplierApplication(), ...(raw.supplier || {}) },
    storeApplication: {
      ...emptyStoreApplication(),
      ...(raw.storeApplication || raw.store_application || {}),
    },
    store: toStoreSummary(raw.store),
    ads: Array.isArray(raw.ads) ? raw.ads : [],
    products: Array.isArray(raw.products) ? raw.products : [],
  };
}

export async function fetchSellerMe(token: string): Promise<ApiResult<SellerMe>> {
  try {
    const response = await apiFetch(`${API_URL}/api/seller/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const parsed = await parseSellerResponse<SellerMe>(response, 'Não foi possível carregar a conta de vendedor.');
    if (!parsed.success) return parsed;
    return { success: true, data: normalizeMe(parsed.data) };
  } catch {
    return { success: false, reason: 'network', message: 'Sem ligação ao servidor.' };
  }
}

export async function submitSupplierApplication(
  token: string,
  application: SupplierApplication,
): Promise<ApiResult<SupplierApplication>> {
  try {
    const form = new FormData();
    form.append(
      'payload',
      JSON.stringify({
        ...application,
        photos: application.photos.map((photo) => photo.remote_url || null),
      }),
    );
    application.photos.forEach((photo, index) => {
      appendImage(form, 'photos', photo.uri, `supplier-${index}`);
    });
    const response = await apiFetch(`${API_URL}/api/seller/supplier`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    return parseSellerResponse<SupplierApplication>(response, 'Não foi possível enviar o pedido de fornecedor.');
  } catch {
    return { success: false, reason: 'network', message: 'Sem ligação ao servidor.' };
  }
}

export async function submitStoreApplication(
  token: string,
  application: StoreApplication,
): Promise<ApiResult<StoreApplication>> {
  try {
    const form = new FormData();
    form.append(
      'payload',
      JSON.stringify({
        ...application,
        logo: application.logo?.remote_url || null,
        cover: application.cover?.remote_url || null,
        space_photos: application.space_photos.map((photo) => photo.remote_url || null),
        documents: application.documents.map((doc) => ({
          kind: doc.kind,
          url: doc.remote_url || null,
        })),
      }),
    );
    appendImage(form, 'logo', application.logo?.uri, 'logo');
    appendImage(form, 'cover', application.cover?.uri, 'cover');
    application.space_photos.forEach((photo, index) => {
      appendImage(form, 'space_photos', photo.uri, `space-${index}`);
    });
    application.documents.forEach((doc, index) => {
      appendImage(form, `document_${doc.kind}`, doc.uri, `doc-${doc.kind}-${index}`);
    });
    const response = await apiFetch(`${API_URL}/api/seller/store-application`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    return parseSellerResponse<StoreApplication>(response, 'Não foi possível enviar o pedido de loja.');
  } catch {
    return { success: false, reason: 'network', message: 'Sem ligação ao servidor.' };
  }
}

export async function fetchSellerProducts(token: string): Promise<ApiResult<Product[]>> {
  try {
    const response = await apiFetch(`${API_URL}/api/seller/products`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseSellerResponse<Product[]>(response, 'Não foi possível carregar os produtos.');
  } catch {
    return { success: false, reason: 'network', message: 'Sem ligação ao servidor.' };
  }
}

export async function createSellerProduct(
  token: string,
  input: SellerProductDraft,
): Promise<ApiResult<Product | SellerProductDraft>> {
  try {
    const form = new FormData();
    form.append(
      'payload',
      JSON.stringify({
        titulo: input.title,
        preco: input.price,
        stock: input.stock,
        descricao: input.description,
        category_id: input.category_id,
        visible: input.visible,
      }),
    );
    input.photos.forEach((photo, index) => {
      appendImage(form, 'images', photo.uri, `product-${index}`);
    });
    const response = await apiFetch(`${API_URL}/api/seller/products`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    return parseSellerResponse(response, 'Não foi possível guardar o produto.');
  } catch {
    return { success: false, reason: 'network', message: 'Sem ligação ao servidor.' };
  }
}

export async function fetchSellerOrders(token: string): Promise<ApiResult<Order[]>> {
  try {
    const response = await apiFetch(`${API_URL}/api/seller/orders`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseSellerResponse<Order[]>(response, 'Não foi possível carregar os pedidos da loja.');
  } catch {
    return { success: false, reason: 'network', message: 'Sem ligação ao servidor.' };
  }
}

export async function updateSellerOrderStatus(
  token: string,
  orderId: string,
  status: string,
): Promise<ApiResult<Order>> {
  try {
    const response = await apiFetch(`${API_URL}/api/seller/orders/${encodeURIComponent(orderId)}/status`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    });
    return parseSellerResponse<Order>(response, 'Não foi possível atualizar o pedido.');
  } catch {
    return { success: false, reason: 'network', message: 'Sem ligação ao servidor.' };
  }
}

export type SellerPayoutRow = {
  id: string;
  amount: number;
  commission: number;
  net: number;
  status: string;
  created_at: string;
  note?: string | null;
};

export async function fetchSellerPayouts(token: string): Promise<ApiResult<SellerPayoutRow[]>> {
  try {
    const response = await apiFetch(`${API_URL}/api/seller/payouts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseSellerResponse<SellerPayoutRow[]>(response, 'Não foi possível carregar os recebimentos.');
  } catch {
    return { success: false, reason: 'network', message: 'Sem ligação ao servidor.' };
  }
}

export async function updateSellerStore(
  token: string,
  input: Partial<Pick<SellerStoreSummary, 'name' | 'address' | 'phone' | 'opening_hours' | 'fulfillment_mode'>>,
): Promise<ApiResult<SellerStoreSummary>> {
  try {
    const response = await apiFetch(`${API_URL}/api/seller/store`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });
    return parseSellerResponse<SellerStoreSummary>(response, 'Não foi possível atualizar a loja.');
  } catch {
    return { success: false, reason: 'network', message: 'Sem ligação ao servidor.' };
  }
}

export async function submitSellerAdRequest(
  token: string,
  input: Omit<SellerAdRequest, 'id' | 'status' | 'created_at'>,
): Promise<ApiResult<SellerAdRequest>> {
  try {
    const form = new FormData();
    form.append('payload', JSON.stringify(input));
    appendImage(form, 'image', input.image_uri, 'ad');
    const response = await apiFetch(`${API_URL}/api/seller/ads`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    return parseSellerResponse<SellerAdRequest>(response, 'Não foi possível enviar o pedido de publicidade.');
  } catch {
    return { success: false, reason: 'network', message: 'Sem ligação ao servidor.' };
  }
}

export async function fetchSellerAds(token: string): Promise<ApiResult<SellerAdRequest[]>> {
  try {
    const response = await apiFetch(`${API_URL}/api/seller/ads`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseSellerResponse<SellerAdRequest[]>(response, 'Não foi possível carregar os pedidos de publicidade.');
  } catch {
    return { success: false, reason: 'network', message: 'Sem ligação ao servidor.' };
  }
}
