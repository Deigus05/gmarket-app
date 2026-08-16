// components/api.ts

import Constants from 'expo-constants';
import { Platform } from 'react-native';

import {
  CacheTTL,
  cacheAuthScope,
  cacheKeyProduct,
  cacheKeyProperties,
  cacheKeyProperty,
  cacheKeyRecommendations,
  cacheKeySearch,
  cacheKeyStore,
  cacheKeyStoreProducts,
  invalidateApiCache,
  peekCache,
  setCacheValue,
  warmProductCache,
  warmPropertyCache,
  withApiCache,
  type CacheReadOptions,
} from '@/components/apiCache';

export type { CacheReadOptions };

function isUsableLanHost(host: string) {
  const name = host.trim().toLowerCase();
  if (!name || name === 'localhost' || name === '127.0.0.1') return false;
  // Túnel do Expo/ngrok não encaminha a porta 3001 do backend.
  if (
    name.endsWith('.exp.direct')
    || name.endsWith('.exp.host')
    || name.endsWith('.expo.dev')
    || name.includes('ngrok')
  ) {
    return false;
  }
  return true;
}

const PRODUCTION_API_URL = 'https://gmarket-api-proxy.puzzling-apricot.workers.dev';

function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  // Preview/production APK/IPA: nunca usar localhost / 10.0.2.2 / IP da LAN.
  if (!__DEV__) return PRODUCTION_API_URL;

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host && isUsableLanHost(host)) {
      return `http://${host}:3001`;
    }
  }

  if (Platform.OS === 'android') return 'http://10.0.2.2:3001';
  return 'http://127.0.0.1:3001';
}

// IP/porta do backend Express (mesma rede Wi‑Fi ou override via EXPO_PUBLIC_API_URL)
export const API_URL = resolveApiUrl();

if (__DEV__) {
  console.log('[GMarket] API_URL =', API_URL);
}

const API_FETCH_TIMEOUT_MS = 30_000;

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const AUTH_FETCH_TIMEOUT_MS = 20_000;

function authFetch(input: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUTH_FETCH_TIMEOUT_MS);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
  });
}

export interface ProductCategory {
  id: string;
  slug: string;
  name: string;
  sort_order?: number;
}

export interface ProductSpecification {
  attribute_id: string;
  key?: string;
  label?: string;
  value: string;
  kind?: 'spec';
  input_type?: 'text' | 'number' | 'select';
  required?: boolean;
  sort_order?: number;
}

export interface ProductVariantDimension {
  id?: string;
  attribute_id: string | null;
  key: string;
  label: string;
  options: string[];
  sort_order?: number;
}

export interface ProductVariantCombination {
  id: string;
  product_id: string;
  sku: string;
  option_values: Record<string, string>;
  preco: number;
  preco_gpay: number;
  stock: number;
  image_url?: string | null;
  is_default: boolean;
  legacy?: boolean;
}

export type StoreFulfillmentMode = 'ambos' | 'entrega' | 'recolha';

export interface ProductStore {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  cover_url?: string | null;
  rating_avg?: number;
  review_count?: number;
  verified?: boolean;
  address?: string | null;
  phone?: string | null;
  opening_hours?: string | null;
  fulfillment_mode?: StoreFulfillmentMode;
}

export interface ProductReview {
  id: string;
  product_id: string;
  user_name: string;
  user_avatar?: string | null;
  rating: number;
  comment?: string | null;
  photo_urls?: string[] | null;
  created_at?: string;
}

export interface ProductReviews {
  items: ProductReview[];
  average: number;
  count: number;
}

export interface ProductGroupMember {
  id: string;
  titulo: string;
  image_url: string | null;
  group_label: string;
  preco: number;
  stock: number;
}

export interface ProductGroup {
  id: string;
  label: string | null;
  members: ProductGroupMember[];
}

export interface Product {
  id: string;
  titulo: string;
  preco: number;
  preco_gpay: number;
  image_url: string | null;
  image_urls?: string[] | null;
  descricao?: string | null;
  marca?: string | null;
  garantia?: string | null;
  delivery_fee?: number | null;
  delivery_time?: string | null;
  stock: number;
  store_id?: string | null;
  category_id?: string | null;
  group_id?: string | null;
  group_label?: string | null;
  description?: string;
  images?: string[];
  category?: ProductCategory | null;
  specifications?: ProductSpecification[];
  variants?: {
    dimensions: ProductVariantDimension[];
    combinations: ProductVariantCombination[];
  };
  group?: ProductGroup | null;
  store?: ProductStore | null;
  reviews?: ProductReviews;
}

// 📊 Função que conta quantas vezes o app foi aberto no dia
export async function trackAppAccess(device_id: string, plataforma: string) {
  try {
    await fetch(`${API_URL}/api/analytics/access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id, plataforma }),
    });
    console.log('Acesso enviado para o Supabase!');
  } catch (error) {
    console.log('Erro ao enviar acesso do app:', error);
  }
}

/** Heartbeat de presença — mantém o dispositivo como "online" no painel admin. */
export async function sendPresenceHeartbeat(input: {
  device_id: string;
  plataforma: string;
  token?: string | null;
}): Promise<void> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (input.token) headers.Authorization = `Bearer ${input.token}`;
    await fetch(`${API_URL}/api/presence/heartbeat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        device_id: input.device_id,
        plataforma: input.plataforma,
      }),
    });
  } catch (error) {
    console.log('Erro ao enviar presença:', error);
  }
}

export async function sendPresenceLeave(device_id: string): Promise<void> {
  try {
    await fetch(`${API_URL}/api/presence/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id }),
    });
  } catch (error) {
    console.log('Erro ao limpar presença:', error);
  }
}

// 📈 Função invisível que envia os cliques de anúncios para a nuvem
export async function trackEvent(tipo_evento: 'CLICOU_ANUNCIO' | 'VISUALIZOU_PRODUTO', item_id: string, item_nome: string) {
  try {
    await fetch(`${API_URL}/api/analytics/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo_evento, item_id, item_nome }),
    });
    console.log('Clique em anúncio computado em Cloud!');
  } catch (error) {
    console.log('Erro ao enviar tracking em background:', error);
  }
}

// ─── IMÓVEIS (Guiné-Bissau) ──────────────────────────────────────────────────

type PropertyApiResult<T> = { success: true; data: T; message?: string } | { success: false; message: string };

export type PropertyPurpose = 'venda' | 'arrendamento';
export type PropertyRentalPeriod = 'mensal' | 'diaria';
export type PropertyStatus = 'disponivel' | 'reservado' | 'vendido' | 'arrendado';
export type PropertyAttrGroup = 'info' | 'amenity' | 'structure' | 'service';
export type PropertyInputType = 'text' | 'number' | 'select' | 'boolean' | 'multiselect';

export type PropertyAttribute = {
  id: string;
  key: string;
  label: string;
  attr_group: PropertyAttrGroup;
  input_type: PropertyInputType;
  required: boolean;
  options: string[];
  unit?: string | null;
  show_in_main: boolean;
  sort_order: number;
  value?: string | null;
};

export type PropertyType = {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
  attributes: PropertyAttribute[];
  attributes_by_group?: Record<PropertyAttrGroup, PropertyAttribute[]>;
};

export type PropertyRoom = {
  id?: string;
  name: string;
  price_per_night: number;
  guests: number;
  beds: number;
  bathrooms: number;
  image_urls?: string[];
  available?: boolean;
};

export type Property = {
  id: string;
  title: string;
  type: string;
  category: string;
  subcategory_slug?: string;
  purpose?: PropertyPurpose;
  rental_period?: PropertyRentalPeriod | null;
  location: string;
  price: number;
  negotiable?: boolean;
  image_url: string | null;
  image_urls?: string[];
  video_urls?: string[];
  virtual_tour_url?: string | null;
  details?: string | null;
  description?: string | null;
  country?: string;
  region?: string | null;
  sector?: string | null;
  bairro?: string | null;
  tabanca?: string | null;
  rua?: string | null;
  referencia?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  show_on_map?: boolean;
  owner_name?: string | null;
  agency_name?: string | null;
  advertiser?: string;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  status?: PropertyStatus;
  is_visible?: boolean;
  view_count?: number;
  attributes?: PropertyAttribute[];
  rooms?: PropertyRoom[];
  agency?: CustomerAgency | null;
  related?: Property[];
  created_at?: string;
  updated_at?: string;
};

