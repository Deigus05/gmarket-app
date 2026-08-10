import type { Property, PropertyRentalPeriod } from '@/components/api';
import { PROPERTY_PURPOSES, RENTAL_PERIODS } from '@/constants/propertySchema';

export function purposeLabel(purpose?: string | null): string {
  if (!purpose) return '';
  return PROPERTY_PURPOSES.find((p) => p.key === purpose)?.label || purpose;
}

export function rentalPeriodLabel(period?: PropertyRentalPeriod | string | null): string {
  if (!period) return '';
  return RENTAL_PERIODS.find((p) => p.key === period)?.label || period;
}

/** Ex.: "Arrendamento · Mensal" */
export function propertyPurposeBadge(property: Pick<Property, 'purpose' | 'rental_period' | 'type'>): string {
  const purpose = purposeLabel(property.purpose) || property.type || '';
  if (property.purpose === 'arrendamento') {
    const period = rentalPeriodLabel(property.rental_period || 'mensal');
    return period ? `${purpose} · ${period}` : purpose;
  }
  return purpose;
}

/** Sufixo de preço: /Mês, /Dia, ou vazio (venda). */
export function propertyPriceSuffix(property: Pick<Property, 'purpose' | 'rental_period'>): string {
  if (property.purpose !== 'arrendamento') return '';
  return property.rental_period === 'diaria' ? '/Dia' : '/Mês';
}

/** Ex.: "150.000 CFA/Mês · Negociável" */
export function formatPropertyPrice(
  property: Pick<Property, 'price' | 'purpose' | 'rental_period' | 'negotiable'>,
): string {
  const base = `${Number(property.price).toLocaleString()} CFA${propertyPriceSuffix(property)}`;
  return property.negotiable ? `${base} · Negociável` : base;
}

/** Label do campo de preço no anúncio/filtros. */
export function propertyPriceFieldLabel(
  purpose?: string,
  rentalPeriod?: PropertyRentalPeriod | string | null,
): string {
  if (purpose === 'arrendamento') {
    return rentalPeriod === 'diaria' ? 'Preço/Dia (CFA)' : 'Preço/Mês (CFA)';
  }
  return 'Preço (CFA)';
}

/** Nº de estrelas (1–5) para hotéis; 0 se não for hotel ou não tiver categoria. */
export function hotelStarCount(
  property: Pick<Property, 'subcategory_slug' | 'category' | 'type' | 'attributes'>,
): number {
  const slug = (property.subcategory_slug || '').toLowerCase();
  const category = (property.category || '').toLowerCase();
  const type = (property.type || '').toLowerCase();
  const isHotel = slug === 'hotel' || category.includes('hotel') || type.includes('hotel');
  if (!isHotel) return 0;

  const raw = property.attributes?.find((a) => a.key === 'estrelas')?.value;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 0;
  return Math.min(5, Math.round(n));
}
