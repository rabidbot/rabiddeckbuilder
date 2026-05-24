import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

const MANA_COLORS: Record<string, string> = {
  W: '#f9f6ee',
  U: '#4a90d9',
  B: '#8b52a0',
  R: '#d94a4a',
  G: '#2d8b4a',
  C: '#b0a890',
  Multi: '#c9a84c',
};

interface ColorData {
  name: string;
  value: number;
  color: string;
}

export default function ColorPieChart({ data }: { data: ColorData[] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;

  return (
    <div className="rounded-2xl border border-white/5 bg-gradient-to-b from-[#1f1f28]/90 to-[#14141c]/90 p-5 shadow-[0_18px_36px_rgba(0,0,0,0.28)]">
      <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-[#a0a0b8] mb-1">
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
              <Cell key={index} fill={entry.color} stroke="#0d0d0f" strokeWidth={1} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: '#1e1e24',
              border: '1px solid #333344',
              borderRadius: '10px',
              color: '#e8e8f0',
              fontSize: '12px',
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
              <span style={{ color: '#a0a0b8' }}>{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export { MANA_COLORS };
