import type { CollectionEntry, CommanderAnalysis, DeckBlueprint, DeckProfile, DeckRole } from './types';
import { getOracleText, getTypeLine, getManaCost, getColorIdentity, getDeckCardKey, isLandCard, isBasicLandCard } from './card-utils';
import { detectCardRoles, cardMatchesTheme } from './card-roles';
import { getDeckBlueprint } from './deck-blueprint';
import type { PowerLevel } from './deck-blueprint';
import { analyzeCommander } from './commander-analyzer';

function describeGamePlan(cmdAnalysis: CommanderAnalysis): string {
  const primary = cmdAnalysis.themes.slice(0, 2).map((t) => t[0].toUpperCase() + t.slice(1));
  return primary.length ? primary.join(' / ') : 'Balanced Goodstuff';
}

function computePipWeight(entries: CollectionEntry[]): Record<string, number> {
  const demand: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const entry of entries) {
    const card = entry.scryfallData;
    if (isLandCard(card)) continue;
    const manaCost = getManaCost(card);
    for (const match of manaCost.matchAll(/\{([WUBRG])\}/g)) {
      demand[match[1]]++;
    }
  }
  return demand;
}

function scoreRedundancy(card: CollectionEntry, cmdAnalysis: CommanderAnalysis): { bonus: number; reasons: string[] } {
  const oracle = getOracleText(card.scryfallData).toLowerCase();
  const typeLine = getTypeLine(card.scryfallData).toLowerCase();
  let bonus = 0;
  const reasons: string[] = [];

  for (const theme of cmdAnalysis.themes) {
    if (cardMatchesTheme(card.scryfallData, cmdAnalysis, theme)) {
      bonus += theme === 'goodstuff' ? 1 : 3;
      reasons.push(`${theme[0].toUpperCase()}${theme.slice(1)} support`);
    }
  }

  if (cmdAnalysis.wants.includes('attack') && /attacks|combat damage|haste/i.test(oracle))
    { bonus += 2; reasons.push('Attack pattern support'); }
  if (cmdAnalysis.wants.includes('etb') && /enters the battlefield|flicker|blink/i.test(oracle))
    { bonus += 2; reasons.push('ETB support'); }
  if (cmdAnalysis.wants.includes('dies') && /dies|sacrifice|graveyard/i.test(oracle))
    { bonus += 2; reasons.push('Death trigger support'); }
  if (cmdAnalysis.wants.includes('cast') && /whenever you cast|instant|sorcery|storm/i.test(`${oracle} ${typeLine}`))
    { bonus += 2; reasons.push('Cast trigger support'); }
  if (cmdAnalysis.wants.includes('draw') && /draw.*card|wheel|connive/i.test(oracle))
    { bonus += 2; reasons.push('Draw trigger support'); }

  for (const subtype of cmdAnalysis.subtypes) {
    if (typeLine.includes(subtype.toLowerCase())) {
      bonus += 3;
      reasons.push(`${subtype} tribal support`);
      break;
    }
  }

  if (!getColorIdentity(card.scryfallData).length && !isLandCard(card.scryfallData)) {
    bonus += 1;
    reasons.push('Colorless utility');
  }

  return { bonus: Math.min(bonus, 10), reasons: [...new Set(reasons)] };
}

function computeSynergyWebBonus(
  card: CollectionEntry,
  currentDeckEntries: CollectionEntry[],
  _cmdAnalysis: CommanderAnalysis,
  getRoles: (entry: CollectionEntry) => import('./types').CardRoles,
): { bonus: number; note: string } {
  const oracle = getOracleText(card.scryfallData).toLowerCase();
  const sharedWords = new Set(
    (oracle.match(/\b\w{5,}\b/g) || []).filter(
      (w) => ![
        'therefore','another','whenever','target','until','during','without',
        'creature','permanent','player','battlefield','graveyard','library',
        'counter','spell','control','artifact','enchantment','planeswalker',
        'instant','sorcery','legendary','token','opponent','instead',
        'beginning','additional','sacrifice','destroy','return','exile',
      ].includes(w),
    ),
  );
  let interactions = 0;
  const cardRoles = getRoles(card);

  for (const deckEntry of currentDeckEntries) {
    const deckCard = deckEntry.scryfallData;
    const deckOracle = getOracleText(deckCard).toLowerCase();
    const deckRoles = getRoles(deckEntry);

    if (cardRoles.themeHits.some((theme) => deckRoles.themeHits.includes(theme)))
      interactions += 2;

    if (cardRoles.tokens && deckRoles.finisher) interactions += 2;
    if (cardRoles.recursion && /dies|mill|discard|sacrifice/i.test(deckOracle)) interactions += 2;
    if (cardRoles.draw && (deckRoles.tutor || deckRoles.finisher || deckRoles.synergy)) interactions += 1;
    if (cardRoles.interaction && deckRoles.draw) interactions += 1;
    if (cardRoles.ramp && deckRoles.finisher) interactions += 1;

    let overlap = 0;
    for (const word of sharedWords) {
      if (deckOracle.includes(word)) overlap++;
      if (overlap >= 3) break;
    }
    if (overlap >= 3) interactions++;
  }

  if (interactions >= 14) return { bonus: 7, note: `${interactions} synergy links` };
  if (interactions >= 8) return { bonus: 5, note: `${interactions} synergy links` };
  if (interactions >= 4) return { bonus: 3, note: `${interactions} synergy links` };
  return { bonus: 0, note: `${interactions} synergy links` };
}

