import {
  createTicketOrder,
  type EventTicketDto,
  getEvents,
} from '@/components/api';
import {
  AccountDataKey,
  getAccountItem,
  getActiveAccountId,
  setAccountItem,
} from '@/lib/accountStorage';

let announceLock: Promise<void> = Promise.resolve();

function withAnnounceLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = announceLock.then(fn, fn);
  announceLock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function getLocalTickets(): Promise<EventTicketDto[]> {
  try {
    const userId = await getActiveAccountId();
    if (!userId) return [];
    const raw = await getAccountItem(AccountDataKey.localTickets);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as EventTicketDto[]) : [];
  } catch {
    return [];
  }
}

export async function saveLocalTicket(ticket: EventTicketDto): Promise<void> {
  const userId = await getActiveAccountId();
  if (!userId) return;
  const list = await getLocalTickets();
  const next = [ticket, ...list.filter((t) => t.id !== ticket.id && t.code !== ticket.code)];
  await setAccountItem(AccountDataKey.localTickets, JSON.stringify(next));
}

export async function removeLocalTicket(id: string): Promise<void> {
  const userId = await getActiveAccountId();
  if (!userId) return;
  const list = await getLocalTickets();
  await setAccountItem(
    AccountDataKey.localTickets,
    JSON.stringify(list.filter((t) => t.id !== id)),
  );
}

export async function setLocalTickets(tickets: EventTicketDto[]): Promise<void> {
  const userId = await getActiveAccountId();
  if (!userId) return;
  await setAccountItem(AccountDataKey.localTickets, JSON.stringify(tickets));
}

function isLocalTicket(ticket: EventTicketDto): boolean {
  return ticket.id.startsWith('local-') || ticket.code.startsWith('LOC');
}

function ticketKey(ticket: EventTicketDto): string {
  return ticket.id || `code:${ticket.code}`;
}

/**
 * Envia bilhetes guardados só no telemóvel para o backend (para aparecerem no admin).
 * Só sincroniza bilhetes da conta ativa.
 */
export async function syncLocalTicketsToServer(token: string): Promise<EventTicketDto[]> {
  const userId = await getActiveAccountId();
  if (!userId) return [];

  const local = await getLocalTickets();
  const pending = local.filter(
    (t) => isLocalTicket(t) && t.status === 'awaiting_confirmation',
  );
  if (!pending.length) return local;

  let apiEvents: Awaited<ReturnType<typeof getEvents>> = [];
  try {
    apiEvents = await getEvents();
  } catch {
    apiEvents = [];
  }

  const remaining: EventTicketDto[] = [];
  const synced: EventTicketDto[] = [];

  for (const ticket of local) {
    if (!isLocalTicket(ticket) || ticket.status !== 'awaiting_confirmation') {
      remaining.push(ticket);
      continue;
    }

    let eventId = ticket.eventId;
    const uuidLike =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        eventId,
      );

    if (!uuidLike && apiEvents.length) {
      const title = (ticket.event?.title || '').trim().toLowerCase();
      const match = apiEvents.find((e) => e.title.trim().toLowerCase() === title);
      if (match) eventId = match.id;
    }

    if (!uuidLike && eventId === ticket.eventId) {
      remaining.push(ticket);
      continue;
    }

    const result = await createTicketOrder(token, {
      eventId,
      qty: ticket.qty || 1,
      buyerNome: ticket.buyerNome,
      buyerTelefone: ticket.buyerTelefone,
      buyerGenero: ticket.buyerGenero,
      payment_method: ticket.payment_method || 'transfer',
    });

    if (result.success) {
      const serverTicket = {
        ...result.data,
        event: result.data.event || ticket.event,
      };
      synced.push(serverTicket);
    } else {
      remaining.push(ticket);
    }
  }

  await setLocalTickets([...synced, ...remaining]);
  return synced;
}

/** Junta remoto + cache local e grava o resultado para uso offline. */
export async function mergeTicketsWithLocal(
  remote: EventTicketDto[],
): Promise<EventTicketDto[]> {
  const userId = await getActiveAccountId();
  if (!userId) {
    return remote.filter((t) => t.status !== 'cancelled');
  }

  const local = await getLocalTickets();
  const remoteIds = new Set(remote.map((t) => t.id));
  const remoteCodes = new Set(remote.map((t) => t.code));

  const extras = local.filter(
    (t) =>
      isLocalTicket(t) &&
      !remoteIds.has(t.id) &&
      !remoteCodes.has(t.code),
  );

  const localByCode = new Map(local.map((t) => [t.code, t]));
  const mergedRemote = remote
    .filter((t) => t.status !== 'cancelled')
    .map((t) => {
      const cached = localByCode.get(t.code);
      if (!t.event && cached?.event) {
        return { ...t, event: cached.event };
      }
      return t;
    });

  const merged = [...mergedRemote, ...extras].sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at)),
  );

  await setLocalTickets(merged);
  return merged;
}

async function loadAnnouncedConfirmedIds(): Promise<Set<string>> {
  try {
    const raw = await getAccountItem(AccountDataKey.announcedTickets);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

async function saveAnnouncedConfirmedIds(ids: Set<string>) {
  await setAccountItem(
    AccountDataKey.announcedTickets,
    JSON.stringify([...ids].slice(-100)),
  );
}

/** Marca bilhetes como já anunciados (partilhado com a inbox). */
export async function markTicketsConfirmedAnnounced(ticketIds: string[]): Promise<void> {
  if (!ticketIds.length) return;
  await withAnnounceLock(async () => {
    const announced = await loadAnnouncedConfirmedIds();
    for (const id of ticketIds) announced.add(id);
    await saveAnnouncedConfirmedIds(announced);
  });
}

/**
 * Regista bilhetes que passaram a confirmados.
 * O alerta no telemóvel fica a cargo da inbox/push (evita alerta em duplicado).
 */
export async function announceNewlyConfirmedTickets(
  _previous: EventTicketDto[],
  next: EventTicketDto[],
  _options?: { skipLocalAlert?: boolean },
): Promise<number> {
  return withAnnounceLock(async () => {
    const announced = await loadAnnouncedConfirmedIds();

    for (const ticket of next) {
      if (ticket.status !== 'confirmed') continue;
      const key = ticketKey(ticket);
      if (announced.has(key) || announced.has(ticket.id)) continue;
      announced.add(key);
      announced.add(ticket.id);
    }

    await saveAnnouncedConfirmedIds(announced);
    return 0;
  });
}