export type GbSector = { id: string; slug: string; name: string; region_id: string };
export type GbRegion = { id: string; slug: string; name: string; sectors: GbSector[] };

export type PropertyQuota = {
  count: number;
  limit: number | null;
  unlimited: boolean;
  can_create: boolean;
};

export async function getLiveProperties(
  filters?: {
    purpose?: string;
    rental_period?: string;
    subcategory?: string;
    region?: string;
    sector?: string;
    min_price?: string;
    max_price?: string;
    bedrooms?: string;
    check_in?: string;
    check_out?: string;
    status?: string;
  },
  opts?: CacheReadOptions,
): Promise<Property[]> {
  const params = new URLSearchParams();
  if (filters?.purpose) params.set('purpose', filters.purpose);
  if (filters?.rental_period) params.set('rental_period', filters.rental_period);
  if (filters?.subcategory) params.set('subcategory', filters.subcategory);
  if (filters?.region) params.set('region', filters.region);
  if (filters?.sector) params.set('sector', filters.sector);
  if (filters?.min_price) params.set('min_price', filters.min_price);
  if (filters?.max_price) params.set('max_price', filters.max_price);
  if (filters?.bedrooms) params.set('bedrooms', filters.bedrooms);
  if (filters?.check_in) params.set('check_in', filters.check_in);
  if (filters?.check_out) params.set('check_out', filters.check_out);
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString();

  return withApiCache(
    cacheKeyProperties(qs),
    CacheTTL.properties,
    async () => {
      const response = await fetch(`${API_URL}/api/properties${qs ? `?${qs}` : ''}`);
      const result = await response.json();
      let data: Property[] = result.success ? result.data : [];

      // Fallback client-side for fields the API may still ignore.
      if (filters?.rental_period) {
        data = data.filter((item) => {
          if (item.purpose !== 'arrendamento') return false;
          const period = item.rental_period || 'mensal';
          return period === filters.rental_period;
        });
      }
      if (filters?.bedrooms) {
        const minBeds = Number(filters.bedrooms);
        if (minBeds > 0) {
          data = data.filter((item) => {
            const quartos = item.attributes?.find((a) => a.key === 'quartos' || a.key === 'numero_quartos');
            const value = Number(quartos?.value ?? 0);
            if (minBeds >= 5) return value >= 5;
            return value === minBeds;
          });
        }
      }

      if (response.ok && result.success) {
        void warmPropertyCache(data);
        return { ok: true, data };
      }
      return { ok: false, data: [] };
    },
    [],
    opts,
  );
}

