import type { CollectionEntry, CommanderAnalysis, DeckBlueprint, DeckProfile, DeckRole } from './types';
import { getOracleText, getTypeLine, getManaCost, getColorIdentity, getDeckCardKey, isLandCard, isBasicLandCard, canRunMultipleCopies } from './card-utils';
import { detectCardRoles, cardMatchesTheme } from './card-roles';
import { getDeckBlueprint } from './deck-blueprint';
import type { PowerLevel } from './deck-blueprint';
import { analyzeCommander } from './commander-analyzer';
import { ARCHETYPE_LIBRARY, runSanityCheck, verifyTribalRejects, verifySignalExamples, SEED_GAPS } from './archetype-library';
import type { ArchetypeCategory } from './archetype-library';

interface ClusterArchetype {
  key: string;
  display_name: string;
  category: ArchetypeCategory;
  matches: (entry: CollectionEntry, getRoles: (e: CollectionEntry) => import('./types').CardRoles) => boolean;
  exclusions: ((entry: CollectionEntry) => boolean) | null;
  idealCards: number;
}

interface ClusterResult {
  archetype: ClusterArchetype;
  added: CollectionEntry[];
  target: number;
  matched: number;
  subRoleFills?: SubRoleFill[];
  completeness?: 'COMPLETE' | 'UNDERFILLED' | 'INCOMPLETE';
}

interface CompiledSubRole {
  key: string;
  name: string;
  ideal: number;
  minimum: number;
  optional: boolean;
  predicate: (entry: CollectionEntry) => boolean;
  example_cards: string[];
}

interface SubRoleFill {
  role: CompiledSubRole;
  cards: CollectionEntry[];
  filled: number;
  status: 'complete' | 'underfilled' | 'missing';
  budgetSkipped?: boolean;
}

interface ArchetypeDiagnostic {
  key: string;
  display_name: string;
  category: string;
  status: 'selected' | 'underfilled' | 'skipped-color' | 'skipped-no-signal' | 'skipped-no-cards' | 'predicate-bug';
  qualifying: number;
  ideal: number;
  reason: string;
}

function describeGamePlan(cmdAnalysis: CommanderAnalysis, results?: ClusterResult[], diagnostics?: ArchetypeDiagnostic[]): string {
  console.log("CLUSTER-CONTENTS v1");
  if (!results || !results.length) {
    const primary = cmdAnalysis.themes.slice(0, 2).map((t) => t[0].toUpperCase() + t.slice(1));
    return primary.length ? primary.join(' / ') : 'Balanced Goodstuff';
  }

  const allNames = (entries: CollectionEntry[]): string =>
    entries.map((e) => e.scryfallData.name).join(', ');

  const wincon = results.filter((r) => r.archetype.category === 'wincon');
  const engines = results.filter((r) => r.archetype.category === 'engine');
  const synergies = results.filter((r) => r.archetype.category === 'synergy');
  const enabler = results.filter((r) => r.archetype.category === 'enabler');

  const parts: string[] = [];

  const describeCluster = (r: ClusterResult): string => {
    if (r.added.length === 0) {
      return `${r.archetype.display_name}: empty (0/${r.matched} qualifying)`;
    }
    const shortNames = (entries: CollectionEntry[], count: number): string =>
      entries.slice(0, count).map(e => e.scryfallData.name).join(', ');
    const cardList = allNames(r.added);
    let header = '';
    if (r.added.length < r.target) {
      const advice = r.archetype.category === 'wincon'
        ? 'Acquiring more options would strengthen this win condition.'
        : 'Acquiring more options would deepen this cluster.';
      header = `${r.archetype.display_name}: ${r.added.length}/${r.target} (${r.matched} in collection). ${advice}\n     ${cardList}`;
    } else {
      header = `${r.archetype.display_name}: ${r.added.length}/${r.target} \u2713\n     ${cardList}`;
    }
    // Sub-role breakdown
    if (r.subRoleFills && r.subRoleFills.length > 0) {
      const srLines: string[] = [];
      for (const sr of r.subRoleFills) {
        const marker = sr.status === 'complete' ? '\u2713' : (sr.status === 'missing' ? '\u2717' : '~');
        if (sr.role.optional && sr.filled === 0) {
          srLines.push(`    ${sr.role.name}: 0/${sr.role.ideal} (optional)`);
        } else if (sr.status === 'missing') {
          const who = sr.filled > 0 ? `only ${shortNames(sr.cards, 3)} qualifies` : 'none qualify';
          const budgetNote = sr.budgetSkipped ? ' BUDGET-STRIPPED' : '';
          srLines.push(`    ${sr.role.name}: ${sr.filled}/${sr.role.minimum} ${marker} MISSING${budgetNote} — ${who}.`);
          const tribeMatch = r.archetype.display_name.match(/\(([^)]+)\)/);
          const tribe = tribeMatch ? tribeMatch[1] : null;
          const seedKey = tribe ? `${sr.role.key}:${tribe}` : sr.role.key;
          const seeds = SEED_GAPS[seedKey] || SEED_GAPS[r.archetype.key] || sr.role.example_cards;
          if (seeds && seeds.length > 0) {
            srLines.push(`           Consider: ${seeds.join(', ')}.`);
          }
        } else {
          srLines.push(`    ${sr.role.name}: ${sr.filled}/${sr.role.ideal} ${marker} (${shortNames(sr.cards, 4)})`);
        }
      }
      return `${header}\n${srLines.join('\n')}`;
    }
    return header;
  };

  if (wincon.length) parts.push(`Win: ${wincon.map(describeCluster).join('; ')}`);
  if (engines.length) parts.push(`Engines: ${engines.map(describeCluster).join('; ')}`);
  if (synergies.length) parts.push(`Synergy: ${synergies.map(describeCluster).join('; ')}`);
  if (enabler.length) parts.push(`Enablers: ${enabler.map(describeCluster).join('; ')}`);

  // Add compact skip summary
  if (diagnostics && diagnostics.length > 0) {
    const skipped = diagnostics.filter(d =>
      d.status === 'skipped-color' || d.status === 'skipped-no-signal' || d.status === 'skipped-no-cards');
    if (skipped.length > 0) {
      const skipReasons = skipped.map(d => `${d.display_name}(${d.reason})`).join(', ');
      parts.push(`Skipped: ${skipReasons}`);
    }
  }

  // BUG 5: Collection gap report for underfilled clusters
  const underfilled = results.filter(r => r.added.length < r.target);
  if (underfilled.length > 0) {
    const gapLines: string[] = [];
    for (const r of underfilled) {
      const tribeMatch = r.archetype.display_name.match(/\(([^)]+)\)/);
      const tribe = tribeMatch ? tribeMatch[1] : null;
      const seedKey = tribe ? `${r.archetype.key}:${tribe}` : r.archetype.key;
      const seeds = SEED_GAPS[seedKey] || SEED_GAPS[r.archetype.key];
      if (seeds && seeds.length > 0) {
        gapLines.push(
          `  - ${r.archetype.display_name}: underfilled ${r.added.length}/${r.target}. Cards that would qualify:\n     ${seeds.join(', ')}`,
        );
      }
    }
    if (gapLines.length > 0) {
      parts.push(`COLLECTION GAPS:\n${gapLines.join('\n')}`);
    }
  }

  return parts.join('. ') + '.';
}

