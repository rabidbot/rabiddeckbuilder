import { useMemo } from 'react';
import { BarChart3, TrendingUp, Shield, Sparkles } from 'lucide-react';
import { useCollectionStore } from '../../stores/collectionStore';
import { useDeckStore } from '../../stores/deckStore';
import { analyzeCommander } from '../../lib/commander-analyzer';
import { getDeckBlueprint } from '../../lib/deck-blueprint';
import { detectCardRoles, categorizeCard } from '../../lib/card-roles';
import { getColorIdentity, isLandCard } from '../../lib/card-utils';
import type { CollectionEntry } from '../../lib/types';
import ManaCurveChart from './ManaCurveChart';
import ColorPieChart, { MANA_COLORS } from './ColorPieChart';
import CategoryBreakdown from './CategoryBreakdown';

function computeScoreDistribution(entries: CollectionEntry[]) {
  const buckets = [
    { label: '90-100', min: 90, max: 100 },
    { label: '80-89', min: 80, max: 89 },
    { label: '70-79', min: 70, max: 79 },
    { label: '60-69', min: 60, max: 69 },
    { label: '50-59', min: 50, max: 59 },
    { label: '40-49', min: 40, max: 49 },
    { label: '<40', min: 0, max: 39 },
  ];
  return buckets.map((b) => ({
    label: b.label,
    count: entries.filter((e) => e.scores.composite >= b.min && e.scores.composite <= b.max).length,
  }));
}

