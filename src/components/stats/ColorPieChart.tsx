import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

const MANA_COLORS: Record<string, string> = {
  W: '#f9f3e4',
  U: '#5a9ad4',
  B: '#8b6a9c',
  R: '#d45a4a',
  G: '#3d8b4a',
  C: '#b0a48a',
  Multi: '#a67c38',
};

interface ColorData {
  name: string;
  value: number;
  color: string;
}

export default function ColorPieChart({ data }: { data: ColorData[] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-text-secondary mb-1">
        Color Distribution
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={48}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.color} stroke="#faf7f2" strokeWidth={1} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: '#ffffff',
              border: '1px solid #e2dbd0',
              borderRadius: '10px',
              color: '#2c2416',
              fontSize: '12px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            }}
            formatter={(_value: unknown) => {
              const v = Number(_value) || 0;
              return [`${v} (${Math.round((v / total) * 100)}%)`, 'Cards'];
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: '11px' }}
            iconType="circle"
            iconSize={8}
            formatter={(value) => (
              <span style={{ color: '#6b6358' }}>{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export { MANA_COLORS };
