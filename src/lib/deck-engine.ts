import type { CollectionEntry, CommanderAnalysis, DeckBlueprint, DeckProfile, DeckRole } from './types';
import { getOracleText, getTypeLine, getManaCost, getColorIdentity, getDeckCardKey, isLandCard, isBasicLandCard, canRunMultipleCopies } from './card-utils';
import { detectCardRoles, cardMatchesTheme } from './card-roles';
import { getDeckBlueprint } from './deck-blueprint';
import type { PowerLevel } from './deck-blueprint';
import { analyzeCommander } from './commander-analyzer';

interface ClusterArchetype {
  name: string;
  matches: (entry: CollectionEntry, getRoles: (e: CollectionEntry) => import('./types').CardRoles) => boolean;
  minCards: number;
  idealCards: number;
  themes_supported: string[];
  role_in_deck: 'engine' | 'wincon' | 'synergy';
}

interface ClusterCandidate {
  archetype: ClusterArchetype;
  cards: CollectionEntry[];
  depth: number;
  quality: number;
  relevance: number;
  score: number;
}

interface ClusterResult {
  archetype: ClusterArchetype;
  added: CollectionEntry[];
  target: number;
  matched: number;
}

function describeGamePlan(cmdAnalysis: CommanderAnalysis, results?: ClusterResult[]): string {
  if (!results || !results.length) {
    const primary = cmdAnalysis.themes.slice(0, 2).map((t) => t[0].toUpperCase() + t.slice(1));
    return primary.length ? primary.join(' / ') : 'Balanced Goodstuff';
  }

  const nameSample = (entries: CollectionEntry[], count = 2): string =>
    entries.slice(0, count).map((e) => e.scryfallData.name).join(', ');

  const wincon = results.filter((r) => r.archetype.role_in_deck === 'wincon');
  const engines = results.filter((r) => r.archetype.role_in_deck === 'engine');
  const synergies = results.filter((r) => r.archetype.role_in_deck === 'synergy');

  const parts: string[] = [];

  const describeCluster = (r: ClusterResult): string => {
    if (r.added.length === 0) {
      return `${r.archetype.name}: empty (0/${r.matched} qualifying in collection)`;
    }
    if (r.added.length < r.target) {
      const advice = r.archetype.role_in_deck === 'wincon'
        ? 'Acquiring more options would strengthen this win condition.'
        : 'Acquiring more options would deepen this cluster.';
      return `${r.archetype.name} (${nameSample(r.added, 2)}): underfilled (${r.added.length}/${r.target}, ${r.matched} qualifying in collection). ${advice}`;
    }
    return `${r.archetype.name} (${nameSample(r.added, 2)})`;
  };

  if (wincon.length) {
    parts.push(`Wins via: ${wincon.map(describeCluster).join('; ')}`);
  }
  if (engines.length) {
    parts.push(`Engines: ${engines.map(describeCluster).join('; ')}`);
  }
  if (synergies.length) {
    parts.push(`Synergy: ${synergies.map(describeCluster).join('; ')}`);
  }
  return parts.join('. ') + '.';
}

