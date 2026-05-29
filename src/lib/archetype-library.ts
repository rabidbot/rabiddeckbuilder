import type { CollectionEntry } from './types';
import { getOracleText, getTypeLine, isLandCard } from './card-utils';

export type ArchetypeCategory = 'wincon' | 'engine' | 'synergy' | 'enabler';

export interface SubRole {
  key: string;
  name: string;
  predicate: string;
  ideal: number;
  minimum: number;
  optional: boolean;
  example_cards: string[];
  example_rejects: string[];
}

export interface ArchetypeEntry {
  key: string;
  display_name: string;
  category: ArchetypeCategory;
  required_colors: string[];
  commander_signals: RegExp[];
  card_predicate: RegExp;
  exclusions: RegExp | null;
  ideal_count: number;
  always_proposed: boolean;
  example_cards: string[];
  example_rejects: string[];
  sub_roles?: SubRole[];
}

export function matchesEntry(entry: CollectionEntry, arch: ArchetypeEntry): boolean {
  const oracle = getOracleText(entry.scryfallData).toLowerCase();
  if (!arch.card_predicate.test(oracle)) return false;
  if (arch.exclusions && arch.exclusions.test(oracle)) return false;
  return true;
}

const W = 'W', U = 'U', B = 'B', R = 'R', G = 'G';

