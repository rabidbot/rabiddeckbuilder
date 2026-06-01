# AGENTS.md — EDH Deck Builder

## Project at a glance

- **Stack:** React 19 + Vite + Electron + SQL.js + Zustand
- **Platform:** Windows exe, deployed via GitHub Actions on push to `main`
- **Repo:** `rabidbot/rabiddeckbuilder`
- **Current version:** `0.1.51` (package.json:6)
- **Build command:** `npm run electron:build` (triggered by GitHub Actions `build.yml`)
- **Lint:** `npx eslint .` — pre-existing React hooks warnings are not ours
- **Type check:** `npx tsc --noEmit` — must pass clean

## How we push

Every feature or fix commit MUST include a version bump in `package.json` before pushing:

```
git add -A
git commit -m "prefix: description of change"
git push
```

- **Prefixes:** `feat:` for features, `fix:` for bugs, `chore:` for version-only bumps
- **Version:** bump patch (0.1.X+1). `chore: bump version` as a separate commit is fine.
- **GitHub Actions:** `build.yml` triggers on push to `main`, builds the Electron app, and creates a release. No manual release step needed.

## Key source files

| File | Purpose |
|---|---|
| `src/lib/archetype-library.ts` | 34-entry archetype library, `SubRole` interface, `runSanityCheck`, `SEED_GAPS`, `verifyTribalRejects`, `verifySignalExamples` |
| `src/lib/deck-engine.ts` | `buildOptimalDeck` (cluster-first builder), `proposeArchetypes` (color/signal/tribal/wincon-multiplier checks), `describeGamePlan`, `buildGamePlanSummary`, `compileSubRoles`, `logClusterMatch` |
| `src/lib/commander-analyzer.ts` | `analyzeCommander()` — derives themes, subtypes, wants, posture from Scryfall oracle |
| `src/lib/card-utils.ts` | `getOracleText`, `getTypeLine`, `getColorIdentity`, `isLandCard`, `getDeckCardKey` |
| `src/lib/card-roles.ts` | `detectCardRoles` — role tagging for non-cluster fill |
| `src/lib/scoring.ts` | `scoreCard`, `KNOWN_STAPLES` (with `tier` field), `applyTierGating` |
| `src/lib/deck-blueprint.ts` | `getDeckBlueprint` — slot budgets and curve percentages per power level |
| `src/stores/deckStore.ts` | Zustand store calling `buildOptimalDeck`, storing `gamePlanSummary`, catching errors as toasts |
| `src/stores/uiStore.ts` | UI state — `onboardingComplete`, `onboardingDismissed`, `showHelp` with localStorage persistence |
| `src/components/layout/OnboardingModal.tsx` | 3-step onboarding modal, gated by `edh-onboarding-v1-seen` + session `onboardingDismissed` |
| `src/components/deck/DeckBuilderView.tsx` | 5-line game plan summary, build button with spinner, power level toggle with tooltip, empty-state Link |
| `src/components/collection/ImportView.tsx` | CSV import with format validation, count+ETA progress tracking |
| `src/components/layout/WelcomeView.tsx` | Landing page 3-step wizard with commander search |

## Architecture: how a deck gets built

1. `analyzeCommander(card)` → themes, subtypes, wants, tribalPayoff
2. `proposeArchetypes(cmdAnalysis, valid, powerLevel)` — scores all 34 library entries against commander colors + signals + power-level wincon multipliers, selects top wincon/engines/synergies/enablers
3. Phase 2: allocate slot budget per cluster (`idealCards` capped by `qualifying * 0.8`)
4. Phase 2.5: `computeSynergyDensity()` — per-card score = `min(30, clusters×5 + subroles×3 + bridging×7 + min(richness,3))`. Bridging counts pool-level sole-shared-card between cluster pairs (unordered). Density added as additive summand to all fill phase scoring.
5. Phase 3: fill each cluster — clusters with `sub_roles` use greedy loop with `getTierComposite + subRolePriorityBonus + densityScore + freeSpellBonus`; others sort by `getTierComposite + densityScore + freeSpellBonus`. **Gated on `nonLandTarget`** (v0.1.51).
6. Phase 5: enabler fill from remaining qualifying cards, sorted by `getTierComposite + freeSpellBonus`
7. Phase 6–8: role-aware greedy fill with tier-gated `scoreCandidateForDeck().score + densityScore`, lands (nonbasic then proportional basics), backfill
8. `validateAndRepairDeck` — color identity, dedup, deck-size repair

