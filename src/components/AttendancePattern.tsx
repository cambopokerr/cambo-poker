import { useStore } from "../data/store";

/** Small bar strip: games attended per month for one player. */
export default function AttendancePattern({ playerId }: { playerId: string }) {
  const { db } = useStore();
  const months = new Map<string, number>();
  for (const a of db.attendance) {
    if (a.playerId !== playerId) continue;
    const g = db.games.find((x) => x.id === a.gameId);
    if (!g?.date) continue;
    const k = g.date.slice(0, 7);
    months.set(k, (months.get(k) ?? 0) + 1);
  }
  const rows = [...months.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (!rows.length) return <p className="muted">No dated games yet.</p>;
  const max = Math.max(1, ...rows.map(([, v]) => v));
  return (
    <div className="pattern" role="img" aria-label="Games attended per month">
      <div className="pattern-axis">{[max, Math.round(max / 2), 0].map((v) => <span key={v}>{v}</span>)}</div>
      <div className="pattern-bars">
        {rows.map(([k, v]) => (
          <div key={k} className="pattern-col" title={`${k}: ${v} game${v === 1 ? "" : "s"}`}>
            <div className="pattern-bar" style={{ height: `${(v / max) * 100}%` }} />
            <span>{new Date(Number(k.slice(0, 4)), Number(k.slice(5)) - 1, 1).toLocaleDateString("en-AU", { month: "short" })}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