export async function getPropertyById(
  id: string,
  token?: string | null,
  opts?: CacheReadOptions,
): Promise<Property | null> {
  // Detalhe autenticado não usa cache (pode ter dados privados).
  if (token) {
    try {
      const response = await fetch(`${API_URL}/api/properties/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      const data = response.ok && result.success ? (result.data as Property) : null;
      if (data) void setCacheValue(cacheKeyProperty(id), data);
      return data;
    } catch (error) {
      console.log('Erro ao carregar imóvel:', error);
      return (await peekCache<Property>(cacheKeyProperty(id))) ?? null;
    }
  }

  return withApiCache(
    cacheKeyProperty(id),
    CacheTTL.propertyDetail,
    async () => {
      const response = await fetch(`${API_URL}/api/properties/${encodeURIComponent(id)}`);
      const result = await response.json();
      if (response.ok && result.success) return { ok: true, data: result.data as Property };
      return { ok: false, data: null };
    },
    null,
    opts,
  );
}

export async function getPropertyTypes(opts?: CacheReadOptions): Promise<PropertyType[]> {
  return withApiCache(
    'property-types',
    CacheTTL.propertyTypes,
    async () => {
      const response = await fetch(`${API_URL}/api/property-types`);
      const result = await response.json();
      if (result.success) return { ok: true, data: result.data as PropertyType[] };
      return { ok: false, data: [] };
    },
    [],
    opts,
  );
}

export async function getGbLocations(opts?: CacheReadOptions): Promise<GbRegion[]> {
  return withApiCache(
    'gb-locations',
    CacheTTL.locations,
    async () => {
      const response = await fetch(`${API_URL}/api/gb-locations`);
      const result = await response.json();
      if (result.success) return { ok: true, data: result.data as GbRegion[] };
      return { ok: false, data: [] };
    },
    [],
    opts,
  );
}

export async function getMyPropertyQuota(token: string): Promise<PropertyQuota | null> {
  try {
    const response = await fetch(`${API_URL}/api/properties/mine/count`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await response.json();
    return response.ok && result.success ? result.data : null;
  } catch (error) {
    console.log('Erro ao contar anúncios:', error);
    return null;
  }
}

export async function getMyProperties(token: string): Promise<ApiResult<Property[]>> {
  try {
    const response = await fetch(`${API_URL}/api/properties/mine`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseAuthResponse<Property[]>(response);
  } catch (error) {
    console.log('Erro ao listar meus anúncios:', error);
    return { success: false, message: 'Sem ligação ao servidor.' };
  }
}

export async function updateProperty(
  token: string,
  id: string,
  fields: Record<string, string | boolean | number>,
): Promise<ApiResult<Property>> {
  try {
    const form = new FormData();
    Object.entries(fields).forEach(([key, value]) => {
      form.append(key, String(value));
    });
    const response = await fetch(`${API_URL}/api/properties/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    return parseAuthResponse<Property>(response);
  } catch (error) {
    console.log('Erro ao atualizar anúncio:', error);
    return { success: false, message: 'Sem ligação ao servidor.' };
  }
}

export async function setPropertyVisibility(
  token: string,
  id: string,
  isVisible: boolean,
): Promise<ApiResult<Property>> {
  return updateProperty(token, id, { is_visible: isVisible });
}

export async function deleteProperty(token: string, id: string): Promise<ApiResult<{ id?: string }>> {
  try {
    const response = await fetch(`${API_URL}/api/properties/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.success) {
      return { success: true, data: result.data || {}, message: result.message };
    }
    return {
      success: false,
      message: typeof result.message === 'string' ? result.message : 'Não foi possível apagar o anúncio.',
    };
  } catch (error) {
    console.log('Erro ao apagar anúncio:', error);
    return { success: false, message: 'Sem ligação ao servidor.' };
  }
}

export async function createProperty(
  token: string,
  input: {
    fields: Record<string, string | boolean | number>;
    attributes: { key: string; value: string | boolean | number }[];
    rooms?: PropertyRoom[];
    imageUris: string[];
    videoUris?: string[];
  },
): Promise<PropertyApiResult<Property>> {
  try {
    const form = new FormData();
    Object.entries(input.fields).forEach(([key, value]) => {
      form.append(key, String(value));
    });
    form.append('attributes', JSON.stringify(input.attributes));
    if (input.rooms?.length) {
      form.append('rooms', JSON.stringify(input.rooms));
    }

    // Expect client-compressed JPEGs from imageOptimization (anunciar-imovel).
    input.imageUris.forEach((uri, index) => {
      const rawName = uri.split('/').pop() || `photo-${index}.jpg`;
      const name = rawName.replace(/\.\w+$/, '') + '.jpg';
      form.append('images', {
        uri,
        name,
        type: 'image/jpeg',
      } as unknown as Blob);
    });

    (input.videoUris || []).forEach((uri, index) => {
      const name = uri.split('/').pop() || `video-${index}.mp4`;
      form.append('videos', {
        uri,
        name,
        type: 'video/mp4',
      } as unknown as Blob);
    });

    const response = await fetch(`${API_URL}/api/properties`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.success) {
      // Lista de imóveis em cache ficava desatualizada até 15 min.
      await invalidateApiCache('properties:');
      if (result.data?.id) {
        await setCacheValue(cacheKeyProperty(String(result.data.id)), result.data);
      }
      return { success: true, data: result.data as Property, message: result.message };
    }
    return {
      success: false,
      message: typeof result.message === 'string' ? result.message : 'Não foi possível publicar o imóvel.',
    };
  } catch (error) {
    console.log('Erro ao criar imóvel:', error);
    return { success: false, message: 'Sem ligação ao servidor. Verifique a rede e o backend.' };
  }
}

export async function getAgencies(opts?: CacheReadOptions): Promise<CustomerAgency[]> {
  return withApiCache(
    'agencies',
    CacheTTL.agencies,
    async () => {
      const response = await fetch(`${API_URL}/api/agencies`);
      const result = await response.json();
      if (result.success) return { ok: true, data: result.data as CustomerAgency[] };
      return { ok: false, data: [] };
    },
    [],
    opts,
  );
}
// Adicione isto no final do arquivo components/api.ts

export type BannerSlot = 'hero' | 'feed' | 'grid' | 'search';

export type HomeBanner = {
  id: string;
  slot: BannerSlot;
  title: string;
  subtitle: string;
  image_url: string;
  link_url?: string | null;
  sort_order?: number;
};

export type HomeBannersGrouped = {
  hero: HomeBanner[];
  feed: HomeBanner[];
  grid: HomeBanner[];
  search: HomeBanner[];
};

export async function getHomeBanners(opts?: CacheReadOptions): Promise<HomeBannersGrouped> {
  const empty: HomeBannersGrouped = { hero: [], feed: [], grid: [], search: [] };
  return withApiCache(
    'home-banners',
    CacheTTL.banners,
    async () => {
      const response = await fetch(`${API_URL}/api/banners`);
      const result = await response.json();
      if (!response.ok || !result.success || !result.data) return { ok: false, data: empty };
      const data: HomeBannersGrouped = {
        hero: Array.isArray(result.data.hero) ? result.data.hero : [],
        feed: Array.isArray(result.data.feed) ? result.data.feed : [],
        grid: Array.isArray(result.data.grid) ? result.data.grid : [],
        search: Array.isArray(result.data.search) ? result.data.search : [],
      };
      return { ok: true, data };
    },
    empty,
    opts,
  );
}

export type PromoInterstitialPlacement = 'fullscreen' | 'sheet';
export type PromoInterstitialFrequency =
  | 'once'
  | 'once_per_day'
  | 'once_per_session'
  | 'every_launch';

export type PromoInterstitial = {
  id: string;
  placement: PromoInterstitialPlacement;
  title: string;
  subtitle: string;
  image_url: string;
  background_color: string;
  /** true: imagem ocupa todo o fundo; false: cor de fundo + imagem em destaque */
  image_fill?: boolean;
  product_id?: string | null;
  promo_code?: string | null;
  cta_product_label?: string;
  cta_promo_label?: string;
  frequency: PromoInterstitialFrequency;
  sort_order?: number;
};

export type PromoInterstitialsPayload = {
  fullscreen: PromoInterstitial | null;
  sheet: PromoInterstitial | null;
};

/** Pop-ups promocionais elegíveis para o utilizador atual (auth opcional). */
export async function getPromoInterstitials(
  token?: string | null,
): Promise<PromoInterstitialsPayload> {
  const empty: PromoInterstitialsPayload = { fullscreen: null, sheet: null };
  try {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await apiFetch(`${API_URL}/api/promo-interstitials`, { headers });
    const result = await response.json();
    if (!response.ok || !result.success || !result.data) return empty;
    return {
      fullscreen: result.data.fullscreen || null,
      sheet: result.data.sheet || null,
    };
  } catch {
    return empty;
  }
}

export type PlatformContactKind = 'support' | 'transfer';

export type PlatformContact = {
  id: string;
  kind: PlatformContactKind;
  label: string;
  phone: string;
  notes?: string;
  sort_order?: number;
};

export type PlatformContactsGrouped = {
  support: PlatformContact[];
  transfer: PlatformContact[];
};

export async function getPlatformContacts(
  opts?: CacheReadOptions,
): Promise<PlatformContactsGrouped> {
  const empty: PlatformContactsGrouped = { support: [], transfer: [] };
  return withApiCache(
    'platform-contacts',
    CacheTTL.contacts,
    async () => {
      const response = await fetch(`${API_URL}/api/contacts`);
      const result = await response.json();
      if (!response.ok || !result.success || !result.data) return { ok: false, data: empty };
      const data: PlatformContactsGrouped = {
        support: Array.isArray(result.data.support) ? result.data.support : [],
        transfer: Array.isArray(result.data.transfer) ? result.data.transfer : [],
      };
      return { ok: true, data };
    },
    empty,
    opts,
  );
}

// 📡 Produtos com cache local (economiza dados; sobrevive sem rede/PC)
export async function getLiveProducts(opts?: CacheReadOptions): Promise<Product[]> {
  return withApiCache(
    'live-products',
    CacheTTL.products,
    async () => {
      const response = await apiFetch(`${API_URL}/api/products`);
      const result = await response.json();
      if (!response.ok || !result?.success || !Array.isArray(result.data)) {
        return { ok: false, data: [] };
      }
      void warmProductCache(result.data);
      return { ok: true, data: result.data as Product[] };
    },
    [],
    opts,
  );
}

export async function getCategories(opts?: CacheReadOptions): Promise<ProductCategory[]> {
  return withApiCache(
    'product-categories',
    CacheTTL.categories,
    async () => {
      const response = await fetch(`${API_URL}/api/categories`);
      const result = await response.json();
      if (!response.ok || !result?.success || !Array.isArray(result.data)) {
        return { ok: false, data: [] };
      }
      return { ok: true, data: result.data as ProductCategory[] };
    },
    [],
    opts,
  );
}

/** Filtra produtos pela categoria (a listagem da API traz category_id). */
export async function getProductsByCategory(
  categoryId: string,
  opts?: CacheReadOptions,
): Promise<Product[]> {
  const id = categoryId.trim();
  if (!id) return [];
  const products = await getLiveProducts(opts);
  return products.filter(
    (product) => product.category?.id === id || product.category_id === id,
  );
}

export async function getProductById(id: string, opts?: CacheReadOptions): Promise<Product | null> {
  return withApiCache(
    cacheKeyProduct(id),
    CacheTTL.productDetail,
    async () => {
      const response = await apiFetch(`${API_URL}/api/products/${encodeURIComponent(id)}`);
      const result = await response.json();
      if (response.ok && result.success) return { ok: true, data: result.data as Product };
      return { ok: false, data: null };
    },
    null,
    opts,
  );
}

export type LiveStore = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  cover_url: string | null;
  rating_avg: number;
  review_count: number;
  verified: boolean;
  categoria?: string;
  created_at?: string;
  address?: string | null;
  phone?: string | null;
  opening_hours?: string | null;
  fulfillment_mode?: StoreFulfillmentMode;
};

export async function getLiveStores(opts?: CacheReadOptions): Promise<LiveStore[]> {
  return withApiCache(
    'live-stores',
    CacheTTL.stores,
    async () => {
      const response = await fetch(`${API_URL}/api/stores`);
      const result = await response.json();
      if (result.success && Array.isArray(result.data)) {
        await Promise.all(
          (result.data as LiveStore[]).map((store) => setCacheValue(cacheKeyStore(store.id), store)),
        );
        return { ok: true, data: result.data as LiveStore[] };
      }
      return { ok: false, data: [] };
    },
    [],
    opts,
  );
}

export async function getStoreById(id: string, opts?: CacheReadOptions): Promise<LiveStore | null> {
  return withApiCache(
    cacheKeyStore(id),
    CacheTTL.storeDetail,
    async () => {
      const response = await fetch(`${API_URL}/api/stores/${encodeURIComponent(id)}`);
      const result = await response.json();
      if (response.ok && result.success) return { ok: true, data: result.data as LiveStore };
      return { ok: false, data: null };
    },
    null,
    opts,
  );
}

export async function getStoreProducts(
  storeId: string,
  opts?: CacheReadOptions,
): Promise<Product[]> {
  return withApiCache(
    cacheKeyStoreProducts(storeId),
    CacheTTL.storeProducts,
    async () => {
      const response = await fetch(
        `${API_URL}/api/stores/${encodeURIComponent(storeId)}/products`,
      );
      const result = await response.json();
      if (response.ok && result.success && Array.isArray(result.data)) {
        void warmProductCache(result.data);
        return { ok: true, data: result.data as Product[] };
      }
      return { ok: false, data: [] };
    },
    [],
    opts,
  );
}

// ─── AUTH / CLIENTES ─────────────────────────────────────────────────────────

export type CustomerAddress = {
  label: string;
  details: string;
  latitude: number | null;
  longitude: number | null;
};

export type CustomerAgency = {
  id: string;
  nome: string;
  verified: boolean;
  logo_url?: string | null;
};

export type Customer = {
  id: string;
  nome: string;
  apelido: string;
  genero: 'masculino' | 'feminino';
  telefone: string;
  foto_url?: string | null;
  account_type?: 'user' | 'agency';
  agency_id?: string | null;
  agency?: CustomerAgency | null;
  endereco: CustomerAddress | null;
  created_at: string;
};

export type AuthSession = {
  token: string;
  expires_at: string;
  user: Customer;
};

export type ApiResult<T> =
  | { success: true; data: T; message?: string }
  | {
      success: false;
      message: string;
      /** unauthorized = sessão morta; network = manter token; other = erro genérico */
      reason?: 'unauthorized' | 'network' | 'other';
    };

async function parseAuthResponse<T>(response: Response): Promise<ApiResult<T>> {
  const result = await response.json().catch(() => ({}));
  if (response.ok && result.success) {
    return { success: true, data: result.data as T, message: result.message };
  }
  if (response.status === 401 || response.status === 403) {
    return {
      success: false,
      reason: 'unauthorized',
      message:
        typeof result.message === 'string'
          ? result.message
          : 'Sessão inválida ou expirada.',
    };
  }
  if (response.status >= 500 || response.status === 408 || response.status === 429) {
    return {
      success: false,
      reason: 'network',
      message: 'Sem ligação ao servidor.',
    };
  }
  return {
    success: false,
    reason: 'other',
    message: typeof result.message === 'string' ? result.message : 'Não foi possível concluir o pedido.',
  };
}

export async function registerCustomer(input: {
  nome: string;
  apelido: string;
  genero: 'masculino' | 'feminino';
  telefone: string;
  senha: string;
}): Promise<ApiResult<AuthSession>> {
  try {
    const response = await authFetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return parseAuthResponse<AuthSession>(response);
  } catch (error) {
    console.log('Erro ao registar conta:', error);
    return { success: false, message: 'Sem ligação ao servidor. Verifique a rede e o backend.' };
  }
}

export async function loginCustomer(input: {
  telefone: string;
  senha: string;
}): Promise<ApiResult<AuthSession>> {
  try {
    const response = await authFetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return parseAuthResponse<AuthSession>(response);
  } catch (error) {
    console.log('Erro ao entrar na conta:', error);
    return { success: false, message: 'Sem ligação ao servidor. Verifique a rede e o backend.' };
  }
}

export async function fetchCurrentCustomer(token: string): Promise<ApiResult<Customer>> {
  const attempt = async (): Promise<ApiResult<Customer>> => {
    const response = await authFetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseAuthResponse<Customer>(response);
  };

  try {
    return await attempt();
  } catch (firstError) {
    // Rede lenta / troca de Wi‑Fi: uma segunda tentativa antes de desistir.
    try {
      await new Promise((resolve) => setTimeout(resolve, 700));
      return await attempt();
    } catch (error) {
      console.log('Erro ao carregar perfil:', error || firstError);
      return {
        success: false,
        reason: 'network',
        message: 'Sem ligação ao servidor.',
      };
    }
  }
}

export async function updateCustomerProfile(
  token: string,
  input: {
    nome?: string;
    apelido?: string;
    genero?: 'masculino' | 'feminino';
    telefone?: string;
  },
): Promise<ApiResult<Customer>> {
  try {
    const response = await fetch(`${API_URL}/api/auth/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(input),
    });
    return parseAuthResponse<Customer>(response);
  } catch (error) {
    console.log('Erro ao atualizar perfil:', error);
    return { success: false, message: 'Sem ligação ao servidor.' };
  }
}

export async function saveCustomerAddress(
  token: string,
  input: {
    label: string;
    details: string;
    latitude?: number | null;
    longitude?: number | null;
  },
): Promise<ApiResult<Customer>> {
  try {
    const response = await fetch(`${API_URL}/api/auth/address`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(input),
    });
    return parseAuthResponse<Customer>(response);
  } catch (error) {
    console.log('Erro ao guardar endereço:', error);
    return { success: false, message: 'Sem ligação ao servidor.' };
  }
}

