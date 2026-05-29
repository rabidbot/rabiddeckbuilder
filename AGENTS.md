# AGENTS.md — EDH Deck Builder

## Project at a glance

- **Stack:** React 19 + Vite + Electron + SQL.js + Zustand
- **Platform:** Windows exe, deployed via GitHub Actions on push to `main`
- **Repo:** `rabidbot/rabiddeckbuilder`
- **Current version:** `0.1.43` (package.json:6)
- **Build command:** `npm run electron:build` (triggered by GitHub Actions `build.yml`)
- **Lint:** `npx eslint .` — pre-existing React hooks warnings are not ours
- **Type check:** `npx tsc --noEmit` — must pass clean

## Key source files

| File | Purpose |
|---|---|
| `src/lib/archetype-library.ts` | 34-entry archetype library, `SubRole` interface, `runSanityCheck`, `SEED_GAPS`, `verifyTribalRejects`, `verifySignalExamples` |
| `src/lib/deck-engine.ts` | `buildOptimalDeck` (cluster-first builder), `proposeArchetypes` (color/signal/tribal checks), `describeGamePlan`, `compileSubRoles`, `logClusterMatch` |
| `src/lib/commander-analyzer.ts` | `analyzeCommander()` — derives themes, subtypes, wants, posture from Scryfall oracle |
| `src/lib/card-utils.ts` | `getOracleText`, `getTypeLine`, `getColorIdentity`, `isLandCard`, `getDeckCardKey` |
| `src/lib/card-roles.ts` | `detectCardRoles` — role tagging for non-cluster fill |
| `src/stores/deckStore.ts` | Zustand store calling `buildOptimalDeck`, catching errors as toasts |

## Architecture: how a deck gets built

1. `analyzeCommander(card)` → themes, subtypes, wants, tribalPayoff
2. `proposeArchetypes(cmdAnalysis, valid)` — scores all 34 library entries against commander colors + signals, selects top wincon/engines/synergies/enablers
3. Phase 2: allocate slot budget per cluster (`idealCards` capped by `qualifying * 0.8`)
4. Phase 3: fill each cluster — clusters with `sub_roles` use greedy loop with +12/+6 priority bonus; others sort by composite
5. Phase 5: enabler fill from remaining qualifying cards
6. Phase 6–8: role-aware greedy fill, lands (nonbasic then proportional basics), backfill
7. `validateAndRepairDeck` — color identity, dedup, deck-size repair

## Sub-role system (v0.1.41)

9 archetypes have `sub_roles[]` with `{ key, name, predicate (regex source string), ideal, minimum, optional, example_cards, example_rejects }`.

| Archetype | Sub-roles |
|---|---|
| REANIMATION | Grave Fillers, Reanimators, Targets |
| COMBAT_FINISHERS_GO_WIDE | Token Producers, Anthems, Closers |
| BURN_X_SPELL_KILL | X-Spells, Rituals & Big Mana, Copy Effects (optional) |
| SPELLSLINGER_PAYOFF | Payoffs, Cheap Spell Density, Copy/Recur (optional) |
| TRIBAL_DENSITY | Tribe Bodies, Tribal Lords, Tribal Enablers (optional) |
| SACRIFICE_OUTLET_ENGINE | Outlets, Fodder, Aftermath Payoffs |
| COUNTERS_PROLIFERATE_ENGINE | Counter Placers, Proliferate Engines, Counter Payoffs |
| BLINK_ETB_LOOP | Blink Effects, ETB Value Targets |
| TREASURE_GENERATION | Treasure Makers, Treasure Payoffs |

**Compilation:** `compileSubRoles(entry, tribe)` — called from Phase 3. Cached by `${key}:${tribe}`. `{tribe}` templates expanded with `escapeRegexMeta`. Sentinel predicates (`__TRIBE_BODIES__`, `__TARGETS__`, etc.) handled specially (parsed subtypes, cmc checks, type_line context).

