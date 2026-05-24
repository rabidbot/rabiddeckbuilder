import type { ScryfallCard, CollectionEntry } from './types';

export function getColorIdentity(card: ScryfallCard): string[] {
  return (card.color_identity || []).map((c) => c.toUpperCase());
}

export function isLegendaryCreature(card: ScryfallCard): boolean {
  const t = (card.type_line || '').toLowerCase();
  return t.includes('legendary') && t.includes('creature');
}

export function getOracleText(card: ScryfallCard): string {
  const oracle = card.oracle_text || '';
  const faces = card.card_faces || [];
  if (!oracle && faces.length) {
    return faces.map((f) => f.oracle_text || '').filter(Boolean).join('\n');
  }
  return oracle;
}

export function getTypeLine(card: ScryfallCard): string {
  const tl = card.type_line || '';
  const faces = card.card_faces || [];
  if (!tl && faces.length) {
    return faces.map((f) => f.type_line || '').filter(Boolean).join(' // ');
  }
  return tl;
}

export function getManaCost(card: ScryfallCard): string {
  const mc = card.mana_cost || '';
  const faces = card.card_faces || [];
  if (!mc && faces.length) {
    return faces.map((f) => f.mana_cost || '').filter(Boolean).join('');
  }
  return mc;
}

export function isLandCard(card: ScryfallCard): boolean {
  return /land/i.test(getTypeLine(card));
}

export function isBasicLandCard(card: ScryfallCard): boolean {
  return /basic land/i.test(getTypeLine(card));
}

export function canRunMultipleCopies(card: ScryfallCard): boolean {
  return isBasicLandCard(card) || /a deck can have any number of cards named/i.test(getOracleText(card));
}

export function getDeckCardKey(card: ScryfallCard): string {
  if (canRunMultipleCopies(card)) {
    return `${(card.name || '').toLowerCase()}::${card.id}`;
  }
  return ((card.oracle_id || card.name || card.id || '') + '').toLowerCase();
}

export function getCurveBucket(cmc: number): 'low' | 'mid' | 'high' | 'finisher' {
  if (cmc <= 2) return 'low';
  if (cmc <= 4) return 'mid';
  if (cmc <= 6) return 'high';
  return 'finisher';
}

export function getProducedColors(card: ScryfallCard): string[] {
  const produced = new Set<string>((card.produced_mana || []).map((c) => c.toUpperCase()));
  const oracle = getOracleText(card).toLowerCase();
  const typeLine = getTypeLine(card).toLowerCase();

  if (/plains/.test(typeLine)) produced.add('W');
  if (/island/.test(typeLine)) produced.add('U');
  if (/swamp/.test(typeLine)) produced.add('B');
  if (/mountain/.test(typeLine)) produced.add('R');
  if (/forest/.test(typeLine)) produced.add('G');

  for (const match of oracle.matchAll(/add\s+\{([wubrgc])\}/gi)) {
    produced.add(match[1].toUpperCase());
  }

  if (/one mana of any color|any combination of colors/i.test(oracle)) {
    const ci = getColorIdentity(card);
    for (const c of ci) produced.add(c);
    if (!produced.size) ['W', 'U', 'B', 'R', 'G'].forEach((c) => produced.add(c));
  }

  return [...produced];
}

export function getCardByName(collection: CollectionEntry[], name: string): CollectionEntry | undefined {
  return collection.find((e) => e.scryfallData.name?.toLowerCase() === name.toLowerCase());
}
