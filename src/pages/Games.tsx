import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useStore } from "../data/store";
import { computeGame, computeTotals } from "../lib/finance";
import { money } from "../lib/format";
import type { GameStatus } from "../types";
import { Card, Search, Segmented, Stat } from "../components/ui";
import { IcoCalendar, IcoChip, IcoCoins, IcoDealer, IcoFood, IcoPlayers, IcoPlus } from "../components/icons";
import GameTable from "../components/GameTable";

type Filter = GameStatus | "all";

export default function Games() {
  const { db } = useStore();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [status, setStatus] = useState<Filter>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dealer, setDealer] = useState("all");
  const [sortAsc, setSortAsc] = useState(false);
  useEffect(() => { const pq = params.get("q"); if (pq != null) setQ(pq); }, [params]);

  const dealers = useMemo(() => [...new Set(db.games.map((g) => (g.dealerPlayerId ? db.players.find((p) => p.id === g.dealerPlayerId)?.name : g.dealerName) || "").filter(Boolean))].sort(), [db]);

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return db.games
      .filter((g) => {
        if (status !== "all" && computeGame(db, g).status !== status) return false;
        if (from && (g.date == null || g.date < from)) return false;
        if (to && (g.date == null || g.date > to)) return false;
        const dn = (g.dealerPlayerId ? db.players.find((p) => p.id === g.dealerPlayerId)?.name : g.dealerName) || "";
        if (dealer !== "all" && dn !== dealer) return false;
        if (!ql) return true;
        const names = db.attendance.filter((a) => a.gameId === g.id).map((a) => db.players.find((p) => p.id === a.playerId)?.name ?? "");
        return [g.originalDateText, g.date ?? "", dn, g.notes, g.sourceText, ...names].join(" ").toLowerCase().includes(ql);
      })
      .sort((a, b) => { const da = a.date ?? "9999", dbb = b.date ?? "9999"; return sortAsc ? da.localeCompare(dbb) : dbb.localeCompare(da); });
  }, [db, q, status, from, to, dealer, sortAsc]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: db.games.length, reconciled: 0, needs_review: 0, incomplete: 0 };
    for (const g of db.games) c[computeGame(db, g).status]++;
    return c;
  }, [db]);
  const t = computeTotals(db, rows);
  const reset = () => { setQ(""); setFrom(""); setTo(""); setStatus("all"); setDealer("all"); setParams({}); };

  return (
    <>
      <div className="page-head">
        <div><h1>Games</h1><div className="sub">View and manage all poker sessions. Track players, rake, expenses and profit.</div></div>
      </div>

      <Segmented value={status} onChange={setStatus} options={[
        { value: "all", label: "All games", count: counts.all }, { value: "reconciled", label: "Completed", count: counts.reconciled },
        { value: "needs_review", label: "Needs review", count: counts.needs_review }, { value: "incomplete", label: "Incomplete", count: counts.incomplete },
      ]} />

      <div className="grid grid-stats mt">
        <Stat icon={<IcoCalendar />} label="Games" value={rows.length} sub={rows.length !== db.games.length ? `of ${db.games.length}` : undefined} />
        <Stat icon={<IcoPlayers />} label="Player attendances" value={t.attendances} />
        <Stat icon={<IcoChip />} label="Total rake" value={money(t.rakeVerified + t.rakeUnverified, true)} sub={t.rakeUnverified ? `${money(t.rakeUnverified, true)} needs review` : "verified"} />
        <Stat icon={<IcoCoins />} label="Profit (verified)" value={money(t.netVerified, true)} sub={`${t.reconciledGames} reconciled`} tone="green" />
        <Stat icon={<IcoFood />} label="Expenses" value={money(t.expensesVerified + t.expensesUnverified, true)} />
        <Stat icon={<IcoDealer />} label="Dealer earnings" value={money(t.dealerEarningsVerified + t.dealerEarningsUnverified, true)} />
      </div>

      <Card className="mt">
        <div className="filters">
          <Search className="grow" value={q} onChange={setQ} placeholder="Search games…" />
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <span className="muted">to</span>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          <select value={dealer} onChange={(e) => setDealer(e.target.value)} aria-label="Dealer"><option value="all">All dealers</option>{dealers.map((d) => <option key={d} value={d}>{d}</option>)}</select>
          <button className="btn" onClick={() => setSortAsc((v) => !v)}>{sortAsc ? "Oldest first" : "Newest first"}</button>
          <button className="btn" onClick={reset}>Reset</button>
        </div>
        <GameTable games={rows} />
        <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>Showing {rows.length} of {db.games.length} games</p>
      </Card>
      <Link to="/games/new" className="fab only-mobile" aria-label="Log a game"><IcoPlus /></Link>
    </>
  );
}
