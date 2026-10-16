import { Fragment, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../data/store";
import { computeGame, computeTotals, monthlySeries } from "../lib/finance";
import { fmtDateShort, fmtMonth, money, signedMoney } from "../lib/format";
import { download, toCSV } from "../lib/csv";
import { CATEGORY_LABEL, STATUS_LABEL, type Category } from "../types";
import { Card, Search, Stat, StatusBadge, Tabs } from "../components/ui";
import { IcoChevron, IcoChip, IcoCoins, IcoDealer, IcoFinancials, IcoFood } from "../components/icons";
import { C, DONUT, Donut, Legend, TrendChart, type TrendPoint } from "../components/charts";

type Tab = "games" | "expenses" | "dealers" | "profit" | "distributions";

export default function Financials() {
  const { db } = useStore();
  const nav = useNavigate();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [tab, setTab] = useState<Tab>("games");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");

  const games = useMemo(() => db.games.filter((g) => {
    if (g.date == null) return !from && !to;
    if (from && g.date < from) return false;
    if (to && g.date > to) return false;
    return true;
  }).sort((a, b) => (b.date ?? "9999").localeCompare(a.date ?? "9999")), [db.games, from, to]);

  const t = useMemo(() => computeTotals(db, games), [db, games]);
  const rows = useMemo(() => games.map((g) => ({ g, f: computeGame(db, g), players: db.attendance.filter((a) => a.gameId === g.id).length })), [db, games]);
  const trend: TrendPoint[] = useMemo(() => monthlySeries(db, games).filter((m) => m.month !== "unknown").map((m) => {
    const ids = new Set(games.filter((g) => g.date?.startsWith(m.month)).map((g) => g.id));
    const dealer = db.entries.filter((e) => ids.has(e.gameId) && e.category === "dealer_earnings").reduce((s, e) => s + (e.amount ?? 0), 0);
    return { label: fmtMonth(m.month).split(" ")[0], rake: m.rake, expenses: m.expenses, dealer, net: m.net };
  }), [db, games]);

  const ids = useMemo(() => new Set(games.map((g) => g.id)), [games]);
  const expenseEntries = db.entries.filter((e) => ids.has(e.gameId) && ["food", "drinks", "other_expense"].includes(e.category));
  const expenseTotal = expenseEntries.reduce((s, e) => s + (e.amount ?? 0), 0);
  const breakdown = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of expenseEntries) {
      const txt = e.originalText.toLowerCase();
      const key = e.category === "food" ? (/gyg|takeaway/.test(txt) ? "GYG / takeaway" : "Food") : e.category === "drinks" ? (/snack/.test(txt) ? "Snacks" : "Drinks") : "Other";
      m.set(key, (m.get(key) ?? 0) + (e.amount ?? 0));
    }
    return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [expenseEntries]);

  const dealerRows = useMemo(() => {
    const m = new Map<string, { games: number; total: number; fromRake: number }>();
    for (const g of games) {
      const es = db.entries.filter((e) => e.gameId === g.id && e.category === "dealer_earnings");
      if (!es.length) continue;
      const name = g.dealerPlayerId ? db.players.find((p) => p.id === g.dealerPlayerId)?.name ?? g.dealerName : g.dealerName || "Unnamed dealer";
      const r = m.get(name) ?? { games: 0, total: 0, fromRake: 0 };
      r.games++;
      for (const e of es) { r.total += e.amount ?? 0; if (e.deductFromRake) r.fromRake += e.amount ?? 0; }
      m.set(name, r);
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [db, games]);
  const dealerGames = dealerRows.reduce((s, [, r]) => s + r.games, 0);

  const transactions = useMemo(() => db.entries
    .filter((e) => ids.has(e.gameId))
    .map((e) => ({ e, g: db.games.find((g) => g.id === e.gameId)! }))
    .sort((a, b) => (b.g.date ?? "9999").localeCompare(a.g.date ?? "9999"))
    .slice(0, 8), [db, ids]);

  const tableRows = rows.filter(({ g, f }) => (status === "all" || f.status === status) && (!q || [g.originalDateText, g.date ?? "", g.dealerName, g.notes].join(" ").toLowerCase().includes(q.toLowerCase())));
  const range = from || to ? `${from || "start"}_to_${to || "latest"}` : "all";
  const cats: Category[] = ["rake", "food", "drinks", "other_expense", "adjustment", "dealer_earnings"];

  const exportGames = () => download(`cambo-poker-games-${range}.csv`, toCSV(rows.map(({ g, f, players }) => ({
    date: g.date ?? "", date_as_written: g.originalDateText, start: g.startTime, finish: g.finishTime, hours: g.durationHours ?? "", players, dealer: g.dealerName,
    gross_rake: f.grossRake, adjustments: f.adjustments, food: f.food, drinks_snacks: f.drinks, other_expenses: f.otherExpense, dealer_earnings: f.dealerEarnings,
    dealer_deducted_from_rake: f.dealerDeducted, net_distributable: f.netDistributable, ...Object.fromEntries(db.settings.hosts.map((h) => [`share_${h}`, f.shares[h].toFixed(2)])),
    recorded_distribution: f.recordedDistribution ?? "", variance: f.variance ?? "", status: STATUS_LABEL[f.status], open_questions: f.reasons.join(" | "),
  }))));
  const exportEntries = () => download(`cambo-poker-entries-${range}.csv`, toCSV(games.flatMap((g) => db.entries.filter((e) => e.gameId === g.id).map((e) => ({
    date: g.date ?? "", date_as_written: g.originalDateText, category: CATEGORY_LABEL[e.category], amount: e.amount ?? "", original_text: e.originalText, verification: e.verification,
    dealer_from_rake: e.category === "dealer_earnings" ? (e.deductFromRake ? "yes" : "no") : "", notes: e.notes ?? "" })))));
  const exportDist = () => download(`cambo-poker-distributions-${range}.csv`, toCSV(games.flatMap((g) => db.distributions.filter((d) => d.gameId === g.id).map((d) => ({
    date: g.date ?? "", date_as_written: g.originalDateText, recipient: d.recipient, type: d.type, amount: d.amount ?? "", original_text: d.originalText, verification: d.verification })))));

  return (
    <>
      <div className="page-head">
        <div><h1>Financials</h1><div className="sub">Track rake, expenses, dealer earnings and profit. Keep your poker business organised.</div></div>
        <div className="actions">
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" style={{ width: "auto" }} />
          <span className="muted">to</span>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" style={{ width: "auto" }} />
          {(from || to) && <button className="btn" onClick={() => { setFrom(""); setTo(""); }}>All time</button>}
        </div>
      </div>

      <div className="grid grid-stats">
        <Stat icon={<IcoChip />} label="Total rake" value={money(t.rakeVerified + t.rakeUnverified, true)} sub={`From ${games.length} games${t.rakeUnverified ? ` · ${money(t.rakeUnverified, true)} needs review` : ""}`} />
        <Stat icon={<IcoFood />} label="Total expenses" value={money(expenseTotal, true)} sub="Food, drinks & other" />
        <Stat icon={<IcoDealer />} label="Dealer earnings" value={money(t.dealerEarningsVerified + t.dealerEarningsUnverified, true)} sub={`${dealerGames} games`} />
        <Stat icon={<IcoFinancials />} label="Net profit (verified)" value={money(t.netVerified, true)} sub={`${t.reconciledGames} complete games`} tone="green" />
        <Stat icon={<IcoCoins />} label="Avg profit per game" value={money(t.reconciledGames ? t.netVerified / t.reconciledGames : 0, true)} sub={`From ${t.reconciledGames} verified games`} />
      </div>

      <div className="grid grid-2-1 mt">
        <Card title="Rake, expenses & profit trend" actions={<Legend items={[{ label: "Rake", color: C.rake }, { label: "Expenses", color: C.expenses }, { label: "Dealer earnings", color: C.dealer }, { label: "Net profit", color: C.net }]} />}>
          {trend.length ? <TrendChart data={trend} height={240} /> : <p className="muted">No dated games in range.</p>}
        </Card>
        <Card title="Expense breakdown">
          {breakdown.length ? (
            <div className="donut-wrap">
              <Donut data={breakdown} total={expenseTotal} label="Total expenses" />
              <div className="legend-rows">
                {breakdown.map((b, i) => (
                  <div className="legend-row" key={b.name}><span className="dot" style={{ background: DONUT[i % DONUT.length] }} /><span>{b.name}</span><strong>{money(b.value, true)}</strong><span className="pct">{expenseTotal ? `${((b.value / expenseTotal) * 100).toFixed(1)}%` : ""}</span></div>
                ))}
              </div>
            </div>
          ) : <p className="muted">No expenses recorded in range.</p>}
        </Card>
      </div>

      <div className="grid grid-2-1 mt">
        <Card>
          <Tabs value={tab} onChange={setTab} options={[{ value: "games", label: "Game breakdown" }, { value: "expenses", label: "Expense breakdown" }, { value: "dealers", label: "Dealer earnings" }, { value: "profit", label: "Profit summary" }, { value: "distributions", label: "Distributions" }]} />

          {tab === "games" && (
            <>
              <div className="filters">
                <Search className="grow" value={q} onChange={setQ} placeholder="Search games…" />
                <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="all">All status</option><option value="reconciled">Completed</option><option value="needs_review">Needs review</option><option value="incomplete">Incomplete</option></select>
                <button className="btn" onClick={() => { setQ(""); setStatus("all"); }}>Reset</button>
                <button className="btn" onClick={exportGames}>Export CSV</button>
              </div>
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Date</th><th className="num">Players</th><th className="num">Rake (AUD)</th><th className="num">Expenses</th><th className="num">Dealer</th><th className="num">Net profit</th><th className="num">Recorded</th><th className="num">Variance</th><th>Status</th><th className="td-chev" /></tr></thead>
                <tbody>
                  {tableRows.map(({ g, f, players }) => (
                    <tr key={g.id} className="clickable" onClick={() => nav(`/games/${g.id}`)}>
                      <td><span className="row-link">{fmtDateShort(g.date)}</span>{g.date == null && <div className="faint" style={{ fontSize: 12 }}>{g.originalDateText}</div>}</td>
                      <td className="num">{players}</td>
                      <td className="num">{f.hasRake ? money(f.grossRake, true) : <span className="neg">?</span>}</td>
                      <td className="num">{f.expenses ? money(f.expenses, true) : "–"}</td>
                      <td className="num">{f.dealerEarnings ? money(f.dealerEarnings, true) : "–"}</td>
                      <td className="num">{f.hasRake ? money(f.netDistributable) : "–"}</td>
                      <td className="num">{f.recordedDistribution == null ? <span className="faint">–</span> : money(f.recordedDistribution)}</td>
                      <td className={`num ${f.variance != null && Math.abs(f.variance) > db.settings.reconcileTolerance ? "neg" : ""}`}>{f.variance == null ? "–" : signedMoney(f.variance)}</td>
                      <td><StatusBadge status={f.status} /></td>
                      <td className="td-chev"><IcoChevron className="chev" /></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>Showing {tableRows.length} of {games.length} games</p>
            </>
          )}

          {tab === "expenses" && (
            <>
              <div className="filters" style={{ justifyContent: "flex-end" }}><button className="btn" onClick={exportEntries}>Export entries CSV</button></div>
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Category</th><th className="num">Verified</th><th className="num">Needs review</th><th className="num">Total</th></tr></thead>
                <tbody>{cats.map((c) => { const v = t.byCategory[c] ?? { verified: 0, unverified: 0 }; return (
                  <tr key={c}><td>{CATEGORY_LABEL[c]}</td><td className="num">{c === "adjustment" ? signedMoney(v.verified) : money(v.verified)}</td><td className="num">{v.unverified ? money(v.unverified) : "–"}</td><td className="num">{money(v.verified + v.unverified)}</td></tr>); })}</tbody>
              </table></div>
              <h3 style={{ margin: "18px 0 8px" }}>Every expense line</h3>
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Date</th><th>Category</th><th className="num">Amount</th><th>Original text</th><th>Status</th></tr></thead>
                <tbody>{expenseEntries.sort((a, b) => (db.games.find((g) => g.id === b.gameId)?.date ?? "").localeCompare(db.games.find((g) => g.id === a.gameId)?.date ?? "")).map((e) => { const g = db.games.find((x) => x.id === e.gameId)!; return (
                  <tr key={e.id} className="clickable" onClick={() => nav(`/games/${g.id}`)}><td>{fmtDateShort(g.date)}</td><td>{CATEGORY_LABEL[e.category]}</td><td className="num">{money(e.amount)}</td><td className="mono">{e.originalText}</td><td>{e.verification === "verified" ? <span className="badge badge-reconciled">Verified</span> : <span className="badge badge-needs_review">Needs review</span>}</td></tr>); })}</tbody>
              </table></div>
            </>
          )}

          {tab === "dealers" && (
            dealerRows.length ? (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Dealer</th><th className="num">Games</th><th className="num">Earned</th><th className="num">Of which from rake</th><th className="num">Avg per game</th></tr></thead>
                <tbody>{dealerRows.map(([n, r]) => <tr key={n}><td>{n}</td><td className="num">{r.games}</td><td className="num">{money(r.total)}</td><td className="num">{r.fromRake ? money(r.fromRake) : "–"}</td><td className="num">{money(r.total / r.games, true)}</td></tr>)}</tbody>
                <tfoot><tr><td>Total</td><td className="num">{dealerGames}</td><td className="num">{money(dealerRows.reduce((s, [, r]) => s + r.total, 0))}</td><td className="num">{money(dealerRows.reduce((s, [, r]) => s + r.fromRake, 0))}</td><td /></tr></tfoot>
              </table></div>
            ) : <p className="muted">No dealer earnings recorded in range.</p>
          )}

          {tab === "profit" && (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Month</th><th className="num">Games</th><th className="num">Rake</th><th className="num">Expenses</th><th className="num">Net (all)</th><th className="num">Net (verified)</th></tr></thead>
              <tbody>{monthlySeries(db, games).map((m) => <tr key={m.month}><td>{fmtMonth(m.month)}</td><td className="num">{m.games}</td><td className="num">{money(m.rake, true)}</td><td className="num">{money(m.expenses)}</td><td className="num">{money(m.net)}</td><td className="num pos">{money(m.netVerified)}</td></tr>)}</tbody>
              <tfoot><tr><td>Total</td><td className="num">{games.length}</td><td className="num">{money(t.rakeVerified + t.rakeUnverified, true)}</td><td className="num">{money(t.expensesVerified + t.expensesUnverified)}</td><td className="num">{money(t.netVerified + t.netUnverified)}</td><td className="num pos">{money(t.netVerified)}</td></tr></tfoot>
            </table></div>
          )}

          {tab === "distributions" && (
            <>
              <div className="filters" style={{ justifyContent: "flex-end" }}><button className="btn" onClick={exportDist}>Export splits CSV</button></div>
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Recipient</th><th className="num">Verified share (model)</th><th className="num">Recorded in notes</th></tr></thead>
                <tbody>
                  {db.settings.hosts.map((h) => <tr key={h}><td>{h}</td><td className="num">{money(t.sharesVerified[h])}</td><td className="num">{money(db.distributions.filter((d) => ids.has(d.gameId) && d.recipient === h).reduce((s, d) => s + (d.amount ?? 0), 0))}</td></tr>)}
                  <tr><td className="muted">Pooled totals (not split per host in the note)</td><td className="num">–</td><td className="num">{money(db.distributions.filter((d) => ids.has(d.gameId) && d.type === "pooled_total").reduce((s, d) => s + (d.amount ?? 0), 0))}</td></tr>
                </tbody>
              </table></div>
              <p className="rule" style={{ marginTop: 10 }}>Model shares come from reconciled games only. “Recorded in notes” is what the notes say was actually paid, whether or not the game reconciles.</p>
            </>
          )}
        </Card>

        <div className="stack">
          <Card title="Profit summary">
            <dl className="kv">
              <dt>Total rake</dt><dd>{money(t.rakeVerified + t.rakeUnverified, true)}</dd>
              <dt>Cash adjustments</dt><dd>{signedMoney(t.adjustmentsVerified + t.adjustmentsUnverified)}</dd>
              <dt>Total expenses</dt><dd>− {money(expenseTotal, true)}</dd>
              <dt>Dealer paid from rake</dt><dd>− {money(dealerRows.reduce((s, [, r]) => s + r.fromRake, 0), true)}</dd>
              <dt style={{ borderTop: "1px solid var(--line-strong)", paddingTop: 8 }}><strong>Net profit (verified)</strong></dt><dd style={{ borderTop: "1px solid var(--line-strong)", paddingTop: 8 }}><strong className="pos">{money(t.netVerified, true)}</strong></dd>
              <dt>Unverified profit</dt><dd className="muted">{money(t.netUnverified, true)}</dd>
              {db.settings.hosts.map((h) => <Fragment key={h}><dt>{h} (verified)</dt><dd>{money(t.sharesVerified[h], true)}</dd></Fragment>)}
            </dl>
            <p className="rule" style={{ marginTop: 10 }}>Dealer tips kept by a hired dealer are not deducted. Unverified profit is the indicative net from games still needing review.</p>
          </Card>
          <Card title="Recent transactions" actions={<Link to="/games">View all →</Link>}>
            <div className="mini-list">
              {transactions.map(({ e, g }) => (
                <Link key={e.id} to={`/games/${g.id}`}>
                  <span><span className="muted" style={{ marginRight: 10 }}>{fmtDateShort(g.date)}</span>{e.category === "dealer_earnings" ? `Dealer – ${g.dealerName || "unnamed"}` : e.category === "rake" ? "Game rake" : CATEGORY_LABEL[e.category]}</span>
                  <span className={`num ${e.category === "rake" || (e.category === "adjustment" && (e.amount ?? 0) > 0) ? "pos" : ""}`}>{e.amount == null ? "?" : e.category === "rake" || e.category === "adjustment" ? signedMoney(e.amount) : `−${money(e.amount)}`}</span>
                  <span className={`badge badge-plain ${e.category === "rake" ? "badge-host" : e.category === "dealer_earnings" ? "badge-neutral" : "badge-incomplete"}`}>{e.category === "rake" ? "Rake" : e.category === "dealer_earnings" ? "Dealer" : e.category === "adjustment" ? "Adjust." : "Expense"}</span>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
