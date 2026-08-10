import type { EventDto } from '@/components/api';
import type { EventItem } from './EventTicketCard';
import type { FeaturedConcert } from './FeaturedConcertCarousel';

export type EventCategory = EventItem['category'];

export type EventGuest = {
  id: string;
  name: string;
  image: string;
};

/** Modelo completo usado no detalhe e na listagem */
export type EventRecord = {
  id: string;
  title: string;
  venue: string;
  city: string;
  day: string;
  month: string;
  weekday: string;
  age: string;
  priceLabel: string;
  /** Preço unitário em CFA (0 = gratuito) */
  priceCfa: number;
  category: EventCategory;
  typeLabel: string;
  description: string;
  images: string[];
  /** Artistas / convidados do evento (opcional) */
  guests?: EventGuest[];
  featured?: boolean;
  paymentPhone?: string;
  paymentLabel?: string;
  gate?: string;
  startTime?: string;
};

export function eventDtoToRecord(dto: EventDto): EventRecord {
  return {
    id: dto.id,
    title: dto.title,
    venue: dto.venue,
    city: dto.city,
    day: dto.day,
    month: dto.month,
    weekday: dto.weekday,
    age: dto.age,
    priceLabel: dto.priceLabel,
    priceCfa: dto.priceCfa,
    category: dto.category,
    typeLabel: dto.typeLabel,
    description: dto.description,
    images: dto.images || [],
    guests: (dto.guests || []).map((g) => ({
      id: g.id,
      name: g.name,
      image: g.image,
    })),
    featured: dto.featured,
    paymentPhone: dto.paymentPhone,
    paymentLabel: dto.paymentLabel,
    gate: dto.gate,
    startTime: dto.startTime,
  };
}

export function recordsToFeatured(records: EventRecord[]): FeaturedConcert[] {
  return records
    .filter((e) => e.featured)
    .map((e) => ({
      id: e.id,
      title: e.title,
      type: e.typeLabel,
      age: e.age,
      city: e.city,
      day: e.day,
      month: e.month,
      weekday: e.weekday,
      priceLabel: e.priceLabel,
      images: e.images,
    }));
}

export function recordsToListItems(records: EventRecord[]): EventItem[] {
  return records
    .filter((e) => !e.featured)
    .map((e) => ({
      id: e.id,
      title: e.title,
      venue: e.venue,
      city: e.city,
      day: e.day,
      month: e.month,
      weekday: e.weekday,
      age: e.age,
      priceLabel: e.priceLabel,
      category: e.category,
      image: e.images[0] ?? '',
    }));
}

/** Cache em memória para abrir o detalhe de imediato (sem esperar a API). */
const eventCache = new Map<string, EventRecord>();

export function cacheEvents(records: EventRecord[]): void {
  for (const record of records) {
    eventCache.set(record.id, record);
  }
}

export function cacheEvent(record: EventRecord): void {
  eventCache.set(record.id, record);
}

export function getCachedEvent(id: string): EventRecord | undefined {
  return eventCache.get(id);
}

export function getEventById(id: string): EventRecord | undefined {
  return getCachedEvent(id);
}

export function formatCfa(amount: number): string {
  if (amount <= 0) return 'Gratuito';
  return `${amount.toLocaleString('pt-PT')} CFA`;
}

export function eventRecordToDto(record: EventRecord): EventDto {
  return {
    id: record.id,
    title: record.title,
    typeLabel: record.typeLabel,
    category: record.category,
    age: record.age,
    venue: record.venue,
    city: record.city,
    day: record.day,
    month: record.month,
    weekday: record.weekday,
    priceCfa: record.priceCfa,
    priceLabel: record.priceLabel,
    description: record.description,
    images: record.images,
    featured: !!record.featured,
    paymentPhone: record.paymentPhone || '',
    paymentLabel: record.paymentLabel || '',
    gate: record.gate || '',
    startTime: record.startTime || '',
    guests: (record.guests || []).map((g) => ({
      id: g.id,
      name: g.name,
      image: g.image,
    })),
  };
}

export async function resolveEventDto(id: string): Promise<EventDto | null> {
  const cached = getCachedEvent(id);
  if (cached) return eventRecordToDto(cached);

  try {
    const { getEventById: fetchEvent } = await import('@/components/api');
    const api = await fetchEvent(id);
    if (api) {
      cacheEvent(eventDtoToRecord(api));
      return api;
    }
  } catch {
    // sem fallback fake
  }
  return null;
}