export default function StatsView() {
  const collection = useCollectionStore((s) => s.collection);
  const commander = useCollectionStore((s) => s.commander);
  const { cardIds, gamePlan } = useDeckStore();

  const deckEntries = useMemo(
    () => collection.filter((e) => cardIds.includes(e.scryfallData.id)),
    [collection, cardIds],
  );

  const nonLandEntries = useMemo(
    () => deckEntries.filter((e) => e.scryfallData.id !== commander?.id && !isLandCard(e.scryfallData)),
    [deckEntries, commander],
  );

  const cmdAnalysis = useMemo(
    () => (commander ? analyzeCommander(commander) : null),
    [commander],
  );

  const blueprint = useMemo(
    () => (cmdAnalysis ? getDeckBlueprint(cmdAnalysis) : null),
    [cmdAnalysis],
  );

  const manaCurveData = useMemo(() => {
    const buckets: number[] = Array(10).fill(0);
    for (const entry of nonLandEntries) {
      const cmc = Math.min(9, Math.floor(entry.scryfallData.cmc || 0));
      buckets[cmc]++;
    }
    return buckets.map((count, i) => ({
      cmc: i === 9 ? '9+' : String(i),
      count,
      isOptimal: false,
    }));
  }, [nonLandEntries]);

  const colorData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of nonLandEntries) {
      const ci = getColorIdentity(entry.scryfallData);
      if (ci.length === 0) {
        counts['C'] = (counts['C'] || 0) + 1;
      } else if (ci.length > 1) {
        counts['Multi'] = (counts['Multi'] || 0) + 1;
      } else {
        counts[ci[0]] = (counts[ci[0]] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({
        name,
        value,
        color: MANA_COLORS[name] || '#6a6a88',
      }));
  }, [nonLandEntries]);

  const categoryData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of nonLandEntries) {
      const cat = categorizeCard(entry, cmdAnalysis!);
      counts[cat] = (counts[cat] || 0) + 1;
    }
    const order = ['Lands', 'Ramp', 'Card Draw', 'Tutors', 'Protection', 'Board Wipes', 'Interaction', 'Recursion', 'Win Cons', 'Strategy', 'Flex'];
    return order
      .filter((name) => counts[name] !== undefined)
      .map((name) => ({
        name,
        count: counts[name],
        target:
          blueprint
            ? name === 'Lands' ? blueprint.lands
            : name === 'Ramp' ? blueprint.ramp
            : name === 'Card Draw' ? blueprint.draw
            : name === 'Tutors' ? blueprint.tutors
            : name === 'Protection' ? blueprint.protection
            : name === 'Board Wipes' ? blueprint.wipes
            : name === 'Recursion' ? blueprint.recursion
            : 0
            : 0,
      }));
  }, [nonLandEntries, cmdAnalysis, blueprint]);

  const avgScore = deckEntries.length
    ? Math.round(deckEntries.reduce((s, e) => s + e.scores.composite, 0) / deckEntries.length)
    : 0;

  const avgCmc = nonLandEntries.length
    ? (nonLandEntries.reduce((s, e) => s + (e.scryfallData.cmc || 0), 0) / nonLandEntries.length).toFixed(1)
    : '0';

  const scoreDist = useMemo(() => computeScoreDistribution(nonLandEntries), [nonLandEntries]);

  if (!deckEntries.length) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <BarChart3 size={64} className="text-[#a0a0b8]/30 mb-4" />
        <h2 className="text-xl font-semibold text-[#e8e8f0] mb-2">No Deck Built</h2>
        <p className="text-[#a0a0b8] text-sm max-w-md">
          Build a deck in the Deck Builder tab first, then view detailed
          statistics and quality analysis here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-[#e8e8f0] mb-1">Deck Statistics</h2>
        <p className="text-sm text-[#6a6a88]">
          {commander?.name && (
            <span className="text-[#e8c86a]">{commander.name}</span>
          )}
          {gamePlan && <span> &mdash; {gamePlan}</span>}
          <span className="ml-2">{deckEntries.length} cards</span>
        </p>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-white/5 bg-gradient-to-b from-[#1f1f28]/90 to-[#14141c]/90 p-4 shadow-[0_12px_24px_rgba(0,0,0,0.2)]">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={16} className="text-[#c9a84c]" />
            <span className="text-[10px] uppercase tracking-[0.08em] text-[#6a6a88]">Avg Score</span>
          </div>
          <span
            className={`text-2xl font-bold ${
              avgScore >= 70 ? 'text-[#52c272]' : avgScore >= 50 ? 'text-[#c9a84c]' : 'text-[#e05252]'
            }`}
          >
            {avgScore}
          </span>
          <div className="text-[10px] text-[#6a6a88] mt-1">/ 100 composite</div>
        </div>

        <div className="rounded-2xl border border-white/5 bg-gradient-to-b from-[#1f1f28]/90 to-[#14141c]/90 p-4 shadow-[0_12px_24px_rgba(0,0,0,0.2)]">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={16} className="text-[#5280e0]" />
            <span className="text-[10px] uppercase tracking-[0.08em] text-[#6a6a88]">Avg CMC</span>
          </div>
          <span className="text-2xl font-bold text-[#e8e8f0]">{avgCmc}</span>
          <div className="text-[10px] text-[#6a6a88] mt-1">non-land average</div>
        </div>

        <div className="rounded-2xl border border-white/5 bg-gradient-to-b from-[#1f1f28]/90 to-[#14141c]/90 p-4 shadow-[0_12px_24px_rgba(0,0,0,0.2)]">
          <div className="flex items-center gap-2 mb-2">
            <Shield size={16} className="text-[#d94a4a]" />
            <span className="text-[10px] uppercase tracking-[0.08em] text-[#6a6a88]">Lands</span>
          </div>
          <span className="text-2xl font-bold text-[#e8e8f0]">
            {deckEntries.filter((e) => detectCardRoles(e.scryfallData, cmdAnalysis!).land).length}
          </span>
          <div className="text-[10px] text-[#6a6a88] mt-1">
            {blueprint ? `target: ${blueprint.lands}` : '—'}
          </div>
        </div>

        <div className="rounded-2xl border border-white/5 bg-gradient-to-b from-[#1f1f28]/90 to-[#14141c]/90 p-4 shadow-[0_12px_24px_rgba(0,0,0,0.2)]">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 size={16} className="text-[#e08052]" />
            <span className="text-[10px] uppercase tracking-[0.08em] text-[#6a6a88]">Non-Lands</span>
          </div>
          <span className="text-2xl font-bold text-[#e8e8f0]">{nonLandEntries.length}</span>
          <div className="text-[10px] text-[#6a6a88] mt-1">
            {blueprint ? `target: ${99 - blueprint.lands}` : '—'}
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ManaCurveChart curveData={manaCurveData} />
        <ColorPieChart data={colorData} />
        <div className="lg:col-span-1">
          <CategoryBreakdown data={categoryData} />
        </div>

        {/* Score Distribution */}
        <div className="rounded-2xl border border-white/5 bg-gradient-to-b from-[#1f1f28]/90 to-[#14141c]/90 p-5 shadow-[0_18px_36px_rgba(0,0,0,0.28)]">
          <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-[#a0a0b8] mb-4">
            Score Distribution
          </h3>
          <div className="space-y-2">
            {scoreDist.map((b) => {
              const pct = nonLandEntries.length ? (b.count / nonLandEntries.length) * 100 : 0;
              const color =
                b.label === '90-100' ? '#52c272'
                : b.label.startsWith('8') ? '#7ce39a'
                : b.label.startsWith('7') ? '#c9a84c'
                : b.label.startsWith('6') ? '#d4843a'
                : b.label.startsWith('5') ? '#e08052'
                : '#e05252';
              return (
                <div key={b.label} className="flex items-center gap-3">
                  <span className="w-14 text-right text-[10px] text-[#a0a0b8]">{b.label}</span>
                  <div className="flex-1 h-3 rounded-full bg-white/[0.04] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>
                  <span className="w-10 text-right text-[10px] text-[#6a6a88]">
                    {b.count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Commander Analysis */}
        {cmdAnalysis && (
          <div className="rounded-2xl border border-white/5 bg-gradient-to-b from-[#1f1f28]/90 to-[#14141c]/90 p-5 shadow-[0_18px_36px_rgba(0,0,0,0.28)] lg:col-span-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-[#a0a0b8] mb-4">
              Commander Analysis
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-[10px] uppercase tracking-[0.08em] text-[#6a6a88] block mb-2">Themes</span>
                <div className="flex flex-wrap gap-1.5">
                  {cmdAnalysis.themes.map((t) => (
                    <span key={t} className="px-2 py-1 rounded-full text-[11px] border border-[#c9a84c]/15 bg-white/[0.03] text-[#a0a0b8] capitalize">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-[0.08em] text-[#6a6a88] block mb-2">Posture</span>
                <span className="text-[#e8e8f0] capitalize">{cmdAnalysis.posture}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-[0.08em] text-[#6a6a88] block mb-2">Triggers</span>
                <div className="flex flex-wrap gap-1.5">
                  {cmdAnalysis.wants.map((w) => (
                    <span key={w} className="px-2 py-1 rounded-full text-[11px] border border-white/[0.06] bg-white/[0.02] text-[#a0a0b8] capitalize">
                      {w}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
