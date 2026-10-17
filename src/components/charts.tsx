import { Bar, BarChart, CartesianGrid, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money } from "../lib/format";

export const C = { rake: "#1e9bff", expenses: "#c9d4e5", dealer: "#3b6fb6", net: "#67e8f9", muted: "#4b5b73" };
const tip = { contentStyle: { background: "#0f1d30", border: "1px solid rgba(120,170,255,0.24)", borderRadius: 10, fontSize: 13 }, labelStyle: { color: "#9fb0c8" }, itemStyle: { color: "#eef3fa" } };
const axis = { tick: { fill: "#9fb0c8", fontSize: 12 }, axisLine: false, tickLine: false } as const;
const kfmt = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}K` : String(v));

export interface TrendPoint { label: string; rake: number; expenses: number; dealer: number; net: number }

export function TrendChart({ data, height = 260 }: { data: TrendPoint[]; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 10, right: 8, left: -10, bottom: 0 }} barGap={3}>
          <CartesianGrid stroke="rgba(120,170,255,0.08)" vertical={false} />
          <XAxis dataKey="label" {...axis} />
          <YAxis {...axis} tickFormatter={kfmt} />
          <Tooltip {...tip} formatter={(v) => money(Number(v))} cursor={{ fill: "rgba(30,155,255,0.06)" }} />
          <Bar dataKey="rake" name="Rake" fill={C.rake} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
          <Bar dataKey="expenses" name="Expenses" fill={C.expenses} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
          <Bar dataKey="dealer" name="Dealer earnings" fill={C.dealer} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
          <Line type="monotone" dataKey="net" name="Net profit" stroke={C.net} strokeWidth={2} dot={{ r: 3, fill: C.net, strokeWidth: 0 }} activeDot={{ r: 5 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Legend({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <div className="legend">
      {items.map((i) => <span key={i.label} style={{ "--c": i.color } as React.CSSProperties}>{i.label}</span>)}
    </div>
  );
}

export const DONUT = ["#1e9bff", "#4fb8ff", "#c9d4e5", "#3b6fb6", "#8ea4c4", "#67e8f9"];

/** Plain-SVG donut: one stroked arc per slice, no chart library involved. */
export function Donut({ data, total, label }: { data: Array<{ name: string; value: number }>; total: number; label: string }) {
  const size = 200, r = 78, cx = size / 2, cy = size / 2, circ = 2 * Math.PI * r;
  const sum = data.reduce((s, d) => s + d.value, 0) || 1;
  let offset = 0;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={26} />
        {data.map((d, i) => {
          const len = (d.value / sum) * circ;
          const el = (
            <circle key={d.name} cx={cx} cy={cy} r={r} fill="none" stroke={DONUT[i % DONUT.length]} strokeWidth={26}
              strokeDasharray={`${Math.max(len - 3, 0)} ${circ - Math.max(len - 3, 0)}`} strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="butt"><title>{`${d.name}: ${money(d.value)}`}</title></circle>
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="donut-center"><div><strong>{money(total, true)}</strong><span>{label}</span></div></div>
    </div>
  );
}


/** Single line over categories, e.g. $/hour per game. Null values leave a gap. */
export function LineSeries({ data, dataKey, name, height = 220, color = C.net, fmt = (v: number) => money(v) }: { data: object[]; dataKey: string; name: string; height?: number; color?: string; fmt?: (v: number) => string }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid stroke="rgba(120,170,255,0.08)" vertical={false} />
          <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={18} />
          <YAxis {...axis} tickFormatter={kfmt} />
          <Tooltip {...tip} formatter={(v) => fmt(Number(v))} />
          <Line type="monotone" dataKey={dataKey} name={name} stroke={color} strokeWidth={2} dot={{ r: 3, fill: color, strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** One or two bar series over categories. */
export function BarSeries({ data, series, height = 220, fmt = (v: number) => money(v), layout = "horizontal" }: { data: object[]; series: Array<{ key: string; name: string; color: string }>; height?: number; fmt?: (v: number) => string; layout?: "horizontal" | "vertical" }) {
  const vertical = layout === "vertical";
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} layout={layout} margin={{ top: 10, right: 8, left: vertical ? 8 : -10, bottom: 0 }} barGap={3}>
          <CartesianGrid stroke="rgba(120,170,255,0.08)" vertical={vertical} horizontal={!vertical} />
          {vertical ? <XAxis type="number" {...axis} tickFormatter={kfmt} allowDecimals={false} /> : <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={18} />}
          {vertical ? <YAxis type="category" dataKey="label" {...axis} width={70} interval={0} /> : <YAxis {...axis} tickFormatter={kfmt} allowDecimals={false} />}
          <Tooltip {...tip} formatter={(v) => fmt(Number(v))} cursor={{ fill: "rgba(30,155,255,0.06)" }} />
          {series.map((s) => <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={vertical ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