export const ARCHETYPE_LIBRARY: ArchetypeEntry[] = [
  // ===== WINCONS =====
  {
    key: 'COMMANDER_DAMAGE_VOLTRON',
    display_name: 'Commander Voltron',
    category: 'wincon',
    required_colors: [],
    commander_signals: [
      /\bequipped creature\b|\benchanted creature\b/i,
      /attach|equip .{0,80}(double strike|trample|menace|unblockable|first strike|hexproof|protection)/i,
    ],
    card_predicate: /[^.]*\bequip(?:ped)? creature gets \+|equipped creature (?:has|gains) \w|enchanted creature (?:gets|has)/i,
    exclusions: /sacrifice.{0,20}equipment|draw.{0,10}card/i,
    ideal_count: 8,
    always_proposed: false,
    example_cards: ['Sword of Hearth and Home', 'Blade of Selves', 'Lightning Greaves', 'Swiftfoot Boots'],
    example_rejects: ['Skullclamp', 'Horde of Notions', 'Sol Ring'],
  },
  {
    key: 'COMBAT_FINISHERS_GO_WIDE',
    display_name: 'Go Wide Finishers',
    category: 'wincon',
    required_colors: [],
    commander_signals: [
      /\bcreate .{0,40}token/i,
      /\beach (other )?creature you control\b/i,
      /\b(\w+) creatures you control get\b/i,
      /\btokens? you control\b/i,
      /\bwhenever a creature you control (enters|attacks|dies)/i,
      /\bX is the number of (creatures|\w+s) you control\b/i,
      /\bcreatures? you control with\b/i,
    ],
    card_predicate: /creatures you control get \+|anthem|each (?:other )?creature you control|double the (?:number of )?tokens|populate|convoke|overrun|extra combat|triumph of the hordes/i,
    exclusions: null,
    ideal_count: 6,
    always_proposed: false,
    example_cards: ['Craterhoof Behemoth', 'Parallel Lives', 'Doubling Season', 'Wayfaring Temple'],
    example_rejects: ['Wrath of God'],
    sub_roles: [
      {
        key: 'TOKEN_PRODUCERS', name: 'Token Producers', optional: false, ideal: 5, minimum: 4,
        predicate: 'create .{0,30}\\d+ .{0,30}creature tokens?|create .{0,40}creature token.{0,40}(?:at the beginning|whenever|for each)|populate|amass \\d+|fabricate \\d+|create .{0,30}creature token.{0,100}at the beginning of (?:your |each )?(?:upkeep|combat|end step)',
        example_cards: ['Bitterblossom', 'Avenger of Zendikar', 'Awakening Zone', 'Hoofprints of the Stag', 'Chatterfang'],
        example_rejects: [],
      },
      {
        key: 'ANTHEMS', name: 'Anthems', optional: false, ideal: 3, minimum: 2,
        predicate: 'creatures you control get \\+\\d+\\/\\+\\d+|other (?:\\w+ )?creatures you control get \\+\\d+\\/\\+\\d+|\\w+ creatures you control get \\+\\d+\\/\\+\\d+|at the beginning of combat .{0,40}creatures you control get|\\bcrusade\\b|\\bglorious anthem\\b',
        example_cards: ['Glorious Anthem', 'Crusade', 'Beastmaster Ascension', 'Cathars\' Crusade', 'Coat of Arms'],
        example_rejects: [],
      },
      {
        key: 'CLOSERS', name: 'Closers', optional: false, ideal: 2, minimum: 1,
        predicate: 'creatures you control get \\+\\d+\\/\\+\\d+ and gain trample|\\bovercome\\b|\\bovergrowth\\b|double the number of .{0,30}tokens|each creature you control deals damage equal to',
        example_cards: ['Craterhoof Behemoth', 'Overrun', 'Triumph of the Hordes', 'Pathbreaker Ibex', 'End-Raze Forerunners'],
        example_rejects: [],
      },
    ],
  },
  {
    key: 'BURN_X_SPELL_KILL',
    display_name: 'Burn / X-Spell Finishers',
    category: 'wincon',
    required_colors: [R],
    commander_signals: [
      /damage|spell.{0,20}copy|cast.{0,30}instant|sorcery/i,
    ],
    card_predicate: /deals?\s+X\s+damage to (?:any target|target opponent|each opponent|each player|target player|each of them)|deals?\s+\d+\s+damage to (?:each opponent|each player|target opponent.{0,30}(?:equal to|times))/i,
    exclusions: null,
    ideal_count: 5,
    always_proposed: false,
    example_cards: ['Comet Storm', 'Fall of the Titans', 'Crackle with Power'],
    example_rejects: ['Lightning Bolt', 'Shock', 'Voldaren Epicure', "Bontu's Monument"],
    sub_roles: [
      {
        key: 'X_SPELLS', name: 'X Spells', optional: false, ideal: 4, minimum: 3,
        predicate: '\\{X\\}.{0,40}deals? .{0,20}damage',
        example_cards: ['Comet Storm', 'Fall of the Titans', 'Crackle with Power', 'Banefire', 'Earthquake'],
        example_rejects: ['Lightning Bolt'],
      },
      {
        key: 'RITUALS_AND_BIG_MANA', name: 'Rituals & Big Mana', optional: false, ideal: 3, minimum: 2,
        predicate: 'add .{0,20}(\\{[RUBGW]\\}.{0,5}){2,}|adds? (?:twice|an additional|two|three).{0,30}mana|whenever .{0,40}tap.{0,40}for mana.{0,40}adds?',
        example_cards: ['Seething Song', 'Pyretic Ritual', 'Mana Reflection', 'Nyxbloom Ancient', 'Mana Geyser'],
        example_rejects: [],
      },
      {
        key: 'COPY_EFFECTS', name: 'Copy Effects', optional: true, ideal: 2, minimum: 1,
        predicate: 'copy target (?:instant|sorcery)|copy that spell|whenever you cast (?:an instant or sorcery|a noncreature spell).{0,40}copy',
        example_cards: ['Reverberate', 'Twincast', 'Increasing Vengeance', 'Swarm Intelligence'],
        example_rejects: [],
      },
    ],
  },
  {
    key: 'COMMANDER_DAMAGE_INFECT_POISON',
    display_name: 'Infect / Poison Win',
    category: 'wincon',
    required_colors: [],
    commander_signals: [/infect|toxic|poison|proliferate/i],
    card_predicate: /\binfect\b|\btoxic \d+|poison counters?|proliferate/i,
    exclusions: null,
    ideal_count: 6,
    always_proposed: false,
    example_cards: ['Triumph of the Hordes', 'Glistener Elf'],
    example_rejects: [],
  },
  {
    key: 'MILL_OPPONENTS_OUT',
    display_name: 'Mill Opponents',
    category: 'wincon',
    required_colors: [U],
    commander_signals: [/mill|library.{0,20}graveyard|cards from the top/i],
    card_predicate: /target (?:player|opponent) mills?\s+\d+|each opponent mills?\s+\d+|put the top \d+ cards of (?:target )?(?:player|opponent).{0,20}into.{0,20}graveyard/i,
    exclusions: null,
    ideal_count: 5,
    always_proposed: false,
    example_cards: ['Bruvac the Grandiloquent', 'Maddening Cacophony'],
    example_rejects: [],
  },
  {
    key: 'LIFE_DRAIN_AGGREGATE',
    display_name: 'Life Drain Win',
    category: 'wincon',
    required_colors: [B],
    commander_signals: [
      /loses? life|drain|each opponent loses/i,
      /\blifelink\b/i,
      /\bgain .{0,20} life\b/i,
      /\bwhenever .{0,30}(deals|gain).{0,30}(damage|life)/i,
    ],
    card_predicate: /each opponent loses \d+ life|deals \d+ damage to each opponent|whenever.{0,40}(?:creature|token).{0,40}(?:dies|enters|leaves).{0,40}(?:opponent|player).{0,20}loses?\s+\d+\s+life/i,
    exclusions: null,
    ideal_count: 6,
    always_proposed: false,
    example_cards: ['Blood Artist', 'Zulaport Cutthroat', 'Marionette Apprentice'],
    example_rejects: [],
  },
  {
    key: 'COMBO_TWO_CARD_INFINITE',
    display_name: 'Two-Card Combo Win',
    category: 'wincon',
    required_colors: [],
    commander_signals: [/search your library|draw cards|tutor/i],
    card_predicate: /Thassa.{0,20}Oracle|Demonic Consultation|Kiki-Jiki|Restoration Angel|Heliod|Walking Ballista|Worldgorger Dragon|Animate Dead|Dramatic Reversal|Isochron Scepter|Mikaeus|Triskelion|Devoted Druid|Vizier of Remedies/i,
    exclusions: null,
    ideal_count: 4,
    always_proposed: false,
    example_cards: ['Thassa\'s Oracle', 'Demonic Consultation', 'Kiki-Jiki, Mirror Breaker'],
    example_rejects: [],
  },

  // ===== ENGINES =====
  {
    key: 'CARD_DRAW_REPEATABLE',
    display_name: 'Card Draw Engine',
    category: 'engine',
    required_colors: [],
    commander_signals: [],
    card_predicate: /whenever .{0,80}draw (?:a|that) card|at the beginning of (?:your |each )?(?:upkeep|end step).{0,40}draw|\{T\}.{0,30}draw a card|draws? an additional card|skip your draw step.{0,30}draw \d+/i,
    exclusions: null,
    ideal_count: 8,
    always_proposed: true,
    example_cards: ['Rhystic Study', 'Mystic Remora', 'Esper Sentinel', 'The One Ring', 'Sylvan Library'],
    example_rejects: ['Opt', 'Preordain'],
  },
  {
    key: 'TUTORS_GENERIC',
    display_name: 'Tutor Suite',
    category: 'engine',
    required_colors: [],
    commander_signals: [],
    card_predicate: /search your library for (?:a|up to|any|an?) .{0,60}(?:card|creature|artifact|enchantment|instant|sorcery|land|planeswalker)/i,
    exclusions: /\b(?:land|Plains|Island|Swamp|Mountain|Forest)\b.{0,120}(?:battlefield|onto the battlefield)/i,
    ideal_count: 4,
    always_proposed: true,
    example_cards: ['Demonic Tutor', 'Vampiric Tutor', 'Worldly Tutor', 'Enlightened Tutor'],
    example_rejects: ['Cultivate', 'Farseek'],
  },
  {
    key: 'REANIMATION_CREATURE_ENGINE',
    display_name: 'Creature Reanimation',
    category: 'engine',
    required_colors: [B],
    commander_signals: [
      /(?:from|in) (?:your |a )?graveyard.{0,40}(?:battlefield|hand|play)/i,
      /return.{0,30}creature.{0,30}graveyard/i,
      /(?:cast|play).{0,50}(?:from|in) (?:your |a )?graveyard/i,
    ],
    card_predicate: /(?:return|puts?).{0,80}\bcreature\b.{0,80}(?:from (?:your|a|the|their) graveyard|graveyard.{0,80}(?:to (?:the )?battlefield|onto the battlefield|to (?:your )?hand))|graveyard.{0,300}(?:return|puts?).{0,80}\bcreature\b/i,
    exclusions: /enchantment|artifact|land(?:s)?|instant|sorcery/i,
    ideal_count: 6,
    always_proposed: false,
    example_cards: ['Animate Dead', 'Reanimate', 'Living Death', 'Angel of Glory\'s Rise'],
    example_rejects: ['Replenish', 'Splendid Reclamation'],
    sub_roles: [
      {
        key: 'GRAVE_FILLERS', name: 'Grave Fillers', optional: false, ideal: 4, minimum: 3,
        predicate: '\\bmill\\b|\\bself-mill\\b|put .{0,30}top .{0,30}cards? .{0,30}of your library into .{0,20}graveyard|draws? .{0,20}cards?.{0,30}(?:then |and )?discards?|discard your hand|sacrifice (?:a|another|target) .{0,20}creature.{0,20}:|\\bdredge\\b',
        example_cards: ['Buried Alive', 'Stitcher\'s Supplier', 'Champion of Wits', 'Hermit Druid', 'Faithless Looting', 'Liliana of the Veil', 'Mesmeric Orb', 'Otrimi the Ever-Playful', 'Viscera Seer'],
        example_rejects: ['Gate to the Afterlife', 'Animate Dead'],
      },
      {
        key: 'REANIMATORS', name: 'Reanimators', optional: false, ideal: 4, minimum: 3,
        predicate: '(?:return|puts?).{0,80}\\bcreature\\b.{0,80}(?:from (?:your|a|the|their) graveyard|graveyard.{0,80}(?:to (?:the )?battlefield|onto the battlefield|to (?:your )?hand))|graveyard.{0,300}(?:return|puts?).{0,80}\\bcreature\\b',
        example_cards: ['Reanimate', 'Animate Dead', 'Living Death', 'Angel of Glory\'s Rise', 'Bloodline Bidding', 'Unearth', 'Victimize'],
        example_rejects: ['Replenish', 'Splendid Reclamation'],
      },
      {
        key: 'TARGETS', name: 'Targets', optional: false, ideal: 4, minimum: 2,
        predicate: '__REANIM_TARGETS__',
        example_cards: ['Craterhoof Behemoth', 'Avenger of Zendikar', 'Massacre Wurm', 'Sun Titan', 'Sheoldred the Apocalypse', 'Cavalier of Thorns'],
        example_rejects: ['Lightning Bolt', 'Sol Ring'],
      },
    ],
  },
  {
    key: 'SPELL_RECURSION_ENGINE',
    display_name: 'Spell Recursion',
    category: 'engine',
    required_colors: [B, R, U],
    commander_signals: [
      /instant.{0,30}graveyard|sorcery.{0,30}graveyard|cast.{0,40}graveyard|flashback/i,
    ],
    card_predicate: /return.{0,40}(?:target )?(?:instant|sorcery).{0,40}from.{0,20}graveyard|cast.{0,40}(?:instant|sorcery).{0,40}from.{0,20}graveyard|flashback/i,
    exclusions: null,
    ideal_count: 5,
    always_proposed: false,
    example_cards: ['Past in Flames', 'Snapcaster Mage', 'Underworld Breach'],
    example_rejects: ['Animate Dead', 'Eternal Witness'],
  },
  {
    key: 'SACRIFICE_OUTLET_ENGINE',
    display_name: 'Sacrifice Outlets',
    category: 'engine',
    required_colors: [B, R],
    commander_signals: [
      /sacrifice|whenever .{0,30}(?:creature|permanent).{0,30}dies|whenever a token/i,
    ],
    card_predicate: /sacrifice (?:a|another|target) .{0,30}(?:creature|permanent|artifact)\s?[:,]/i,
    exclusions: /as an additional cost/i,
    ideal_count: 4,
    always_proposed: false,
    example_cards: ['Ashnod\'s Altar', 'Phyrexian Altar', 'Viscera Seer', 'Carrion Feeder'],
    example_rejects: ['Fleshbag Marauder'],
    sub_roles: [
      {
        key: 'OUTLETS', name: 'Outlets', optional: false, ideal: 3, minimum: 2,
        predicate: 'sacrifice (?:a|another|target) .{0,30}(?:creature|permanent|artifact)\\s?[:,]',
        example_cards: ['Ashnod\'s Altar', 'Phyrexian Altar', 'Viscera Seer', 'Carrion Feeder'],
        example_rejects: ['Fleshbag Marauder'],
      },
      {
        key: 'FODDER', name: 'Fodder', optional: false, ideal: 6, minimum: 4,
        predicate: '__FODDER__',
        example_cards: ['Gravecrawler', 'Reassembling Skeleton', 'Bloodsoaked Champion'],
        example_rejects: [],
      },
      {
        key: 'AFTERMATH_PAYOFFS', name: 'Aftermath Payoffs', optional: false, ideal: 3, minimum: 2,
        predicate: 'whenever .{0,30}creature .{0,30}dies.{0,40}(?:opponent|player|deals|gain|put)',
        example_cards: ['Blood Artist', 'Zulaport Cutthroat', 'Grim Haruspex', 'Pitiless Plunderer'],
        example_rejects: [],
      },
    ],
  },
  {
    key: 'TOKEN_PRODUCTION_ENGINE',
    display_name: 'Token Generation',
    category: 'engine',
    required_colors: [],
    commander_signals: [
      /create .{0,30}token|populate|amass|fabricate|convoke|whenever.{0,30}token enters/i,
    ],
    card_predicate: /create .{0,50}token|populate|amass|fabricate \d+|at the beginning of (?:your |each )?(?:upkeep|end step|combat).{0,40}create/i,
    exclusions: null,
    ideal_count: 7,
    always_proposed: false,
    example_cards: ['Bitterblossom', 'Hoofprints of the Stag', 'Awakening Zone', 'Chatterfang'],
    example_rejects: [],
  },
  {
    key: 'BLINK_ETB_LOOP_ENGINE',
    display_name: 'Blink / ETB Loop',
    category: 'engine',
    required_colors: [W, U],
    commander_signals: [
      /exile.{0,30}return.{0,30}battlefield|flicker|when.{0,30}enters/i,
    ],
    card_predicate: /exile (?:target|another target) (?:creature|permanent).{0,40}return.{0,40}battlefield (?:under (?:its|their|your|its owner's|their owner's) control|tapped|untapped)|flicker/i,
    exclusions: null,
    ideal_count: 6,
    always_proposed: false,
    example_cards: ['Cloudshift', 'Ephemerate', 'Conjurer\'s Closet', 'Soulherder'],
    example_rejects: [],
    sub_roles: [
      {
        key: 'BLINK_EFFECTS', name: 'Blink Effects', optional: false, ideal: 4, minimum: 2,
        predicate: 'exile (?:target|another target) (?:creature|permanent).{0,40}return.{0,40}battlefield (?:under (?:its|their|your|its owner\'s|their owner\'s) control|tapped|untapped)|flicker',
        example_cards: ['Cloudshift', 'Ephemerate', 'Conjurer\'s Closet', 'Soulherder'],
        example_rejects: [],
      },
      {
        key: 'ETB_VALUE_TARGETS', name: 'ETB Value Targets', optional: false, ideal: 5, minimum: 3,
        predicate: '__ETB_TARGETS__',
        example_cards: ['Mulldrifter', 'Reflector Mage', 'Reclamation Sage', 'Cloudblazer', 'Eternal Witness'],
        example_rejects: [],
      },
    ],
  },
  {
    key: 'MANA_DOUBLERS_PRODUCTION',
    display_name: 'Mana Doublers / Big Mana',
    category: 'engine',
    required_colors: [],
    commander_signals: [
      /\{X\}|cost.{0,30}more|cost.{0,30}less/i,
    ],
    card_predicate: /(?:adds?|produces?) (?:twice|an additional|two|three|four).{0,40}mana|whenever.{0,40}tap.{0,30}for mana.{0,40}(?:adds?|produces?)/i,
    exclusions: null,
    ideal_count: 3,
    always_proposed: false,
    example_cards: ['Mana Reflection', 'Mirari\'s Wake', 'Nyxbloom Ancient', 'Cabal Coffers'],
    example_rejects: ['Sol Ring'],
  },
  {
    key: 'TREASURE_GENERATION',
    display_name: 'Treasure / Mana Tokens',
    category: 'engine',
    required_colors: [B, R, U],
    commander_signals: [/treasure|mana token|gold token/i],
    card_predicate: /create .{0,20}treasure token|whenever .{0,40}create .{0,20}treasure/i,
    exclusions: null,
    ideal_count: 5,
    always_proposed: false,
    example_cards: ['Dockside Extortionist', 'Pitiless Plunderer', 'Brass\'s Bounty'],
    example_rejects: [],
    sub_roles: [
      {
        key: 'TREASURE_MAKERS', name: 'Treasure Makers', optional: false, ideal: 5, minimum: 3,
        predicate: 'create .{0,20}treasure token|whenever .{0,40}create .{0,20}treasure',
        example_cards: ['Dockside Extortionist', 'Pitiless Plunderer', 'Brass\'s Bounty'],
        example_rejects: [],
      },
      {
        key: 'TREASURE_PAYOFFS', name: 'Treasure Payoffs', optional: false, ideal: 2, minimum: 1,
        predicate: 'sacrifice .{0,10}treasure|whenever .{0,30}artifact .{0,30}enters|for each .{0,20}artifact',
        example_cards: ['Marionette Apprentice', 'Disciple of the Vault'],
        example_rejects: [],
      },
    ],
  },
  {
    key: 'COUNTERS_PROLIFERATE_ENGINE',
    display_name: '+1/+1 Counters / Proliferate',
    category: 'engine',
    required_colors: [],
    commander_signals: [/\+1\/\+1 counter|proliferate|counters? on/i],
    card_predicate: /put .{0,30}\+1\/\+1 counter(?:s)? on|\+1\/\+1 counter.{0,20}(?:put|placed|would be put|on\b)|proliferate|whenever .{0,30}counter.{0,30}placed/i,
    exclusions: null,
    ideal_count: 6,
    always_proposed: false,
    example_cards: ['Hardened Scales', 'Doubling Season', 'Inspiring Call', 'Evolution Sage'],
    example_rejects: [],
    sub_roles: [
      {
        key: 'COUNTER_PLACERS', name: 'Counter Placers', optional: false, ideal: 5, minimum: 3,
        predicate: 'put .{0,30}\\+1\\/\\+1 counter',
        example_cards: ['Hardened Scales', 'Doubling Season', 'Inspiring Call', 'Evolution Sage'],
        example_rejects: [],
      },
      {
        key: 'PROLIFERATE_ENGINES', name: 'Proliferate Engines', optional: false, ideal: 3, minimum: 2,
        predicate: 'proliferate|double the number of',
        example_cards: ['Evolution Sage', 'Doubling Season'],
        example_rejects: [],
      },
      {
        key: 'COUNTER_PAYOFFS', name: 'Counter Payoffs', optional: false, ideal: 2, minimum: 1,
        predicate: 'equal to the number of .{0,40}counters|for each .{0,30}counter',
        example_cards: ['Inspiring Call', 'Armorcraft Judge'],
        example_rejects: [],
      },
    ],
  },
  {
    key: 'SPELLSLINGER_PAYOFF',
    display_name: 'Spellslinger Payoff',
    category: 'engine',
    required_colors: [U, R],
    commander_signals: [
      /(?:instant|sorcery).{0,40}(?:cast|graveyard|hand)|prowess|magecraft|whenever you cast/i,
    ],
    card_predicate: /whenever you cast (?:an? |your )?(?:instant|sorcery|noncreature)|magecraft|prowess/i,
    exclusions: null,
    ideal_count: 7,
    always_proposed: false,
    example_cards: ['Storm-Kiln Artist', 'Young Pyromancer', 'Talrand', 'Archmage Emeritus'],
    example_rejects: [],
    sub_roles: [
      {
        key: 'PAYOFFS', name: 'Payoffs', optional: false, ideal: 5, minimum: 4,
        predicate: 'whenever you cast (?:an? |your )?(?:instant|sorcery|noncreature)|magecraft|prowess',
        example_cards: ['Storm-Kiln Artist', 'Young Pyromancer', 'Talrand', 'Archmage Emeritus'],
        example_rejects: [],
      },
      {
        key: 'CHEAP_SPELL_DENSITY', name: 'Cheap Spell Density', optional: false, ideal: 12, minimum: 8,
        predicate: '__CHEAP_SPELL__',
        example_cards: ['Lightning Bolt', 'Brainstorm', 'Opt', 'Preordain', 'Counterspell', 'Swords to Plowshares', 'Path to Exile'],
        example_rejects: [],
      },
      {
        key: 'COPY_RECUR', name: 'Copy / Recur', optional: true, ideal: 2, minimum: 1,
        predicate: 'copy target (?:instant|sorcery)|cast .{0,40}from .{0,20}graveyard|flashback|whenever you cast .{0,40}from .{0,20}graveyard',
        example_cards: ['Snapcaster Mage', 'Past in Flames', 'Increasing Vengeance', 'Underworld Breach', 'Mystic Sanctuary'],
        example_rejects: [],
      },
    ],
  },
  {
    key: 'ARTIFACT_SYNERGY_ENGINE',
    display_name: 'Artifact Engine',
    category: 'engine',
    required_colors: [],
    commander_signals: [/artifact.{0,30}artifact|artifact/i],
    card_predicate: /whenever .{0,30}artifact.{0,30}(?:enters|cast|dies)|artifacts? you control|metalcraft|affinity for artifacts|improvise/i,
    exclusions: null,
    ideal_count: 8,
    always_proposed: false,
    example_cards: ['Goblin Welder', 'Cranial Plating', 'Urza Lord High Artificer'],
    example_rejects: [],
  },
  {
    key: 'ENCHANTMENT_SYNERGY_ENGINE',
    display_name: 'Enchantress / Enchantment Engine',
    category: 'engine',
    required_colors: [W, G],
    commander_signals: [/enchantment.{0,30}enchantment|enchantment/i],
    card_predicate: /whenever .{0,30}enchantment.{0,30}(?:enters|cast)|enchantments? you control|constellation|enchantress/i,
    exclusions: null,
    ideal_count: 7,
    always_proposed: false,
    example_cards: ['Argothian Enchantress', 'Sythis', 'Sterling Grove', 'Eidolon of Blossoms'],
    example_rejects: [],
  },
  {
    key: 'GRAVEYARD_VALUE_RECURSION',
    display_name: 'Graveyard Value (non-creature)',
    category: 'engine',
    required_colors: [B, G],
    commander_signals: [/(?:from|in).{0,10}graveyard|delve|dredge|escape|threshold/i],
    card_predicate: /return .{0,60}(?:target )?card from (?:your |a )?graveyard to .{0,20}hand|return .{0,60}(?:target )?(?:artifact|enchantment|land|permanent).{0,60}graveyard.{0,40}battlefield/i,
    exclusions: null,
    ideal_count: 4,
    always_proposed: false,
    example_cards: ['Eternal Witness', 'Regrowth', 'Sun Titan'],
    example_rejects: [],
  },

  // ===== SYNERGIES =====
  {
    key: 'TRIBAL_DENSITY',
    display_name: 'Tribal Density ({tribe})',
    category: 'synergy',
    required_colors: [],
    commander_signals: [],
    card_predicate: /TRIBAL_PLACEHOLDER_DENSITY/i,
    exclusions: null,
    ideal_count: 12,
    always_proposed: false,
    example_cards: ['Cavalier of Thorns', 'Multani', 'Titania'],
    example_rejects: [],
    sub_roles: [
      {
        key: 'TRIBE_BODIES', name: 'Tribe Bodies', optional: false, ideal: 12, minimum: 8,
        predicate: '__TRIBE_BODIES__',
        example_cards: ['Cavalier of Thorns', 'Multani', 'Titania'],
        example_rejects: [],
      },
      {
        key: 'TRIBAL_LORDS', name: 'Tribal Lords', optional: false, ideal: 3, minimum: 1,
        predicate: '\\b{tribe}s? you control get \\+\\d+\\/\\+\\d+|other \\b{tribe}s? get',
        example_cards: ['Omnath Locus of the Roil', 'Soulbright Flamekin'],
        example_rejects: [],
      },
      {
        key: 'TRIBAL_ENABLERS', name: 'Tribal Enablers', optional: true, ideal: 2, minimum: 1,
        predicate: '\\b{tribe}s? you cast cost .{0,10} less|search your library for .{0,30}\\b{tribe}\\b|return target \\b{tribe}\\b',
        example_cards: ['Smokebraider', 'Flamekin Harbinger', 'Incandescent Soulstoke'],
        example_rejects: [],
      },
    ],
  },
  {
    key: 'TRIBAL_PAYOFF',
    display_name: 'Tribal Payoffs ({tribe})',
    category: 'synergy',
    required_colors: [],
    commander_signals: [],
    card_predicate: /TRIBAL_PLACEHOLDER_PAYOFF/i,
    exclusions: null,
    ideal_count: 5,
    always_proposed: false,
    example_cards: ['Risen Reef', 'Elemental Bond', 'Omnath'],
    example_rejects: [],
  },
  {
    key: 'LANDFALL_PAYOFF',
    display_name: 'Landfall Payoffs',
    category: 'synergy',
    required_colors: [],
    commander_signals: [/landfall|land enters/i],
    card_predicate: /landfall|whenever a land enters/i,
    exclusions: null,
    ideal_count: 7,
    always_proposed: false,
    example_cards: ['Avenger of Zendikar', 'Felidar Retreat', 'Lotus Cobra'],
    example_rejects: [],
  },
  {
    key: 'AURA_VOLTRON_SUPPORT',
    display_name: 'Aura Voltron',
    category: 'synergy',
    required_colors: [W, G, U],
    commander_signals: [/shroud|hexproof|ward|enchanted creature/i],
    card_predicate: /enchanted creature gets|enchanted creature has|enchanted creature gains/i,
    exclusions: null,
    ideal_count: 7,
    always_proposed: false,
    example_cards: ['Eldrazi Conscription', 'Hyena Umbra', 'All That Glitters'],
    example_rejects: ['Pacifism', 'Faith\'s Fetters'],
  },
  {
    key: 'ATTACK_TRIGGERS_PAYOFF',
    display_name: 'Combat Triggers',
    category: 'synergy',
    required_colors: [],
    commander_signals: [
      /\bwhen(ever)? .{0,40}\b(attacks?|deals combat damage|deals damage to a player)\b/i,
      /\battacks alone\b/i,
    ],
    card_predicate: /whenever .{0,30}attacks?|whenever .{0,30}deals combat damage/i,
    exclusions: null,
    ideal_count: 6,
    always_proposed: false,
    example_cards: ['Edric, Spymaster of Trest', 'Prince Imrahil'],
    example_rejects: [],
  },
  {
    key: 'ETB_DIES_TRIGGERS',
    display_name: 'ETB/Dies Triggers',
    category: 'synergy',
    required_colors: [],
    commander_signals: [
      /\bwhen(ever)? .{0,40}\b(enters|dies|leaves the battlefield|is put into a graveyard)\b/i,
      /\bwhen(ever)? a (\w+ )?(creature|permanent|token) (you control )?enters\b/i,
    ],
    card_predicate: /when(?:ever)?.{0,40}(?:enters the battlefield|enters|dies|is put into a graveyard from the battlefield)/i,
    exclusions: null,
    ideal_count: 6,
    always_proposed: false,
    example_cards: ['Eternal Witness', 'Mulldrifter', 'Reclamation Sage', 'Cloudblazer'],
    example_rejects: [],
  },

  // ===== ENABLERS =====
  {
    key: 'GRAVEYARD_FILL',
    display_name: 'Graveyard Fill',
    category: 'enabler',
    required_colors: [],
    commander_signals: [/graveyard|mill|discard|dies|sacrifice/i],
    card_predicate: /\bmills?\b|\bself-mill\b|put the top .{0,30}cards?.{0,30}into.{0,20}(?:your |the )?graveyard|draws? .{0,20}cards?.{0,60}discards?|discard your hand|cycling|(?:search|reveal).{0,60}into.{0,20}(?:your|a) graveyard/i,
    exclusions: null,
    ideal_count: 8,
    always_proposed: false,
    example_cards: ['Buried Alive', 'Champion of Wits', 'Stitcher\'s Supplier', 'Faithless Looting', 'Hermit Druid', 'Mesmeric Orb'],
    example_rejects: ['Animate Dead'],
  },
  {
    key: 'ROCKS_RAMP',
    display_name: 'Mana Rocks',
    category: 'enabler',
    required_colors: [],
    commander_signals: [],
    card_predicate: /\{T\}: add (?:\{[WUBRGC0-9X]\})+|adds? (?:one|two|three) mana of any color/i,
    exclusions: null,
    ideal_count: 8,
    always_proposed: true,
    example_cards: ['Sol Ring', 'Arcane Signet', 'Mind Stone'],
    example_rejects: ['Cultivate', 'Gadrak, the Crown-Scourge', 'Solemn Simulacrum'],
  },
  {
    key: 'LAND_RAMP_GREEN',
    display_name: 'Land Ramp',
    category: 'enabler',
    required_colors: [G],
    commander_signals: [],
    card_predicate: /search your library for .{0,80}(?:basic )?land.{0,80}(?:battlefield|tapped|onto)|put.{0,60}land.{0,60}onto the battlefield/i,
    exclusions: null,
    ideal_count: 7,
    always_proposed: true,
    example_cards: ['Cultivate', 'Kodama\'s Reach', 'Three Visits', 'Nature\'s Lore', 'Farseek'],
    example_rejects: [],
  },
  {
    key: 'DORK_RAMP',
    display_name: 'Mana Dorks',
    category: 'enabler',
    required_colors: [G],
    commander_signals: [],
    card_predicate: /\{T\}: add \{[WUBRGC]\}|\{T\}: add one mana of any color/i,
    exclusions: null,
    ideal_count: 4,
    always_proposed: true,
    example_cards: ['Llanowar Elves', 'Birds of Paradise', 'Elvish Mystic', 'Avacyn\'s Pilgrim'],
    example_rejects: ['Solemn Simulacrum'],
  },
  {
    key: 'INTERACTION_REMOVAL',
    display_name: 'Targeted Removal',
    category: 'enabler',
    required_colors: [],
    commander_signals: [],
    card_predicate: /destroy target|exile target (?:creature|permanent|nonland|artifact|enchantment|planeswalker)|counter target spell|return target.{0,30}to .{0,20}owner's hand/i,
    exclusions: null,
    ideal_count: 8,
    always_proposed: true,
    example_cards: ['Swords to Plowshares', 'Path to Exile', 'Beast Within', 'Generous Gift', 'Assassin\'s Trophy'],
    example_rejects: ['Wrath of God'],
  },
  {
    key: 'BOARD_WIPES',
    display_name: 'Board Wipes',
    category: 'enabler',
    required_colors: [],
    commander_signals: [/destroy all|exile all/i],
    card_predicate: /destroy all .{0,30}(?:creatures|permanents|nonland)|exile all .{0,30}(?:creatures|permanents)|each creature gets -[X\d]|all creatures get -[X\d]|deals \d+ damage to each creature/i,
    exclusions: null,
    ideal_count: 3,
    always_proposed: false,
    example_cards: ['Wrath of God', 'Damnation', 'Toxic Deluge', 'Blasphemous Act', 'Cyclonic Rift'],
    example_rejects: [],
  },
  {
    key: 'PROTECTION_COMMANDER',
    display_name: 'Commander Protection',
    category: 'enabler',
    required_colors: [],
    commander_signals: [],
    card_predicate: /hexproof|shroud|indestructible|protection from|phasing|target.{0,30}(?:gains?|has) shroud|creatures you control (?:gain|have) (?:indestructible|hexproof)/i,
    exclusions: null,
    ideal_count: 4,
    always_proposed: true,
    example_cards: ['Lightning Greaves', 'Swiftfoot Boots', 'Heroic Intervention', 'Teferi\'s Protection', 'Flawless Maneuver', 'Deflecting Swat'],
    example_rejects: [],
  },
];