function buildDeckProfile(
  entries: CollectionEntry[],
  _cmdAnalysis: CommanderAnalysis,
  getRoles: (entry: CollectionEntry) => import('./types').CardRoles,
): DeckProfile {
  const profile: DeckProfile = {
    entries,
    total: entries.length,
    nonLands: 0,
    lands: 0,
    ramp: 0,
    draw: 0,
    interaction: 0,
    wipes: 0,
    protection: 0,
    recursion: 0,
    tutors: 0,
    finishers: 0,
    synergy: 0,
    avgComposite: 0,
    curve: { low: 0, mid: 0, high: 0, finisher: 0 },
    sources: { W: 0, U: 0, B: 0, R: 0, G: 0 },
  };

  if (!entries.length) return profile;

  let totalScore = 0;
  for (const entry of entries) {
    const tags = getRoles(entry);
    totalScore += entry.scores.composite;

    if (tags.land) profile.lands++;
    else {
      profile.nonLands++;
      profile.curve[tags.bucket]++;
    }

    if (tags.ramp && !tags.land) profile.ramp++;
    if (tags.draw) profile.draw++;
    if (tags.interaction) profile.interaction++;
    if (tags.wipe) profile.wipes++;
    if (tags.protection) profile.protection++;
    if (tags.recursion) profile.recursion++;
    if (tags.tutor) profile.tutors++;
    if (tags.finisher) profile.finishers++;
    if (tags.synergy) profile.synergy++;

    if (tags.land || tags.ramp) {
      for (const color of tags.producedColors) {
        if (profile.sources[color] !== undefined) profile.sources[color]++;
      }
    }
  }

  profile.avgComposite = Math.round(totalScore / entries.length);
  return profile;
}

function estimateColorDemand(
  validCards: CollectionEntry[],
  cmdAnalysis: CommanderAnalysis,
): Record<string, number> {
  const demand: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const shortlist = [...validCards]
    .filter((entry) => !detectCardRoles(entry.scryfallData, cmdAnalysis).land)
    .sort((a, b) => {
      const aTags = detectCardRoles(a.scryfallData, cmdAnalysis);
      const bTags = detectCardRoles(b.scryfallData, cmdAnalysis);
      return (b.scores.composite + bTags.themeHits.length * 9) -
             (a.scores.composite + aTags.themeHits.length * 9);
    })
    .slice(0, 80);

  for (const entry of shortlist) {
    const manaCost = getManaCost(entry.scryfallData);
    const weight = 1 + detectCardRoles(entry.scryfallData, cmdAnalysis).themeHits.length * 0.9 + entry.scores.composite / 125;
    let seenSymbol = false;
    for (const match of manaCost.matchAll(/\{([WUBRG])\}/g)) {
      demand[match[1]] += weight;
      seenSymbol = true;
    }
    if (!seenSymbol) {
      for (const color of getColorIdentity(entry.scryfallData)) demand[color] += weight * 0.35;
    }
  }

  for (const color of cmdAnalysis.ci) {
    if (!demand[color]) demand[color] = 1;
  }

  return demand;
}

