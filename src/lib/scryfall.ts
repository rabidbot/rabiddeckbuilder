import type { ScryfallCard } from './types';

const SCRYFALL_API = 'https://api.scryfall.com';

let requestCount = 0;
const MAX_PER_SECOND = 8;
const REQUEST_DELAY = 120;

async function rateLimit() {
  requestCount++;
  if (requestCount > MAX_PER_SECOND) {
    await new Promise((r) => setTimeout(r, REQUEST_DELAY));
    requestCount = 0;
  }
}

export async function fetchCardById(id: string): Promise<ScryfallCard | null> {
  await rateLimit();
  try {
    const resp = await fetch(`${SCRYFALL_API}/cards/${encodeURIComponent(id)}`);
    if (!resp.ok) {
      if (resp.status === 404) return null;
      throw new Error(`HTTP ${resp.status}`);
    }
    return await resp.json();
  } catch (err) {
    console.warn(`Failed to fetch card ${id}:`, err);
    return null;
  }
}

export async function fetchCardBySetAndNumber(
  set: string,
  collectorNumber: string,
): Promise<ScryfallCard | null> {
  await rateLimit();
  try {
    const resp = await fetch(
      `${SCRYFALL_API}/cards/${encodeURIComponent(set.toLowerCase())}/${encodeURIComponent(collectorNumber)}`,
    );
    if (!resp.ok) return null;
    return await resp.json();
  } catch (err) {
    console.warn(`Failed to fetch card ${set}/${collectorNumber}:`, err);
    return null;
  }
}

export function getCardImageUrl(
  card: ScryfallCard,
  size: 'small' | 'normal' | 'large' = 'normal',
): string | null {
  if (card.image_uris) return card.image_uris[size] || card.image_uris.normal || null;
  if (card.card_faces?.[0]?.image_uris) {
    return (
      card.card_faces[0].image_uris[size] || card.card_faces[0].image_uris.normal || null
    );
  }
  return null;
}
