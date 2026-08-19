import type { StoreFulfillmentMode } from '@/components/api';

export type SellerApplicationStatus =
  | 'none'
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'needs_changes'
  | 'approved'
  | 'rejected'
  | 'accepted';

export type SupplierDeliveryMode = 'dropoff' | 'pickup' | 'tbd';

export type SupplierStockNow = 'yes' | 'no' | 'on_order';

export type StoreBusinessType = 'company' | 'physical_shop';

export type StorePayoutMethod = 'orange_money' | 'transfer' | 'other';

export type StoreDocumentKind =
  | 'id_front'
  | 'id_back'
  | 'selfie'
  | 'nif'
  | 'storefront'
  | 'other';

export type SellerAdSlot = 'hero' | 'feed' | 'grid' | 'search' | 'interstitial';

export type SellerAdStatus = 'pending' | 'approved' | 'rejected' | 'ended';

export type LocalImage = {
  uri: string;
  remote_url?: string | null;
};

export type StoreDocument = LocalImage & {
  kind: StoreDocumentKind;
};

export type SupplierApplication = {
  id?: string;
  status: SellerApplicationStatus;
  understood: boolean;
  what_sells: string;
  category_ids: string[];
  neighborhood: string;
  stock_now: SupplierStockNow | '';
  delivery_mode: SupplierDeliveryMode | '';
  photos: LocalImage[];
  asking_price?: string;
  whatsapp?: string;
  notes?: string;
  admin_message?: string | null;
  submitted_at?: string | null;
  updated_at?: string;
  local_only?: boolean;
};

export type StoreApplication = {
  id?: string;
  status: SellerApplicationStatus;
  business_type: StoreBusinessType | '';
  category_ids: string[];
  what_sells: string;
  has_physical_shop: boolean | null;
  trade_name: string;
  legal_name: string;
  nif: string;
  responsible_name: string;
  role?: string;
  store_phone: string;
  store_whatsapp?: string;
  email?: string;
  logo?: LocalImage | null;
  cover?: LocalImage | null;
  space_photos: LocalImage[];
  address_details: string;
  neighborhood: string;
  latitude?: number | null;
  longitude?: number | null;
  opening_hours: string;
  fulfillment_mode: StoreFulfillmentMode | '';
  delivery_zones?: string;
  prep_time?: string;
  payout_method: StorePayoutMethod | '';
  payout_holder: string;
  payout_account: string;
  payout_account_confirm: string;
  documents: StoreDocument[];
  terms_accepted: boolean;
  admin_message?: string | null;
  correction_steps?: string[];
  submitted_at?: string | null;
  updated_at?: string;
  local_only?: boolean;
  store_id?: string | null;
  store_slug?: string | null;
  store_verified?: boolean;
};

export type SellerStoreSummary = {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  cover_url?: string | null;
  verified?: boolean;
  address?: string | null;
  phone?: string | null;
  opening_hours?: string | null;
  fulfillment_mode?: StoreFulfillmentMode | null;
};

export type SellerAdRequest = {
  id: string;
  status: SellerAdStatus;
  target: 'product' | 'store';
  product_id?: string | null;
  slot: SellerAdSlot;
  start_date?: string;
  end_date?: string;
  image_uri?: string | null;
  notes?: string;
  created_at: string;
  local_only?: boolean;
};

export type SellerProductDraft = {
  id: string;
  title: string;
  price: string;
  stock: string;
  description: string;
  category_id: string;
  photos: LocalImage[];
  visible: boolean;
  created_at: string;
  local_only?: boolean;
};

export type SellerMe = {
  supplier: SupplierApplication;
  storeApplication: StoreApplication;
  store: SellerStoreSummary | null;
  ads: SellerAdRequest[];
  products: SellerProductDraft[];
};

export function emptySupplierApplication(): SupplierApplication {
  return {
    status: 'none',
    understood: false,
    what_sells: '',
    category_ids: [],
    neighborhood: '',
    stock_now: '',
    delivery_mode: '',
    photos: [],
    asking_price: '',
    whatsapp: '',
    notes: '',
    admin_message: null,
    submitted_at: null,
  };
}

export function emptyStoreApplication(): StoreApplication {
  return {
    status: 'none',
    business_type: '',
    category_ids: [],
    what_sells: '',
    has_physical_shop: null,
    trade_name: '',
    legal_name: '',
    nif: '',
    responsible_name: '',
    role: '',
    store_phone: '',
    store_whatsapp: '',
    email: '',
    logo: null,
    cover: null,
    space_photos: [],
    address_details: '',
    neighborhood: '',
    latitude: null,
    longitude: null,
    opening_hours: '',
    fulfillment_mode: '',
    delivery_zones: '',
    prep_time: '',
    payout_method: '',
    payout_holder: '',
    payout_account: '',
    payout_account_confirm: '',
    documents: [],
    terms_accepted: false,
    admin_message: null,
    correction_steps: [],
    submitted_at: null,
    store_id: null,
  };
}

export function isBlockingStatus(status: SellerApplicationStatus) {
  return status === 'submitted' || status === 'under_review' || status === 'accepted' || status === 'approved';
}

export function isOpenForEdit(status: SellerApplicationStatus) {
  return status === 'none' || status === 'draft' || status === 'needs_changes' || status === 'rejected';
}