export async function changeCustomerPassword(
  token: string,
  input: {
    senhaAtual: string;
    novaSenha: string;
  },
): Promise<ApiResult<{ ok: true }>> {
  try {
    const response = await fetch(`${API_URL}/api/auth/password`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(input),
    });
    return parseAuthResponse<{ ok: true }>(response);
  } catch (error) {
    console.log('Erro ao alterar senha:', error);
    return { success: false, message: 'Sem ligação ao servidor.' };
  }
}

export async function uploadCustomerPhoto(
  token: string,
  imageUri: string,
): Promise<ApiResult<Customer>> {
  try {
    const form = new FormData();
    const rawName = imageUri.split('/').pop() || 'avatar.jpg';
    const name = rawName.replace(/\.\w+$/, '') + '.jpg';
    form.append('photo', {
      uri: imageUri,
      name,
      type: 'image/jpeg',
    } as unknown as Blob);

    const response = await fetch(`${API_URL}/api/auth/photo`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    return parseAuthResponse<Customer>(response);
  } catch (error) {
    console.log('Erro ao enviar foto de perfil:', error);
    return { success: false, message: 'Sem ligação ao servidor.' };
  }
}

export async function deleteCustomerPhoto(token: string): Promise<ApiResult<Customer>> {
  try {
    const response = await fetch(`${API_URL}/api/auth/photo`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseAuthResponse<Customer>(response);
  } catch (error) {
    console.log('Erro ao remover foto de perfil:', error);
    return { success: false, message: 'Sem ligação ao servidor.' };
  }
}

export async function logoutCustomer(token: string): Promise<void> {
  try {
    await fetch(`${API_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    console.log('Erro ao sair da conta:', error);
  }
}

export async function deleteCustomerAccount(
  token: string,
  input?: { senha?: string },
): Promise<ApiResult<{ ok: true }>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  const body = JSON.stringify(input?.senha ? { senha: input.senha } : {});

  try {
    // Preferir POST: mais compatível em React Native / proxies do que DELETE com body.
    let response = await fetch(`${API_URL}/api/auth/account/delete`, {
      method: 'POST',
      headers,
      body,
    });

    // Fallback para builds antigas do backend que só tenham DELETE.
    if (response.status === 404) {
      response = await fetch(`${API_URL}/api/auth/account`, {
        method: 'DELETE',
        headers,
        body,
      });
    }

    return parseAuthResponse<{ ok: true }>(response);
  } catch (error) {
    console.log('Erro ao eliminar conta:', error);
    return { success: false, message: 'Sem ligação ao servidor.' };
  }
}

/** Sincroniza o carrinho local com o servidor (só com sessão). */
export async function syncCartToServer(
  token: string | null | undefined,
  items: Array<{
    productId?: string;
    id?: string;
    variantId?: string;
    title: string;
    variantLabel?: string;
    image?: string;
    price: number;
    quantity: number;
  }>,
): Promise<void> {
  if (!token) return;
  try {
    const payload = items
      .map((item) => {
        const productId = (item.productId || item.id || '').split(':')[0];
        if (!productId) return null;
        return {
          product_id: productId,
          variant_id: item.variantId || null,
          title: item.title,
          variant_label: item.variantLabel || null,
          image_url: item.image || null,
          unit_price: Number(item.price) || 0,
          quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
        };
      })
      .filter(Boolean);

    await fetch(`${API_URL}/api/cart`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ items: payload }),
    });
  } catch (error) {
    console.log('Erro ao sincronizar carrinho:', error);
  }
}

// ─── PEDIDOS ─────────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'pending'
  | 'preparing'
  | 'picked'
  | 'on_way'
  | 'arrived'
  | 'delivered'
  | 'cancelled';

export type OrderItem = {
  id: string;
  product_id: string;
  variant_id: string | null;
  title: string;
  variant_label: string | null;
  image_url: string | null;
  unit_price: number;
  quantity: number;
  line_total: number;
};

export type Order = {
  id: string;
  order_number: string;
  status: OrderStatus;
  fulfillment_method: 'entrega' | 'recolha';
  payment_method: 'entrega' | 'gpay';
  payment_status: 'pending' | 'paid' | 'refunded';
  buyer: {
    nome: string;
    apelido: string;
    telefone: string;
  };
  delivery: {
    label: string;
    address: string;
    latitude: number | null;
    longitude: number | null;
  } | null;
  store: {
    id: string | null;
    name: string;
    address?: string | null;
    phone?: string | null;
    opening_hours?: string | null;
  };
  items: OrderItem[];
  subtotal: number;
  delivery_fee: number;
  discount_amount?: number;
  promo_code?: string | null;
  total: number;
  cancelled_at: string | null;
  delivered_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type PromoCodeValidation = {
  code: string;
  name?: string | null;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  discount_amount: number;
  eligible_subtotal?: number;
  description?: string | null;
  used_count?: number;
  max_uses?: number | null;
};

export async function validatePromoCode(
  token: string,
  input: {
    code: string;
    subtotal: number;
    productIds?: string[];
    items?: Array<{ productId: string; subtotal: number }>;
  },
): Promise<ApiResult<PromoCodeValidation>> {
  try {
    const response = await fetch(`${API_URL}/api/promo-codes/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        code: input.code.trim(),
        subtotal: Math.max(0, Math.round(Number(input.subtotal) || 0)),
        product_ids: input.productIds || [],
        items: (input.items || []).map((item) => ({
          productId: item.productId,
          subtotal: Math.max(0, Math.round(Number(item.subtotal) || 0)),
        })),
      }),
    });
    return parseAuthResponse<PromoCodeValidation>(response);
  } catch (error) {
    console.log('Erro ao validar código promocional:', error);
    return { success: false, message: 'Sem ligação ao servidor.' };
  }
}

