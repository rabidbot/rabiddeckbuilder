import type { ScryfallCard, CommanderAnalysis, CardRoles } from './types';
import { getOracleText, getTypeLine, isLandCard, getProducedColors, getCurveBucket } from './card-utils';

export function cardMatchesTheme(
  card: ScryfallCard,
  cmdAnalysis: CommanderAnalysis,
  theme: string,
): boolean {
  const oracle = getOracleText(card).toLowerCase();
  const typeLine = getTypeLine(card).toLowerCase();
  const subtypes = (cmdAnalysis?.subtypes || []).map((sub) => sub.toLowerCase());

  switch (theme) {
    case 'counters':
      return /\+1\/\+1 counter|proliferate|adapt|evolve|bolster|support/i.test(oracle);
    case 'graveyard':
      return /graveyard|mill|dies|discard|return.*graveyard|reanimate|unearth|flashback|delve|escape/i.test(oracle);
    case 'tokens':
      return /create.*token|populate|convoke|anointed procession|doubling season/i.test(oracle);
    case 'spellslinger':
      return /instant|sorcery/i.test(typeLine) || /magecraft|copy.*spell|whenever you cast.*instant|whenever you cast.*sorcery|prowess/i.test(oracle);
    case 'tribal':
      return subtypes.some((sub) => typeLine.includes(sub));
    case 'voltron':
      return /equipment|aura|attach|equip|double strike|hexproof|ward|menace|unblockable/i.test(`${oracle} ${typeLine}`);
    case 'sacrifice':
      return /sacrifice|dies|aristocrat|blood artist|edict/i.test(oracle);
    case 'damage':
      return /deal.*damage|each opponent loses|burn|damage can't be prevented/i.test(oracle);
    case 'blink':
      return /exile.*return.*battlefield|flicker|blink|enters the battlefield|etb/i.test(oracle);
    case 'draw':
      return /draw.*card|loot|connive|wheel|investigate/i.test(oracle);
    case 'artifacts':
      return /artifact/i.test(typeLine) || /treasure token|clue token|food token|artifact.*you control/i.test(oracle);
    case 'enchantments':
      return /enchantment|aura/i.test(typeLine) || /constellation|enchant/i.test(oracle);
    case 'landfall':
      return /landfall|whenever a land enters|play.*additional.*land/i.test(oracle);
    default:
      return false;
  }
}

export function detectCardRoles(
  card: ScryfallCard,
  cmdAnalysis: CommanderAnalysis | null = null,
): CardRoles {
  const oracle = getOracleText(card).toLowerCase();
  const producedColors = getProducedColors(card);
  const themeHits = cmdAnalysis
    ? cmdAnalysis.themes.filter((theme) => cardMatchesTheme(card, cmdAnalysis, theme))
    : [];

  const roles: CardRoles = {
    land: isLandCard(card),
    ramp: false,
    draw: false,
    interaction: false,
    wipe: false,
    protection: false,
    tutor: false,
    recursion: false,
    finisher: false,
    tokens: false,
    fixing: false,
    value: false,
    synergy: themeHits.length > 0,
    themeHits,
    bucket: getCurveBucket(card.cmc || 0),
    producedColors,
  };

  if (!roles.land) {
    const oracleLower = oracle;
    const name = (card.name || '').toLowerCase();
    roles.ramp =
      /add \{[^}]+\}|search your library for (?:a|up to).*land|put.*land.*battlefield|create.*treasure token|costs? \{?\d?\}? less to cast|untap target land/i.test(oracleLower) ||
      /sol ring|mana crypt|mana vault|arcane signet|fellwar stone|commander's sphere/i.test(name);

    roles.draw =
      /draw \d+ card|draw a card|draw cards|you draw|whenever you draw|at the beginning of .*draw|investigate|connive|discover|impulse/i.test(oracleLower);

    roles.wipe =
      /destroy all|exile all|all creatures get -|each creature|each artifact|each enchantment|farewell|wrath/i.test(oracleLower);

    roles.interaction =
      /destroy target|exile target|counter target|return target.*hand|fight target|deals? \d+ damage to target|tap target|sacrifice target|target creature gets -\d/i.test(oracleLower);

    roles.protection =
      /hexproof|shroud|ward|indestructible|protection from|phases out|can't be countered|regenerate/i.test(oracleLower);

    roles.tutor = /search your library/i.test(oracleLower) &&
      !/search your library for (?:a|up to).*(?:basic land|land card|plains|island|swamp|mountain|forest)/i.test(oracleLower);

    roles.recursion =
      /return target.*graveyard|from your graveyard to your hand|reanimate|unearth|flashback|escape|disturb|recover|mill \d|discard a card.*draw|dredge|surveil/i.test(oracleLower);

    roles.finisher =
      /you win the game|each opponent loses|deal.*each opponent|extra turn|extra combat|double.*damage|overrun|craterhoof|triumph of the hordes|torment of hailfire/i.test(oracleLower);

    roles.tokens = /create.*token|populate|amass/i.test(oracleLower);

    roles.fixing =
      producedColors.length >= 2 || /one mana of any color|any combination of colors|treasure token/i.test(oracleLower);

    roles.value =
      roles.draw || /scry|surveil|cascade|discover|investigate|venture|connive|learn/i.test(oracleLower);

    roles.synergy ||= roles.tokens || roles.recursion;
  } else {
    roles.fixing = producedColors.length >= 2 || !producedColors.includes('C');
  }

  return roles;
}

export function categorizeCard(
  entry: import('./types').CollectionEntry,
  analysis: import('./types').CommanderAnalysis | null,
  categoryOverrides?: Record<string, string>,
): string {
  if (categoryOverrides?.[entry.scryfallData.id]) {
    return categoryOverrides[entry.scryfallData.id];
  }
  if (!analysis) return 'Flex';
  const tags = detectCardRoles(entry.scryfallData, analysis);
  if (tags.land) return 'Lands';
  if (tags.ramp) return 'Ramp';
  if (tags.tutor) return 'Tutors';
  if (tags.draw) return 'Card Draw';
  if (tags.protection) return 'Protection';
  if (tags.wipe) return 'Board Wipes';
  if (tags.recursion) return 'Recursion';
  if (tags.interaction) return 'Interaction';
  if (tags.finisher) return 'Win Cons';
  if (tags.synergy) return 'Strategy';
  return 'Flex';
}
