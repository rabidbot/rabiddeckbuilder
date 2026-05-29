import type { CollectionEntry } from './types';
import { getOracleText, getTypeLine, isLandCard } from './card-utils';

export type ArchetypeCategory = 'wincon' | 'engine' | 'synergy' | 'enabler';

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
      /equip|aura|attached|attaches|double strike|trample|unblockable|menace|combat damage to a player/i,
    ],
    card_predicate: /(?:equip(?:ped|s|ment)?|enchanted creature gets|attached|equipped creature gains)/i,
    exclusions: /sacrifice.{0,20}equipment/i,
    ideal_count: 8,
    always_proposed: false,
    example_cards: ['Sword of Hearth and Home', 'Blade of Selves', 'Lightning Greaves', 'Swiftfoot Boots'],
    example_rejects: ['Skullclamp', 'Sol Ring'],
  },
  {
    key: 'COMBAT_FINISHERS_GO_WIDE',
    display_name: 'Go Wide Finishers',
    category: 'wincon',
    required_colors: [],
    commander_signals: [
      /create.{0,30}(?:token|creatures)|tokens you control|each creature you control|whenever a creature you control/i,
    ],
    card_predicate: /creatures you control get \+|anthem|each (?:other )?creature you control|double the (?:number of )?tokens|populate|convoke|overrun|extra combat|triumph of the hordes/i,
    exclusions: null,
    ideal_count: 6,
    always_proposed: false,
    example_cards: ['Craterhoof Behemoth', 'Parallel Lives', 'Doubling Season', 'Wayfaring Temple'],
    example_rejects: ['Wrath of God'],
  },
  {
    key: 'BURN_X_SPELL_KILL',
    display_name: 'Burn / X-Spell Finishers',
    category: 'wincon',
    required_colors: [R],
    commander_signals: [
      /damage|spell.{0,20}copy|cast.{0,30}instant|sorcery/i,
    ],
    card_predicate: /deals?\s+X\s+damage|deals?\s+\d+\s+damage to (?:each opponent|any target|target opponent)|each opponent loses .{0,20}life/i,
    exclusions: null,
    ideal_count: 5,
    always_proposed: false,
    example_cards: ['Comet Storm', 'Fall of the Titans', 'Crackle with Power'],
    example_rejects: ['Lightning Bolt', 'Shock'],
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
    commander_signals: [/loses? life|drain|each opponent loses/i],
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
    exclusions: /\bland\b.{0,30}enters.{0,30}tapped/i,
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
    ],
    card_predicate: /return.{0,80}\bcreature(?:s|s'?)?\b.{0,80}from (?:your|a) graveyard.{0,40}(?:to (?:the )?battlefield|to (?:your )?hand)/i,
    exclusions: /enchantment|artifact|land(?:s)?|instant|sorcery/i,
    ideal_count: 6,
    always_proposed: false,
    example_cards: ['Animate Dead', 'Reanimate', 'Living Death', 'Buried Alive', 'Angel of Glory\'s Rise'],
    example_rejects: ['Replenish', 'Splendid Reclamation'],
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
  },
  {
    key: 'TOKEN_PRODUCTION_ENGINE',
    display_name: 'Token Generation',
    category: 'engine',
    required_colors: [],
    commander_signals: [
      /create .{0,30}token|populate|amass|fabricate|convoke|whenever.{0,30}token enters/i,
    ],
    card_predicate: /create .{0,30}token|populate|amass|fabricate \d+|at the beginning of (?:your |each )?(?:upkeep|end step|combat).{0,40}create/i,
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
    card_predicate: /exile (?:target|another target) (?:creature|permanent).{0,40}return.{0,40}battlefield (?:under (?:its|their) owner's control|tapped|untapped)|flicker/i,
    exclusions: null,
    ideal_count: 6,
    always_proposed: false,
    example_cards: ['Cloudshift', 'Ephemerate', 'Conjurer\'s Closet', 'Soulherder'],
    example_rejects: [],
  },
  {
    key: 'MANA_DOUBLERS_PRODUCTION',
    display_name: 'Mana Doublers / Big Mana',
    category: 'engine',
    required_colors: [],
    commander_signals: [
      /\{X\}|cost.{0,30}more|cost.{0,30}less/i,
    ],
    card_predicate: /adds? (?:twice|an additional|two|three|four).{0,40}mana|whenever.{0,40}tap.{0,30}for mana.{0,40}adds?/i,
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
  },
  {
    key: 'COUNTERS_PROLIFERATE_ENGINE',
    display_name: '+1/+1 Counters / Proliferate',
    category: 'engine',
    required_colors: [],
    commander_signals: [/\+1\/\+1 counter|proliferate|counters? on/i],
    card_predicate: /put .{0,30}\+1\/\+1 counter(?:s)? on|proliferate|whenever .{0,30}counter.{0,30}placed/i,
    exclusions: null,
    ideal_count: 6,
    always_proposed: false,
    example_cards: ['Hardened Scales', 'Doubling Season', 'Inspiring Call', 'Evolution Sage'],
    example_rejects: [],
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
  },
  {
    key: 'ARTIFACT_SYNERGY_ENGINE',
    display_name: 'Artifact Engine',
    category: 'engine',
    required_colors: [],
    commander_signals: [/artifact.{0,30}artifact|artifact/i],
    card_predicate: /whenever .{0,30}artifact.{0,30}(?:enters|cast|dies)|artifacts you control|metalcraft|affinity for artifacts|improvise/i,
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
    card_predicate: /return .{0,40}(?:target )?card from (?:your |a )?graveyard to .{0,20}hand|return .{0,40}(?:target )?(?:artifact|enchantment|land).{0,30}graveyard.{0,20}battlefield/i,
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
    example_rejects: ['Mass of Mysteries', 'Subterfuge'],
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
    commander_signals: [/whenever .{0,20}attacks?|attacks alone|deals combat damage|swing/i],
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
    commander_signals: [/when(?:ever)?.{0,30}(?:enters the battlefield|dies|leaves the battlefield)/i],
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
    card_predicate: /\bmill\b|\bself-mill\b|put the top .{0,30}cards?.{0,30}into.{0,20}(?:your |the )?graveyard|draws? .{0,20}cards?.{0,30}discards?|discard your hand|cycling/i,
    exclusions: null,
    ideal_count: 8,
    always_proposed: false,
    example_cards: ['Buried Alive', 'Champion of Wits', 'Stitcher\'s Supplier', 'Faithless Looting', 'Hermit Druid', 'Mesmeric Orb'],
    example_rejects: ['Gate to the Afterlife', 'Animate Dead'],
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
    example_rejects: ['Cultivate'],
  },
  {
    key: 'LAND_RAMP_GREEN',
    display_name: 'Land Ramp',
    category: 'enabler',
    required_colors: [G],
    commander_signals: [],
    card_predicate: /search your library for .{0,30}(?:basic )?land.{0,30}(?:battlefield|tapped|onto)|put.{0,40}land.{0,40}onto the battlefield/i,
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
    card_predicate: /destroy all .{0,30}(?:creatures|permanents|nonland)|exile all .{0,30}(?:creatures|permanents)|each creature gets -\d/i,
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
    card_predicate: /hexproof|indestructible|protection from|phasing|target.{0,30}gains? shroud|creatures you control gain (?:indestructible|hexproof)/i,
    exclusions: null,
    ideal_count: 4,
    always_proposed: true,
    example_cards: ['Lightning Greaves', 'Swiftfoot Boots', 'Heroic Intervention', 'Teferi\'s Protection', 'Flawless Maneuver', 'Deflecting Swat'],
    example_rejects: [],
  },
];