export async function createOrder(
  token: string,
  input: {
    productId: string;
    variantId?: string;
    quantity: number;
    fulfillment_method: 'entrega' | 'recolha';
    payment_method: 'entrega' | 'gpay';
    buyer_nome: string;
    buyer_apelido?: string;
    buyer_telefone: string;
    variant_label?: string;
    promo_code?: string;
    /** Limite do desconto neste pedido (ex.: resto de um cupom de valor fixo). */
    promo_max_discount?: number;
    /** Se false, aplica o desconto sem consumir uma utilização do código. */
    promo_consume?: boolean;
  },
): Promise<ApiResult<Order>> {
  try {
    const response = await fetch(`${API_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(input),
    });
    return parseAuthResponse<Order>(response);
  } catch (error) {
    console.log('Erro ao criar pedido:', error);
    return { success: false, message: 'Sem ligação ao servidor. Verifique a rede e o backend.' };
  }
}

export type OrderBatchResult = {
  orders: Array<{
    id: string;
    order_number: string;
    store_id?: string | null;
    store_name?: string | null;
    subtotal: number;
    delivery_fee: number;
    discount_amount: number;
    total: number;
  }>;
  total: number;
  discount_amount: number;
  idempotency_key: string;
};

export async function createOrderBatch(
  token: string,
  input: {
    idempotency_key: string;
    items: Array<{
      productId: string;
      variantId?: string;
      variantLabel?: string;
      quantity: number;
    }>;
    fulfillment_method: 'entrega' | 'recolha';
    payment_method: 'entrega' | 'gpay';
    buyer_nome: string;
    buyer_apelido?: string;
    buyer_telefone: string;
    promo_code?: string;
  },
): Promise<ApiResult<OrderBatchResult>> {
  try {
    const response = await fetch(`${API_URL}/api/orders/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': input.idempotency_key,
      },
      body: JSON.stringify(input),
    });
    return parseAuthResponse<OrderBatchResult>(response);
  } catch (error) {
    console.log('Erro ao criar pedidos em lote:', error);
    return { success: false, message: 'Sem ligação ao servidor. Pode tentar novamente com segurança.' };
  }
}

