import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface CategoryData {
  name: string;
  count: number;
  target: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  Lands: '#2d8b4a',
  Ramp: '#5280e0',
  'Card Draw': '#4a90d9',
  Tutors: '#9052e0',
  Protection: '#f9f6ee',
  'Board Wipes': '#d94a4a',
  Interaction: '#e05252',
  Recursion: '#8b52a0',
  'Win Cons': '#e08052',
  Strategy: '#c9a84c',
  Flex: '#6a6a88',
};

export default function CategoryBreakdown({ data }: { data: CategoryData[] }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-gradient-to-b from-[#1f1f28]/90 to-[#14141c]/90 p-5 shadow-[0_18px_36px_rgba(0,0,0,0.28)]">
      <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-[#a0a0b8] mb-4">
        Category Breakdown
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 0, bottom: 0, left: -20 }}
        >
          <XAxis type="number" tick={{ fill: '#6a6a88', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: '#a0a0b8', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={90}
          />
          <Tooltip
            contentStyle={{
              background: '#1e1e24',
              border: '1px solid #333344',
              borderRadius: '10px',
              color: '#e8e8f0',
              fontSize: '12px',
            }}
            formatter={(_value: unknown, _name: unknown, item: unknown) => {
              const payload = (item as { payload?: CategoryData })?.payload;
              return [`${payload?.count ?? 0} cards`, payload?.target ? `Target: ${payload.target}` : 'No target'];
            }}
          />
          <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={16}>
            {data.map((entry, index) => (
              <Cell
                key={index}
                fill={CATEGORY_COLORS[entry.name] || '#6a6a88'}
                fillOpacity={entry.count > 0 ? 0.85 : 0.3}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export { CATEGORY_COLORS };
