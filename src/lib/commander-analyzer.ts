import type { ScryfallCard, CommanderAnalysis } from './types';
import { getColorIdentity, getOracleText, getTypeLine } from './card-utils';

export function analyzeCommander(cmd: ScryfallCard): CommanderAnalysis {
  const oracle = getOracleText(cmd).toLowerCase();
  const typeLine = getTypeLine(cmd).toLowerCase();
  const keywords = (cmd.keywords || []).map((k) => k.toLowerCase());
  const ci = getColorIdentity(cmd);
  const themes: string[] = [];

  if (/\+1\/\+1 counter|proliferate|bolster|adapt|evolve|toxic|infect/i.test(oracle) || keywords.includes('proliferate'))
    themes.push('counters');
  if (/graveyard|dies|mill|reanimate|return.*graveyard|descend|delirium/i.test(oracle))
    themes.push('graveyard');
  if (/create.*token|populate|convoke|offspring|amass/i.test(oracle))
    themes.push('tokens');
  if (/whenever you cast.*instant|whenever you cast.*sorcery|magecraft|storm|copy.*spell/i.test(oracle))
    themes.push('spellslinger');
  if (/equipment|aura|attach|equip|modified creature|combat damage/i.test(oracle))
    themes.push('voltron');
  if (/sacrifice|dies|blood artist|aristocrats|whenever.*creature.*dies/i.test(oracle))
    themes.push('sacrifice');
  if (/deal.*damage|each opponent loses|burn|ping/i.test(oracle))
    themes.push('damage');
  if (/exile.*return.*battlefield|flicker|blink|when.*enters the battlefield|whenever.*enters the battlefield/i.test(oracle))
    themes.push('blink');
  if (/draw.*card|whenever you draw|wheel|connive/i.test(oracle))
    themes.push('draw');
  if (/artifact.*you control|affinity for artifacts|improvise|historic/i.test(oracle))
    themes.push('artifacts');
  if (/enchantment.*you control|constellation|enchant|aura/i.test(oracle))
    themes.push('enchantments');
  if (/landfall|whenever a land enters/i.test(oracle))
    themes.push('landfall');

  const subtypeMatch = typeLine.match(/(?:legendary creature|creature)\s+—\s+(.+)/);
  const subtypes = subtypeMatch ? subtypeMatch[1].trim().split(/\s+/).filter((w) => w.length > 2) : [];
  if (subtypes.length) {
    const hasTribalSupport = subtypes.some((sub) => oracle.includes(sub.toLowerCase()));
    if (hasTribalSupport) themes.push('tribal');
  }

  if (!themes.length) themes.push('goodstuff');

  const wants: string[] = [];
  if (/attacks|combat damage/i.test(oracle)) wants.push('attack');
  if (/enters the battlefield|whenever.*enters/i.test(oracle)) wants.push('etb');
  if (/dies|whenever.*dies/i.test(oracle)) wants.push('dies');
  if (/whenever you cast/i.test(oracle)) wants.push('cast');
  if (/whenever you draw/i.test(oracle)) wants.push('draw');
  if (/sacrifice/i.test(oracle)) wants.push('sacrifice');
  if (/tap.*:/i.test(oracle)) wants.push('tap');

  const posture: 'control' | 'aggro' | 'midrange' = /counter target|whenever an opponent|during each opponent|at the beginning of each end step/i.test(oracle)
    ? 'control'
    : (themes.includes('voltron') || themes.includes('damage') ? 'aggro' : 'midrange');

  return {
    themes: [...new Set(themes)],
    wants: [...new Set(wants)],
    ci,
    subtypes,
    oracle,
    typeLine,
    keywords,
    cmc: cmd.cmc || 0,
    posture,
  };
}
