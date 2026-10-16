import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../data/store";
import { fmtDateShort } from "../lib/format";
import { possibleDuplicates } from "../lib/names";
import type { Player } from "../types";
import { Card, ConfirmDialog, Initial, Search, Segmented, Stat } from "../components/ui";
import { IcoCards, IcoChevron, IcoClock, IcoPlayers, IcoPlus, IcoTrophy } from "../components/icons";
import AttendancePattern from "../components/AttendancePattern";
import { AddPlayerModal } from "./GameForm";

type Tier = "all" | "regular" | "occasional" | "new";
export const tierOf = (games: number, total: number): Exclude<Tier, "all"> => (games <= 1 ? "new" : games / Math.max(total, 1) >= 0.3 ? "regular" : "occasional");
export const TIER_LABEL = { regular: "Regular", occasional: "Occasional", new: "New" } as const;

export default function Players() {
  const { db, dispatch } = useStore();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [tier, setTier] = useState<Tier>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [merge, setMerge] = useState<{ keep: string; remove: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const stats = useMemo(() => {
    const m = new Map<string, { games: number; last: string | null }>();
    for (const a of db.attendance) {
      const g = db.games.find((x) => x.id === a.gameId);
      const s = m.get(a.playerId) ?? { games: 0, last: null };
      s.games++;
      if (g?.date && (!s.last || g.date > s.last)) s.last = g.date;
      m.set(a.playerId, s);
    }
    return m;
  }, [db]);
  const total = db.games.length;
  const S = (id: string) => stats.get(id) ?? { games: 0, last: null };

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return db.players
      .filter((p) => !ql || p.name.toLowerCase().includes(ql) || p.aliases.some((a) => a.toLowerCase().includes(ql)))
      .filter((p) => tier === "all" || tierOf(S(p.id).games, total) === tier)
      .sort((a, b) => S(b.id).games - S(a.id).games || a.name.localeCompare(b.name));
  }, [db.players, stats, q, tier, total]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => {
    const c = { all: db.players.length, regular: 0, occasional: 0, new: 0 };
    for (const p of db.players) c[tierOf(S(p.id).games, total)]++;
    return c;
  }, [db.players, stats, total]); // eslint-disable-line react-hooks/exhaustive-deps

  const dupes = useMemo(() => possibleDuplicates(db.players), [db.players]);
  const most = [...db.players].sort((a, b) => S(b.id).games - S(a.id).games)[0];
  const lastGame = [...db.games].filter((g) => g.date).sort((a, b) => b.date!.localeCompare(a.date!))[0];
  const sel: Player | undefined = db.players.find((p) => p.id === (selected ?? rows[0]?.id));
  const name = (id: string) => db.players.find((p) => p.id === id)?.name ?? "?";

  const Row = ({ p, i }: { p: Player; i: number }) => {
    const s = S(p.id); const t = tierOf(s.games, total);
    return (
      <tr className={`clickable ${sel?.id === p.id ? "selected" : ""}`} onClick={() => setSelected(p.id)} onDoubleClick={() => nav(`/players/${p.id}`)}>
        <td className="faint">{i + 1}</td>
        <td><Initial name={p.name} /><span className="row-link">{p.name}</span>{p.aliases.length > 0 && <div className="faint" style={{ fontSize: 12, marginLeft: 38 }}>aka {p.aliases.join(", ")}</div>}</td>
        <td className="num">{s.games}</td>
        <td className="num">{total ? Math.round((s.games / total) * 100) : 0}%</td>
        <td className="muted">{fmtDateShort(s.last)}</td>
        <td>{p.isHost ? <span className="badge badge-host">Owner</span> : <span className={`badge ${t === "regular" ? "badge-host" : "badge-neutral"}`}>{TIER_LABEL[t]}</span>}</td>
        <td className="td-chev"><Link to={`/players/${p.id}`} onClick={(e) => e.stopPropagation()} aria-label={`Open ${p.name}`}><IcoChevron className="chev" /></Link></td>
      </tr>
    );
  };

  return (
    <>
      <div className="page-head">
        <div><h1>Players</h1><div className="sub">View player profiles, attendance history and performance.</div></div>
        <div className="actions only-desktop"><button className="btn btn-primary" onClick={() => setAddOpen(true)}><IcoPlus /> Add Player</button></div>
      </div>

      <div className="grid grid-stats">
        <Stat icon={<IcoPlayers />} label="Total players" value={db.players.length} sub="Unique people" />
        <Stat icon={<IcoCards />} label="Total attendances" value={db.attendance.length} sub="Across all games" />
        {most && <Stat icon={<IcoTrophy />} label="Most games" value={S(most.id).games} sub={most.name} />}
        {lastGame && <Stat icon={<IcoClock />} label="Last game" value={fmtDateShort(lastGame.date)} sub={`${db.attendance.filter((a) => a.gameId === lastGame.id).length} players`} />}
      </div>

      {dupes.length > 0 && (
        <Card title={`Possible duplicate names (${dupes.length}): review before merging`} className="mt">
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Name</th><th>Looks like</th><th>Why</th><th /></tr></thead>
            <tbody>
              {dupes.map(([a, b, why]) => (
                <tr key={a.id + b.id}>
                  <td><Link to={`/players/${a.id}`}>{a.name}</Link> <span className="faint">({S(a.id).games})</span></td>
                  <td><Link to={`/players/${b.id}`}>{b.name}</Link> <span className="faint">({S(b.id).games})</span></td>
                  <td className="muted">{why}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button className="btn btn-sm" onClick={() => setMerge({ keep: a.id, remove: b.id })}>Merge into {a.name}</button>{" "}
                    <button className="btn btn-sm" onClick={() => setMerge({ keep: b.id, remove: a.id })}>Merge into {b.name}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <p className="rule" style={{ marginTop: 8 }}>Nothing is merged automatically. Merging moves all attendance to the kept name and records the other spelling as an alias.</p>
        </Card>
      )}

      <div className="filters mt" style={{ marginBottom: 0 }}>
        <Segmented value={tier} onChange={setTier} options={[{ value: "all", label: "All", count: counts.all }, { value: "regular", label: "Regulars", count: counts.regular }, { value: "occasional", label: "Occasional", count: counts.occasional }, { value: "new", label: "New", count: counts.new }]} />
        <Search className="grow" value={q} onChange={setQ} placeholder="Search players…" />
      </div>

      <div className="players-split mt">
        <Card>
          <div className="table-wrap only-desktop"><table className="table">
            <thead><tr><th>#</th><th>Player</th><th className="num">Games</th><th className="num">Attendance</th><th>Last played</th><th>Status</th><th className="td-chev" /></tr></thead>
            <tbody>
              {rows.map((p, i) => <Row key={p.id} p={p} i={i} />)}
              {!rows.length && <tr><td colSpan={7} className="muted">No players match.</td></tr>}
            </tbody>
          </table></div>
          <div className="list only-mobile">
            {rows.map((p) => { const s = S(p.id); const t = tierOf(s.games, total); return (
              <button key={p.id} type="button" className="list-row" onClick={() => nav(`/players/${p.id}`)}>
                <Initial name={p.name} size={36} />
                <span className="list-main"><span className="list-title">{p.name}</span><span className="list-sub">{s.games} games · last {fmtDateShort(s.last)}</span></span>
                <span className="list-side">{p.isHost ? <span className="badge badge-host badge-plain">Owner</span> : <span className={`badge badge-plain ${t === "regular" ? "badge-host" : "badge-neutral"}`}>{TIER_LABEL[t]}</span>}</span>
                <IcoChevron className="chev" />
              </button>
            ); })}
            {!rows.length && <p className="muted">No players match.</p>}
          </div>
          <p className="muted only-desktop" style={{ marginTop: 12, fontSize: 13 }}>Showing {rows.length} of {db.players.length} players · click a row to preview, open for the full profile</p>
        </Card>

        {sel && (() => {
          const s = S(sel.id); const t = tierOf(s.games, total);
          const hist = db.attendance.filter((a) => a.playerId === sel.id).map((a) => db.games.find((g) => g.id === a.gameId)!).filter(Boolean).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).slice(0, 5);
          return (
            <Card className="only-desktop">
              <div className="profile-head">
                <Initial name={sel.name} size={52} />
                <div>
                  <h2>{sel.name}</h2>
                  <div className="pill-row" style={{ marginTop: 4 }}>{sel.isHost ? <span className="badge badge-host">Owner</span> : <span className="badge badge-host">{TIER_LABEL[t]}</span>}{s.last && lastGame?.date && s.last >= lastGame.date.slice(0, 7) && <span className="badge badge-reconciled">Active</span>}</div>
                </div>
                <Link className="btn btn-sm" style={{ marginLeft: "auto" }} to={`/players/${sel.id}`}>Open profile</Link>
              </div>
              <div className="profile-stats">
                <div><strong>{s.games}</strong><span>Games played</span></div>
                <div><strong>{total ? Math.round((s.games / total) * 100) : 0}%</strong><span>Attendance</span></div>
                <div><strong style={{ fontSize: 15 }}>{fmtDateShort(s.last)}</strong><span>Last played</span></div>
              </div>
              <h3 style={{ margin: "6px 0 6px" }}>Recent games</h3>
              <div className="mini-list">
                {hist.map((g) => <Link key={g.id} to={`/games/${g.id}`}><span>{fmtDateShort(g.date)}</span><span className="muted">{g.startTime || "–"}</span><IcoChevron className="chev" /></Link>)}
                {!hist.length && <span className="muted">No games.</span>}
              </div>
              <h3 style={{ margin: "16px 0 8px" }}>Attendance pattern</h3>
              <AttendancePattern playerId={sel.id} />
              {sel.notes && <><h3 style={{ margin: "16px 0 6px" }}>Notes</h3><p className="muted" style={{ whiteSpace: "pre-wrap" }}>{sel.notes}</p></>}
            </Card>
          );
        })()}
      </div>

      <button type="button" className="fab only-mobile" aria-label="Add player" onClick={() => setAddOpen(true)}><IcoPlus /></button>

      {addOpen && <AddPlayerModal players={db.players} onClose={() => setAddOpen(false)} onPick={(p) => { setAddOpen(false); nav(`/players/${p.id}`); }} onCreate={(p) => { dispatch({ type: "player:save", player: p }); setAddOpen(false); nav(`/players/${p.id}`); }} />}
      {merge && (
        <ConfirmDialog title="Merge players?" confirmLabel="Merge"
          message={<>Merge <strong>{name(merge.remove)}</strong> into <strong>{name(merge.keep)}</strong>? All of {name(merge.remove)}'s attendance moves to {name(merge.keep)} and the name is kept as an alias. Only do this if you are sure they are the same person.</>}
          onCancel={() => setMerge(null)} onConfirm={() => { dispatch({ type: "player:merge", keepId: merge.keep, removeId: merge.remove }); setMerge(null); }} />
      )}
    </>
  );
}
