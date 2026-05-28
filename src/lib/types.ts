export interface ScryfallCard {
  id: string;
  oracle_id: string;
  name: string;
  mana_cost: string;
  cmc: number;
  type_line: string;
  oracle_text: string;
  colors: string[];
  color_identity: string[];
  keywords: string[];
  power: string;
  toughness: string;
  loyalty: string;
  set: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  scryfall_uri: string;
  image_uris?: { small: string; normal: string; large: string; png: string };
  card_faces?: Array<{
    name: string;
    mana_cost: string;
    type_line: string;
    oracle_text: string;
    image_uris?: { small: string; normal: string; large: string; png: string };
  }>;
  prices: { usd?: string; usd_foil?: string };
  legalities: Record<string, string>;
  produced_mana?: string[];
  released_at: string;
}

export interface Scores {
  power: number;
  manaEff: number;
  cmdSynergy: number;
  winCon: number;
  budget: number;
  composite: number;
  valid: boolean;
  reasons: {
    power: string[];
    manaEff: string[];
    cmdSynergy: string[];
    winCon: string[];
    budget: string[];
  };
}

export interface CollectionEntry {
  csvRow: Record<string, string>;
  scryfallData: ScryfallCard;
  scores: Scores;
}

export interface CardRoles {
  land: boolean;
  ramp: boolean;
  draw: boolean;
  interaction: boolean;
  wipe: boolean;
  protection: boolean;
  tutor: boolean;
  recursion: boolean;
  finisher: boolean;
  tokens: boolean;
  fixing: boolean;
  value: boolean;
  synergy: boolean;
  themeHits: string[];
  bucket: 'low' | 'mid' | 'high' | 'finisher';
  producedColors: string[];
}

export interface CommanderAnalysis {
  themes: string[];
  wants: string[];
  ci: string[];
  subtypes: string[];
  oracle: string;
  typeLine: string;
  keywords: string[];
  cmc: number;
  posture: 'control' | 'aggro' | 'midrange';
}

export interface DeckBlueprint {
  lands: number;
  ramp: number;
  draw: number;
  interaction: number;
  wipes: number;
  protection: number;
  recursion: number;
  tutors: number;
  finishers: number;
  synergy: number;
  curve: { low: number; mid: number; high: number; finisher: number };
}

export interface DeckProfile {
  entries: CollectionEntry[];
  total: number;
  nonLands: number;
  lands: number;
  ramp: number;
  draw: number;
  interaction: number;
  wipes: number;
  protection: number;
  recursion: number;
  tutors: number;
  finishers: number;
  synergy: number;
  avgComposite: number;
  curve: { low: number; mid: number; high: number; finisher: number };
  sources: Record<string, number>;
}

export interface DeckRole {
  role: string;
  reason: string;
}

export interface DeckViolation {
  cardId: string;
  type: 'color_identity' | 'duplicate' | 'deck_size';
  message: string;
  affectedCardIds: string[];
}

export interface Deck {
  id?: string;
  name: string;
  commanderId: string;
  cardIds: string[];
  roles: Record<string, DeckRole>;
  createdAt: string;
  updatedAt: string;
}