function scoreLandCandidate(
  entry: CollectionEntry,
  profile: DeckProfile,
  blueprint: DeckBlueprint,
  cmdAnalysis: CommanderAnalysis,
  colorDemand: Record<string, number>,
  getRoles: (entry: CollectionEntry) => import('./types').CardRoles,
): { score: number; role: string; reason: string } {
  const card = entry.scryfallData;
  const tags = getRoles(entry);
  const oracle = getOracleText(card).toLowerCase();
  const relevantColors = tags.producedColors.filter((color) => cmdAnalysis.ci.includes(color));
  let score = entry.scores.composite + (blueprint.lands - profile.lands) * 8;
  const reasons: string[] = [];

  if (/one mana of any color|any combination of colors/i.test(oracle)) {
    score += 16;
    reasons.push('perfect fixing');
  }

  if (relevantColors.length >= 2) {
    score += 10;
    reasons.push('multi-color source');
  } else if (relevantColors.length === 1) {
    const color = relevantColors[0];
    const unmet = Math.max(0, Math.ceil((colorDemand[color] || 0) / 6) - (profile.sources[color] || 0));
    score += 5 + unmet * 6;
    if (unmet > 0) reasons.push(`needed ${color} source`);
  }

  if (isBasicLandCard(card)) {
    score += 4;
    reasons.push('reliable untapped land');
  }

  if (/enters the battlefield tapped/i.test(oracle)) score -= relevantColors.length >= 2 ? 2 : 5;
  if (/draw a card|scry|surveil|sacrifice.*draw|becomes a creature|deals 1 damage to any target/i.test(oracle)) score += 3;

  return {
    score,
    role: 'Mana Base',
    reason: reasons.length ? reasons.slice(0, 2).join(' • ') : 'Mana base slot',
  };
}

function scoreCandidateForDeck(
  entry: CollectionEntry,
  profile: DeckProfile,
  blueprint: DeckBlueprint,
  cmdAnalysis: CommanderAnalysis,
  getRoles: (entry: CollectionEntry) => import('./types').CardRoles,
): { score: number; role: string; reason: string } {
  const card = entry.scryfallData;
  const tags = getRoles(entry);
  let score = entry.scores.composite;
  let role = 'Synergy Pieces';
  let roleWeight = 0;
  const reasons: string[] = [];

  const assignNeed = (active: boolean, missing: number, weight: number, nextRole: string, label: string) => {
    if (!active) return;
    if (missing > 0) {
      const bonus = missing * weight;
      score += bonus;
      reasons.push(label);
      if (bonus > roleWeight) {
        roleWeight = bonus;
        role = nextRole;
      }
    }
  };

  assignNeed(tags.ramp && !tags.land, blueprint.ramp - profile.ramp, 7, 'Ramp', 'fills ramp target');
  assignNeed(tags.draw, blueprint.draw - profile.draw, 7, 'Card Draw', 'adds card flow');
  assignNeed(tags.interaction, blueprint.interaction - profile.interaction, 8, 'Interaction', 'adds interaction');
  assignNeed(tags.protection, blueprint.protection - profile.protection, 7, 'Protection', 'protects core plan');
  assignNeed(tags.recursion, blueprint.recursion - profile.recursion, 7, 'Recursion', 'improves recursion depth');
  assignNeed(tags.finisher, blueprint.finishers - profile.finishers, 8, 'Finishers', 'closes games');
  assignNeed(tags.tutor, blueprint.tutors - profile.tutors, 8, 'Tutors', 'finds key pieces');

  const web = computeSynergyWebBonus(entry, profile.entries, cmdAnalysis, getRoles);
  score += web.bonus * 2;
  if (web.bonus >= 3) reasons.push(web.note);

  const redundancy = scoreRedundancy(entry, cmdAnalysis);
  score += redundancy.bonus * 1.8;
  if (redundancy.reasons.length) reasons.push(redundancy.reasons[0]);

  if (tags.synergy) {
    const themeBonus = 6 + tags.themeHits.length * 4 + Math.max(0, blueprint.synergy - profile.synergy) * 1.5;
    score += themeBonus;
    if (themeBonus > roleWeight) role = tags.themeHits.length > 1 ? 'Redundancy Package' : 'Synergy Pieces';
    reasons.push(tags.themeHits.length ? `supports ${tags.themeHits.join(', ')}` : 'supports commander plan');
  }

  const curveMissing = blueprint.curve[tags.bucket] - profile.curve[tags.bucket];
  if (curveMissing > 0) {
    score += curveMissing * 3.5;
    reasons.push(`${tags.bucket} curve need`);
  } else if (!tags.finisher) {
    score -= Math.min(8, Math.abs(curveMissing) * 1.75);
  }

  if ((card.cmc || 0) >= 7 && !tags.finisher) score -= 12;
  if ((card.cmc || 0) <= 2 && profile.curve.low < blueprint.curve.low) score += 4;
  if (cmdAnalysis.cmc >= 5 && (card.cmc || 0) <= 3) score += 3;
  if (tags.fixing && (cmdAnalysis.ci.length >= 3 || blueprint.ramp > profile.ramp)) score += 4;
  if (tags.wipe && profile.wipes >= blueprint.wipes) score -= 6;

  return {
    score,
    role,
    reason: reasons.length ? reasons.slice(0, 2).join(' • ') : `Score ${entry.scores.composite} best fit`,
  };
}

