const SCHEMA = `
CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  oracle_id TEXT,
  name TEXT NOT NULL,
  mana_cost TEXT,
  cmc REAL,
  type_line TEXT,
  oracle_text TEXT,
  colors TEXT,
  color_identity TEXT,
  keywords TEXT,
  power TEXT,
  toughness TEXT,
  loyalty TEXT,
  set_code TEXT,
  set_name TEXT,
  collector_number TEXT,
  rarity TEXT,
  scryfall_uri TEXT,
  image_uris TEXT,
  card_faces TEXT,
  prices TEXT,
  legalities TEXT,
  produced_mana TEXT,
  released_at TEXT
);

CREATE TABLE IF NOT EXISTS collection (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id TEXT NOT NULL REFERENCES cards(id),
  quantity INTEGER DEFAULT 1,
  set_code TEXT,
  collector_number TEXT,
  foil BOOLEAN DEFAULT FALSE,
  condition TEXT,
  language TEXT,
  purchase_price REAL,
  csv_data TEXT
);

CREATE TABLE IF NOT EXISTS decks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  commander_id TEXT NOT NULL,
  game_plan TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deck_cards (
  deck_id TEXT NOT NULL REFERENCES decks(id),
  card_id TEXT NOT NULL REFERENCES cards(id),
  category TEXT,
  role_data TEXT,
  is_commander BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  PRIMARY KEY (deck_id, card_id)
);
`;

export async function initDatabase() {
  if (window.electronAPI?.isElectron) {
    const result = await window.electronAPI.db.exec(SCHEMA);
    return result.ok;
  }
  return false;
}

export async function dbRun(query: string, params?: unknown[]) {
  if (window.electronAPI?.isElectron) {
    return window.electronAPI.db.run(query, params);
  }
  return { ok: false, error: 'Not running in Electron' };
}

export async function dbAll(query: string, params?: unknown[]) {
  if (window.electronAPI?.isElectron) {
    return window.electronAPI.db.all(query, params);
  }
  return { ok: false, error: 'Not running in Electron' };
}

export async function dbSave() {
  if (window.electronAPI?.isElectron) {
    return window.electronAPI.db.save();
  }
  return { ok: false, error: 'Not running in Electron' };
}

export async function insertCollectionEntry(cardId: string, data: {
  quantity: number;
  setCode: string;
  collectorNumber: string;
  foil: boolean;
  condition: string;
  language: string;
  purchasePrice: number;
  csvRow: Record<string, string>;
}): Promise<void> {
  await dbRun(
    `INSERT OR REPLACE INTO collection
      (card_id, quantity, set_code, collector_number, foil, condition, language, purchase_price, csv_data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      cardId,
      data.quantity,
      data.setCode,
      data.collectorNumber,
      data.foil ? 1 : 0,
      data.condition,
      data.language,
      data.purchasePrice,
      JSON.stringify(data.csvRow),
    ],
  );
}

export async function getCollectionCardIds(): Promise<string[]> {
  const result = await dbAll('SELECT card_id FROM collection ORDER BY card_id', []);
  if (!result.ok || !result.rows) return [];
  return result.rows.map((r) => r.card_id as string);
}

export async function loadCollectionFromDb(): Promise<{ cardId: string; csvRow: Record<string, string>; quantity: number; setCode: string; collectorNumber: string; foil: boolean; condition: string; language: string; purchasePrice: number }[]> {
  const result = await dbAll('SELECT card_id, csv_data, quantity, set_code, collector_number, foil, condition, language, purchase_price FROM collection', []);
  if (!result.ok || !result.rows) return [];
  return (result.rows as Record<string, unknown>[]).map((row) => ({
    cardId: row.card_id as string,
    csvRow: (() => { try { return JSON.parse((row.csv_data as string) || '{}'); } catch { return {}; } })(),
    quantity: (row.quantity as number) || 1,
    setCode: (row.set_code as string) || '',
    collectorNumber: (row.collector_number as string) || '',
    foil: !!(row.foil as number),
    condition: (row.condition as string) || '',
    language: (row.language as string) || '',
    purchasePrice: (row.purchase_price as number) || 0,
  }));
}

export async function clearCollection(): Promise<void> {
  await dbRun('DELETE FROM collection', []);
}

export async function saveDeck(deck: {
  id: string;
  name: string;
  commanderId: string;
  cardIds: string[];
  roles: Record<string, { role: string; reason: string }>;
  gamePlan?: string;
}): Promise<void> {
  await dbRun(
    `INSERT OR REPLACE INTO decks (id, name, commander_id, game_plan, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
    [deck.id, deck.name, deck.commanderId, deck.gamePlan || ''],
  );
  await dbRun('DELETE FROM deck_cards WHERE deck_id = ?', [deck.id]);
  for (let i = 0; i < deck.cardIds.length; i++) {
    const cardId = deck.cardIds[i];
    const role = deck.roles[cardId];
    const isCommander = cardId === deck.commanderId;
    const roleData = role ? JSON.stringify(role) : '';
    await dbRun(
      `INSERT INTO deck_cards (deck_id, card_id, category, role_data, is_commander, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [deck.id, cardId, role?.role || '', roleData, isCommander ? 1 : 0, i],
    );
  }
}

export async function loadDeck(deckId: string): Promise<{
  id: string;
  name: string;
  commanderId: string;
  cardIds: string[];
  roles: Record<string, { role: string; reason: string }>;
  gamePlan: string;
} | null> {
  const deckResult = await dbAll('SELECT * FROM decks WHERE id = ?', [deckId]);
  if (!deckResult.ok || !deckResult.rows || deckResult.rows.length === 0) return null;

  const deck = deckResult.rows[0] as Record<string, unknown>;
  const cardsResult = await dbAll(
    'SELECT * FROM deck_cards WHERE deck_id = ? ORDER BY sort_order',
    [deckId],
  );

  const cardIds: string[] = [];
  const roles: Record<string, { role: string; reason: string }> = {};

  if (cardsResult.ok && cardsResult.rows) {
    for (const row of cardsResult.rows as Record<string, unknown>[]) {
      cardIds.push(row.card_id as string);
      const stored = (row.role_data as string) || '';
      if (stored) {
        try {
          roles[row.card_id as string] = JSON.parse(stored);
        } catch {
          roles[row.card_id as string] = { role: (row.category as string) || '', reason: '' };
        }
      } else {
        roles[row.card_id as string] = { role: (row.category as string) || '', reason: '' };
      }
    }
  }

  return {
    id: deck.id as string,
    name: deck.name as string,
    commanderId: deck.commander_id as string,
    gamePlan: (deck.game_plan as string) || '',
    cardIds,
    roles,
  };
}

export async function listDecks(): Promise<{ id: string; name: string; commanderId: string; updatedAt: string }[]> {
  const result = await dbAll(
    'SELECT id, name, commander_id, updated_at FROM decks ORDER BY updated_at DESC',
    [],
  );
  if (!result.ok || !result.rows) return [];
  return result.rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    commanderId: r.commander_id as string,
    updatedAt: r.updated_at as string,
  }));
}

export async function deleteDeck(deckId: string): Promise<void> {
  await dbRun('DELETE FROM deck_cards WHERE deck_id = ?', [deckId]);
  await dbRun('DELETE FROM decks WHERE id = ?', [deckId]);
}
