import type { ScryfallCard, Scores } from './types';
import type { PowerLevel } from './deck-blueprint';
import { getColorIdentity, getOracleText, getTypeLine } from './card-utils';

function scoreBudget(csvRow: Record<string, string>, card: ScryfallCard): { score: number; price: number; reasons: string[] } {
  let price = parseFloat(csvRow['purchasePrice'] || '0');
  if (!price || isNaN(price)) {
    const prices = card.prices || {};
    price = parseFloat(prices.usd || prices.usd_foil || '0') || 0;
  }

  let score: number;
  const reasons: string[] = [];
  const priceStr = price.toFixed(2);

  if (price <= 0.25)      { score = 10; reasons.push(`Price $${priceStr} — excellent budget card`); }
  else if (price <= 1.00) { score = 8;  reasons.push(`Price $${priceStr} — good budget value`); }
  else if (price <= 3.00) { score = 6;  reasons.push(`Price $${priceStr} — moderate cost`); }
  else if (price <= 10.00){ score = 4;  reasons.push(`Price $${priceStr} — moderately expensive`); }
  else if (price <= 25.00){ score = 2;  reasons.push(`Price $${priceStr} — expensive card`); }
  else                    { score = 1;  reasons.push(`Price $${priceStr} — premium card`); }

  if (price === 0) reasons.push('No price data available');
  return { score, price, reasons };
}

const KNOWN_STAPLES: Record<string, { power: number; manaEff: number; tier?: 'casual' | 'high-power' | 'cedh' }> = {
  'sol ring':               { power: 10, manaEff: 10, tier: 'casual' },
  'mana crypt':             { power: 10, manaEff: 10, tier: 'cedh' },
  'mana vault':             { power: 9,  manaEff: 9,  tier: 'high-power' },
  'chrome mox':             { power: 9,  manaEff: 9,  tier: 'cedh' },
  'mox diamond':            { power: 9,  manaEff: 9,  tier: 'cedh' },
  'mox opal':               { power: 8,  manaEff: 8,  tier: 'cedh' },
  'lotus petal':            { power: 8,  manaEff: 9,  tier: 'cedh' },
  'jeweled lotus':          { power: 9,  manaEff: 9,  tier: 'cedh' },
  'arcane signet':          { power: 7,  manaEff: 8,  tier: 'casual' },
  'mind stone':             { power: 5,  manaEff: 6,  tier: 'casual' },
  'demonic tutor':          { power: 9,  manaEff: 9,  tier: 'high-power' },
  'vampiric tutor':         { power: 9,  manaEff: 9,  tier: 'high-power' },
  'mystical tutor':         { power: 8,  manaEff: 8,  tier: 'high-power' },
  'worldly tutor':          { power: 8,  manaEff: 8,  tier: 'high-power' },
  'enlightened tutor':      { power: 8,  manaEff: 8,  tier: 'high-power' },
  'imperial seal':          { power: 8,  manaEff: 8,  tier: 'cedh' },
  'gamble':                 { power: 7,  manaEff: 8,  tier: 'high-power' },
  'rhystic study':          { power: 9,  manaEff: 7,  tier: 'high-power' },
  'mystic remora':          { power: 8,  manaEff: 8,  tier: 'high-power' },
  'smothering tithe':       { power: 9,  manaEff: 7,  tier: 'high-power' },
  'esper sentinel':         { power: 8,  manaEff: 8,  tier: 'high-power' },
  'cyclonic rift':          { power: 9,  manaEff: 7,  tier: 'high-power' },
  'fierce guardianship':    { power: 9,  manaEff: 8,  tier: 'cedh' },
  'deadly rollick':         { power: 9,  manaEff: 8,  tier: 'cedh' },
  'force of will':          { power: 9,  manaEff: 8,  tier: 'cedh' },
  'force of negation':      { power: 9,  manaEff: 8,  tier: 'cedh' },
  'swan song':              { power: 8,  manaEff: 8,  tier: 'high-power' },
  'swords to plowshares':   { power: 8,  manaEff: 9,  tier: 'casual' },
  'path to exile':          { power: 8,  manaEff: 9,  tier: 'casual' },
  'assassin\'s trophy':     { power: 8,  manaEff: 8,  tier: 'high-power' },
  'toxic deluge':           { power: 9,  manaEff: 8,  tier: 'high-power' },
  'damnation':              { power: 8,  manaEff: 7,  tier: 'high-power' },
  'teferi\'s protection':   { power: 9,  manaEff: 7,  tier: 'high-power' },
  'deflecting swat':        { power: 9,  manaEff: 8,  tier: 'cedh' },
  'flawless maneuver':      { power: 8,  manaEff: 8,  tier: 'cedh' },
  'necropotence':           { power: 9,  manaEff: 8,  tier: 'cedh' },
  'ad nauseam':             { power: 9,  manaEff: 8,  tier: 'cedh' },
  'underworld breach':      { power: 9,  manaEff: 8,  tier: 'cedh' },
  'thassa\'s oracle':       { power: 9,  manaEff: 9,  tier: 'cedh' },
  'demonic consultation':   { power: 9,  manaEff: 9,  tier: 'cedh' },
  'tainted pact':           { power: 9,  manaEff: 7,  tier: 'cedh' },
  'dockside extortionist':  { power: 9,  manaEff: 8,  tier: 'high-power' },
  'craterhoof behemoth':    { power: 9,  manaEff: 6,  tier: 'high-power' },
  'the one ring':           { power: 9, manaEff: 7, tier: 'high-power' },
  'beast within':           { power: 7, manaEff: 7, tier: 'casual' },
  'cultivate':              { power: 8, manaEff: 8, tier: 'casual' },
  'kodama\'s reach':        { power: 8, manaEff: 8, tier: 'casual' },
  'three visits':           { power: 8, manaEff: 9, tier: 'casual' },
  'farseek':                { power: 8, manaEff: 8, tier: 'casual' },
};