export const SEED_GAPS: Record<string, string[]> = {
  REANIMATION_CREATURE_ENGINE: [
    'Animate Dead', 'Reanimate', 'Living Death', 'Victimize', 'Persist',
    'Sevinne\'s Reclamation', 'Unburial Rites',
  ],
  'TRIBAL_PAYOFF:Elemental': [
    'Risen Reef', 'Omnath Locus of the Roil', 'Elemental Bond',
    'Smokebraider', 'Incandescent Soulstoke',
  ],
  'TRIBAL_PAYOFF:Snake': [
    'Lorescale Coatl', 'Ohran Frostfang', 'Hapatra Vizier of Poisons',
  ],
  GRAVEYARD_FILL: [
    'Stitcher\'s Supplier', 'Hedron Crab', 'Mesmeric Orb', 'Faithless Looting',
    'Liliana of the Veil', 'Otrimi the Ever-Playful',
  ],
  COMBAT_FINISHERS_GO_WIDE: [
    'Craterhoof Behemoth', 'Overrun', 'Triumph of the Hordes',
    'Parallel Lives', 'Doubling Season',
  ],
};

export function runSanityCheck(library: ArchetypeEntry[], collection: CollectionEntry[]): string[] {
  console.log('ARCHETYPE-SANITY v2 running');
  const bugs: string[] = [];
  let hadRejectBugs = false;

  for (const arch of library) {
    if (arch.key === 'TRIBAL_DENSITY' || arch.key === 'TRIBAL_PAYOFF') {
      // Tribal entries use placeholder predicates — test with Elemental tribe (inferred from example_cards)
      const testTribe = 'elemental';
      const isDensity = arch.key === 'TRIBAL_DENSITY';

      for (const name of arch.example_rejects) {
        const entry = collection.find(e => e.scryfallData.name === name);
        if (!entry) continue;
        let passes = false;
        if (isDensity) {
          const tl = getTypeLine(entry.scryfallData);
          const subtypeMatch = tl.match(/Creature\s+(?:—|–)\s+(.+)/i);
          if (subtypeMatch) {
            const subtypes = subtypeMatch[1].trim().split(/\s+/).map((s: string) => s.toLowerCase());
            if (subtypes.includes(testTribe)) passes = true;
          }
          if (!passes) {
            const oracle = getOracleText(entry.scryfallData).toLowerCase().replace(/\n/g, ' ');
            passes = new RegExp(`\\bthis creature is (?:also )?an? ${testTribe}\\b`, 'i').test(oracle)
              || /\bchangeling\b/i.test(oracle);
          }
        } else {
          const oracle = getOracleText(entry.scryfallData).toLowerCase().replace(/\n/g, ' ');
          passes = new RegExp(`\\b${testTribe}s?\\b.{0,60}(you control|gets?|gain|\\+\\d|enters|attacks?|dies|cast|deals?|create|put|return)`, 'i').test(oracle)
            || new RegExp(`(create|put|return).{0,50}\\b${testTribe}s?\\b`, 'i').test(oracle);
        }
        if (passes) {
          const bug = `[ArchetypeSanity] ${arch.key}: example_reject "${name}" PASSED predicate (should reject)`;
          console.error(bug);
          bugs.push(bug);
          hadRejectBugs = true;
        }
      }
      continue;
    }

    for (const name of arch.example_cards) {
      const entry = collection.find(e => e.scryfallData.name === name);
      if (!entry) continue;
      const oracle = getOracleText(entry.scryfallData).toLowerCase().replace(/\n/g, ' ');
      const typeLine = getTypeLine(entry.scryfallData).toLowerCase();
      let passes = arch.card_predicate.test(oracle);
      if (!passes) {
        passes = arch.card_predicate.test(typeLine + ' ' + oracle);
      }
      if (arch.exclusions && passes && arch.exclusions.test(oracle)) passes = false;
      // Apply post-filters mirroring proposeArchetypes
      if (passes) {
        const tl = getTypeLine(entry.scryfallData).toLowerCase();
        const tlNorm = tl.replace(/\n/g, ' ');
        if (arch.key === 'COMMANDER_DAMAGE_VOLTRON') {
          passes = tlNorm.includes('equipment') || tlNorm.includes('aura');
        } else if (arch.key === 'ROCKS_RAMP') {
          passes = tlNorm.includes('artifact') && !tlNorm.includes('creature') && !tlNorm.includes('equipment');
        } else if (arch.key === 'LAND_RAMP_GREEN') {
          passes = tlNorm.includes('sorcery') || tlNorm.includes('instant');
        } else if (arch.key === 'DORK_RAMP') {
          passes = tlNorm.includes('creature') && (entry.scryfallData.cmc || 0) <= 2;
        } else if (arch.key === 'BURN_X_SPELL_KILL') {
          const dmgMatch = oracle.match(/deals?\s+(\d+)\s+damage/);
          if (dmgMatch) {
            passes = parseInt(dmgMatch[1]) >= 5;
          }
        }
      }
      if (!passes && !isLandCard(entry.scryfallData)) {
        const bug = `[ArchetypeSanity] ${arch.key}: example_card "${name}" FAILED predicate`;
        console.warn(bug);
        bugs.push(bug);
      }
    }
    for (const name of arch.example_rejects) {
      const entry = collection.find(e => e.scryfallData.name === name);
      if (!entry) continue;
      const oracle = getOracleText(entry.scryfallData).toLowerCase().replace(/\n/g, ' ');
      let passes = arch.card_predicate.test(oracle);
      if (arch.exclusions && passes && arch.exclusions.test(oracle)) passes = false;
      // Apply post-filters mirroring proposeArchetypes
      if (passes) {
        const tl = getTypeLine(entry.scryfallData).toLowerCase().replace(/\n/g, ' ');
        if (arch.key === 'COMMANDER_DAMAGE_VOLTRON') {
          passes = tl.includes('equipment') || tl.includes('aura');
        } else if (arch.key === 'ROCKS_RAMP') {
          passes = tl.includes('artifact') && !tl.includes('creature') && !tl.includes('equipment');
        } else if (arch.key === 'LAND_RAMP_GREEN') {
          passes = tl.includes('sorcery') || tl.includes('instant');
        } else if (arch.key === 'DORK_RAMP') {
          passes = tl.includes('creature') && (entry.scryfallData.cmc || 0) <= 2;
        } else if (arch.key === 'BURN_X_SPELL_KILL') {
          const dmgMatch = oracle.match(/deals?\s+(\d+)\s+damage/);
          if (dmgMatch) {
            passes = parseInt(dmgMatch[1]) >= 5;
          }
        }
      }
      if (passes && !isLandCard(entry.scryfallData)) {
        const bug = `[ArchetypeSanity] ${arch.key}: example_reject "${name}" PASSED predicate (should reject)`;
        console.error(bug);
        bugs.push(bug);
        hadRejectBugs = true;
      }
    }
  }

  if (hadRejectBugs) {
    throw new Error('PREDICATE BUG: sanity check failed — example_reject(s) passed predicates they should reject. See console logs above.');
  }
  return bugs;
}