export function runSanityCheck(library: ArchetypeEntry[], collection: CollectionEntry[]): string[] {
  const bugs: string[] = [];
  for (const arch of library) {
    if (arch.key === 'TRIBAL_DENSITY' || arch.key === 'TRIBAL_PAYOFF') continue;
    for (const name of arch.example_cards) {
      const entry = collection.find(e => e.scryfallData.name === name);
      if (!entry) continue;
      const oracle = getOracleText(entry.scryfallData).toLowerCase();
      const typeLine = getTypeLine(entry.scryfallData).toLowerCase();
      let passes = arch.card_predicate.test(oracle);
      if (!passes) {
        // Extra check: predicate might need type_line context
        passes = arch.card_predicate.test(typeLine + ' ' + oracle);
      }
      if (arch.exclusions && passes && arch.exclusions.test(oracle)) passes = false;
      if (!passes && !isLandCard(entry.scryfallData)) {
        bugs.push(`[ArchetypeSanity] ${arch.key}: example_card "${name}" FAILED predicate`);
      }
    }
    for (const name of arch.example_rejects) {
      const entry = collection.find(e => e.scryfallData.name === name);
      if (!entry) continue;
      const oracle = getOracleText(entry.scryfallData).toLowerCase();
      let passes = arch.card_predicate.test(oracle);
      if (arch.exclusions && passes && arch.exclusions.test(oracle)) passes = false;
      if (passes && !isLandCard(entry.scryfallData)) {
        bugs.push(`[ArchetypeSanity] ${arch.key}: example_reject "${name}" PASSED predicate (should reject)`);
      }
    }
  }
  return bugs;
}