## Power level system (v0.1.50)

### Card tiers
`KNOWN_STAPLES` in `scoring.ts` has a `tier` field: `'casual' | 'high-power' | 'cedh'`. ~45 staples tagged. Untagged cards default to casual.

### Tier gating (`applyTierGating`)
Called during deck building for every composite score used in ranking. Not applied at import/scoring time — only during fill phases.
- **Tier higher than power level:** composite × 0.3 (heavy penalty — Mana Crypt shouldn't appear in casual)
- **Tier lower than power level:** composite − 5 (mild discount — casual staples still playable but yield to stronger options)
- **Tier matches or untagged:** no change
- Applied via `getTierComposite(entry)` in Phase 3, 5, and `applyTierGating` wrapper in Phase 6.

### Wincon multipliers
In `proposeArchetypes`, wincon archetype scoring multiplied by power-level factor:

| Archetype key | Casual | High Power | cEDH |
|---|---|---|---|
| COMBAT_FINISHERS_GO_WIDE | ×1.3 | ×1.0 | ×0.7 |
| COMMANDER_DAMAGE_VOLTRON | ×1.2 | ×1.0 | ×0.5 |
| COMBO_TWO_CARD_INFINITE | ×0.4 | ×0.8 | ×1.8 |
| All others | ×1.0 | ×1.0 | ×1.0 |

### Free-spell bonus
For INTERACTION_REMOVAL and PROTECTION_COMMANDER clusters, cards with "without paying its mana cost" oracle text get:
- cEDH: +15
- High Power: +8
- Casual: 0

This pulls Force of Will, Fierce Guardianship, Deflecting Swat, etc. to the top of interaction piles.

### Curve tightening
| Power level | Low | Mid | High | Finisher |
|---|---|---|---|---|
| Casual | 28% | 36% | 24% | 12% |
| High Power | 34% | 34% | 20% | 12% |
| cEDH | 42% | 30% | 16% | 12% |

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

## Synergy density system (v0.1.45)

`computeSynergyDensity(selectedArchetypes, valid, getRoles, globalCardToSubRoleKeys)` computes per-card density scores before fill.

**Formula:** `min(30, clusters×5 + subroles×3 + bridging×7 + min(richness, 3))`

- **clusters:** count of selected clusters the card qualifies for
- **subroles:** count of sub-roles filled across all clusters  
- **bridging:** for each unordered pair of clusters the card belongs to, +7 if the card is the SOLE shared card between them (pool-level eligibility intersection)
- **richness:** `detectCardRoles` flags not covered by the conservative `SUBROLE_FLAG_COVERAGE` map, capped at 3

**Coverage map** only marks flags that a sub-role definitionally implies (FODDER→tokens, REANIMATORS→recursion). Most map to empty — cards earn richness naturally.

**Scoring in all phases:** `baseScore + densityScore` (additive, not multiplicative).

**Output:** Top-10 density contributors in game plan with breakdown like:
```
Karmic Guide: density 21 [clusters 1×5, sub-roles 2×3, bridging 1×7, richness 3]
  Creature Reanimation (Reanimators, Targets) +protection
```

**Summary line:** `Average synergy density: 6.4. Top quartile: 12+. This is a Tight build.` Tight ≥7, Moderate 4–7, Loose <4.

## Game Plan summary (v0.1.48)

`buildGamePlanSummary()` in `deck-engine.ts` returns a structured `GamePlanSummary` object alongside the full `gamePlan` string. Rendered as an always-visible 5-line block in `DeckBuilderView.tsx`:

- Primary archetype, power level, build quality (color-coded) with `[?]` tooltip
- Wincon/Engine/Synergy cluster statuses (Complete/Thin/Missing)
- Gaps list (up to 3, with overflow count)
- Chevron toggle reveals full paragraph dump below

Stored in `DeckStore.gamePlanSummary`. Regenerated on every build, not persisted to DB.

## Polish pass (v0.1.47–0.1.49)

- **Game Plan:** 5-line summary always visible, chevron toggle reveals full plan at 40vh
- **Onboarding:** `OnboardingModal.tsx` — 3-step guide. `edh-onboarding-v1-seen` localStorage gating for permanent dismiss, session-only `onboardingDismissed` flag so "Got it" works without checkbox. Help `?` button in `Header.tsx` re-opens it.
- **Commander search:** WelcomeView step 2 grid has a search input filtering by name and type_line.
- **Skip reasons:** `friendlyReason()` maps technical reasons to plain language (`needs B` → `not in commander's colors`)
- **CSV import:** format validation rejects non-ManaBox CSVs. Count+ETA tracking after first 50 cards.
- **Empty states:** "Select a Commander" has a `NavLink` to `/collection`
- **Build button:** `Loader2` spinner with `animate-spin` during `isBuilding`
- **Power level tooltip:** `[?]` hover on toggle buttons explains Casual/High Power/cEDH

## Debug checklist

### Console strings to look for
- `"ARCHETYPE-SANITY v2 running"` — sanity check ran
- `"CLUSTER-CONTENTS v1"` — game plan built
- `"[Archetype] ..."` — per-archetype diagnostic (selected/skipped/underfilled)
- `"WINCON FALLBACK: forced ..."` — wincon fallback fired
- `"TOKEN_PRODUCTION_ENGINE: inferred from TRIBAL_DENSITY ..."` — token inference
- `"[TribalSanity] ..."` / `"[SignalSanity] ..."` — startup checks
- `"[LandPhase] pip-weight: ..."` — pip distribution before basic allocation
- `"[LandPhase] sources-per-color: ..."` — mana sources per color after land phase

### Deck won't build (toast "Build failed")
1. Look for `PREDICATE BUG:` throw → find which example_reject leaked
2. Verify the leaking card with actual Scryfall data: `curl -sG 'https://api.scryfall.com/cards/search' --data-urlencode 'q=!"Card Name"'`
3. If the card legitimately qualifies → remove from `example_rejects`
4. If the predicate is too loose → tighten the `card_predicate` regex

### UI freezes
- Check greedy fill loop for missing `else` block after failed `addEntry`

### Density doesn't look right
- Verify `SUBROLE_FLAG_COVERAGE` map — only flags definitionally implied by sub-role predicate
- Check bridging: pools are at `clusterPools[clusterKey]` = all qualifying cards, not cards-placed-so-far
- Richness capped at 3; weights are clusters×5, subroles×3, bridging×7, richness
- Density is additive summand, works in all three fill phases

### Mana base has too few lands or zero basics
- Check Phase 3 respects `nonLandTarget` boundary (added v0.1.51)
- Phase 3 `while` loop (sub-roles): `addedEntries.length < alloc && cardIds.length < nonLandTarget`
- Phase 3 `for` loop (non-sub-roles): `if (cardIds.length >= nonLandTarget) break;`
- Verify `blueprint.lands` value for the power level (casual=37, high-power=34, cEDH=31 + commander adjustments)
- Virtual basics are created in `createVirtualBasicLands()`, added to `valid` pool before any phases run

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

10. **Active discard needs `your|each|all`, not `\w+ cards?`** — `\bdiscard\b.{0,20}(?:\w+ cards?|all)` matched Gate's "discard a card" because `\w+` caught "a". Changed to `(?:your |each|all)` — catches hand wipe, Liliana's "each player discards," and "discard all" but not conditional singleton discards. Fixed in v0.1.44.

11. **Density computation runs BEFORE fill** — uses pool-level eligibility sets (all qualifying cards, not cards-placed-so-far). This makes bridging stable (unaffected by fill order) and avoids expensive per-placement recomputation. The `globalCardToSubRoleKeys` map feeds both density and Phase 3 classification.

12. **Richness cap prevents utility inflation** — a Swiss Army Knife card (Staff of Compleation) should get at most 3 richness points regardless of how many flags it triggers. The cap keeps strategy-bridging cards (Karmic Guide) above generic utility.

13. **Polish edits only touch presentation layers** — `DeckBuilderView.tsx`, `ImportView.tsx`, `Header.tsx`, `AppShell.tsx`, `uiStore.ts`. Backend files (`deck-engine.ts`, `archetype-library.ts`) only change for display text mapping (`friendlyReason`), never for algorithmic behavior. *(Exception: power level system added algorithmic changes to deck-engine.ts in v0.1.50.)*

14. **Phase 3 must gate on nonLandTarget** — clusters fill greedily to per-cluster allocs, which can exceed `nonLandTarget = 99 - blueprint.lands`. Without a boundary check, nonland cards fill all 99 slots, `addEntry` returns false for lands, and the deck ships with zero basics. Fixed v0.1.51 by adding `cardIds.length < nonLandTarget` guards in both Phase 3 fill loops.