interface TribalTest {
  name: string;
  subtype: string;
  oracle: string;
  shouldFire: boolean;
}

let tribalSanityRan = false;

export function verifyTribalRejects(): string[] {
  if (tribalSanityRan) return [];
  tribalSanityRan = true;

  const tests: TribalTest[] = [
    {
      name: 'Ikra Shidiqi, the Usurper',
      subtype: 'Snake',
      oracle: 'Menace\nWhenever a creature you control deals combat damage to a player, you gain that much life.\n{T}: Add {C}{C}.',
      shouldFire: false,
    },
    {
      name: 'Atraxa, Praetors\' Voice',
      subtype: 'Phyrexian',
      oracle: 'Flying, vigilance, deathtouch, lifelink\nAt the beginning of your end step, proliferate.',
      shouldFire: false,
    },
    {
      name: 'Niv-Mizzet, Parun',
      subtype: 'Dragon',
      oracle: 'This spell can\'t be countered.\nFlying\nWhenever you draw a card, Niv-Mizzet, Parun deals 1 damage to any target.\nWhenever a player casts an instant or sorcery spell, you draw a card.',
      shouldFire: false,
    },
    {
      name: 'Kyler, Sigardian Emissary',
      subtype: 'Human',
      oracle: 'Whenever another Human enters the battlefield under your control, put a +1/+1 counter on Kyler, Sigardian Emissary.\nOther Human creatures you control get +X/+X, where X is the number of counters on Kyler.',
      shouldFire: true,
    },
    {
      name: 'Edgar Markov',
      subtype: 'Vampire',
      oracle: 'Eminence — Whenever you cast another Vampire spell, if Edgar Markov is in the command zone or on the battlefield, create a 1/1 black Vampire creature token.\nFirst strike, haste\nWhen Edgar Markov attacks, put a +1/+1 counter on each Vampire you control.',
      shouldFire: true,
    },
  ];

  const bugs: string[] = [];
  for (const t of tests) {
    const tribeLower = t.subtype.toLowerCase();
    const tribeInOracle = new RegExp(`\\b${tribeLower}s?\\b`, 'i').test(t.oracle.toLowerCase());
    if (tribeInOracle !== t.shouldFire) {
      bugs.push(
        `[TribalSanity] "${t.name}": subtype="${t.subtype}" shouldFire=${t.shouldFire} but oracle match=${tribeInOracle}`,
      );
    }
  }

  for (const bug of bugs) console.error(bug);
  return bugs;
}

