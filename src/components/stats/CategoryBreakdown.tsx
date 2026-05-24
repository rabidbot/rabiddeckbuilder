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
  Lands: '#3d8b4a',
  Ramp: '#4a6a9c',
  'Card Draw': '#5a9ad4',
  Tutors: '#7a5a9c',
  Protection: '#f9f3e4',
  'Board Wipes': '#d45a4a',
  Interaction: '#c44a3a',
  Recursion: '#8b6a9c',
  'Win Cons': '#c47a4a',
  Strategy: '#a67c38',
  Flex: '#9a9080',
};

export default function CategoryBreakdown({ data }: { data: CategoryData[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-text-secondary mb-4">
        Category Breakdown
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 0, bottom: 0, left: -20 }}
        >
          <XAxis type="number" tick={{ fill: '#9a9080', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: '#6b6358', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={90}
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
            formatter={(_value: unknown, _name: unknown, item: unknown) => {
              const payload = (item as { payload?: CategoryData })?.payload;
              return [`${payload?.count ?? 0} cards`, payload?.target ? `Target: ${payload.target}` : 'No target'];
            }}
          />
          <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={16}>
            {data.map((entry, index) => (
              <Cell
                key={index}
                fill={CATEGORY_COLORS[entry.name] || '#9a9080'}
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