function buildPredicate(entry: ArchetypeEntry): (e: CollectionEntry) => boolean {
  return (e: CollectionEntry) => {
    const oracle = getOracleText(e.scryfallData).toLowerCase().replace(/\n/g, ' ');
    const typeLine = getTypeLine(e.scryfallData).toLowerCase();
    if (!entry.card_predicate.test(oracle)) {
      // Also test against type_line context
      if (!entry.card_predicate.test(typeLine + ' ' + oracle)) return false;
    }
    if (entry.exclusions && entry.exclusions.test(oracle)) return false;
    return true;
  };
}

function buildExclusions(entry: ArchetypeEntry): ((e: CollectionEntry) => boolean) | null {
  if (!entry.exclusions) return null;
  return (e: CollectionEntry) => getOracleText(e.scryfallData).toLowerCase().replace(/\n/g, ' ').match(entry.exclusions!) !== null;
}

function logClusterMatch(archetype: ClusterArchetype, entry: CollectionEntry): void {
  const oracle = getOracleText(entry.scryfallData).toLowerCase().replace(/\n/g, ' ');
  const tl = getTypeLine(entry.scryfallData);
  let reason = 'card_predicate matched oracle_text';
  if (archetype.key === 'TRIBAL_DENSITY') {
    const tribeMatch = archetype.display_name.match(/\(([^)]+)\)/);
    const tribe = tribeMatch ? tribeMatch[1].toLowerCase() : '';
    const subtypeMatch = tl.match(/Creature\s+(?:—|–)\s+(.+)/i);
    if (subtypeMatch) {
      const subtypes = subtypeMatch[1].trim().split(/\s+/).map(s => s.toLowerCase());
      if (subtypes.includes(tribe)) {
        reason = `type_line contains '${tribe}' as creature subtype`;
      }
    }
    if (reason === 'card_predicate matched oracle_text') {
      if (/\bchangeling\b/i.test(oracle)) {
        reason = 'oracle_text: changeling';
      } else {
        reason = `oracle_text: 'this creature is (also) a(n) ${tribe}' clause`;
      }
    }
  } else if (archetype.key === 'TRIBAL_PAYOFF') {
    const tribeMatch = archetype.display_name.match(/\(([^)]+)\)/);
    const tribe = tribeMatch ? tribeMatch[1].toLowerCase() : '';
    if (new RegExp(`(create|put|return).{0,50}\\b${tribe}s?\\b`, 'i').test(oracle)) {
      reason = `oracle_text: create/put/return of '${tribe}'`;
    } else {
      reason = `oracle_text contains '${tribe}' with payoff clause`;
    }
  }
  console.log(`[${archetype.display_name}] ${entry.scryfallData.name} → matched clause: ${reason}`);
}