function identifyWinConditions(
  validCards: CollectionEntry[],
  cmdAnalysis: CommanderAnalysis,
): Array<{ type: string; cards: CollectionEntry[] }> {
  const winSignals: Array<{ type: string; cards: CollectionEntry[] }> = [];
  const rank = (entry: CollectionEntry) =>
    entry.scores.composite + detectCardRoles(entry.scryfallData, cmdAnalysis).themeHits.length * 9 +
    (detectCardRoles(entry.scryfallData, cmdAnalysis).finisher ? 10 : 0);

  const top = (filter: (e: CollectionEntry) => boolean, limit = 3) =>
    validCards.filter(filter).sort((a, b) => rank(b) - rank(a)).slice(0, limit);

  const directWins = top((e) => /you win the game|target opponent loses the game/i.test(getOracleText(e.scryfallData)), 2);
  if (directWins.length) winSignals.push({ type: 'direct win', cards: directWins });

  const drainFinish = top((e) => /each opponent loses|deal.*each opponent|drain each opponent|torment of hailfire/i.test(getOracleText(e.scryfallData)), 3);
  if (drainFinish.length >= 2 || (drainFinish.length && cmdAnalysis.themes.includes('damage')))
    winSignals.push({ type: 'life drain', cards: drainFinish });

  const spellBurst = top((e) => /extra turn|copy.*spell|storm|magecraft|whenever you cast.*instant|whenever you cast.*sorcery/i.test(getOracleText(e.scryfallData)), 3);
  if (spellBurst.length >= 2 && cmdAnalysis.themes.includes('spellslinger'))
    winSignals.push({ type: 'spell burst', cards: spellBurst });

  const overrun = top((e) => /creatures you control get \+|overrun|craterhoof|triumph of the hordes|extra combat/i.test(getOracleText(e.scryfallData)), 3);
  const tokenMakers = top((e) => detectCardRoles(e.scryfallData, cmdAnalysis).tokens, 4);
  if (overrun.length && tokenMakers.length >= 2 && (cmdAnalysis.themes.includes('tokens') || cmdAnalysis.themes.includes('tribal')))
    winSignals.push({ type: 'go wide', cards: [...overrun, ...tokenMakers].slice(0, 4) });

  const graveyardBombs = top((e) => /return.*graveyard.*battlefield|reanimate|whenever a creature dies|sacrifice a creature/i.test(getOracleText(e.scryfallData)), 4);
  if (graveyardBombs.length >= 2 && (cmdAnalysis.themes.includes('graveyard') || cmdAnalysis.themes.includes('sacrifice')))
    winSignals.push({ type: 'graveyard engine', cards: graveyardBombs });

  const commanderKill = top((e) => /double strike|unblockable|equipment|aura|attach|combat damage/i.test(`${getTypeLine(e.scryfallData)} ${getOracleText(e.scryfallData)}`), 4);
  if (commanderKill.length >= 2 && cmdAnalysis.themes.includes('voltron'))
    winSignals.push({ type: 'commander damage', cards: commanderKill });

  return winSignals;
}

const BASIC_LAND_MAP: Record<string, { name: string; color: string; abbr: string }> = {
  W: { name: 'Plains', color: 'W', abbr: 'Plains' },
  U: { name: 'Island', color: 'U', abbr: 'Island' },
  B: { name: 'Swamp', color: 'B', abbr: 'Swamp' },
  R: { name: 'Mountain', color: 'R', abbr: 'Mountain' },
  G: { name: 'Forest', color: 'G', abbr: 'Forest' },
};