export async function getMyOrders(
  token: string,
  status?: 'active' | OrderStatus,
): Promise<ApiResult<Order[]>> {
  try {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    const response = await apiFetch(`${API_URL}/api/orders${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseAuthResponse<Order[]>(response);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { success: false, message: 'Sem ligação ao servidor.' };
    }
    console.log('Erro ao listar pedidos:', error);
    return { success: false, message: 'Sem ligação ao servidor.' };
  }
}

export async function getOrderById(token: string, orderId: string): Promise<ApiResult<Order>> {
  try {
    const response = await apiFetch(`${API_URL}/api/orders/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseAuthResponse<Order>(response);
  } catch (error) {
    console.log('Erro ao carregar pedido:', error);
    return { success: false, message: 'Sem ligação ao servidor.' };
  }
}

export async function cancelOrder(token: string, orderId: string): Promise<ApiResult<Order>> {
  try {
    const response = await apiFetch(`${API_URL}/api/orders/${encodeURIComponent(orderId)}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseAuthResponse<Order>(response);
  } catch (error) {
    console.log('Erro ao cancelar pedido:', error);
    return { success: false, message: 'Sem ligação ao servidor.' };
  }
}

export type OrderReturn = {
  id: string;
  order_id: string;
  customer_id?: string;
  order_item_id?: string | null;
  reason: string;
  photo_urls: string[];
  status: 'pending' | 'approved' | 'rejected' | 'refunded';
  admin_note?: string | null;
  created_at: string;
  updated_at?: string;
};

export async function getOrderReturns(
  token: string,
  orderId: string,
): Promise<ApiResult<OrderReturn[]>> {
  try {
    const response = await fetch(
      `${API_URL}/api/orders/${encodeURIComponent(orderId)}/returns`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return parseAuthResponse<OrderReturn[]>(response);
  } catch (error) {
    console.log('Erro ao listar devoluções:', error);
    return { success: false, message: 'Sem ligação ao servidor.' };
  }
}

export async function submitOrderReturn(
  token: string,
  orderId: string,
  input: {
    reason: string;
    order_item_id?: string;
    photo_uris: string[];
  },
): Promise<ApiResult<OrderReturn>> {
  try {
    const form = new FormData();
    form.append('reason', input.reason.trim());
    if (input.order_item_id) form.append('order_item_id', input.order_item_id);
    for (const uri of (input.photo_uris || []).slice(0, 3)) {
      if (!uri || /^https?:\/\//i.test(uri)) continue;
      const rawName = uri.split('/').pop() || 'return.jpg';
      const name = rawName.replace(/\.\w+$/, '') + '.jpg';
      form.append('photos', {
        uri,
        name,
        type: 'image/jpeg',
      } as unknown as Blob);
    }

    const response = await fetch(
      `${API_URL}/api/orders/${encodeURIComponent(orderId)}/returns`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      },
    );
    return parseAuthResponse<OrderReturn>(response);
  } catch (error) {
    console.log('Erro ao pedir devolução:', error);
    return { success: false, message: 'Sem ligação ao servidor.' };
  }
}

export type MyReviewsPayload = {
  products: Array<{
    id: string;
    product_id: string;
    order_id?: string | null;
    order_item_id?: string | null;
    store_id?: string | null;
    user_name: string;
    user_avatar?: string | null;
    rating: number;
    comment?: string | null;
    photo_urls?: string[];
    created_at?: string;
    updated_at?: string;
    product_title?: string;
    product_image?: string | null;
    store_name?: string;
  }>;
  stores: Array<{
    id: string;
    store_id: string;
    order_id?: string | null;
    user_name: string;
    user_avatar?: string | null;
    rating: number;
    comment?: string | null;
    photo_urls?: string[];
    created_at?: string;
    updated_at?: string;
    store_name?: string;
    store_logo?: string | null;
  }>;
};

export async function getMyReviews(token: string): Promise<ApiResult<MyReviewsPayload>> {
  try {
    const response = await fetch(`${API_URL}/api/me/reviews`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseAuthResponse<MyReviewsPayload>(response);
  } catch (error) {
    console.log('Erro ao listar avaliações:', error);
    return { success: false, message: 'Sem ligação ao servidor.' };
  }
}

export async function submitProductReview(
  token: string,
  input: {
    product_id: string;
    order_id: string;
    order_item_id?: string;
    rating: number;
    comment?: string;
    user_avatar?: string | null;
    photo_uris?: string[];
  },
): Promise<ApiResult<MyReviewsPayload['products'][number]>> {
  try {
    const form = new FormData();
    form.append('product_id', input.product_id);
    form.append('order_id', input.order_id);
    // Evitar IDs sintéticos (`orderId:productId`) — o backend rejeita e a avaliação falha.
    if (input.order_item_id && !input.order_item_id.includes(':')) {
      form.append('order_item_id', input.order_item_id);
    }
    form.append('rating', String(input.rating));
    if (input.comment?.trim()) form.append('comment', input.comment.trim());
    if (input.user_avatar && /^https?:\/\//i.test(input.user_avatar)) {
      form.append('user_avatar', input.user_avatar);
    }
    const remotePhotos = (input.photo_uris || []).filter((uri) => /^https?:\/\//i.test(uri));
    if (remotePhotos.length) {
      form.append('existing_photo_urls', JSON.stringify(remotePhotos.slice(0, 3)));
    }
    for (const uri of (input.photo_uris || []).slice(0, 3)) {
      if (!uri || /^https?:\/\//i.test(uri)) continue;
      const rawName = uri.split('/').pop() || 'review.jpg';
      const name = rawName.replace(/\.\w+$/, '') + '.jpg';
      form.append('photos', {
        uri,
        name,
        type: 'image/jpeg',
      } as unknown as Blob);
    }

    const response = await fetch(`${API_URL}/api/reviews/product`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const parsed = await parseAuthResponse<MyReviewsPayload['products'][number]>(response);
    if (!parsed.success && __DEV__) {
      console.log('Erro ao publicar avaliação:', parsed.message, 'status=', response.status);
    }
    return parsed;
  } catch (error) {
    console.log('Erro ao publicar avaliação:', error);
    return { success: false, message: 'Sem ligação ao servidor.' };
  }
}

export async function submitStoreReview(
  token: string,
  input: {
    store_id: string;
    order_id: string;
    rating: number;
    comment?: string;
    user_avatar?: string | null;
    photo_uris?: string[];
  },
): Promise<ApiResult<MyReviewsPayload['stores'][number]>> {
  try {
    const form = new FormData();
    form.append('store_id', input.store_id);
    form.append('order_id', input.order_id);
    form.append('rating', String(input.rating));
    if (input.comment?.trim()) form.append('comment', input.comment.trim());
    if (input.user_avatar && /^https?:\/\//i.test(input.user_avatar)) {
      form.append('user_avatar', input.user_avatar);
    }
    const remotePhotos = (input.photo_uris || []).filter((uri) => /^https?:\/\//i.test(uri));
    if (remotePhotos.length) {
      form.append('existing_photo_urls', JSON.stringify(remotePhotos.slice(0, 3)));
    }
    for (const uri of (input.photo_uris || []).slice(0, 3)) {
      if (!uri || /^https?:\/\//i.test(uri)) continue;
      const rawName = uri.split('/').pop() || 'review.jpg';
      const name = rawName.replace(/\.\w+$/, '') + '.jpg';
      form.append('photos', {
        uri,
        name,
        type: 'image/jpeg',
      } as unknown as Blob);
    }

    const response = await fetch(`${API_URL}/api/reviews/store`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    return parseAuthResponse(response);
  } catch (error) {
    console.log('Erro ao publicar avaliação da loja:', error);
    return { success: false, message: 'Sem ligação ao servidor.' };
  }
}

// ─── GCOIN / GPAY ────────────────────────────────────────────────────────────

export type GcoinTransaction = {
  id: string;
  customer_id: string;
  type: string;
  amount: number;
  balance_after: number;
  reason: string | null;
  reference_id: string | null;
  created_by: string;
  created_at: string;
};

export type GcoinWallet = {
  balance: number;
  updated_at: string;
  cashback_total: number;
  transactions: GcoinTransaction[];
};

export async function getGcoinWallet(token: string): Promise<ApiResult<GcoinWallet>> {
  try {
    const response = await fetch(`${API_URL}/api/gcoin/wallet`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseAuthResponse<GcoinWallet>(response);
  } catch (error) {
    console.log('Erro ao carregar carteira GCoin:', error);
    return { success: false, message: 'Sem ligação ao servidor.' };
  }
}

// ─── NOTIFICAÇÕES / FOLLOWS ──────────────────────────────────────────────────

export type AppNotificationType =
  | 'new_product'
  | 'store_promo'
  | 'gmarket_promo'
  | 'delivery_status'
  | 'ticket_confirmed'
  | 'support_message';

export type AppNotification = {
  id: string;
  type: AppNotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  image_url?: string | null;
  read_at?: string | null;
  created_at: string;
};

export async function getStoreFollowStatus(
  token: string,
  storeId: string,
): Promise<ApiResult<{ following: boolean; followers_count: number }>> {
  try {
    const response = await fetch(`${API_URL}/api/stores/${encodeURIComponent(storeId)}/follow`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseAuthResponse(response);
  } catch (error) {
    console.log('Erro ao verificar follow:', error);
    return { success: false, message: 'Sem ligação ao servidor.' };
  }
}

export async function followStore(token: string, storeId: string): Promise<ApiResult<{ following: boolean }>> {
  try {
    const response = await fetch(`${API_URL}/api/stores/${encodeURIComponent(storeId)}/follow`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseAuthResponse(response);
  } catch (error) {
    console.log('Erro ao seguir loja:', error);
    return { success: false, message: 'Sem ligação ao servidor.' };
  }
}

export async function unfollowStore(token: string, storeId: string): Promise<ApiResult<{ following: boolean }>> {
  try {
    const response = await fetch(`${API_URL}/api/stores/${encodeURIComponent(storeId)}/follow`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseAuthResponse(response);
  } catch (error) {
    console.log('Erro ao deixar de seguir:', error);
    return { success: false, message: 'Sem ligação ao servidor.' };
  }
}

export type FollowedStoreItem = {
  store_id: string;
  followed_at: string;
  store: LiveStore;
};

/** Lojas seguidas — inclui logo_url / cover_url do painel admin. */
export async function getFollowedStores(token: string): Promise<ApiResult<FollowedStoreItem[]>> {
  try {
    const response = await fetch(`${API_URL}/api/me/follows`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseAuthResponse(response);
  } catch (error) {
    console.log('Erro ao listar lojas seguidas:', error);
    return { success: false, message: 'Sem ligação ao servidor.' };
  }
}

export async function registerPushToken(
  token: string,
  pushToken: string,
  platform?: string,
): Promise<ApiResult<{ ok?: boolean }>> {
  try {
    const response = await fetch(`${API_URL}/api/me/push-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ token: pushToken, platform }),
    });
    return parseAuthResponse(response);
  } catch (error) {
    console.log('Erro ao registar push token:', error);
    return { success: false, message: 'Sem ligação ao servidor.' };
  }
}

/** Remove o token push desta conta (evita alertas após logout / troca de conta). */
export async function unregisterPushToken(
  token: string,
  pushToken: string,
): Promise<ApiResult<{ ok?: boolean }>> {
  try {
    const response = await fetch(`${API_URL}/api/me/push-token`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ token: pushToken }),
    });
    return parseAuthResponse(response);
  } catch (error) {
    console.log('Erro ao remover push token:', error);
    return { success: false, message: 'Sem ligação ao servidor.' };
  }
}