**Completeness:** `INCOMPLETE` if any non-optional sub-role below minimum. Budget-stripped when minimums exceed `ideal_count`. Optional sub-roles never trigger `INCOMPLETE`.

**Greedy fill loop (Phase 3):** Pre-classifies card→sub-role, tracks counts, picks highest `composite + bonus` per iteration. **Critical: `else { addedIds.add(card.id) }`** after failed `addEntry` — without this, infinite loop (v0.1.41→0.1.42 fix).

## Debug checklist

### Console strings to look for
- `"ARCHETYPE-SANITY v2 running"` — sanity check ran
- `"CLUSTER-CONTENTS v1"` — game plan built
- `"[Archetype] ..."` — per-archetype diagnostic (selected/skipped/underfilled)
- `"WINCON FALLBACK: forced ..."` — wincon fallback fired
- `"TOKEN_PRODUCTION_ENGINE: inferred from TRIBAL_DENSITY ..."` — token inference
- `"[TribalSanity] ..."` / `"[SignalSanity] ..."` — startup checks

### Deck won't build (toast "Build failed")
1. Look for `PREDICATE BUG:` throw → find which example_reject leaked
2. Verify the leaking card with actual Scryfall data: `curl -sG 'https://api.scryfall.com/cards/search' --data-urlencode 'q=!"Card Name"'`
3. If the card legitimately qualifies → remove from `example_rejects`
4. If the predicate is too loose → tighten the `card_predicate` regex

### UI freezes
- Check greedy fill loop for missing `else` block after failed `addEntry`

## Hard-won lessons

1. **Oracle newlines break regex `.`** — `getOracleText()` returns `\n`-separated multi-line text. Always normalize: `.replace(/\n/g, ' ')`. Applied in `buildPredicate`, `buildExclusions`, tribal predicates, `logClusterMatch`, `runSanityCheck`.

2. **Regex bounds too tight** — modern card templating often spans 40–80 chars between connected clauses (e.g., Cultivate's "land...put one onto"). Don't use `.{0,20}` for long spans.

3. **Sanity check must mirror proposer filters** — `runSanityCheck` tests `card_predicate` only. But `proposeArchetypes` adds type-line post-filters (Equipment check for VOLTRON, artifact check for ROCKS, damage≥5 for BURN, etc.). Without mirroring, example_rejects that would be caught by post-filters in production leak in the sanity check. Fixed in v0.1.37.

4. **Example_rejects must be verified against real Scryfall data** — 6 cards labeled "Elemental rejects" were all legitimate `Creature — Elemental` creatures. The reject list was wrong, not the predicate. Always dump actual card type_lines before marking cards as rejects.

5. **Wincon fallback is context-aware, not binary** — the old Voltron-vs-GoWide binary picked wrong for spellslinger/tribal commanders. Now chains: spellslinger→burn, tribal→go_wide, reanimation→go_wide, tokens→go_wide, counters→infect/go_wide, else→go_wide (Voltron removed as generic fallback).

6. **TUTORS exclusion matches land ramp variants** — Farseek lists "Plains/Island/Swamp/Mountain" without the word "land" and "put that card onto the battlefield" with 11 chars between "put" and "onto." Exclusion must match `\b(land|Plains|Island|Swamp|Mountain|Forest)\b` + broad battlefield span.

7. **Tribal oracle check** — TRIBAL_DENSITY/TRIBAL_PAYOFF now iterate all commander subtypes and require the tribe name in the commander's oracle text (not just presence in type_line). Prevents Snake tribal on Ikra, Dragon on Niv-Mizzet.

8. **Skullclamp exclusion** — "draw two cards" → `draw a card` missed the "two." Changed to `draw.{0,10}card`. Also applied Equipment type-line post-filter to VOLTRON.

9. **GRAVEYARD_FILL discard clause** — `draws? .{0,20}cards?.{0,60}discards?` matched Gate to the Afterlife's "draw a card. If you do, discard a card" (conditional rider, not active graveyard fill). Tightened to require quantified draw + explicit `then|and` connector before discard, plus separate active-discard clause for Liliana-style effects.