export function createVirtualBasicLand(name: string, color: string, copyIndex: number): CollectionEntry {
  const id = `virtual-basic-${name.toLowerCase()}-${copyIndex}`;
  return {
    scryfallData: {
      id,
      oracle_id: id,
      name,
      mana_cost: '',
      cmc: 0,
      type_line: `Basic Land — ${name}`,
      oracle_text: `({T}: Add {${color}}.)`,
      colors: [],
      color_identity: [color],
      keywords: [],
      power: '',
      toughness: '',
      loyalty: '',
      set: 'basic',
      set_name: 'Basic Lands',
      collector_number: String(copyIndex),
      rarity: 'common',
      scryfall_uri: '',
      image_uris: {},
      card_faces: [],
      prices: {},
      legalities: {},
      produced_mana: [color],
      released_at: '',
    },
    scores: {
      composite: 50,
      power: 2,
      cmdSynergy: 2,
      manaEff: 8,
      winCon: 0,
      budget: 10,
      valid: true,
      reasons: {
        power: ['Basic land — always useful'],
        cmdSynergy: [],
        manaEff: ['Produces needed mana'],
        winCon: [],
        budget: ['Free'],
      },
    },
    csvRow: {
      name,
      setCode: 'basic',
      setName: 'Basic Lands',
      collectorNumber: String(copyIndex),
      foil: 'false',
      rarity: 'common',
      quantity: '1',
      manaBoxId: '',
      scryfallId: id,
      purchasePrice: '0',
      misprint: 'false',
      altered: 'false',
      condition: 'NM',
      language: 'en',
    },
  };
}

export function createVirtualBasicLands(commanderColors: string[]): CollectionEntry[] {
  const entries: CollectionEntry[] = [];
  const colors = commanderColors.length ? commanderColors : ['C'];
  for (const color of colors) {
    const land = BASIC_LAND_MAP[color];
    if (!land) continue;
    for (let i = 0; i < 15; i++) {
      entries.push(createVirtualBasicLand(land.name, land.color, i + 1));
    }
  }
  return entries;
}

