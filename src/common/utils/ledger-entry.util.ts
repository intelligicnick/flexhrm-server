export type LedgerItemType =
  | 'advance'
  | 'penalty'
  | 'uniform'
  | 'foodPerk'
  | 'accommodationPerk'
  | 'conveyancePerk';

export interface LedgerItemRecord {
  id: string;
  type: LedgerItemType;
  amount: number;
  entryDate: string;
  note: string;
}

export interface LedgerEntryRecord {
  advance?: number;
  penalty?: number;
  uniform?: number;
  foodPerk?: number;
  accommodationPerk?: number;
  conveyancePerk?: number;
  penaltyReason?: string;
  paymentStatus?: string;
  ledgerItems?: LedgerItemRecord[];
}

const TOTAL_KEYS: Record<LedgerItemType, keyof LedgerEntryRecord> = {
  advance: 'advance',
  penalty: 'penalty',
  uniform: 'uniform',
  foodPerk: 'foodPerk',
  accommodationPerk: 'accommodationPerk',
  conveyancePerk: 'conveyancePerk',
};

function toAmount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function newId(): string {
  return `li_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeItems(raw: LedgerItemRecord[] | undefined): LedgerItemRecord[] {
  return (raw ?? []).map((item) => ({
    id: String(item.id || newId()),
    type: item.type as LedgerItemType,
    amount: toAmount(item.amount),
    entryDate: String(item.entryDate || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
    note: String(item.note || ''),
  }));
}

function migrateLegacyItems(entry: LedgerEntryRecord, items: LedgerItemRecord[]): LedgerItemRecord[] {
  if (items.length > 0) return items;
  const migrated: LedgerItemRecord[] = [];
  const fallbackDate = new Date().toISOString().slice(0, 10);
  const legacyNote = String(entry.penaltyReason || '');

  for (const type of Object.keys(TOTAL_KEYS) as LedgerItemType[]) {
    const total = toAmount(entry[TOTAL_KEYS[type]]);
    if (total > 0) {
      migrated.push({
        id: newId(),
        type,
        amount: total,
        entryDate: fallbackDate,
        note: type === 'advance' || type === 'penalty' ? legacyNote : '',
      });
    }
  }
  return migrated;
}

function computeTotals(items: LedgerItemRecord[]): Pick<
  LedgerEntryRecord,
  'advance' | 'penalty' | 'uniform' | 'foodPerk' | 'accommodationPerk' | 'conveyancePerk'
> {
  const totals = {
    advance: 0,
    penalty: 0,
    uniform: 0,
    foodPerk: 0,
    accommodationPerk: 0,
    conveyancePerk: 0,
  };
  for (const item of items) {
    const key = TOTAL_KEYS[item.type];
    if (key) totals[key as keyof typeof totals] += item.amount;
  }
  return totals;
}

export function normalizeLedgerEntry(raw: unknown): LedgerEntryRecord {
  if (!raw || typeof raw !== 'object') {
    return {
      advance: 0,
      penalty: 0,
      uniform: 0,
      foodPerk: 0,
      accommodationPerk: 0,
      conveyancePerk: 0,
      penaltyReason: '',
      paymentStatus: 'Unpaid',
      ledgerItems: [],
    };
  }

  const entry = { ...(raw as LedgerEntryRecord) };
  let items = migrateLegacyItems(entry, normalizeItems(entry.ledgerItems));
  items.sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.id.localeCompare(b.id));
  const totals = computeTotals(items);

  return {
    ...entry,
    ...totals,
    ledgerItems: items,
    penaltyReason: String(entry.penaltyReason || ''),
    paymentStatus: entry.paymentStatus || 'Unpaid',
  };
}

export function appendLedgerItem(
  entry: LedgerEntryRecord,
  item: { type: LedgerItemType; amount: number; entryDate: string; note?: string },
): LedgerEntryRecord {
  const normalized = normalizeLedgerEntry(entry);
  const nextItem: LedgerItemRecord = {
    id: newId(),
    type: item.type,
    amount: toAmount(item.amount),
    entryDate: String(item.entryDate || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
    note: String(item.note || '').trim(),
  };
  return normalizeLedgerEntry({
    ...normalized,
    ledgerItems: [...(normalized.ledgerItems ?? []), nextItem],
  });
}

export function removeLedgerItem(entry: LedgerEntryRecord, itemId: string): LedgerEntryRecord {
  const normalized = normalizeLedgerEntry(entry);
  return normalizeLedgerEntry({
    ...normalized,
    ledgerItems: (normalized.ledgerItems ?? []).filter((item) => item.id !== itemId),
  });
}

export function clearLedgerItemsOfType(entry: LedgerEntryRecord, type: LedgerItemType): LedgerEntryRecord {
  const normalized = normalizeLedgerEntry(entry);
  return normalizeLedgerEntry({
    ...normalized,
    ledgerItems: (normalized.ledgerItems ?? []).filter((item) => item.type !== type),
  });
}
