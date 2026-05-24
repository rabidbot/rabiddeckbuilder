import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface CurveData {
  cmc: string;
  count: number;
  isOptimal: boolean;
}

const OPTIMAL_CURVE = [2, 6, 12, 16, 14, 10, 6, 3, 2, 1];

function estimateOptimal(counts: number[]): boolean[] {
  const total = counts.reduce((s, c) => s + c, 0) || 1;
  return counts.map((c, i) => {
    const pct = c / total;
    const opt = OPTIMAL_CURVE[i] / OPTIMAL_CURVE.reduce((a, b) => a + b, 0);
    return Math.abs(pct - opt) < 0.06;
  });
}

export default function ManaCurveChart({ curveData }: { curveData: CurveData[] }) {
  const counts = curveData.map((d) => d.count);
  const optimals = estimateOptimal(counts);

  const data = curveData.map((d, i) => ({
    ...d,
    isOptimal: optimals[i],
  }));

  return (
    <div className="rounded-2xl border border-white/5 bg-gradient-to-b from-[#1f1f28]/90 to-[#14141c]/90 p-5 shadow-[0_18px_36px_rgba(0,0,0,0.28)]">
      <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-[#a0a0b8] mb-4">
        Mana Curve
      </h3>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -20 }}>
          <XAxis
            dataKey="cmc"
            tick={{ fill: '#6a6a88', fontSize: 11 }}
            axisLine={{ stroke: '#333344' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#6a6a88', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: '#1e1e24',
              border: '1px solid #333344',
              borderRadius: '10px',
              color: '#e8e8f0',
              fontSize: '12px',
            }}
            itemStyle={{ color: '#e8e8f0' }}
            labelStyle={{ color: '#a0a0b8', marginBottom: '4px' }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={36}>
            {data.map((entry, index) => (
              <Cell
                key={index}
                fill={entry.isOptimal ? '#52c272' : '#c9a84c'}
                fillOpacity={entry.isOptimal ? 0.9 : 0.6}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex justify-center gap-4 mt-3 text-[10px]">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-[#52c272]/60" /> Optimal
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-[#c9a84c]/60" /> Deviating
        </span>
      </div>
    </div>
  );
}