function escapeRegexMeta(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const subRoleCompileCache = new Map<string, CompiledSubRole[]>();

function compileSubRoles(entry: typeof ARCHETYPE_LIBRARY[0], tribe?: string): CompiledSubRole[] {
  const cacheKey = tribe ? `${entry.key}:${tribe}` : entry.key;
  const cached = subRoleCompileCache.get(cacheKey);
  if (cached) return cached;
  if (!entry.sub_roles) return [];

  const tribeLower = tribe ? tribe.toLowerCase() : '';
  const tribeEscaped = tribeLower ? escapeRegexMeta(tribeLower) : '';
  const compiled: CompiledSubRole[] = [];

  for (const sr of entry.sub_roles) {
    const buildRegexPredicate = (pattern: string): ((e: CollectionEntry) => boolean) => {
      const finalPattern = tribeEscaped ? pattern.replace(/\{tribe\}/g, tribeEscaped) : pattern;
      const regex = new RegExp(finalPattern, 'i');
      return (e: CollectionEntry) => {
        const oracle = getOracleText(e.scryfallData).toLowerCase().replace(/\n/g, ' ');
        return regex.test(oracle);
      };
    };

    let pred: (e: CollectionEntry) => boolean;

    if (sr.key === 'TRIBE_BODIES') {
      pred = (e: CollectionEntry) => {
        const tl = getTypeLine(e.scryfallData);
        const subtypeMatch = tl.match(/Creature\s+(?:—|–)\s+(.+)/i);
        if (subtypeMatch) {
          const subtypes = subtypeMatch[1].trim().split(/\s+/).map(s => s.toLowerCase());
          if (subtypes.includes(tribeLower)) return true;
        }
        const oracle = getOracleText(e.scryfallData).toLowerCase().replace(/\n/g, ' ');
        return /\bchangeling\b/i.test(oracle);
      };
    } else if (sr.key === 'TARGETS') {
      pred = (e: CollectionEntry) => {
        const card = e.scryfallData;
        const tl = getTypeLine(card).toLowerCase();
        if (!tl.includes('creature') || (card.cmc || 0) < 5) return false;
        const pow = parseInt(card.power) || 0;
        const tou = parseInt(card.toughness) || 0;
        if (pow >= 4 && tou >= 4) return true;
        const oracle = getOracleText(card).toLowerCase().replace(/\n/g, ' ');
        return /when .{0,40}(?:enters the battlefield|enters\b)|whenever .{0,30}attacks/i.test(oracle);
      };
    } else if (sr.key === 'CHEAP_SPELL_DENSITY') {
      pred = (e: CollectionEntry) => {
        const tl = getTypeLine(e.scryfallData).toLowerCase();
        return (tl.includes('instant') || tl.includes('sorcery')) && (e.scryfallData.cmc || 0) <= 3;
      };
    } else if (sr.key === 'FODDER') {
      pred = (e: CollectionEntry) => {
        const tl = getTypeLine(e.scryfallData).toLowerCase();
        if (tl.includes('creature') && (e.scryfallData.cmc || 0) <= 2) return true;
        const oracle = getOracleText(e.scryfallData).toLowerCase().replace(/\n/g, ' ');
        return /create .{0,30}creature token/i.test(oracle);
      };
    } else if (sr.key === 'ETB_VALUE_TARGETS') {
      pred = (e: CollectionEntry) => {
        const tl = getTypeLine(e.scryfallData).toLowerCase();
        if (!tl.includes('creature')) return false;
        const oracle = getOracleText(e.scryfallData).toLowerCase().replace(/\n/g, ' ');
        return /when .{0,40}enters.{0,40}(?:draw|search|destroy|exile|return|create|deal)/i.test(oracle);
      };
    } else if (sr.key === 'GRAVE_FILLERS') {
      const basePred = buildRegexPredicate(sr.predicate);
      pred = (e: CollectionEntry) => {
        if (isLandCard(e.scryfallData)) {
          return /mill/i.test(getOracleText(e.scryfallData).toLowerCase().replace(/\n/g, ' '));
        }
        return basePred(e);
      };
    } else {
      pred = buildRegexPredicate(sr.predicate);
    }

    compiled.push({
      key: sr.key,
      name: sr.name,
      ideal: sr.ideal,
      minimum: sr.minimum,
      optional: sr.optional,
      predicate: pred,
      example_cards: [...sr.example_cards],
    });
  }

  subRoleCompileCache.set(cacheKey, compiled);
  return compiled;
}

function classifySubRoles(cards: CollectionEntry[], compiled: CompiledSubRole[]): SubRoleFill[] {
  const fills: SubRoleFill[] = compiled.map(c => ({
    role: c,
    cards: [] as CollectionEntry[],
    filled: 0,
    status: 'missing' as const,
  }));
  const fillMap = new Map(fills.map(f => [f.role.key, f]));
  for (const card of cards) {
    for (const c of compiled) {
      if (c.predicate(card)) {
        const f = fillMap.get(c.key)!;
        f.cards.push(card);
        f.filled = f.cards.length;
      }
    }
  }
  for (const f of fills) {
    if (f.filled < f.role.minimum) f.status = 'missing';
    else if (f.filled < f.role.ideal) f.status = 'underfilled';
    else f.status = 'complete';
  }
  return fills;
}

function computeSubRoleBonuses(card: CollectionEntry, compiled: CompiledSubRole[], fills: SubRoleFill[]): number {
  let hasBelowMin = false;
  let hasBelowIdeal = false;
  for (const c of compiled) {
    if (!c.predicate(card)) continue;
    const f = fills.find(fi => fi.role.key === c.key);
    if (!f) continue;
    if (f.filled < c.minimum) hasBelowMin = true;
    else if (f.filled < c.ideal) hasBelowIdeal = true;
  }
  if (hasBelowMin) return 12;
  if (hasBelowIdeal) return 6;
  return 0;
}

function proposeArchetypes(
  cmdAnalysis: CommanderAnalysis,
  valid: CollectionEntry[],
): { selected: ClusterArchetype[]; diagnostics: ArchetypeDiagnostic[] } {
  const diagnostics: ArchetypeDiagnostic[] = [];
  const selected: ClusterArchetype[] = [];
  const cmdOracle = cmdAnalysis.oracle.toLowerCase();
  const cmdTypeLine = cmdAnalysis.typeLine.toLowerCase();
  const cmdCI = new Set(cmdAnalysis.ci.map(c => c.toUpperCase()));

  const sanityBugs = runSanityCheck(ARCHETYPE_LIBRARY, valid);
  for (const bug of sanityBugs) console.warn(bug);
  const tribalBugs = verifyTribalRejects();
  for (const bug of tribalBugs) console.error(bug);
  const signalBugs = verifySignalExamples();
  for (const bug of signalBugs) console.error(bug);

  interface ScoredCandidate {
    archetype: ClusterArchetype;
    score: number;
    qualifying: number;
    index: number;
  }
  const scored: ScoredCandidate[] = [];

  for (let i = 0; i < ARCHETYPE_LIBRARY.length; i++) {
    const entry = ARCHETYPE_LIBRARY[i];

    // Handle tribal archetypes — fill in tribe name from commander subtypes
    let displayName = entry.display_name;
    let predicateFn = buildPredicate(entry);
    let exclusionFn = buildExclusions(entry);

    if (entry.key === 'TRIBAL_DENSITY' || entry.key === 'TRIBAL_PAYOFF') {
      if (!cmdAnalysis.subtypes.length) {
        diagnostics.push({
          key: entry.key, display_name: displayName, category: entry.category,
          status: 'skipped-no-signal', qualifying: 0, ideal: entry.ideal_count,
          reason: 'no tribe (no commander subtypes)',
        });
        continue;
      }
      // Iterate subtypes to find one that is rewarded in the commander's oracle text
      let tribe: string | null = null;
      for (const sub of cmdAnalysis.subtypes) {
        const subLower = sub.toLowerCase();
        if (new RegExp(`\\b${subLower}s?\\b`, 'i').test(cmdOracle)) {
          tribe = sub;
          break;
        }
      }
      if (!tribe) {
        diagnostics.push({
          key: entry.key, display_name: displayName, category: entry.category,
          status: 'skipped-no-signal', qualifying: 0, ideal: entry.ideal_count,
          reason: `subtype present but not rewarded in oracle text (${cmdAnalysis.subtypes.join(', ')})`,
        });
        continue;
      }
      displayName = entry.display_name.replace('{tribe}', tribe);

      // Build tribe-specific predicates
      const tribeLower = tribe.toLowerCase();
      if (entry.key === 'TRIBAL_DENSITY') {
        predicateFn = (e: CollectionEntry) => {
          const tl = getTypeLine(e.scryfallData);
          const subtypeMatch = tl.match(/Creature\s+(?:—|–)\s+(.+)/i);
          if (subtypeMatch) {
            const subtypes = subtypeMatch[1].trim().split(/\s+/).map(s => s.toLowerCase());
            if (subtypes.includes(tribeLower)) return true;
          }
          const oracle = getOracleText(e.scryfallData).toLowerCase().replace(/\n/g, ' ');
          return new RegExp(`\\bthis creature is (?:also )?an? ${tribeLower}\\b`, 'i').test(oracle)
            || /\bchangeling\b/i.test(oracle);
        };
      } else {
        predicateFn = (e: CollectionEntry) => {
          const oracle = getOracleText(e.scryfallData).toLowerCase().replace(/\n/g, ' ');
          return new RegExp(`\\b${tribeLower}s?\\b.{0,60}(you control|gets?|gain|\\+\\d|enters|attacks?|dies|cast|deals?|create|put|return)`, 'i').test(oracle)
            || new RegExp(`(create|put|return).{0,50}\\b${tribeLower}s?\\b`, 'i').test(oracle);
        };
      }
      exclusionFn = null;
    }

    // Color check
    if (entry.required_colors.length > 0) {
      const hasColor = entry.required_colors.some(c => cmdCI.has(c));
      if (!hasColor) {
        diagnostics.push({
          key: entry.key, display_name: displayName, category: entry.category,
          status: 'skipped-color', qualifying: 0, ideal: entry.ideal_count,
          reason: `needs ${entry.required_colors.join('/')}`,
        });
        continue;
      }
    }

    // Commander signals check
    if (!entry.always_proposed && entry.commander_signals.length > 0) {
      const matched = entry.commander_signals.some(sig =>
        sig.test(cmdOracle) || sig.test(cmdTypeLine));
      if (!matched) {
        diagnostics.push({
          key: entry.key, display_name: displayName, category: entry.category,
          status: 'skipped-no-signal', qualifying: 0, ideal: entry.ideal_count,
          reason: 'no commander signal',
        });
        continue;
      }
    }

    // BUG C: ANTI-HORDE guard — Elemental reanimation commanders are never voltron
    if (entry.key === 'COMMANDER_DAMAGE_VOLTRON'
      && cmdTypeLine.toLowerCase().includes('elemental')
      && /from (?:your|a) graveyard/i.test(cmdOracle)) {
      diagnostics.push({
        key: entry.key, display_name: displayName, category: entry.category,
        status: 'skipped-no-signal', qualifying: 0, ideal: entry.ideal_count,
        reason: 'Elemental graveyard commander — not voltron',
      });
      continue;
    }

    // Find qualifying cards
    const qualifying = valid.filter(e => {
      if (isLandCard(e.scryfallData)) return false;
      if (!predicateFn(e)) return false;
      if (exclusionFn && exclusionFn(e)) return false;
      return true;
    });

    // Also do a type-line check for rocks and dorks
    if (entry.key === 'ROCKS_RAMP') {
      // Must be artifact non-creature, non-equipment
      const final = qualifying.filter(e => {
        const tl = getTypeLine(e.scryfallData).toLowerCase();
        return tl.includes('artifact') && !tl.includes('creature') && !tl.includes('equipment');
      });
      qualifying.length = 0;
      qualifying.push(...final);
    }
    if (entry.key === 'LAND_RAMP_GREEN') {
      const final = qualifying.filter(e => {
        const tl = getTypeLine(e.scryfallData).toLowerCase();
        return tl.includes('sorcery') || tl.includes('instant');
      });
      qualifying.length = 0;
      qualifying.push(...final);
    }
    if (entry.key === 'DORK_RAMP') {
      const final = qualifying.filter(e => {
        const tl = getTypeLine(e.scryfallData).toLowerCase();
        return tl.includes('creature') && (e.scryfallData.cmc || 0) <= 2;
      });
      qualifying.length = 0;
      qualifying.push(...final);
    }
    if (entry.key === 'BURN_X_SPELL_KILL') {
      const final = qualifying.filter(e => {
        const oracle = getOracleText(e.scryfallData);
        const dmgMatch = oracle.match(/deals?\s+(\d+)\s+damage/);
        if (dmgMatch) {
          return parseInt(dmgMatch[1]) >= 5;
        }
        return true;
      });
      qualifying.length = 0;
      qualifying.push(...final);
    }
    if (entry.key === 'COMMANDER_DAMAGE_VOLTRON') {
      const final = qualifying.filter(e => {
        const tl = getTypeLine(e.scryfallData).toLowerCase();
        return tl.includes('equipment') || tl.includes('aura');
      });
      qualifying.length = 0;
      qualifying.push(...final);
    }

    if (qualifying.length === 0 && entry.category !== 'enabler') {
      diagnostics.push({
        key: entry.key, display_name: displayName, category: entry.category,
        status: 'skipped-no-cards', qualifying: 0, ideal: entry.ideal_count,
        reason: '0 qualifying cards',
      });
      continue;
    }

    // Score
    const categoryWeight: Record<string, number> = { wincon: 1.5, engine: 1.2, synergy: 1.0, enabler: 0.8 };
    const signalStrength = entry.always_proposed ? 1.5 : Math.max(1, entry.commander_signals.filter(s => s.test(cmdOracle) || s.test(cmdTypeLine)).length);
    const score = qualifying.length * signalStrength * (categoryWeight[entry.category] || 1.0);

    const archetype: ClusterArchetype = {
      key: entry.key,
      display_name: displayName,
      category: entry.category,
      matches: predicateFn,
      exclusions: exclusionFn,
      idealCards: entry.ideal_count,
    };

    scored.push({ archetype, score, qualifying: qualifying.length, index: i });
  }

  // BUG 2: Inferred TOKEN_PRODUCTION_ENGINE from TRIBAL_DENSITY
  const TOKENABLE_TRIBES = ['Human', 'Soldier', 'Goblin', 'Zombie', 'Spirit', 'Saproling', 'Elf', 'Faerie', 'Cat', 'Rat', 'Insect', 'Bird', 'Squirrel', 'Knight', 'Wolf', 'Snake'];
  const tribalDensityScored = scored.find(s => s.archetype.key === 'TRIBAL_DENSITY');
  if (tribalDensityScored) {
    const densityTribe = tribalDensityScored.archetype.display_name.match(/\(([^)]+)\)/)?.[1];
    if (densityTribe && TOKENABLE_TRIBES.some(t => t.toLowerCase() === densityTribe.toLowerCase())) {
      const tokenAlready = scored.find(s => s.archetype.key === 'TOKEN_PRODUCTION_ENGINE');
      if (!tokenAlready) {
        const tokenEntry = ARCHETYPE_LIBRARY.find(e => e.key === 'TOKEN_PRODUCTION_ENGINE');
        if (tokenEntry) {
          const tokenQualifying = valid.filter(e => {
            if (isLandCard(e.scryfallData)) return false;
            const oracle = getOracleText(e.scryfallData).toLowerCase();
            return tokenEntry.card_predicate.test(oracle)
              && (!tokenEntry.exclusions || !tokenEntry.exclusions.test(oracle));
          });
          const tokenDisplayName = `Token Generation (${densityTribe})`;
          const tokenArchetype: ClusterArchetype = {
            key: tokenEntry.key,
            display_name: tokenDisplayName,
            category: tokenEntry.category,
            matches: (entry: CollectionEntry) => {
              const oracle = getOracleText(entry.scryfallData).toLowerCase();
              return tokenEntry.card_predicate.test(oracle)
                && (!tokenEntry.exclusions || !tokenEntry.exclusions.test(oracle));
            },
            exclusions: tokenEntry.exclusions ? (entry: CollectionEntry) => tokenEntry.exclusions!.test(getOracleText(entry.scryfallData).toLowerCase()) : null,
            idealCards: tokenEntry.ideal_count,
          };
          scored.push({
            archetype: tokenArchetype,
            score: tokenQualifying.length * 0.8,
            qualifying: tokenQualifying.length,
            index: 999,
          });
          console.log(`TOKEN_PRODUCTION_ENGINE: inferred from TRIBAL_DENSITY (${densityTribe})`);
        }
      }
    }
  }

  // Selection logic
  if (!scored.length) return { selected, diagnostics };

  scored.sort((a, b) => b.score - a.score);

  // Always include enablers
  const enablers = scored.filter(s => s.archetype.category === 'enabler');
  for (const e of enablers) {
    selected.push(e.archetype);
    diagnostics.push({
      key: e.archetype.key, display_name: e.archetype.display_name,
      category: e.archetype.category,
      status: e.qualifying < e.archetype.idealCards ? 'underfilled' : 'selected',
      qualifying: e.qualifying, ideal: e.archetype.idealCards,
      reason: e.qualifying >= e.archetype.idealCards ? 'filled' : `${e.qualifying}/${e.archetype.idealCards}`,
    });
  }

  // Pick best wincon
  const wincons = scored.filter(s => s.archetype.category === 'wincon');
  if (wincons.length > 0) {
    const best = wincons[0]; // already sorted by score
    if (!selected.includes(best.archetype)) {
      selected.push(best.archetype);
      diagnostics.push({
        key: best.archetype.key, display_name: best.archetype.display_name,
        category: best.archetype.category,
        status: best.qualifying < best.archetype.idealCards ? 'underfilled' : 'selected',
        qualifying: best.qualifying, ideal: best.archetype.idealCards,
        reason: `top wincon, score=${best.score.toFixed(1)}`,
      });
    }
  }

  // Pick top engines (up to 5)
  const engines = scored.filter(s => s.archetype.category === 'engine' && !selected.includes(s.archetype));
  for (const e of engines.slice(0, 5)) {
    selected.push(e.archetype);
    diagnostics.push({
      key: e.archetype.key, display_name: e.archetype.display_name,
      category: e.archetype.category,
      status: e.qualifying < e.archetype.idealCards ? 'underfilled' : 'selected',
      qualifying: e.qualifying, ideal: e.archetype.idealCards,
      reason: e.qualifying >= e.archetype.idealCards ? `${e.qualifying}/${e.archetype.idealCards}` : `${e.qualifying}/${e.archetype.idealCards}`,
    });
  }

  // Pick top synergies (up to 3)
  const synergies = scored.filter(s => s.archetype.category === 'synergy' && !selected.includes(s.archetype));
  for (const e of synergies.slice(0, 3)) {
    selected.push(e.archetype);
    diagnostics.push({
      key: e.archetype.key, display_name: e.archetype.display_name,
      category: e.archetype.category,
      status: e.qualifying < e.archetype.idealCards ? 'underfilled' : 'selected',
      qualifying: e.qualifying, ideal: e.archetype.idealCards,
      reason: e.qualifying >= e.archetype.idealCards ? `${e.qualifying}/${e.archetype.idealCards}` : `${e.qualifying}/${e.archetype.idealCards}`,
    });
  }

  // BUG E: Smarter wincon fallback — pick based on selected engines
  const selectedWincons = selected.filter(a => a.category === 'wincon');
  if (selectedWincons.length === 0) {
    const countQualifying = (entry: typeof ARCHETYPE_LIBRARY[0]) =>
      valid.filter(e => !isLandCard(e.scryfallData) && buildPredicate(entry)(e)
        && (!entry.exclusions || !entry.exclusions.test(getOracleText(e.scryfallData).toLowerCase()))).length;

    const hasSpellslinger = selected.some(a => a.key === 'SPELLSLINGER_PAYOFF');
    const hasTribalDensity = selected.some(a => a.key === 'TRIBAL_DENSITY');
    const hasReanimation = selected.some(a => a.key === 'REANIMATION_CREATURE_ENGINE');
    const hasTokenEngine = selected.some(a => a.key === 'TOKEN_PRODUCTION_ENGINE');
    const hasCounters = selected.some(a => a.key === 'COUNTERS_PROLIFERATE_ENGINE');

    let fallbackEntry: (typeof ARCHETYPE_LIBRARY)[0] | undefined;
    let fallbackReason = '';

    if (hasSpellslinger && cmdCI.has('R')) {
      fallbackEntry = ARCHETYPE_LIBRARY.find(e => e.key === 'BURN_X_SPELL_KILL');
      fallbackReason = 'SPELLSLINGER_PAYOFF selected — spellslinger decks use burn finishers';
    } else if (hasTribalDensity) {
      fallbackEntry = ARCHETYPE_LIBRARY.find(e => e.key === 'COMBAT_FINISHERS_GO_WIDE');
      fallbackReason = 'TRIBAL_DENSITY selected — tribal decks want to swarm';
    } else if (hasReanimation) {
      fallbackEntry = ARCHETYPE_LIBRARY.find(e => e.key === 'COMBAT_FINISHERS_GO_WIDE');
      fallbackReason = 'REANIMATION_CREATURE_ENGINE selected — recurred creatures need a punch';
    } else if (hasTokenEngine) {
      fallbackEntry = ARCHETYPE_LIBRARY.find(e => e.key === 'COMBAT_FINISHERS_GO_WIDE');
      fallbackReason = 'TOKEN_PRODUCTION_ENGINE selected — tokens want to overrun';
    } else if (hasCounters) {
      const goWideEntry = ARCHETYPE_LIBRARY.find(e => e.key === 'COMBAT_FINISHERS_GO_WIDE');
      const infectEntry = ARCHETYPE_LIBRARY.find(e => e.key === 'COMMANDER_DAMAGE_INFECT_POISON');
      const gwCount = goWideEntry ? countQualifying(goWideEntry) : 0;
      const infCount = infectEntry ? countQualifying(infectEntry) : 0;
      if (infCount > gwCount && infectEntry) {
        fallbackEntry = infectEntry;
        fallbackReason = 'COUNTERS_PROLIFERATE_ENGINE selected — infect has more cards';
      } else if (goWideEntry) {
        fallbackEntry = goWideEntry;
        fallbackReason = 'COUNTERS_PROLIFERATE_ENGINE selected — go-wide has more cards';
      }
    } else {
      fallbackEntry = ARCHETYPE_LIBRARY.find(e => e.key === 'COMBAT_FINISHERS_GO_WIDE');
      fallbackReason = 'universal fallback';
    }

    if (fallbackEntry) {
      const fallbackCount = countQualifying(fallbackEntry);
      if (fallbackCount > 0) {
        const archetype: ClusterArchetype = {
          key: fallbackEntry.key,
          display_name: fallbackEntry.display_name,
          category: fallbackEntry.category,
          matches: buildPredicate(fallbackEntry),
          exclusions: buildExclusions(fallbackEntry),
          idealCards: fallbackEntry.ideal_count,
        };
        selected.push(archetype);
        diagnostics.push({
          key: archetype.key, display_name: archetype.display_name,
          category: archetype.category,
          status: fallbackCount < archetype.idealCards ? 'underfilled' : 'selected',
          qualifying: fallbackCount, ideal: archetype.idealCards,
          reason: `fallback (${fallbackCount} qualifying)`,
        });
        console.log(`WINCON FALLBACK: forced ${archetype.display_name} because ${fallbackReason} (${fallbackCount} qualifying)`);
      } else {
        console.warn('WARNING: no wincon archetype qualifies for this commander/collection');
      }
    }
  }

  // Log all diagnostics to console
  console.log('[Archetype] Proposer results:');
  for (const d of diagnostics) {
    console.log(`[Archetype] ${d.key}: ${d.status} (${d.qualifying}/${d.ideal}) — ${d.reason}`);
  }

  return { selected, diagnostics };
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
  // Phases 0-1: Propose archetypes from library + run sanity check
  const { selected: selectedArchetypes, diagnostics } = proposeArchetypes(cmdAnalysis, valid);

  // Phase 2: Allocate non-land slots across selected archetypes
  const nonLandTarget = 99 - blueprint.lands;
  const clusterAlloc = new Map<ClusterArchetype, number>();
  for (const a of selectedArchetypes) {
    const qualifying = valid.filter(e => !isLandCard(e.scryfallData) && a.matches(e, getRoles) && (!a.exclusions || !a.exclusions(e))).length;
    const alloc = Math.min(a.idealCards, Math.max(2, Math.round(qualifying * 0.8)));
    clusterAlloc.set(a, alloc);
  }

  // Phase 3: Fill each cluster with its best cards
  const clusterResults: ClusterResult[] = [];
  const clusterCardIds = new Map<string, ClusterArchetype[]>();
  for (const a of selectedArchetypes) {
    const alloc = clusterAlloc.get(a) || 0;
    const qualifying = valid.filter(e => !isLandCard(e.scryfallData) && a.matches(e, getRoles) && (!a.exclusions || !a.exclusions(e)));
    const addedEntries: CollectionEntry[] = [];
    const addedIds = new Set<string>();
    const tribalTribe = a.display_name.match(/\(([^)]+)\)/)?.[1];
    const libEntry = ARCHETYPE_LIBRARY.find(e => e.key === a.key);
    const compiledSubRoles = libEntry?.sub_roles ? compileSubRoles(libEntry, tribalTribe) : [];

    if (compiledSubRoles.length > 0) {
      // Pre-classify each qualifying card into sub-roles
      const cardToRoleKeys = new Map<string, Set<string>>();
      for (const entry of qualifying) {
        const roleKeys = new Set<string>();
        for (const c of compiledSubRoles) {
          if (c.predicate(entry)) roleKeys.add(c.key);
        }
        cardToRoleKeys.set(entry.scryfallData.id, roleKeys);
      }
      // Track sub-role fills
      const subRoleCards = new Map<string, CollectionEntry[]>();
      const subRoleCounts = new Map<string, number>();
      for (const c of compiledSubRoles) {
        subRoleCards.set(c.key, []);
        subRoleCounts.set(c.key, 0);
      }
      // Greedy fill with sub-role priority
      while (addedEntries.length < alloc) {
        let bestEntry: CollectionEntry | null = null;
        let bestScore = -Infinity;
        for (const entry of qualifying) {
          if (addedIds.has(entry.scryfallData.id)) continue;
          const card = entry.scryfallData;
          const key = getDeckCardKey(card);
          if (selectedKeys.has(key) || cardIds.includes(card.id)) {
            let inOtherClusters = 0;
            for (const other of selectedArchetypes) {
              if (other === a) continue;
              if (other.matches(entry, getRoles) && (!other.exclusions || !other.exclusions(entry))) inOtherClusters++;
            }
            if (inOtherClusters === 0) continue;
          }
          let bonus = 0;
          const roleKeys = cardToRoleKeys.get(card.id) || new Set();
          for (const rk of roleKeys) {
            const current = subRoleCounts.get(rk) || 0;
            const c = compiledSubRoles.find(sr => sr.key === rk);
            if (!c || c.optional) continue;
            if (current < c.minimum) bonus = Math.max(bonus, 12);
            else if (current < c.ideal) bonus = Math.max(bonus, 6);
          }
          const score = entry.scores.composite + bonus;
          if (score > bestScore) { bestEntry = entry; bestScore = score; }
        }
        if (!bestEntry) break;
        if (addEntry(bestEntry, a.display_name, `${a.category} for "${a.display_name}" cluster`)) {
          addedEntries.push(bestEntry);
          addedIds.add(bestEntry.scryfallData.id);
          logClusterMatch(a, bestEntry);
          const card = bestEntry.scryfallData;
          const ccs = clusterCardIds.get(card.id) || [];
          ccs.push(a);
          clusterCardIds.set(card.id, ccs);
          const roleKeys = cardToRoleKeys.get(card.id) || new Set();
          for (const rk of roleKeys) {
            subRoleCounts.set(rk, (subRoleCounts.get(rk) || 0) + 1);
            const arr = subRoleCards.get(rk)!;
            arr.push(bestEntry);
          }
        } else {
          addedIds.add(bestEntry.scryfallData.id);
        }
      }
      // Build SubRoleFill results
      const subRoleFills: SubRoleFill[] = compiledSubRoles.map(c => {
        const cards = subRoleCards.get(c.key) || [];
        const filled = cards.length;
        let status: 'complete' | 'underfilled' | 'missing' = 'complete';
        if (filled < c.minimum) status = 'missing';
        else if (filled < c.ideal) status = 'underfilled';
        return { role: c, cards, filled, status };
      });
      // Compute cluster-level completeness
      let completeness: 'COMPLETE' | 'UNDERFILLED' | 'INCOMPLETE' = 'COMPLETE';
      for (const sf of subRoleFills) {
        if (sf.role.optional) continue;
        if (sf.status === 'missing') {
          completeness = 'INCOMPLETE';
          // Check budget constraint
          if (alloc < compiledSubRoles.filter(r => !r.optional).reduce((s, r) => s + r.minimum, 0)) {
            sf.budgetSkipped = true;
          }
        } else if (sf.status === 'underfilled' && completeness === 'COMPLETE') {
          completeness = 'UNDERFILLED';
        }
      }
      clusterResults.push({
        archetype: a, added: addedEntries, target: alloc, matched: qualifying.length,
        subRoleFills, completeness,
      });
    } else {
      // Original fill for clusters without sub-roles
      const ranked = [...qualifying].sort((a, b) => b.scores.composite - a.scores.composite);
      for (const entry of ranked) {
        if (addedEntries.length >= alloc) break;
        const card = entry.scryfallData;
        const key = getDeckCardKey(card);
        if (selectedKeys.has(key) || cardIds.includes(card.id)) {
          let inOtherClusters = 0;
          for (const other of selectedArchetypes) {
            if (other === a) continue;
            if (other.matches(entry, getRoles) && (!other.exclusions || !other.exclusions(entry))) inOtherClusters++;
          }
          if (inOtherClusters === 0) continue;
        }
        if (addEntry(entry, a.display_name, `${a.category} for "${a.display_name}" cluster`)) {
          addedEntries.push(entry);
          logClusterMatch(a, entry);
          const ccs = clusterCardIds.get(card.id) || [];
          ccs.push(a);
          clusterCardIds.set(card.id, ccs);
        }
      }
      clusterResults.push({ archetype: a, added: addedEntries, target: alloc, matched: qualifying.length });
    }
  }

  // Phase 4: Compute cluster overlap score
  let overlapCount = 0;
  for (const [, cs] of clusterCardIds) {
    if (cs.length >= 2) overlapCount++;
  }
  console.log(`[Cluster] overlap: ${overlapCount} cards serve 2+ clusters`);

  // Phase 5: Fill remaining slots from enabler clusters + role-based fill
  const enablerPatterns = selectedArchetypes.filter(a => a.category === 'enabler');
  for (const a of enablerPatterns) {
    const alloc = clusterAlloc.get(a) || 0;
    if (alloc <= 0) continue;
    const qualifying = valid.filter(e => !isLandCard(e.scryfallData) && a.matches(e, getRoles) && (!a.exclusions || !a.exclusions(e)));
    const ranked = [...qualifying].sort((a, b) => b.scores.composite - a.scores.composite);
    for (const entry of ranked) {
      if (cardIds.length >= nonLandTarget) break;
      const key = getDeckCardKey(entry.scryfallData);
      if (selectedKeys.has(key) || cardIds.includes(entry.scryfallData.id)) continue;
      addEntry(entry, a.display_name, `enabler: ${a.display_name}`);
    }
  }

  // Phase 6: Role-aware greedy fill for any remaining non-land slots
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

  // Track final results + diagnostics for game plan
  const finalResults = clusterResults;

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
    gamePlan: describeGamePlan(cmdAnalysis, finalResults, diagnostics),
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