export function buildOptimalDeck(
  collection: CollectionEntry[],
  commander: CollectionEntry,
  powerLevel: PowerLevel = '75%',
): { cardIds: string[]; roles: Record<string, DeckRole>; gamePlan: string } {
  const cardIds: string[] = [];
  const selectedKeys = new Set<string>();
  const roles: Record<string, DeckRole> = {};

  const cmdAnalysis = analyzeCommander(commander.scryfallData);
  const blueprint = getDeckBlueprint(cmdAnalysis, powerLevel);

  const augmentedCollection = [...createVirtualBasicLands(cmdAnalysis.ci), ...collection];

  const roleCache = new Map<string, import('./types').CardRoles>();
  const getRoles = (entry: CollectionEntry) => {
    const cacheKey = entry.scryfallData.id;
    if (!roleCache.has(cacheKey)) {
      roleCache.set(cacheKey, detectCardRoles(entry.scryfallData, cmdAnalysis));
    }
    return roleCache.get(cacheKey)!;
  };

  const singletonPool = new Map<string, CollectionEntry>();
  const DEBUG_NAMES = new Set(['jolted awake', 'stratosoarer', 'shimmercreep', 'dawn-blessed pennant']);
  for (const entry of augmentedCollection) {
    const card = entry.scryfallData;
    if (card && DEBUG_NAMES.has((card.name || '').toLowerCase())) {
      console.log('[DEBUG]', card.name,
        'oracle_id:', card.oracle_id,
        'canRunMultipleCopies:', canRunMultipleCopies(card),
        'deckKey:', getDeckCardKey(card));
    }
    if (!card || entry.scores.valid === false || card.id === commander.scryfallData.id) continue;
    const key = getDeckCardKey(card);
    const prev = singletonPool.get(key);
    if (!prev || entry.scores.composite > prev.scores.composite) singletonPool.set(key, entry);
  }
  const valid = [...singletonPool.values()].sort((a, b) => b.scores.composite - a.scores.composite);
  for (const entry of valid) getRoles(entry);

  const entriesInDeck: CollectionEntry[] = [];

  const addEntry = (entry: CollectionEntry, role: string, reason: string): boolean => {
    if (!entry || cardIds.length >= 99) return false;
    const card = entry.scryfallData;
    const key = getDeckCardKey(card);
    if (selectedKeys.has(key) || cardIds.includes(card.id)) return false;
    cardIds.push(card.id);
    selectedKeys.add(key);
    roles[card.id] = { role, reason };
    entriesInDeck.push(entry);
    return true;
  };

  const winConditions = identifyWinConditions(valid, cmdAnalysis);
  for (const win of winConditions) {
    const ranked = [...win.cards].sort(
      (a, b) =>
        (b.scores.composite + getRoles(b).themeHits.length * 10) -
        (a.scores.composite + getRoles(a).themeHits.length * 10),
    );
    for (const entry of ranked.slice(0, 4)) {
      addEntry(entry, 'Combo Pieces', `Supports ${win.type} finish`);
    }
  }

  const isGoodstuff = cmdAnalysis.themes.length === 1 && cmdAnalysis.themes[0] === 'goodstuff';

  let anchorPool: CollectionEntry[];
  if (isGoodstuff) {
    anchorPool = valid
      .filter((entry) => !selectedKeys.has(getDeckCardKey(entry.scryfallData)))
      .sort((a, b) => b.scores.composite - a.scores.composite);
  } else {
    anchorPool = valid
      .filter((entry) => {
        const key = getDeckCardKey(entry.scryfallData);
        return !selectedKeys.has(key) && getRoles(entry).themeHits.length > 0;
      })
      .sort((a, b) => {
        const aRed = scoreRedundancy(a, cmdAnalysis).bonus;
        const bRed = scoreRedundancy(b, cmdAnalysis).bonus;
        return (b.scores.composite + getRoles(b).themeHits.length * 10 + bRed * 2) -
               (a.scores.composite + getRoles(a).themeHits.length * 10 + aRed * 2);
      });
  }
  for (const entry of anchorPool.slice(0, Math.min(8, 4 + cmdAnalysis.themes.length * 2))) {
    const themeList = getRoles(entry).themeHits;
    addEntry(entry, themeList.length > 1 ? 'Redundancy Package' : 'Synergy Pieces',
      `High-fit ${themeList.join(', ') || 'score'} anchor`);
  }

  const tutorPool = valid
    .filter((entry) => {
      const key = getDeckCardKey(entry.scryfallData);
      return !selectedKeys.has(key) && getRoles(entry).tutor;
    })
    .slice(0, blueprint.tutors);
  for (const entry of tutorPool) addEntry(entry, 'Tutors', 'Finds the best card for the current board');

  const protectionPool = valid
    .filter((entry) => {
      const key = getDeckCardKey(entry.scryfallData);
      return !selectedKeys.has(key) && getRoles(entry).protection;
    })
    .sort((a, b) => b.scores.composite - a.scores.composite)
    .slice(0, Math.max(1, blueprint.protection - 1));
  for (const entry of protectionPool) addEntry(entry, 'Protection', 'Defends commander and key engine pieces');

  // === PHASE 5: Nonland fill (skip lands — actual spells first) ===
  let safety = 0;
  const nonLandTarget = 99 - blueprint.lands;
  while (cardIds.length < nonLandTarget && safety < 260) {
    safety++;
    const profile = buildDeckProfile(entriesInDeck, cmdAnalysis, getRoles);

    const candidates: CollectionEntry[] = [];
    for (const entry of valid) {
      if (!selectedKeys.has(getDeckCardKey(entry.scryfallData))) {
        candidates.push(entry);
        if (candidates.length >= 250) break;
      }
    }
    if (!candidates.length) break;

    let best: { entry: CollectionEntry; score: number; role: string; reason: string } | null = null;
    for (const entry of candidates) {
      if (getRoles(entry).land) continue;
      const scored = scoreCandidateForDeck(entry, profile, blueprint, cmdAnalysis, getRoles);
      if (scored && (!best || scored.score > best.score)) best = { entry, ...scored };
    }

    if (!best) break;
    addEntry(best.entry, best.role, best.reason);
  }

  // === PHASE 6: Compute pip-weight from actual selected nonland cards ===
  const pipWeight = computePipWeight(entriesInDeck);
  for (const c of cmdAnalysis.ci) {
    if (!pipWeight[c] || pipWeight[c] === 0) pipWeight[c] = 1;
  }
  console.log('[LandPhase] pip-weight:', JSON.stringify(pipWeight));

  // === PHASE 7: Nonbasic lands — prioritize by number of deck colors produced ===
  const cmdCiSet = new Set(cmdAnalysis.ci.map(c => c.toUpperCase()));
  const nonbasics = valid.filter((entry) => {
    const key = getDeckCardKey(entry.scryfallData);
    return !selectedKeys.has(key)
      && getRoles(entry).land
      && !isBasicLandCard(entry.scryfallData);
  });
  nonbasics.sort((a, b) => {
    const aColors = getRoles(a).producedColors.filter(c => cmdCiSet.has(c)).length;
    const bColors = getRoles(b).producedColors.filter(c => cmdCiSet.has(c)).length;
    if (bColors !== aColors) return bColors - aColors;
    return b.scores.composite - a.scores.composite;
  });
  const nbMax = Math.floor(blueprint.lands * 0.6);
  for (const entry of nonbasics.slice(0, nbMax)) {
    addEntry(entry, 'Mana Base', `Nonbasic fixing (${getRoles(entry).producedColors.filter(c => cmdCiSet.has(c)).length} colors)`);
  }

  // === PHASE 8: Fill remaining land slots with basics proportionally ===
  let landProfile = buildDeckProfile(entriesInDeck, cmdAnalysis, getRoles);
  const remainingLands = blueprint.lands - landProfile.lands;
  if (remainingLands > 0 && cmdAnalysis.ci.length > 0) {
    // Proportional allocation
    const totalPips = Object.values(pipWeight).reduce((s, v) => s + v, 0);
    const alloc: Record<string, number> = {};
    for (const c of cmdAnalysis.ci) {
      alloc[c] = Math.max(1, Math.round((pipWeight[c] / totalPips) * remainingLands));
    }
    // Adjust to fit remaining exactly
    let sum = Object.values(alloc).reduce((s, v) => s + v, 0);
    while (sum > remainingLands) {
      const sorted = Object.entries(alloc).sort(([, a], [, b]) => b - a);
      const [maxColor] = sorted[0];
      if (alloc[maxColor] > 1) { alloc[maxColor]--; sum--; }
      else break;
    }
    while (sum < remainingLands) {
      const sorted = Object.entries(pipWeight).sort(([, a], [, b]) => b - a);
      const [maxColor] = sorted[0];
      if (alloc[maxColor] !== undefined) { alloc[maxColor]++; sum++; }
    }

    // Compute sources-per-color for logging
    const sources: Record<string, number> = {};
    landProfile = buildDeckProfile(entriesInDeck, cmdAnalysis, getRoles);
    for (const c of cmdAnalysis.ci) sources[c] = (landProfile.sources[c] || 0) + (alloc[c] || 0);
    console.log('[LandPhase] sources-per-color:', JSON.stringify(sources));

    // Flag any color below ~0.8 of proportional share
    for (const c of cmdAnalysis.ci) {
      const idealShare = totalPips > 0 ? (pipWeight[c] / totalPips) * (blueprint.lands) : 0;
      if (sources[c] < idealShare * 0.8 && sources[c] > 0) {
        console.log(`[LandPhase] WARNING: ${c} has ${sources[c]} sources, ideal ~${Math.round(idealShare)}`);
      }
    }

    // Add virtual basic lands by allocation
    for (const c of cmdAnalysis.ci) {
      const land = BASIC_LAND_MAP[c];
      if (!land || alloc[c] <= 0) continue;
      const virtuals = valid.filter(v =>
        v.scryfallData.id.startsWith('virtual-basic-')
        && v.scryfallData.name === land.name
        && !selectedKeys.has(getDeckCardKey(v.scryfallData))
      );
      for (let i = 0; i < Math.min(alloc[c], virtuals.length); i++) {
        addEntry(virtuals[i], 'Mana Base', `Proportional basic source (${c}: ${pipWeight[c]} pips)`);
      }
    }
  }

  // === Backfill ===
  if (cardIds.length < 99) {
    const leftovers = valid
      .filter((entry) => !selectedKeys.has(getDeckCardKey(entry.scryfallData)))
      .sort((a, b) => b.scores.composite - a.scores.composite);
    for (const entry of leftovers) {
      if (cardIds.length >= 99) break;
      addEntry(entry, getRoles(entry).land ? 'Mana Base' : 'Synergy Pieces',
        'Backfill from strongest remaining valid card');
    }
  }

  const repaired = validateAndRepairDeck(
    cardIds, entriesInDeck, roles, selectedKeys, valid, commander.scryfallData,
  );
  return {
    cardIds: repaired.cardIds,
    roles: repaired.roles,
    gamePlan: describeGamePlan(cmdAnalysis),
  };
}