let signalSanityRan = false;

export function verifySignalExamples(): string[] {
  if (signalSanityRan) return [];
  signalSanityRan = true;

  const tests: Array<{ key: string; oracle: string; commander: string; shouldMatch: boolean }> = [
    {
      key: 'REANIMATION_CREATURE_ENGINE',
      oracle: 'Vigilance, trample\n{W}{U}{B}{R}{G}: You may play target Elemental card from your graveyard without paying its mana cost.',
      commander: 'Horde of Notions',
      shouldMatch: true,
    },
    {
      key: 'REANIMATION_CREATURE_ENGINE',
      oracle: 'During each of your turns, you may cast a creature spell from your graveyard.',
      commander: 'Karador, Ghost Chieftain',
      shouldMatch: true,
    },
    {
      key: 'REANIMATION_CREATURE_ENGINE',
      oracle: 'During each of your turns, you may play a land or cast a permanent spell from your graveyard.',
      commander: 'Muldrotha, the Gravetide',
      shouldMatch: true,
    },
  ];

  const bugs: string[] = [];
  for (const t of tests) {
    const entry = ARCHETYPE_LIBRARY.find(e => e.key === t.key);
    if (!entry) continue;
    const matched = entry.commander_signals.some(s => s.test(t.oracle.toLowerCase()));
    if (matched !== t.shouldMatch) {
      bugs.push(
        `[SignalSanity] "${t.commander}": signal for ${t.key} shouldMatch=${t.shouldMatch} but matched=${matched}`,
      );
    }
  }

  for (const bug of bugs) console.error(bug);
  if (bugs.length > 0) {
    throw new Error('SIGNAL SANITY FAILED — see console logs above');
  }
  return bugs;
}
