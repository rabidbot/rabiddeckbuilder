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
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-text-secondary mb-4">
        Mana Curve
      </h3>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -20 }}>
          <XAxis
            dataKey="cmc"
            tick={{ fill: '#9a9080', fontSize: 11 }}
            axisLine={{ stroke: '#e2dbd0' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#9a9080', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: '#ffffff',
              border: '1px solid #e2dbd0',
              borderRadius: '10px',
              color: '#2c2416',
              fontSize: '12px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            }}
            itemStyle={{ color: '#2c2416' }}
            labelStyle={{ color: '#6b6358', marginBottom: '4px' }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={36}>
            {data.map((entry, index) => (
              <Cell
                key={index}
                fill={entry.isOptimal ? '#4a7a3c' : '#a67c38'}
                fillOpacity={entry.isOptimal ? 0.9 : 0.6}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex justify-center gap-4 mt-3 text-[10px]">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-success/60" /> Optimal
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-primary/60" /> Deviating
        </span>
      </div>
    </div>
  );
}