function validateAndRepairDeck(
  cardIds: string[],
  entriesInDeck: CollectionEntry[],
  roles: Record<string, DeckRole>,
  selectedKeys: Set<string>,
  valid: CollectionEntry[],
  commander: import('./types').ScryfallCard,
): { cardIds: string[]; roles: Record<string, DeckRole>; violations: import('./types').DeckViolation[] } {
  const violations: import('./types').DeckViolation[] = [];
  const entryById = new Map<string, CollectionEntry>();
  for (const entry of [...entriesInDeck, ...valid]) {
    if (!entryById.has(entry.scryfallData.id)) entryById.set(entry.scryfallData.id, entry);
  }

  // 1. Dedup by getDeckCardKey, keep highest composite (basic lands exempt)
  const seenKeys = new Map<string, { id: string; composite: number }>();
  for (const id of cardIds) {
    const entry = entryById.get(id);
    if (!entry) continue;
    const card = entry.scryfallData;
    if (canRunMultipleCopies(card)) continue;
    const key = getDeckCardKey(card);
    const prev = seenKeys.get(key);
    if (prev) {
      if (entry.scores.composite > prev.composite) {
        seenKeys.set(key, { id, composite: entry.scores.composite });
        violations.push({ cardId: prev.id, type: 'duplicate', message: `Duplicate of ${card.name} (key: ${key}) — kept higher composite`, affectedCardIds: [id, prev.id] });
      } else {
        violations.push({ cardId: id, type: 'duplicate', message: `Duplicate of ${card.name} (key: ${key}) — dropped lower composite`, affectedCardIds: [id, prev.id] });
      }
    } else {
      seenKeys.set(key, { id, composite: entry.scores.composite });
    }
  }
  const dedupedIds = new Set(Array.from(seenKeys.values()).map(v => v.id));
  let repairedIds = cardIds.filter(id => {
    const entry = entryById.get(id);
    if (!entry) return true;
    if (canRunMultipleCopies(entry.scryfallData)) return true;
    return dedupedIds.has(id);
  });

  // 2. Re-verify color identity against commander
  const cmdCI = new Set(getColorIdentity(commander).map(c => c.toUpperCase()));
  repairedIds = repairedIds.filter(id => {
    const entry = entryById.get(id);
    if (!entry) return true;
    const cardCI = getColorIdentity(entry.scryfallData).map(c => c.toUpperCase());
    if (cardCI.length === 0 || cardCI.every(c => cmdCI.has(c))) return true;
    violations.push({ cardId: id, type: 'color_identity', message: `${entry.scryfallData.name} outside commander color identity`, affectedCardIds: [id] });
    return false;
  });

  // 3. Ensure exactly 99 (commander not in cardIds)
  let repairedList = [...repairedIds];
  const entryList = repairedList.map(id => entryById.get(id)).filter(Boolean) as CollectionEntry[];
  const usedKeys = new Set<string>();
  for (const id of repairedList) {
    const entry = entryById.get(id);
    if (entry && !canRunMultipleCopies(entry.scryfallData)) {
      usedKeys.add(getDeckCardKey(entry.scryfallData));
    }
  }

  if (repairedList.length > 99) {
    // Trim lowest-composite non-land cards first
    const excess = repairedList.length - 99;
    const ranked = [...repairedList]
      .map(id => ({ id, entry: entryById.get(id) }))
      .filter(e => e.entry && !isLandCard(e.entry.scryfallData))
      .sort((a, b) => (a.entry!.scores.composite || 0) - (b.entry!.scores.composite || 0));
    const toRemove = new Set(ranked.slice(0, excess).map(r => r.id));
    repairedList = repairedList.filter(id => !toRemove.has(id));
    violations.push({ cardId: '', type: 'deck_size', message: `Deck exceeded 99 cards (was ${repairedIds.length}), trimmed ${excess} lowest-composite non-lands`, affectedCardIds: [...toRemove] });
  } else if (repairedList.length < 99) {
    // Refill from highest-composite unselected legal cards in valid (real collection only, not virtual)
    const needed = 99 - repairedList.length;
    const existingIds = new Set(repairedList);
    const candidates = valid.filter(entry => {
      if (existingIds.has(entry.scryfallData.id)) return false;
      if (entry.scryfallData.id.startsWith('virtual-basic-')) return false;
      const key = getDeckCardKey(entry.scryfallData);
      if (usedKeys.has(key) && !canRunMultipleCopies(entry.scryfallData)) return false;
      const cardCI = getColorIdentity(entry.scryfallData).map(c => c.toUpperCase());
      return cardCI.length === 0 || cardCI.every(c => cmdCI.has(c));
    });
    let added = 0;
    for (const entry of candidates) {
      if (added >= needed) break;
      repairedList.push(entry.scryfallData.id);
      usedKeys.add(getDeckCardKey(entry.scryfallData));
      added++;
    }
    if (added > 0) {
      violations.push({ cardId: '', type: 'deck_size', message: `Deck was short ${99 - repairedList.length + added} cards after repair, filled ${added} from pool`, affectedCardIds: repairedList.slice(-added) });
    }
  }

  // 4. Rebuild roles for repaired list
  const repairedRoles: Record<string, DeckRole> = {};
  for (const id of repairedList) {
    repairedRoles[id] = roles[id] || { role: 'Synergy Pieces', reason: 'Added by deck repair' };
  }

  if (violations.length) {
    console.log('[validateAndRepairDeck] violations:', JSON.stringify(violations, null, 2));
  }

  return { cardIds: repairedList, roles: repairedRoles, violations };
}