function deriveClusterArchetypes(cmdAnalysis: CommanderAnalysis): ClusterArchetype[] {
  const archetypes: ClusterArchetype[] = [];
  const oracle = cmdAnalysis.oracle;
  const typeLine = cmdAnalysis.typeLine;
  const themes = new Set(cmdAnalysis.themes);

  const mk = (name: string, matches: ClusterArchetype['matches'], opts: {
    themes_supported: string[]; role_in_deck: ClusterArchetype['role_in_deck'];
    minCards?: number; idealCards?: number;
  }): ClusterArchetype => ({
    name,
    matches,
    minCards: opts.minCards ?? 3,
    idealCards: opts.idealCards ?? 8,
    themes_supported: opts.themes_supported,
    role_in_deck: opts.role_in_deck,
  });

  // Graveyard → fill (ACTIVELY puts cards into graveyard)
  if (themes.has('graveyard') || /graveyard|return.*graveyard/i.test(oracle)) {
    archetypes.push(mk('Graveyard Fill', (entry) => {
      const oracle = getOracleText(entry.scryfallData).toLowerCase();
      return /\b(?:mill|discard|dredge|surveil|connive|loot|descend|delirium)\b|put.{0,30}(top|cards?).{0,30}(into|in).{0,15}(graveyard|your graveyard)/i.test(oracle);
    }, { themes_supported: ['graveyard'], role_in_deck: 'engine' }));
    archetypes.push(mk('Reanimation Engine', (entry) => {
      const oracle = getOracleText(entry.scryfallData).toLowerCase();
      return /return.{0,40}(from.{0,15}graveyard).{0,30}(battlefield|your hand|play)/i.test(oracle);
    }, { themes_supported: ['graveyard'], role_in_deck: 'wincon', idealCards: 6 }));
  }

  // Tribal → density + payoffs (MUST reference the specific tribe)
  if (themes.has('tribal') && cmdAnalysis.subtypes.length > 0) {
    const sub = cmdAnalysis.subtypes[0];
    const subLower = sub.toLowerCase();
    archetypes.push(mk(`${sub} Tribal Density`, (entry) => {
      const typeLine = getTypeLine(entry.scryfallData).toLowerCase();
      return typeLine.includes(subLower);
    }, { themes_supported: ['tribal'], role_in_deck: 'synergy', idealCards: 14 }));
    archetypes.push(mk(`${sub} Tribal Payoffs`, (entry) => {
      const oracle = getOracleText(entry.scryfallData).toLowerCase();
      const typeLine = getTypeLine(entry.scryfallData).toLowerCase();
      // Must name the tribe specifically, not generic "creatures you control"
      if (typeLine.includes(subLower)) return true; // e.g., tribal lord creatures
      if (new RegExp(`${subLower}(s)?\\s+(you|spell|creature|permanent)`, 'i').test(oracle)) return true;
      if (new RegExp(`(create|put|return).{0,30}\\b${subLower}\\b`, 'i').test(oracle)) return true;
      if (new RegExp(`(choose|target) \\w* ?${subLower}`, 'i').test(oracle)) return true;
      if (new RegExp(`for each ${subLower}`, 'i').test(oracle)) return true;
      return false;
    }, { themes_supported: ['tribal'], role_in_deck: 'wincon', idealCards: 6 }));
  }

  // Sacrifice → sac outlets (activated/triggered sac ability) + death triggers
  if (themes.has('sacrifice') || /sacrifice|dies|whenever.*creature.*dies/i.test(oracle)) {
    archetypes.push(mk('Sacrifice Outlets', (entry) => {
      const oracle = getOracleText(entry.scryfallData).toLowerCase();
      return /sacrifice (a|another|target|an?) .{0,25}(creature|permanent):/i.test(oracle)
        || /(whenever|at the beginning).{0,40}you may sacrifice/i.test(oracle);
    }, { themes_supported: ['sacrifice'], role_in_deck: 'engine', idealCards: 5 }));
    if (cmdAnalysis.wants.includes('dies') || /dies|whenever.*creature.*dies/i.test(oracle)) {
      archetypes.push(mk('Death Triggers', (entry) => {
        const oracle = getOracleText(entry.scryfallData).toLowerCase();
        return /when(?:ever)?.{0,25}(dies|is put into.{0,10}graveyard from)/i.test(oracle);
      }, { themes_supported: ['sacrifice'], role_in_deck: 'wincon', idealCards: 5 }));
    }
  }

  // Tokens → token creation + go-wide payoffs
  if (themes.has('tokens') || /create.*token|populate/i.test(oracle)) {
    archetypes.push(mk('Token Engine', (entry) => {
      const oracle = getOracleText(entry.scryfallData).toLowerCase();
      return /create.{0,20}token|populate|amass|offspring/i.test(oracle);
    }, { themes_supported: ['tokens'], role_in_deck: 'engine', idealCards: 7 }));
    archetypes.push(mk('Go-Wide Payoffs', (entry) => {
      const oracle = getOracleText(entry.scryfallData).toLowerCase();
      return /creatures you control get \+|overrun|triumph of the hordes|extra combat/i.test(oracle);
    }, { themes_supported: ['tokens', 'tribal'], role_in_deck: 'wincon', idealCards: 4 }));
  }

  // Spellslinger → spell payoffs (NOT just "is an instant/sorcery")
  if (themes.has('spellslinger') || /whenever you cast.*instant|whenever you cast.*sorcery|magecraft|storm|copy.*spell/i.test(oracle)) {
    archetypes.push(mk('Spell Payoffs', (entry) => {
      const oracle = getOracleText(entry.scryfallData).toLowerCase();
      return /whenever you cast|magecraft|prowess|storm|cop(?:y|ies).{0,10}(target )?spell/i.test(oracle);
    }, { themes_supported: ['spellslinger'], role_in_deck: 'wincon', idealCards: 5 }));
  }

  // Blink → flicker effects + ETB value
  if (themes.has('blink') || /exile.*return.*battlefield|flicker|blink/i.test(oracle)) {
    archetypes.push(mk('Blink Engine', (entry) => {
      const oracle = getOracleText(entry.scryfallData).toLowerCase();
      return /exile.{0,20}(return|then return).{0,30}battlefield|flicker|blink/i.test(oracle);
    }, { themes_supported: ['blink'], role_in_deck: 'engine', idealCards: 6 }));
    archetypes.push(mk('ETB Value', (entry) => {
      const oracle = getOracleText(entry.scryfallData).toLowerCase();
      if (isLandCard(entry.scryfallData)) return false;
      return /when(?:ever)?.{0,30}(enters|enters the battlefield)/i.test(oracle);
    }, { themes_supported: ['blink', 'graveyard'], role_in_deck: 'synergy', idealCards: 10 }));
  }

  // Counters
  if (themes.has('counters') || /\+1\/\+1 counter|proliferate|adapt|evolve|bolster/i.test(oracle)) {
    archetypes.push(mk('Counter Engine', (entry) => {
      const oracle = getOracleText(entry.scryfallData).toLowerCase();
      return /\+1\/\+1 counter|proliferate|adapt|evolve|bolster|support/i.test(oracle);
    }, { themes_supported: ['counters'], role_in_deck: 'engine' }));
  }

  // Voltron
  if (themes.has('voltron') || /equipment|aura|attach|equip/i.test(oracle)) {
    archetypes.push(mk('Commander Enhancement', (entry) => {
      const oracle = getOracleText(entry.scryfallData).toLowerCase();
      const typeLine = getTypeLine(entry.scryfallData).toLowerCase();
      if (/equipment\b/i.test(typeLine) || /\baura\b/i.test(typeLine)) return true;
      return /equip\b|enchant creature|attach/i.test(oracle);
    }, { themes_supported: ['voltron'], role_in_deck: 'engine', idealCards: 6 }));
  }

  // Damage → burn to opponents
  if (themes.has('damage') || /deal.*damage|each opponent loses|burn|ping/i.test(oracle)) {
    archetypes.push(mk('Burn Engine', (entry) => {
      const oracle = getOracleText(entry.scryfallData).toLowerCase();
      return /deal.{0,30}damage to (each|target) opponent|each opponent loses|whenever.{0,20}damage/i.test(oracle);
    }, { themes_supported: ['damage'], role_in_deck: 'wincon', idealCards: 5 }));
  }

  // Draw synergies
  if (themes.has('draw') || /draw.*card|whenever you draw|wheel/i.test(oracle)) {
    archetypes.push(mk('Draw Engine', (entry) => {
      const oracle = getOracleText(entry.scryfallData).toLowerCase();
      return /whenever you draw|draw.{0,20}(additional|extra|that many)/i.test(oracle);
    }, { themes_supported: ['draw'], role_in_deck: 'engine', idealCards: 6 }));
  }

  // Landfall
  if (themes.has('landfall') || /landfall|whenever a land enters/i.test(oracle)) {
    archetypes.push(mk('Landfall Engine', (entry) => {
      const oracle = getOracleText(entry.scryfallData).toLowerCase();
      return /landfall|whenever.{0,10}(a|another) land enters/i.test(oracle);
    }, { themes_supported: ['landfall'], role_in_deck: 'engine', idealCards: 7 }));
  }

  // Artifacts
  if (themes.has('artifacts') || /artifact.*you control|affinity|improvise/i.test(oracle)) {
    archetypes.push(mk('Artifact Engine', (entry) => {
      const oracle = getOracleText(entry.scryfallData).toLowerCase();
      const typeLine = getTypeLine(entry.scryfallData).toLowerCase();
      return /artifact\b/i.test(typeLine)
        || /affinity.{0,10}artifacts|improvise|artifact.{0,15}(you control|spells?)|treasure|clue|food token/i.test(oracle);
    }, { themes_supported: ['artifacts'], role_in_deck: 'engine' }));
  }

  // Enchantments
  if (themes.has('enchantments') || /enchantment|constellation|enchant/i.test(oracle)) {
    archetypes.push(mk('Enchantment Engine', (entry) => {
      const oracle = getOracleText(entry.scryfallData).toLowerCase();
      const typeLine = getTypeLine(entry.scryfallData).toLowerCase();
      return /enchantment\b/i.test(typeLine) || /constellation|enchant/i.test(oracle);
    }, { themes_supported: ['enchantments'], role_in_deck: 'engine' }));
  }

  // Commander-specific keyword archetypes
  if (/evoke/i.test(oracle)) {
    archetypes.push(mk('Evoke Engine', (entry) => {
      const oracle = getOracleText(entry.scryfallData).toLowerCase();
      const typeLine = getTypeLine(entry.scryfallData).toLowerCase();
      const subLower = cmdAnalysis.subtypes[0]?.toLowerCase();
      if (!subLower) return /evoke/i.test(oracle);
      return typeLine.includes(subLower) && /evoke/i.test(oracle);
    }, { themes_supported: ['graveyard', 'tribal'], role_in_deck: 'engine', idealCards: 5 }));
  }
  if (cmdAnalysis.wants.includes('attack') || /attacks|combat damage/i.test(oracle)) {
    archetypes.push(mk('Combat Finishers', (entry) => {
      const oracle = getOracleText(entry.scryfallData).toLowerCase();
      return /extra combat|creatures you control get \+|overrun|triumph of the hordes/i.test(oracle);
    }, { themes_supported: ['damage', 'tribal'], role_in_deck: 'wincon', idealCards: 4 }));
  }

  // Recursion Engine: anything that returns cards from graveyard
  archetypes.push(mk('Recursion Engine', (entry) => {
    const oracle = getOracleText(entry.scryfallData).toLowerCase();
    return /return.{0,30}(from.{0,10}graveyard|target.{0,15}(creature|permanent).{0,10}from.{0,10}graveyard)/i.test(oracle)
      || /reanimate|unearth|flashback|disturb|escape|recover|buyback|delve|embalm/i.test(oracle);
  }, { themes_supported: ['graveyard', 'sacrifice', 'spellslinger'], role_in_deck: 'engine', idealCards: 6 }));

  // Value Engine: incidental card advantage, NOT just "has draw a card in text"
  archetypes.push(mk('Value Engine', (entry) => {
    const oracle = getOracleText(entry.scryfallData).toLowerCase();
    return /scry \d|surveil \d|cascade|discover|investigate|venture|connive|learn/i.test(oracle);
  }, { themes_supported: ['draw'], role_in_deck: 'synergy', idealCards: 6 }));

  // Deduplicate by name
  const seen = new Set<string>();
  return archetypes.filter((a) => {
    const key = a.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scoreCluster(
  archetype: ClusterArchetype,
  valid: CollectionEntry[],
  getRoles: (entry: CollectionEntry) => import('./types').CardRoles,
): ClusterCandidate | null {
  const matches = valid.filter((entry) => {
    if (isLandCard(entry.scryfallData)) return false;
    return archetype.matches(entry, getRoles);
  });

  if (matches.length < archetype.minCards) return null;

  // Depth: 0–10 scale, more cards = higher depth
  const depth = Math.min(10, matches.length / 2.5);

  // Quality: average composite of top idealCards*2 matches
  const ideal = archetype.idealCards * 2;
  const topMatches = [...matches]
    .sort((a, b) => b.scores.composite - a.scores.composite)
    .slice(0, Math.max(ideal, archetype.minCards));
  const avgComposite = topMatches.reduce((s, e) => s + e.scores.composite, 0) / topMatches.length;
  const quality = Math.min(10, avgComposite / 9.0);

  // Relevance: how many themes match * 3, capped at 10
  const relevance = Math.min(10, archetype.themes_supported.length * 4 + (archetype.role_in_deck === 'wincon' ? 5 : 0));

  const score = Math.round((depth * 1.5 + quality * 2.0 + relevance * 2.5) * 10) / 10;

  return {
    archetype,
    cards: matches,
    depth: Math.round(depth * 10) / 10,
    quality: Math.round(quality * 10) / 10,
    relevance: Math.round(relevance * 10) / 10,
    score,
  };
}

function selectClusters(
  candidates: ClusterCandidate[],
  cmdAnalysis: CommanderAnalysis,
): ClusterCandidate[] {
  if (!candidates.length) return [];

  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const selected: ClusterCandidate[] = [];
  const coveredThemes = new Set<string>();
  const needsWincon = true;

  for (const candidate of sorted) {
    if (selected.length >= 10) break;

    // Preference for clusters whose cards overlap with already-selected clusters
    let overlapBonus = 0;
    if (selected.length > 0) {
      const existingIds = new Set<string>();
      for (const sc of selected) {
        for (const c of sc.cards) existingIds.add(c.scryfallData.id);
      }
      for (const c of candidate.cards) {
        if (existingIds.has(c.scryfallData.id)) overlapBonus++;
      }
    }

    const effectiveScore = candidate.score + overlapBonus * 0.5;

    // Select if we need wincon and this is one, or if we need theme coverage
    const isWincon = candidate.archetype.role_in_deck === 'wincon';
    const hasWincon = selected.some((s) => s.archetype.role_in_deck === 'wincon');
    const addsNewTheme = candidate.archetype.themes_supported.some((t) => !coveredThemes.has(t));

    if ((needsWincon && isWincon) || addsNewTheme || selected.length < 4) {
      selected.push(candidate);
      for (const t of candidate.archetype.themes_supported) coveredThemes.add(t);
    } else if (overlapBonus >= 3 && selected.length < 10) {
      selected.push(candidate);
    }
  }

  // If we still have no wincon, force the highest-scored wincon in
  if (!selected.some((s) => s.archetype.role_in_deck === 'wincon')) {
    const bestWincon = sorted.find((s) => s.archetype.role_in_deck === 'wincon');
    if (bestWincon && !selected.includes(bestWincon)) {
      selected.push(bestWincon);
    }
  }

  // Deduplicate
  const seen = new Set<ClusterCandidate>();
  return selected.filter((s) => { const dup = seen.has(s); seen.add(s); return !dup; });
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

  if (cmdAnalysis.tribalPayoff && cmdAnalysis.tribalSubtype) {
    const cardTypeLine = getTypeLine(card).toLowerCase();
    if (cardTypeLine.includes(cmdAnalysis.tribalSubtype.toLowerCase())) {
      score += 30;
      reasons.push(`${cmdAnalysis.tribalSubtype} tribal payoff`);
    }
  }

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

  const graveyardBombs = top((e) => /return.*graveyard.*battlefield|reanimate|whenever a creature dies|sacrifice a creature|mill \d|discard a card.*draw|dredge|surveil|creatures you control get \+.*for each creature card in|number of creature cards in your graveyard/i.test(getOracleText(e.scryfallData)), 4);
  if (graveyardBombs.length >= 2 && (cmdAnalysis.themes.includes('graveyard') || cmdAnalysis.themes.includes('sacrifice') || cmdAnalysis.wants.includes('dies')))
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
  const selectedNames = new Set<string>();
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
  for (const entry of augmentedCollection) {
    const card = entry.scryfallData;
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
    if (!canRunMultipleCopies(card)) {
      const nameLower = (card.name || '').toLowerCase();
      if (selectedNames.has(nameLower)) return false;
      selectedNames.add(nameLower);
    }
    cardIds.push(card.id);
    selectedKeys.add(key);
    roles[card.id] = { role, reason };
    entriesInDeck.push(entry);
    return true;
  };

  // === CLUSTER-FIRST BUILDING ===
  // Phase 1: Derive and score cluster archetypes
  const allArchetypes = deriveClusterArchetypes(cmdAnalysis);
  const candidates: ClusterCandidate[] = [];
  for (const archetype of allArchetypes) {
    const result = scoreCluster(archetype, valid, getRoles);
    if (result) candidates.push(result);
  }

  // Phase 2: Select top clusters
  const selectedClusters = selectClusters(candidates, cmdAnalysis);

  // Log cluster selection
  console.log('[Cluster] Selected clusters:');
  for (const cluster of selectedClusters) {
    console.log(`  "${cluster.archetype.name}" depth=${cluster.depth} quality=${cluster.quality} relevance=${cluster.relevance} score=${cluster.score} role=${cluster.archetype.role_in_deck} (${cluster.cards.length} cards)`);
  }

  // Phase 3: Allocate non-land slots across clusters
  const totalScore = selectedClusters.reduce((s, c) => s + c.score, 0);
  const nonLandTarget = 99 - blueprint.lands;
  let clusterSlotsAllocated = 0;
  const clusterAlloc: Map<ClusterCandidate, number> = new Map();

  if (selectedClusters.length > 0 && totalScore > 0) {
    for (const cluster of selectedClusters) {
      const idealShare = Math.round((cluster.score / totalScore) * nonLandTarget * 0.7); // 70% to clusters
      const capped = Math.min(idealShare, cluster.archetype.idealCards);
      clusterAlloc.set(cluster, Math.max(Math.min(cluster.archetype.minCards, cluster.cards.length), capped));
      clusterSlotsAllocated += clusterAlloc.get(cluster)!;
    }
  }

  // Phase 4: Fill each cluster with its best cards, track results
  const clusterResults: ClusterResult[] = [];
  const clusterCardIds = new Map<string, ClusterCandidate[]>();
  for (const cluster of selectedClusters) {
    const alloc = clusterAlloc.get(cluster) || 0;
    if (alloc <= 0) {
      clusterResults.push({ archetype: cluster.archetype, added: [], target: alloc, matched: cluster.cards.length });
      continue;
    }
    const ranked = [...cluster.cards].sort((a, b) => b.scores.composite - a.scores.composite);
    const addedEntries: CollectionEntry[] = [];
    for (const entry of ranked) {
      if (addedEntries.length >= alloc) break;
      const card = entry.scryfallData;
      const key = getDeckCardKey(card);

      if (selectedKeys.has(key) || cardIds.includes(card.id)) {
        let inOtherClusters = 0;
        for (const sc of selectedClusters) {
          if (sc === cluster) continue;
          if (sc.cards.some((c) => c.scryfallData.id === card.id)) inOtherClusters++;
        }
        if (inOtherClusters === 0) continue;
      }

      if (addEntry(entry, cluster.archetype.name, `${cluster.archetype.role_in_deck} for "${cluster.archetype.name}" cluster`)) {
        addedEntries.push(entry);
        const ccs = clusterCardIds.get(card.id) || [];
        ccs.push(cluster);
        clusterCardIds.set(card.id, ccs);
      }
    }
    clusterResults.push({ archetype: cluster.archetype, added: addedEntries, target: alloc, matched: cluster.cards.length });
  }

  // Phase 5: Compute cluster overlap score
  let overlapCount = 0;
  for (const [, clusters] of clusterCardIds) {
    if (clusters.length >= 2) overlapCount++;
  }
  console.log(`[Cluster] overlap: ${overlapCount} cards serve 2+ clusters`);

  // Phase 6: Fill support slots (tutors, protection, then role-based fill)
  const supportSlotsTarget = nonLandTarget - cardIds.length;

  // Tutors
  if (blueprint.tutors > 0) {
    const tutorCandidates = valid
      .filter((entry) => {
        const key = getDeckCardKey(entry.scryfallData);
        return !selectedKeys.has(key) && getRoles(entry).tutor && !isLandCard(entry.scryfallData);
      })
      .sort((a, b) => b.scores.composite - a.scores.composite);
    for (const entry of tutorCandidates.slice(0, blueprint.tutors)) {
      if (cardIds.length >= nonLandTarget) break;
      addEntry(entry, 'Tutors', 'Finds the best card for the current board');
    }
  }

  // Protection
  if (blueprint.protection > 0) {
    const protCandidates = valid
      .filter((entry) => {
        const key = getDeckCardKey(entry.scryfallData);
        return !selectedKeys.has(key) && getRoles(entry).protection && !isLandCard(entry.scryfallData);
      })
      .sort((a, b) => b.scores.composite - a.scores.composite)
      .slice(0, Math.max(1, blueprint.protection - 1));
    for (const entry of protCandidates) {
      if (cardIds.length >= nonLandTarget) break;
      addEntry(entry, 'Protection', 'Defends commander and key engine pieces');
    }
  }

  // Phase 7: Role-aware fill for remaining non-land slots
  // Use a single-pass greedy fill like the old approach, but prioritize cards that fill blueprint gaps
  let fillSafety = 0;
  while (cardIds.length < nonLandTarget && fillSafety < 260) {
    fillSafety++;
    const profile = buildDeckProfile(entriesInDeck, cmdAnalysis, getRoles);

    const fillCandidates: CollectionEntry[] = [];
    for (const entry of valid) {
      if (!selectedKeys.has(getDeckCardKey(entry.scryfallData))) {
        fillCandidates.push(entry);
        if (fillCandidates.length >= 250) break;
      }
    }
    if (!fillCandidates.length) break;

    let best: { entry: CollectionEntry; score: number; role: string; reason: string } | null = null;
    for (const entry of fillCandidates) {
      if (getRoles(entry).land) continue;
      const scored = scoreCandidateForDeck(entry, profile, blueprint, cmdAnalysis, getRoles);
      if (scored && (!best || scored.score > best.score)) best = { entry, ...scored };
    }

    if (!best) break;
    addEntry(best.entry, best.role, best.reason);
  }

  // Track selected clusters for game plan
  const finalResults = clusterResults;

  // Log per-cluster fill status
  for (const r of finalResults) {
    if (r.added.length < r.target) {
      console.log(`[Cluster] "${r.archetype.name}" underfilled: ${r.added.length}/${r.target} (${r.matched} qualifying in collection)`);
    }
  }

  // === PHASE 8: Compute pip-weight from actual selected nonland cards ===
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
    gamePlan: describeGamePlan(cmdAnalysis, finalResults),
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

  // 0. Literal card.id dedup: unconditional — drop any second occurrence of the same card.id
  // Uses a Set so equal composite scores don't let duplicates slip through.
  const beforeIdDedup = cardIds.length;
  const seenCardIds = new Set<string>();
  const dedupedCardIds = cardIds.filter(id => {
    if (seenCardIds.has(id)) {
      const entry = entryById.get(id);
      if (entry) violations.push({ cardId: id, type: 'duplicate', message: `Removed literal duplicate: ${entry.scryfallData.name}`, affectedCardIds: [id] });
      return false;
    }
    seenCardIds.add(id);
    return true;
  });
  cardIds = dedupedCardIds;
  console.log('[idDedup] removed', beforeIdDedup - cardIds.length, 'literal duplicates, final:', cardIds.length);

  // 1. Dedup by lowercased name (catches DFCs with same name, different oracle_ids)
  const seenNames = new Map<string, { id: string; composite: number }>();
  for (const id of cardIds) {
    const entry = entryById.get(id);
    if (!entry) continue;
    const card = entry.scryfallData;
    if (canRunMultipleCopies(card)) continue;
    const nameKey = (card.name || '').toLowerCase();
    const prev = seenNames.get(nameKey);
    if (prev) {
      if (entry.scores.composite > prev.composite) {
        seenNames.set(nameKey, { id, composite: entry.scores.composite });
        violations.push({ cardId: prev.id, type: 'duplicate', message: `Name collision: ${card.name} — kept higher composite`, affectedCardIds: [id, prev.id] });
      } else {
        violations.push({ cardId: id, type: 'duplicate', message: `Name collision: ${card.name} — dropped lower composite`, affectedCardIds: [id, prev.id] });
      }
    } else {
      seenNames.set(nameKey, { id, composite: entry.scores.composite });
    }
  }
  const nameDedupedIds = new Set(Array.from(seenNames.values()).map(v => v.id));
  cardIds = cardIds.filter(id => {
    const entry = entryById.get(id);
    if (!entry) return false;
    if (canRunMultipleCopies(entry.scryfallData)) return true;
    return nameDedupedIds.has(id);
  });
  console.log('[nameDedup] final count after name dedup:', cardIds.length);

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
    if (!entry) return false;
    if (canRunMultipleCopies(entry.scryfallData)) return true;
    return dedupedIds.has(id);
  });

  // 1.5 Flat dedup: remove any literal duplicate IDs (same card.id appearing twice)
  // This catches duplicates that slip through name/key dedup when the same ID
  // appears multiple times in cardIds (e.g. from duplicate CSV import rows).
  {
    const seenIds = new Set<string>();
    repairedIds = repairedIds.filter(id => {
      const entry = entryById.get(id);
      if (!entry) return false;
      if (canRunMultipleCopies(entry.scryfallData)) return true;
      if (seenIds.has(id)) {
        violations.push({ cardId: id, type: 'duplicate', message: `Removed literal duplicate: ${entry.scryfallData.name}`, affectedCardIds: [id] });
        return false;
      }
      seenIds.add(id);
      return true;
    });
  }

  // 2. Re-verify color identity against commander
  const cmdCI = new Set(getColorIdentity(commander).map(c => c.toUpperCase()));
  repairedIds = repairedIds.filter(id => {
    const entry = entryById.get(id);
    if (!entry) return false;
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
