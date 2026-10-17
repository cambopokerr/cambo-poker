import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../data/store";
import { computeGame, computeTotals, hourlyTotals, missingInfo, monthlySeries } from "../lib/finance";
import { fmtDateShort, fmtMonth, money } from "../lib/format";
import { Card, StatusBadge } from "../components/ui";
import { IcoCalendar, IcoChevron, IcoChip, IcoCoins, IcoDealer, IcoFinancials, IcoPlus, IcoClock } from "../components/icons";
import { C, Legend, TrendChart, type TrendPoint } from "../components/charts";
import { LogGameModal, liveGame } from "../components/StartGame";


export default function Dashboard() {
  const { db } = useStore();
  const nav = useNavigate();
  const t = computeTotals(db);
  const hosts = db.settings.hosts;
  const recent = useMemo(() => [...db.games].sort((a, b) => (b.date ?? "9999").localeCompare(a.date ?? "9999")).slice(0, 6), [db.games]);
  const trend: TrendPoint[] = useMemo(() => monthlySeries(db).filter((m) => m.month !== "unknown").map((m) => {
    const ids = new Set(db.games.filter((g) => g.date?.startsWith(m.month)).map((g) => g.id));
    const dealer = db.entries.filter((e) => ids.has(e.gameId) && e.category === "dealer_earnings").reduce((s, e) => s + (e.amount ?? 0), 0);
    return { label: fmtMonth(m.month).split(" ")[0], rake: m.rake, expenses: m.expenses, dealer, net: m.net };
  }), [db]);
  const needs = t.games - t.reconciledGames;
  const live = liveGame(db.games);
  const [start, setStart] = useState(false);
  const hr = useMemo(() => hourlyTotals(db), [db]);
  const missingGames = useMemo(() => db.games.filter((g) => missingInfo(db, g).length), [db]);


  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <h1 className="hero-title">Your Games.<br />Your Numbers.</h1>
          <p className="hero-sub">Poker nights, organised.</p>
          <hr className="hero-rule" />
          <div className="hero-actions">
            {live ? <Link className="btn btn-primary btn-lg" to={`/games/${live.id}/live`}>Open live game <span aria-hidden>→</span></Link>
              : <button type="button" className="btn btn-primary btn-lg" onClick={() => setStart(true)}><IcoPlus /> Log a Game</button>}
            <Link className="btn btn-outline btn-lg" to="/games/paste">Paste a note</Link>
            <Link className="btn btn-outline btn-lg" to="/games">View Games</Link>
          </div>
        </div>
      </section>

      {live && <div className="live-banner"><div><strong>Game in progress</strong> <span className="muted">· started {live.startTime} · {db.attendance.filter((a) => a.gameId === live.id).length} seated</span></div><Link className="btn btn-primary" to={`/games/${live.id}/live`}>Open live game</Link></div>}
      {missingGames.length > 0 && <div className="live-banner warn"><div><strong>{missingGames.length} game{missingGames.length === 1 ? " has" : "s have"} missing info</strong> <span className="muted">· dates, finish times or amounts left blank in the notes</span></div><Link className="btn btn-primary" to="/games/missing">Fill them in</Link></div>}
      {start && <LogGameModal onClose={() => setStart(false)} />}
      <div className="tiles">
        <div className="tile">
          <div className="tile-ico"><IcoCalendar /></div>
          <div><div className="tile-label">Recorded Games</div><div className="tile-value">{t.games}</div><div className="tile-sub">Total sessions{needs ? ` · ${needs} need review` : ""}</div></div>
        </div>
        <div className="tile">
          <div className="tile-ico"><IcoChip /></div>
          <div><div className="tile-label">Gross Rake</div><div className="tile-value">{money(t.rakeVerified + t.rakeUnverified, true)}</div><div className="tile-sub">Total collected (AUD){t.rakeUnverified ? ` · ${money(t.rakeUnverified, true)} unverified` : ""}</div></div>
        </div>
        <div className="tile tile-green">
          <div className="tile-ico"><IcoFinancials /></div>
          <div><div className="tile-label">Verified Profit</div><div className="tile-value">{money(t.netVerified, true)}</div><div className="tile-sub">Net profit from {t.reconciledGames} reconciled games (AUD)</div></div>
        </div>
        <div className="tile">
          <div className="tile-ico"><IcoClock /></div>
          <div><div className="tile-label">Profit per Hour</div><div className="tile-value">{hr.games ? money(hr.netPerHour, true) : "–"}</div><div className="tile-sub">{hr.games ? `${hosts.map((h) => `${h} ${money(hr.perHost[h]?.perHour ?? 0, true)}/h`).join(" · ")} · ${hr.games} nights with hours` : "Needs finish times"}</div></div>
        </div>
        <div className="tile">
          <div className="tile-ico"><IcoDealer /></div>
          <div><div className="tile-label">Dealer Earnings</div><div className="tile-value">{money(t.dealerEarningsVerified + t.dealerEarningsUnverified, true)}</div><div className="tile-sub">Total paid (AUD)</div></div>
        </div>
      </div>

      <div className="mt">
        <Card title={<span className="serif-title">Recent Sessions</span>} actions={<Link to="/games">View All</Link>}>
          <div className="list only-mobile">
            {recent.map((g) => { const f = computeGame(db, g); const n = db.attendance.filter((a) => a.gameId === g.id).length; return (
              <button key={g.id} type="button" className="list-row" onClick={() => nav(`/games/${g.id}`)}>
                <span className="list-ico"><IcoCalendar /></span>
                <span className="list-main"><span className="list-title">{fmtDateShort(g.date)}</span><span className="list-sub">{g.startTime || "–"} · {n} players</span></span>
                <span className="list-side"><span className="list-amt">{f.hasRake ? money(f.grossRake, true) : "?"}</span><StatusBadge status={f.status} /></span>
                <IcoChevron className="chev" />
              </button>); })}
            <button type="button" onClick={() => setStart(true)} className="btn btn-primary btn-lg mt-sm" style={{ width: "100%" }}><IcoPlus /> Log a Game</button>
          </div>
          <div className="table-wrap only-desktop">
            <table className="table tight">
              <thead><tr><th>Date</th><th>Start Time</th><th>Players</th><th className="num">Rake (AUD)</th><th className="num">Profit (AUD)</th><th>Status</th><th className="td-chev" /></tr></thead>
              <tbody>
                {recent.map((g) => {
                  const f = computeGame(db, g);
                  const n = db.attendance.filter((a) => a.gameId === g.id).length;
                  return (
                    <tr key={g.id} className="clickable" onClick={() => nav(`/games/${g.id}`)}>
                      <td><span className="row-link">{fmtDateShort(g.date)}</span></td>
                      <td className="muted">{g.startTime || "–"}</td>
                      <td className="muted">{n} players</td>
                      <td className="num">{f.hasRake ? money(f.grossRake, true) : "–"}</td>
                      <td className="num">{f.hasRake ? money(f.netDistributable, true) : "–"}</td>
                      <td><StatusBadge status={f.status} /></td>
                      <td className="td-chev"><IcoChevron className="chev" /></td>
                    </tr>
                  );
                })}
                {!recent.length && <tr><td colSpan={7} className="muted">No games yet. Log the first one.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid grid-2 mt">
        <Card title={<span className="serif-title">Rake &amp; Profit Trend</span>} actions={<Legend items={[{ label: "Rake", color: C.rake }, { label: "Expenses", color: C.expenses }, { label: "Dealer", color: C.dealer }, { label: "Net profit", color: C.net }]} />}>
          {trend.length ? <TrendChart data={trend} height={240} /> : <p className="muted">No dated games yet.</p>}
        </Card>
        <Card title={<span className="serif-title">Owner Shares</span>}>
          <div className="share-grid">
            {hosts.map((h) => (
              <div key={h} className="share">
                <span className="ini" style={{ width: 40, height: 40, fontSize: 16, background: "#1a2a44" }}>{h[0]}</span>
                <div><div className="tile-label">{h}</div><div className="tile-value pos">{money(t.sharesVerified[h], true)}</div><div className="tile-sub">{Math.round((db.settings.split[h] ?? 0) * 100)}% of verified net · {money(t.netUnverified * (db.settings.split[h] ?? 0), true)} more once reviews clear</div></div>
              </div>
            ))}
          </div>
          <div className="share-foot"><IcoCoins /> <span>{t.attendances} player attendances across {t.games} games · {db.players.filter((p) => !p.isHost).length} distinct players</span></div>
        </Card>
      </div>
    </>
  );
}