export function applyTierGating(
  cardName: string,
  composite: number,
  powerLevel: PowerLevel,
): number {
  const staple = KNOWN_STAPLES[cardName.toLowerCase()];
  if (!staple?.tier) return composite;
  const tier = staple.tier;
  const tierRank: Record<string, number> = { casual: 0, 'high-power': 1, cedh: 2 };
  const selectedRank = tierRank[powerLevel === 'competitive' ? 'cedh' : powerLevel === '75%' ? 'high-power' : 'casual'];
  if (tierRank[tier] > selectedRank) return Math.round(composite * 0.3);
  if (tierRank[tier] < selectedRank) return Math.max(1, composite - 5);
  return composite;
}

export function scoreCard(
  scryfallData: ScryfallCard,
  csvRow: Record<string, string>,
  commanderData: ScryfallCard | null,
): Scores {
  const oracle = getOracleText(scryfallData).toLowerCase();
  const typeLine = getTypeLine(scryfallData).toLowerCase();
  const cmc = scryfallData.cmc || 0;
  const keywords = (scryfallData.keywords || []).map((k) => k.toLowerCase());

  /* 1. POWER LEVEL */
  let power = 3;
  const powerReasons: string[] = [];

  const nameLower = (scryfallData.name || '').toLowerCase();
  const staple = KNOWN_STAPLES[nameLower];
  if (staple) {
    power = staple.power;
    powerReasons.push(`Recognized staple: ${scryfallData.name}`);
  }

  const powerKeywords: Array<{ kw: string; pts: number; label: string }> = [
    { kw: 'extra turn', pts: 4, label: 'Extra turn effect' },
    { kw: 'return all', pts: 3, label: 'Mass recursion' },
    { kw: 'search your library', pts: 2, label: 'Tutor effect' },
    { kw: 'draw', pts: 1, label: 'Card draw' },
    { kw: 'copy', pts: 1, label: 'Copy effect' },
    { kw: 'double', pts: 1, label: 'Doubling effect' },
    { kw: 'free spell', pts: 3, label: 'Free spell potential' },
    { kw: 'cascade', pts: 2, label: 'Cascade' },
    { kw: 'untap', pts: 1, label: 'Untap ability' },
    { kw: 'proliferate', pts: 1, label: 'Proliferate' },
  ];

  for (const pk of powerKeywords) {
    if (oracle.includes(pk.kw)) {
      power += pk.pts;
      powerReasons.push(pk.label);
    }
  }

  if (/destroy all|exile all|all creatures/i.test(oracle)) {
    power += 2;
    powerReasons.push('Board wipe / mass removal');
  }

  const drawMatches = (oracle.match(/draw \d+ card/g) || []);
  if (drawMatches.length > 1) {
    power += 1;
    powerReasons.push('Multiple draw effects');
  }

  if (typeLine.includes('legendary') && typeLine.includes('creature') && keywords.length >= 3) {
    power += 1;
    powerReasons.push('Legendary creature with multiple abilities');
  }

  if (power < 1) power = 1;
  if (power > 10) power = 10;
  power = Math.round(power);

  /* 2. MANA EFFICIENCY */
  let manaEff = 5;
  const manaReasons: string[] = [];

  if (staple) {
    manaEff = staple.manaEff;
    manaReasons.push('Staple mana efficiency');
  } else {

  const isManaRock = /add \{/i.test(oracle);
  if (isManaRock) {
    const prodMatch = oracle.match(/add \{([^}]+)\}\{([^}]+)\}/);
    const extraMana = prodMatch ? 2 : 1;
    manaEff = Math.max(manaEff, 10 - cmc + extraMana);
    manaReasons.push(`Mana rock (produces ${extraMana}+ mana)`);
  }

  if (cmc === 0)      { manaEff = Math.max(manaEff, 8); manaReasons.push('Zero mana cost'); }
  else if (cmc === 1) { manaEff = Math.max(manaEff, 8); manaReasons.push('1-mana spell'); }
  else if (cmc === 2) { manaEff = Math.max(manaEff, 7); manaReasons.push('2-mana spell'); }
  else if (cmc === 3) { manaEff = Math.max(manaEff, 6); manaReasons.push('3-mana spell'); }
  else if (cmc <= 5)  { manaEff = Math.max(manaEff, 4); manaReasons.push(`${cmc}-mana spell`); }
  else if (cmc <= 7)  { manaEff = Math.max(manaEff, 3); manaReasons.push(`${cmc}-mana spell`); }
  else                { manaEff = Math.max(manaEff, 2); manaReasons.push(`High-cost spell (${cmc} mana)`); }

  if (cmc <= 2 && power >= 7) { manaEff = Math.min(10, manaEff + 2); manaReasons.push('Exceptional effect for cost'); }
  if (cmc >= 6 && power >= 9) { manaEff = Math.min(10, manaEff + 2); manaReasons.push('Game-winning effect despite high cost'); }

  }

  manaEff = Math.max(1, Math.min(10, Math.round(manaEff)));

  /* 3. COMMANDER SYNERGY */
  let cmdSynergy = 5;
  const synergyReasons: string[] = [];

  if (!commanderData) {
    cmdSynergy = 5;
    synergyReasons.push('No commander selected (default score)');
  } else {
    const cmdCI = getColorIdentity(commanderData).map((c) => c.toUpperCase());
    const cardCI = getColorIdentity(scryfallData).map((c) => c.toUpperCase());

    const isValid = cardCI.length === 0 || cardCI.every((c) => cmdCI.includes(c));
    if (!isValid) {
      return {
        power, manaEff, cmdSynergy: 0, winCon: 0, budget: 0, composite: 0, valid: false,
        reasons: {
          power: powerReasons.length ? powerReasons : ['No exceptional power keywords detected'],
          manaEff: manaReasons,
          cmdSynergy: ['Outside commander color identity — INVALID'],
          winCon: ['Card is color identity invalid'],
          budget: ['N/A'],
        },
      };
    }

    const legality = ((scryfallData.legalities && scryfallData.legalities.commander || '') || '').toLowerCase();
    if (legality === 'banned' || legality === 'not_legal') {
      return {
        power, manaEff, cmdSynergy: 0, winCon: 0, budget: 0, composite: 0, valid: false,
        reasons: {
          power: powerReasons.length ? powerReasons : ['Card is banned in Commander'],
          manaEff: manaReasons,
          cmdSynergy: ['Banned/illegal in Commander'],
          winCon: ['Banned/illegal in Commander'],
          budget: ['N/A'],
        },
      };
    }

    synergyReasons.push('Color identity valid');
    cmdSynergy = 5;

    const cmdOracle = getOracleText(commanderData).toLowerCase();
    const cmdKeywords = (commanderData.keywords || []).map((k) => k.toLowerCase());
    const cmdType = getTypeLine(commanderData).toLowerCase();

    const synergies = [
      { cmd: '+1/+1 counter', card: 'proliferate', pts: 2, label: 'Proliferate synergizes with counters' },
      { cmd: '+1/+1 counter', card: '+1/+1', pts: 2, label: 'Counter synergy' },
      { cmd: 'draw', card: 'draw', pts: 1, label: 'Draw engine synergy' },
      { cmd: 'token', card: 'token', pts: 2, label: 'Token synergy' },
      { cmd: 'graveyard', card: 'graveyard', pts: 2, label: 'Graveyard synergy' },
      { cmd: 'sacrifice', card: 'sacrifice', pts: 2, label: 'Sacrifice synergy' },
      { cmd: 'enchantment', card: 'enchantment', pts: 1, label: 'Enchantment synergy' },
      { cmd: 'artifact', card: 'artifact', pts: 1, label: 'Artifact synergy' },
      { cmd: 'flying', card: 'flying', pts: 1, label: 'Flying synergy' },
      { cmd: 'trample', card: 'trample', pts: 1, label: 'Trample synergy' },
      { cmd: 'spells you cast', card: 'instant', pts: 1, label: 'Spellslinger synergy (instant)' },
      { cmd: 'spells you cast', card: 'sorcery', pts: 1, label: 'Spellslinger synergy (sorcery)' },
      { cmd: 'attack', card: 'attack', pts: 1, label: 'Attack trigger synergy' },
    ];

    for (const syn of synergies) {
      const inCmd = cmdOracle.includes(syn.cmd) || cmdKeywords.some((k) => k.includes(syn.cmd));
      const inCard = oracle.includes(syn.card) || typeLine.includes(syn.card) || keywords.some((k) => k.includes(syn.card));
      if (inCmd && inCard) {
        cmdSynergy += syn.pts;
        synergyReasons.push(syn.label);
      }
    }

    const subtypeNoise = new Set(['legendary','creature','instant','sorcery','artifact','enchantment']);
    const cmdSubtypes = cmdType.split(' ').filter((w) => w.length > 3 && !subtypeNoise.has(w));
    for (const sub of cmdSubtypes) {
      if (typeLine.includes(sub)) {
        cmdSynergy += 2;
        synergyReasons.push(`Shares subtype "${sub}" with commander`);
        break;
      }
    }

    if (cardCI.length === 0) {
      cmdSynergy += 1;
      synergyReasons.push('Colorless — fits any commander');
    }

    cmdSynergy = Math.max(1, Math.min(10, Math.round(cmdSynergy)));
  }

  /* 4. WIN CONDITION */
  let winCon = 1;
  const winReasons: string[] = [];

  const winPatterns: Array<{ pat: RegExp; pts: number; label: string }> = [
    { pat: /deal.*damage to each opponent|each opponent loses/i, pts: 3, label: 'Direct damage to opponents' },
    { pat: /whenever.*untap/i, pts: 2, label: 'Potential infinite combo (untap loop)' },
    { pat: /whenever.*create.*token/i, pts: 2, label: 'Token swarm engine' },
    { pat: /create.*\d.*token|create.*token/i, pts: 1, label: 'Token generator' },
    { pat: /return.*graveyard.*battlefield|put.*battlefield.*graveyard/i, pts: 2, label: 'Reanimation effect' },
    { pat: /draw \d+ card|draw cards equal/i, pts: 2, label: 'Card advantage engine' },
    { pat: /you win the game/i, pts: 5, label: 'Direct win condition' },
    { pat: /opponent loses the game|opponent.*lose/i, pts: 4, label: 'Direct loss effect for opponents' },
    { pat: /infinite/i, pts: 3, label: 'Potential infinite' },
    { pat: /copy.*target spell|copy.*spell/i, pts: 2, label: 'Spell copying' },
    { pat: /double.*damage|damage.*double/i, pts: 2, label: 'Damage doubler' },
    { pat: /extra.*combat|additional.*combat/i, pts: 3, label: 'Extra combat phases' },
    { pat: /tutor|search.*library.*put/i, pts: 1, label: 'Tutoring capability' },
    { pat: /whenever.*cast.*instant|whenever.*cast.*sorcery/i, pts: 1, label: 'Spellslinger payoff' },
  ];

  let matches = 0;
  for (const wp of winPatterns) {
    if (wp.pat.test(oracle)) {
      winCon += wp.pts;
      winReasons.push(wp.label);
      matches++;
    }
  }

  if (matches >= 2) { winCon += 1; winReasons.push('Fits multiple win strategies'); }
  winCon = Math.max(1, Math.min(10, Math.round(winCon)));

  /* 5. BUDGET */
  const budgetResult = scoreBudget(csvRow, scryfallData);

  /* COMPOSITE */
  const composite = Math.round(
    power      * 0.35 * 10 +
    cmdSynergy * 0.30 * 10 +
    manaEff    * 0.20 * 10 +
    winCon     * 0.15 * 10
  );

  return {
    power, manaEff, cmdSynergy, winCon,
    budget: budgetResult.score,
    composite,
    valid: true,
    reasons: {
      power: powerReasons.length ? powerReasons : ['No exceptional power keywords detected'],
      manaEff: manaReasons,
      cmdSynergy: synergyReasons,
      winCon: winReasons.length ? winReasons : ['No win-con patterns detected'],
      budget: budgetResult.reasons,
    },
  };
}

export { scoreBudget };