export async function getMyNotifications(
  token: string,
  limit = 50,
): Promise<ApiResult<AppNotification[]>> {
  try {
    const response = await apiFetch(
      `${API_URL}/api/me/notifications?limit=${encodeURIComponent(String(limit))}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return parseAuthResponse(response);
  } catch (error) {
    console.log('Erro ao listar notificações:', error);
    return { success: false, message: 'Sem ligação ao servidor.' };
  }
}

export async function getUnreadNotificationCount(token: string): Promise<ApiResult<{ count: number }>> {
  try {
    const response = await fetch(`${API_URL}/api/me/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseAuthResponse(response);
  } catch (error) {
    console.log('Erro ao contar notificações:', error);
    return { success: false, message: 'Sem ligação ao servidor.' };
  }
}

export async function markNotificationRead(
  token: string,
  notificationId: string,
): Promise<ApiResult<AppNotification>> {
  try {
    const response = await fetch(
      `${API_URL}/api/me/notifications/${encodeURIComponent(notificationId)}/read`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    return parseAuthResponse(response);
  } catch (error) {
    console.log('Erro ao marcar notificação:', error);
    return { success: false, message: 'Sem ligação ao servidor.' };
  }
}

export async function markAllNotificationsRead(token: string): Promise<ApiResult<{ ok?: boolean }>> {
  try {
    const response = await fetch(`${API_URL}/api/me/notifications/read-all`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseAuthResponse(response);
  } catch (error) {
    console.log('Erro ao marcar todas:', error);
    return { success: false, message: 'Sem ligação ao servidor.' };
  }
}

// ─── CHAT DE SUPORTE ─────────────────────────────────────────────────────────

export type SupportMessageImage = {
  id?: string;
  url: string;
  width?: number | null;
  height?: number | null;
};

export type SupportMessage = {
  id: string;
  conversation_id: string;
  client_message_id?: string | null;
  body?: string | null;
  images?: Array<SupportMessageImage | string> | null;
  attachment_urls?: string[] | null;
  sender?: 'customer' | 'admin' | 'support' | 'system' | string;
  sender_type?: 'customer' | 'admin' | 'support' | 'system' | string;
  sender_id?: string | null;
  read_at?: string | null;
  created_at: string;
  updated_at?: string | null;
};

export type SupportConversation = {
  id: string;
  status?: 'open' | 'closed' | 'pending' | string;
  unread_count?: number;
  customer_read_at?: string | null;
  admin_read_at?: string | null;
  last_message?: SupportMessage | null;
  last_message_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type SupportMessagesPage = {
  messages: SupportMessage[];
  has_more: boolean;
  next_before: string | null;
};

export async function getSupportConversation(
  token: string,
): Promise<ApiResult<SupportConversation>> {
  try {
    const response = await apiFetch(`${API_URL}/api/me/support/conversation`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseAuthResponse<SupportConversation>(response);
  } catch (error) {
    console.log('Erro ao carregar conversa de suporte:', error);
    return { success: false, message: 'Sem ligação ao servidor.' };
  }
}

export async function getSupportMessages(
  token: string,
  conversationId: string,
  options?: { before?: string | null; limit?: number },
): Promise<ApiResult<SupportMessagesPage>> {
  try {
    const params = new URLSearchParams();
    params.set('limit', String(Math.max(1, Math.min(options?.limit ?? 30, 100))));
    if (options?.before) params.set('before', options.before);
    const response = await apiFetch(
      `${API_URL}/api/me/support/conversations/${encodeURIComponent(conversationId)}/messages?${params}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const parsed = await parseAuthResponse<
      SupportMessage[] | {
        messages?: SupportMessage[];
        items?: SupportMessage[];
        has_more?: boolean;
        next_before?: string | null;
      }
    >(response);
    if (!parsed.success) return parsed;

    const raw = parsed.data;
    const messages = Array.isArray(raw) ? raw : raw.messages || raw.items || [];
    const explicitHasMore = Array.isArray(raw) ? undefined : raw.has_more;
    const explicitNext = Array.isArray(raw) ? undefined : raw.next_before;
    const oldest = [...messages].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )[0];
    return {
      success: true,
      data: {
        messages,
        has_more: explicitHasMore ?? messages.length >= (options?.limit ?? 30),
        next_before: explicitNext ?? oldest?.id ?? null,
      },
      message: parsed.message,
    };
  } catch (error) {
    console.log('Erro ao listar mensagens de suporte:', error);
    return { success: false, message: 'Sem ligação ao servidor.' };
  }
}

export async function sendSupportMessage(
  token: string,
  conversationId: string,
  input: {
    body?: string;
    client_message_id: string;
    image_uris?: string[];
    audio_uri?: string | null;
  },
): Promise<ApiResult<SupportMessage>> {
  try {
    const form = new FormData();
    if (input.body?.trim()) form.append('body', input.body.trim());
    form.append('client_message_id', input.client_message_id);
    for (const uri of (input.image_uris || []).slice(0, 3)) {
      if (!uri || /^https?:\/\//i.test(uri)) continue;
      const rawName = uri.split('/').pop() || 'support.jpg';
      const name = rawName.replace(/\.\w+$/, '') + '.jpg';
      form.append('attachments', {
        uri,
        name,
        type: 'image/jpeg',
      } as unknown as Blob);
    }
    if (input.audio_uri) {
      const cleanUri = input.audio_uri.split('?')[0];
      const extension = cleanUri.split('.').pop()?.toLowerCase();
      const webm = extension === 'webm';
      const threeGp = extension === '3gp';
      form.append('attachments', {
        uri: input.audio_uri,
        name: `support-audio.${webm ? 'webm' : threeGp ? '3gp' : 'm4a'}`,
        type: webm ? 'audio/webm' : threeGp ? 'audio/3gpp' : 'audio/mp4',
      } as unknown as Blob);
    }
    const response = await apiFetch(
      `${API_URL}/api/me/support/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      },
    );
    return parseAuthResponse<SupportMessage>(response);
  } catch (error) {
    console.log('Erro ao enviar mensagem de suporte:', error);
    return { success: false, message: 'Sem ligação ao servidor.' };
  }
}

export async function markSupportConversationRead(
  token: string,
  conversationId: string,
): Promise<ApiResult<{ ok?: boolean; read_at?: string }>> {
  try {
    const response = await apiFetch(
      `${API_URL}/api/me/support/conversations/${encodeURIComponent(conversationId)}/read`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    return parseAuthResponse(response);
  } catch (error) {
    console.log('Erro ao marcar conversa de suporte como lida:', error);
    return { success: false, message: 'Sem ligação ao servidor.' };
  }
}

/**
 * Sessão de suporte sem conta.
 * Backend deve gravar display_name "Visitante" no painel admin.
 */
export async function getVisitorSupportConversation(
  deviceId: string,
): Promise<
  ApiResult<{
    token: string;
    conversation: SupportConversation;
    display_name: string;
  }>
> {
  try {
    const response = await apiFetch(`${API_URL}/api/support/visitor/conversation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: deviceId,
        display_name: 'Visitante',
      }),
    });
    return parseAuthResponse<{
      token: string;
      conversation: SupportConversation;
      display_name: string;
    }>(response);
  } catch (error) {
    console.log('Erro ao abrir suporte visitante:', error);
    return { success: false, message: 'Sem ligação ao servidor.' };
  }
}

// ─── RECOMENDAÇÕES / ATIVIDADES ──────────────────────────────────────────────

export type UserActivityAction =
  | 'view_category'
  | 'view_product'
  | 'search'
  | 'add_favorite'
  | 'remove_favorite'
  | 'add_cart'
  | 'remove_cart'
  | 'purchase'
  | 'share'
  | 'visit_store';

export type FavoriteCategory = {
  id: string;
  slug: string;
  name: string;
  score: number;
};

export type BecauseYouVisitedSection = {
  category: FavoriteCategory;
  title: string;
  products: Product[];
};

export type HomeRecommendations = {
  continueWatching: Product[];
  recommended: Product[];
  favoriteCategories: FavoriteCategory[];
  becauseYouVisited: BecauseYouVisitedSection[];
  basedOnSearches: { terms: string[]; products: Product[] };
  similarProducts: Product[];
  newProducts: Product[];
  popularProducts: Product[];
  popularInRegion: { region: string; products: Product[] };
  recommendedStores: LiveStore[];
  youMayLike: Product[];
  popularSearches: string[];
};

export type SmartSearchResult = {
  query: string;
  products: Product[];
  categories: FavoriteCategory[];
  stores: LiveStore[];
  suggestions: string[];
  history: string[];
  popularSearches: string[];
};

const EMPTY_HOME_RECOMMENDATIONS: HomeRecommendations = {
  continueWatching: [],
  recommended: [],
  favoriteCategories: [],
  becauseYouVisited: [],
  basedOnSearches: { terms: [], products: [] },
  similarProducts: [],
  newProducts: [],
  popularProducts: [],
  popularInRegion: { region: 'Guiné-Bissau', products: [] },
  recommendedStores: [],
  youMayLike: [],
  popularSearches: [],
};

export async function trackUserActivity(
  token: string | null | undefined,
  input: {
    action: UserActivityAction;
    productId?: string | null;
    categoryId?: string | null;
    categoryName?: string | null;
    storeId?: string | null;
    searchTerm?: string | null;
  },
): Promise<void> {
  if (!token) return;
  try {
    await fetch(`${API_URL}/api/activities`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: input.action,
        productId: input.productId || undefined,
        categoryId: input.categoryId || undefined,
        categoryName: input.categoryName || undefined,
        storeId: input.storeId || undefined,
        searchTerm: input.searchTerm || undefined,
      }),
    });
  } catch (error) {
    console.log('Erro ao registar atividade:', error);
  }
}

export async function getHomeRecommendations(
  token?: string | null,
  opts?: {
    region?: string | null;
    cartProductIds?: string[];
    limit?: number;
  } & CacheReadOptions,
): Promise<HomeRecommendations> {
  const region = opts?.region || 'Guiné-Bissau';
  const limit = opts?.limit || 12;
  const cartSig = (opts?.cartProductIds || []).slice().sort().join(',') || 'none';
  const cacheKey = cacheKeyRecommendations(
    region,
    limit,
    cacheAuthScope(token),
    cartSig,
  );

  return withApiCache(
    cacheKey,
    CacheTTL.recommendations,
    async () => {
      const params = new URLSearchParams();
      if (opts?.region) params.set('region', opts.region);
      if (opts?.limit) params.set('limit', String(opts.limit));
      if (opts?.cartProductIds?.length) {
        params.set('cartProductIds', opts.cartProductIds.join(','));
      }
      const query = params.toString();
      const response = await fetch(
        `${API_URL}/api/recommendations/home${query ? `?${query}` : ''}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        },
      );
      const result = await response.json();
      if (!response.ok || !result.success || !result.data) {
        return { ok: false, data: EMPTY_HOME_RECOMMENDATIONS };
      }
      const data: HomeRecommendations = {
        ...EMPTY_HOME_RECOMMENDATIONS,
        ...result.data,
        basedOnSearches: result.data.basedOnSearches || { terms: [], products: [] },
        popularInRegion: result.data.popularInRegion || {
          region: opts?.region || 'Guiné-Bissau',
          products: [],
        },
      };
      const productBuckets = [
        data.continueWatching,
        data.recommended,
        data.similarProducts,
        data.newProducts,
        data.popularProducts,
        data.youMayLike,
        data.basedOnSearches.products,
        data.popularInRegion.products,
        ...data.becauseYouVisited.map((section) => section.products),
      ];
      void warmProductCache(productBuckets.flat());
      return { ok: true, data };
    },
    EMPTY_HOME_RECOMMENDATIONS,
    opts,
  );
}

export async function smartSearch(
  query: string,
  token?: string | null,
  limit = 20,
  opts?: CacheReadOptions,
): Promise<SmartSearchResult> {
  const empty: SmartSearchResult = {
    query,
    products: [],
    categories: [],
    stores: [],
    suggestions: [],
    history: [],
    popularSearches: [],
  };

  return withApiCache(
    cacheKeySearch(query, limit, cacheAuthScope(token)),
    CacheTTL.search,
    async () => {
      const params = new URLSearchParams({
        q: query,
        limit: String(limit),
      });
      const response = await fetch(`${API_URL}/api/search?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const result = await response.json();
      if (response.ok && result.success && result.data) {
        const data = result.data as SmartSearchResult;
        if (Array.isArray(data.products)) void warmProductCache(data.products);
        return { ok: true, data };
      }
      return { ok: false, data: empty };
    },
    empty,
    opts,
  );
}

export async function getPopularSearches(
  token?: string | null,
  opts?: CacheReadOptions,
): Promise<string[]> {
  return withApiCache(
    `popular-searches:${token ? 'u' : 'g'}`,
    CacheTTL.popularSearches,
    async () => {
      const response = await fetch(`${API_URL}/api/recommendations/popular-searches`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const result = await response.json();
      if (response.ok && result.success && Array.isArray(result.data)) {
        return { ok: true, data: result.data as string[] };
      }
      return { ok: false, data: [] };
    },
    [],
    opts,
  );
}

// ─── EVENTOS / BILHETES ──────────────────────────────────────────────────────

export type EventGuestDto = {
  id: string;
  name: string;
  image: string;
  sort_order?: number;
};

export type EventDto = {
  id: string;
  title: string;
  typeLabel: string;
  category: 'show' | 'festival' | 'atividade' | 'noite';
  age: string;
  venue: string;
  city: string;
  day: string;
  month: string;
  weekday: string;
  priceCfa: number;
  priceLabel: string;
  description: string;
  images: string[];
  featured: boolean;
  active?: boolean;
  paymentPhone: string;
  paymentLabel: string;
  gate: string;
  startTime: string;
  guests: EventGuestDto[];
};

export type TicketPaymentMethod = 'gpay' | 'transfer';

export type EventTicketDto = {
  id: string;
  eventId: string;
  customerId: string;
  qty: number;
  unitPrice: number;
  total: number;
  buyerNome: string;
  buyerTelefone: string;
  buyerGenero: 'masculino' | 'feminino';
  payment_method?: TicketPaymentMethod;
  status: 'awaiting_confirmation' | 'confirmed' | 'cancelled';
  code: string;
  qrPayload: string;
  created_at: string;
  updated_at?: string;
  confirmed_at?: string | null;
  event: {
    id: string;
    title: string;
    typeLabel: string;
    category: string;
    age: string;
    venue: string;
    city: string;
    day: string;
    month: string;
    weekday: string;
    priceLabel: string;
    images: string[];
    gate: string;
    startTime: string;
  } | null;
};

export async function getEvents(opts?: { featured?: boolean }): Promise<EventDto[]> {
  try {
    const q = opts?.featured ? '?featured=true' : '';
    const response = await fetch(`${API_URL}/api/events${q}`);
    const result = await response.json();
    if (response.ok && result.success && Array.isArray(result.data)) {
      return result.data as EventDto[];
    }
    return [];
  } catch (error) {
    console.log('Erro ao listar eventos:', error);
    return [];
  }
}

export async function getEventById(id: string): Promise<EventDto | null> {
  try {
    const response = await fetch(`${API_URL}/api/events/${encodeURIComponent(id)}`);
    const result = await response.json();
    if (response.ok && result.success && result.data) {
      return result.data as EventDto;
    }
    return null;
  } catch (error) {
    console.log('Erro ao carregar evento:', error);
    return null;
  }
}

export async function createTicketOrder(
  token: string,
  input: {
    eventId: string;
    qty: number;
    buyerNome: string;
    buyerTelefone: string;
    buyerGenero: 'masculino' | 'feminino';
    payment_method?: TicketPaymentMethod;
  },
): Promise<ApiResult<EventTicketDto>> {
  try {
    const response = await fetch(`${API_URL}/api/tickets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(input),
    });
    return parseAuthResponse<EventTicketDto>(response);
  } catch (error) {
    console.log('Erro ao criar bilhete:', error);
    return { success: false, message: 'Sem ligação ao servidor.' };
  }
}

/** `null` = falha de rede/servidor (manter cache offline). */
export async function getMyTickets(token: string): Promise<EventTicketDto[] | null> {
  try {
    const response = await fetch(`${API_URL}/api/tickets/mine`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await response.json();
    if (response.ok && result.success && Array.isArray(result.data)) {
      return result.data as EventTicketDto[];
    }
    return null;
  } catch (error) {
    console.log('Erro ao listar bilhetes:', error);
    return null;
  }
}
