import type { ScryfallCard, Scores } from './types';
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

const KNOWN_STAPLES: Record<string, { power: number; manaEff: number }> = {
  'sol ring':               { power: 10, manaEff: 10 },
  'mana crypt':             { power: 10, manaEff: 10 },
  'mana vault':             { power: 9,  manaEff: 9 },
  'chrome mox':             { power: 9,  manaEff: 9 },
  'mox diamond':            { power: 9,  manaEff: 9 },
  'mox opal':               { power: 8,  manaEff: 8 },
  'lotus petal':            { power: 8,  manaEff: 9 },
  'jeweled lotus':          { power: 9,  manaEff: 9 },
  'demonic tutor':          { power: 9,  manaEff: 9 },
  'vampiric tutor':         { power: 9,  manaEff: 9 },
  'mystical tutor':         { power: 8,  manaEff: 8 },
  'worldly tutor':          { power: 8,  manaEff: 8 },
  'enlightened tutor':      { power: 8,  manaEff: 8 },
  'imperial seal':          { power: 8,  manaEff: 8 },
  'gamble':                 { power: 7,  manaEff: 8 },
  'rhystic study':          { power: 9,  manaEff: 7 },
  'mystic remora':          { power: 8,  manaEff: 8 },
  'smothering tithe':       { power: 9,  manaEff: 7 },
  'esper sentinel':         { power: 8,  manaEff: 8 },
  'cyclonic rift':          { power: 9,  manaEff: 7 },
  'fierce guardianship':    { power: 9,  manaEff: 8 },
  'deadly rollick':         { power: 9,  manaEff: 8 },
  'force of will':          { power: 9,  manaEff: 8 },
  'force of negation':      { power: 9,  manaEff: 8 },
  'swan song':              { power: 8,  manaEff: 8 },
  'swords to plowshares':   { power: 8,  manaEff: 9 },
  'path to exile':          { power: 8,  manaEff: 9 },
  'assassin\'s trophy':     { power: 8,  manaEff: 8 },
  'toxic deluge':           { power: 9,  manaEff: 8 },
  'damnation':              { power: 8,  manaEff: 7 },
  'teferi\'s protection':   { power: 9,  manaEff: 7 },
  'deflecting swat':        { power: 9,  manaEff: 8 },
  'flawless maneuver':      { power: 8,  manaEff: 8 },
  'necropotence':           { power: 9,  manaEff: 8 },
  'ad nauseam':             { power: 9,  manaEff: 8 },
  'underworld breach':      { power: 9,  manaEff: 8 },
  'thassa\'s oracle':       { power: 9,  manaEff: 9 },
  'demonic consultation':   { power: 9,  manaEff: 9 },
  'tainted pact':           { power: 9,  manaEff: 7 },
  'dockside extortionist':  { power: 9,  manaEff: 8 },
  'craterhoof behemoth':    { power: 9,  manaEff: 6 },
  'the one ring':           { power: 9,  manaEff: 7 },
};

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
