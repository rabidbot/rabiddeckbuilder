import type { ScryfallCard } from './types';
import { dbRun, dbAll } from './db';

function serializeJson(val: unknown): string {
  return val ? JSON.stringify(val) : '{}';
}

export async function cacheCard(card: ScryfallCard): Promise<void> {
  await dbRun(
    `INSERT OR REPLACE INTO cards
      (id, oracle_id, name, mana_cost, cmc, type_line, oracle_text, colors, color_identity,
       keywords, power, toughness, loyalty, set_code, set_name, collector_number,
       rarity, scryfall_uri, image_uris, card_faces, prices, legalities, produced_mana, released_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      card.id,
      card.oracle_id || card.id,
      card.name,
      card.mana_cost || '',
      card.cmc || 0,
      card.type_line || '',
      card.oracle_text || '',
      serializeJson(card.colors),
      serializeJson(card.color_identity),
      serializeJson(card.keywords),
      card.power || '',
      card.toughness || '',
      card.loyalty || '',
      card.set,
      card.set_name,
      card.collector_number,
      card.rarity,
      card.scryfall_uri || '',
      serializeJson(card.image_uris),
      serializeJson(card.card_faces),
      serializeJson(card.prices),
      serializeJson(card.legalities),
      serializeJson(card.produced_mana || []),
      card.released_at || '',
    ],
  );
}

function parseJsonField<T>(val: unknown, fallback: T): T {
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export async function getCachedCard(id: string): Promise<ScryfallCard | null> {
  const result = await dbAll('SELECT * FROM cards WHERE id = ?', [id]);
  if (!result.ok || !result.rows || result.rows.length === 0) return null;

  const row = result.rows[0] as Record<string, unknown>;
  return {
    id: row.id as string,
    oracle_id: (row.oracle_id as string) || (row.id as string),
    name: row.name as string,
    mana_cost: (row.mana_cost as string) || '',
    cmc: (row.cmc as number) || 0,
    type_line: (row.type_line as string) || '',
    oracle_text: (row.oracle_text as string) || '',
    colors: parseJsonField(row.colors, []),
    color_identity: parseJsonField(row.color_identity, []),
    keywords: parseJsonField(row.keywords, []),
    power: (row.power as string) || '',
    toughness: (row.toughness as string) || '',
    loyalty: (row.loyalty as string) || '',
    set: (row.set_code as string) || '',
    set_name: (row.set_name as string) || '',
    collector_number: (row.collector_number as string) || '',
    rarity: (row.rarity as string) || '',
    scryfall_uri: (row.scryfall_uri as string) || '',
    image_uris: parseJsonField(row.image_uris, undefined) as ScryfallCard['image_uris'],
    card_faces: parseJsonField(row.card_faces, undefined) as ScryfallCard['card_faces'],
    prices: parseJsonField(row.prices, {}),
    legalities: parseJsonField(row.legalities, {}),
    produced_mana: parseJsonField(row.produced_mana, []),
    released_at: (row.released_at as string) || '',
  };
}

export async function cardExistsInCache(id: string): Promise<boolean> {
  const result = await dbAll('SELECT 1 FROM cards WHERE id = ?', [id]);
  return result.ok && !!result.rows && result.rows.length > 0;
}

const cardCache = new Map<string, ScryfallCard>();
const MAX_MEMORY_CACHE = 2000;
let cacheInsertOrder: string[] = [];

export function getFromMemoryCache(id: string): ScryfallCard | null {
  return cardCache.get(id) || null;
}

export function setInMemoryCache(id: string, card: ScryfallCard): void {
  if (cardCache.has(id)) return;
  while (cardCache.size >= MAX_MEMORY_CACHE) {
    const oldest = cacheInsertOrder.shift();
    if (oldest) cardCache.delete(oldest);
  }
  cardCache.set(id, card);
  cacheInsertOrder.push(id);
}

export function clearMemoryCache(): void {
  cardCache.clear();
  cacheInsertOrder = [];
}

export function cacheCards(cards: ScryfallCard[]): void {
  for (const card of cards) {
    setInMemoryCache(card.id, card);
  }
}
