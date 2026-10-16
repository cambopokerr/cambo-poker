import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useStore } from "../data/store";
import { computeGame, playerLifetime, playerResults } from "../lib/finance";
import { fmtDateShort, money, signedMoney } from "../lib/format";
import { Card, Empty, Field, Initial, StatusBadge, Tabs } from "../components/ui";
import { IcoChevron } from "../components/icons";
import AttendancePattern from "../components/AttendancePattern";
import { TIER_LABEL, tierOf } from "./Players";

type Tab = "overview" | "attendance" | "notes";

export default function PlayerProfile() {
  const { id } = useParams();
  const nav = useNavigate();
  const { db, dispatch } = useStore();
  const p = db.players.find((x) => x.id === id);
  const [tab, setTab] = useState<Tab>("overview");
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(p?.name ?? "");
  const [notes, setNotes] = useState(p?.notes ?? "");
  const [aliases, setAliases] = useState(p?.aliases.join(", ") ?? "");
  if (!p) return <Empty title="Player not found" action={<Link className="btn" to="/players">Back to players</Link>} />;

  const history = db.attendance.filter((a) => a.playerId === p.id).map((a) => ({ a, g: db.games.find((g) => g.id === a.gameId)! })).filter((x) => x.g)
    .sort((x, y) => (y.g.date ?? "9999").localeCompare(x.g.date ?? "9999"));
  const dealt = db.entries.filter((e) => e.category === "dealer_earnings" && (e.dealerPlayerId === p.id || (!e.dealerPlayerId && e.dealerName === p.name)));
  const dealtGames = new Set([...dealt.map((e) => e.gameId), ...db.games.filter((g) => g.dealerPlayerId === p.id).map((g) => g.id)]);
  const dealerEarned = db.entries.filter((e) => e.category === "dealer_earnings" && dealtGames.has(e.gameId) && (e.dealerPlayerId === p.id || !e.dealerPlayerId)).reduce((s, e) => s + (e.amount ?? 0), 0);
  const total = db.games.length;
  const tier = tierOf(history.length, total);
  const life = playerLifetime(db, p.id);
  const avgPlayers = history.length ? Math.round(history.reduce((s, h) => s + db.attendance.filter((x) => x.gameId === h.g.id).length, 0) / history.length) : 0;
  const save = () => { dispatch({ type: "player:save", player: { ...p, name: name.trim() || p.name, notes: notes.trim(), aliases: aliases.split(",").map((s) => s.trim()).filter(Boolean) } }); setEdit(false); };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs"><Link to="/players">‹ Players</Link></div>
          <div className="profile-head" style={{ marginBottom: 0 }}>
            <Initial name={p.name} size={60} />
            <div>
              <h1 style={{ fontSize: 28 }}>{p.name}</h1>
              <div className="pill-row" style={{ marginTop: 6 }}>{p.isHost ? <span className="badge badge-host">Owner</span> : <span className={`badge ${tier === "regular" ? "badge-host" : "badge-neutral"}`}>{TIER_LABEL[tier]}</span>}{p.aliases.length > 0 && <span className="faint" style={{ fontSize: 12 }}>aka {p.aliases.join(", ")}</span>}</div>
            </div>
          </div>
        </div>
        <div className="actions"><button className="btn" onClick={() => setEdit((v) => !v)}>{edit ? "Close" : "Edit"}</button></div>
      </div>

      {edit && (
        <Card title="Edit player" className="stack-item">
          <div className="form-grid">
            <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Aliases (comma separated)"><input className="input" value={aliases} onChange={(e) => setAliases(e.target.value)} /></Field>
            <Field label="Notes" className="span-2"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}><button className="btn" onClick={() => setEdit(false)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></div>
        </Card>
      )}

      <div className="profile-stats mt" style={{ maxWidth: 560 }}>
        <div><strong>{history.length}</strong><span>Games played</span></div>
        <div><strong>{total ? Math.round((history.length / total) * 100) : 0}%</strong><span>Attendance</span></div>
        <div><strong className={life.games ? (life.net >= 0 ? "pos" : "neg") : undefined}>{life.games ? signedMoney(life.net) : dealtGames.size ? money(dealerEarned, true) : avgPlayers}</strong><span>{life.games ? `Won / lost (${life.games} tracked)` : dealtGames.size ? `Dealer earnings (${dealtGames.size} dealt)` : "Avg table size"}</span></div>
      </div>

      <Tabs value={tab} onChange={setTab} options={[{ value: "overview", label: "Overview" }, { value: "attendance", label: `Attendance (${history.length})` }, { value: "notes", label: "Notes" }]} />

      {tab === "overview" && (
        <div className="grid grid-2">
          <Card title="Recent games" actions={<button className="btn btn-sm" onClick={() => setTab("attendance")}>See all</button>}>
            <div className="mini-list">
              {history.slice(0, 6).map(({ g }) => { const f = computeGame(db, g); return (
                <Link key={g.id} to={`/games/${g.id}`}><span>{fmtDateShort(g.date)}</span><span className="muted">{f.hasRake ? `${money(f.grossRake, true)} rake` : "–"}</span><IcoChevron className="chev" /></Link>
              ); })}
              {!history.length && <span className="muted">No games recorded.</span>}
            </div>
          </Card>
          <Card title="Attendance pattern"><AttendancePattern playerId={p.id} />
            {p.isHost && <p className="rule" style={{ marginTop: 12 }}>Host share: {Math.round((db.settings.split[p.name] ?? 0) * 100)}% of net distributable profit.</p>}
          </Card>
        </div>
      )}

      {tab === "attendance" && (
        <Card>
          <div className="table-wrap only-desktop"><table className="table">
            <thead><tr><th>Date</th><th>Note</th><th className="num">Players</th><th className="num">Rake</th><th className="num">Result</th><th>Status</th><th className="td-chev" /></tr></thead>
            <tbody>
              {history.map(({ a, g }) => { const f = computeGame(db, g); return (
                <tr key={g.id} className="clickable" onClick={() => nav(`/games/${g.id}`)}>
                  <td><span className="row-link">{fmtDateShort(g.date)}</span>{g.date == null && <div className="faint" style={{ fontSize: 12 }}>{g.originalDateText}</div>}</td>
                  <td className="muted">{a.notes ?? ""}</td>
                  <td className="num">{db.attendance.filter((x) => x.gameId === g.id).length}</td>
                  <td className="num">{f.hasRake ? money(f.grossRake, true) : "–"}</td>
                  <td className="num">{(() => { const r = playerResults(db, g.id).find((x) => x.playerId === p.id); return r?.net == null ? <span className="faint">–</span> : <span className={r.net >= 0 ? "pos" : "neg"}>{signedMoney(r.net)}</span>; })()}</td>
                  <td><StatusBadge status={f.status} /></td>
                  <td className="td-chev"><IcoChevron className="chev" /></td>
                </tr>); })}
            </tbody>
          </table></div>
          <div className="list only-mobile">
            {history.map(({ a, g }) => { const f = computeGame(db, g); return (
              <button key={g.id} type="button" className="list-row" onClick={() => nav(`/games/${g.id}`)}>
                <span className="list-main"><span className="list-title">{fmtDateShort(g.date)}</span><span className="list-sub">{g.startTime || "–"} · {db.attendance.filter((x) => x.gameId === g.id).length} players{a.notes ? ` · ${a.notes}` : ""}</span></span>
                <span className="list-side"><span className="list-amt">{f.hasRake ? money(f.grossRake, true) : "–"}</span><StatusBadge status={f.status} /></span>
                <IcoChevron className="chev" />
              </button>); })}
          </div>
          {!history.length && <p className="muted">No games recorded for this player.</p>}
        </Card>
      )}

      {tab === "notes" && (
        <Card title="Notes">
          {p.notes ? <p style={{ whiteSpace: "pre-wrap" }}>{p.notes}</p> : <p className="muted">No notes yet. Use Edit to add some.</p>}
          <p className="rule" style={{ marginTop: 10 }}>No per-player winnings are tracked: players pay rake into the pot and the notes never record individual results.</p>
        </Card>
      )}
    </>
  );
}
