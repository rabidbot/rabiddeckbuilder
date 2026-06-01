import type { CommanderAnalysis, DeckBlueprint } from './types';

export type PowerLevel = 'casual' | '75%' | 'competitive';

export function getDeckBlueprint(cmdAnalysis: CommanderAnalysis, powerLevel: PowerLevel = '75%'): DeckBlueprint {
  const colorCount = Math.max(1, cmdAnalysis.ci.length);

  // Base values differ by power level
  let lands: number, ramp: number, draw: number, interaction: number, tutors: number, protection: number;
  let curveLow: number, curveMid: number, curveHigh: number;

  if (powerLevel === 'competitive') {
    lands = 31;
    ramp = 12;
    draw = 10;
    interaction = 10;
    tutors = 6;
    protection = 5;
    curveLow = 0.42;
    curveMid = 0.30;
    curveHigh = 0.16;
  } else if (powerLevel === '75%') {
    lands = 34;
    ramp = 10;
    draw = 9;
    interaction = 8;
    tutors = 3;
    protection = 4;
    curveLow = 0.34;
    curveMid = 0.34;
    curveHigh = 0.20;
  } else {
    lands = 37;
    ramp = 9;
    draw = 9;
    interaction = 7;
    tutors = 1;
    protection = 3;
    curveLow = 0.28;
    curveMid = 0.36;
    curveHigh = 0.24;
  }

  // Commander-specific adjustments
  lands += (cmdAnalysis.cmc >= 5 ? 1 : 0) + (colorCount >= 3 ? 1 : 0) + (cmdAnalysis.themes.includes('landfall') ? 2 : 0);
  ramp += (cmdAnalysis.cmc >= 5 ? 2 : 0) + (colorCount >= 3 ? 1 : 0);
  draw += (cmdAnalysis.themes.includes('spellslinger') || cmdAnalysis.themes.includes('draw') ? 1 : 0);
  interaction += (cmdAnalysis.posture === 'control' ? 2 : 0);
  tutors += cmdAnalysis.themes.includes('spellslinger') || cmdAnalysis.themes.includes('graveyard') ? 2 : 0;

  let wipes: number;
  let recursion: number;
  let finishers: number;
  let synergy: number;

  if (powerLevel === 'competitive') {
    wipes = 1;
    recursion = 2;
    finishers = 6;
    synergy = 16;
  } else if (powerLevel === '75%') {
    wipes = 2;
    recursion = 2;
    finishers = 5;
    synergy = 20;
  } else {
    wipes = 3;
    recursion = 2;
    finishers = 4;
    synergy = 24;
  }

  // Commander adjustments
  if (cmdAnalysis.posture === 'aggro') wipes--;
  if (cmdAnalysis.posture === 'control') wipes++;
  if (cmdAnalysis.themes.includes('graveyard') || cmdAnalysis.themes.includes('blink') || cmdAnalysis.themes.includes('sacrifice')) recursion += 1;
  if (cmdAnalysis.themes.includes('tokens') || cmdAnalysis.themes.includes('damage')) finishers += 1;
  synergy += Math.min(8, cmdAnalysis.themes.length * 2);

  if (cmdAnalysis.tribalPayoff) {
    synergy += 4;
    finishers += 1;
  }

  // Clamp
  lands = Math.max(28, Math.min(40, lands));
  ramp = Math.max(6, Math.min(16, ramp));
  draw = Math.max(6, Math.min(12, draw));
  interaction = Math.max(5, Math.min(12, interaction));
  tutors = Math.max(0, Math.min(10, tutors));
  protection = Math.max(1, Math.min(8, protection));

  const nonLandSlots = 99 - lands;
  const low = Math.round(nonLandSlots * curveLow);
  const mid = Math.round(nonLandSlots * curveMid);
  const high = Math.round(nonLandSlots * curveHigh);
  const finisher = Math.max(4, nonLandSlots - low - mid - high);

  return {
    lands, ramp, draw, interaction, wipes, protection, recursion, tutors, finishers, synergy,
    curve: { low, mid, high, finisher },
  };
}
