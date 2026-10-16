import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useStore } from "../data/store";
import { computeGame, durationFromTimes, playerResults, potCheck } from "../lib/finance";
import { fmtDate, money, signedMoney, uid } from "../lib/format";
import { norm } from "../lib/names";
import type { FinancialEntry, Player } from "../types";
import { CATEGORY_LABEL } from "../types";
import { Card, ConfirmDialog, Empty, Field, Initial, Modal, Search } from "../components/ui";
import { IcoChip, IcoCoins, IcoDealer, IcoFood, IcoPlayers, IcoPlus } from "../components/icons";
import { clockNow } from "../components/StartGame";
import { AddPlayerModal, DealerModal, ExpenseModal, type EntryDraft } from "./GameForm";

type Dialog = null | { kind: "buyin"; playerId?: string } | { kind: "cashout"; playerId: string } | { kind: "rake" } | { kind: "expense" } | { kind: "dealer" } | { kind: "player" } | { kind: "end" };

function elapsed(startedAt?: string, startTime?: string): string {
  const start = startedAt ? new Date(startedAt).getTime() : NaN;
  if (isNaN(start)) return startTime ? `since ${startTime}` : "";
  const mins = Math.max(0, Math.floor((Date.now() - start) / 60000));
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`;
}

export default function LiveGame() {
  const { id } = useParams();
  const nav = useNavigate();
  const { db, dispatch, syncError } = useStore();
  const game = db.games.find((g) => g.id === id);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t); }, []);
  if (!game) return <Empty title="Game not found" action={<Link className="btn" to="/games">Back to games</Link>} />;
  if (game.status !== "live") return <Empty title="This game has ended" body="Open the game record to edit it." action={<Link className="btn btn-primary" to={`/games/${game.id}`}>Open game</Link>} />;

  const att = db.attendance.filter((a) => a.gameId === game.id);
  const results = playerResults(db, game.id);
  const byPlayer = new Map(results.map((r) => [r.playerId, r]));
  const pot = potCheck(db, game.id);
  const f = computeGame(db, game);
  const entries = db.entries.filter((e) => e.gameId === game.id);
  const rakeEntries = entries.filter((e) => e.category === "rake");
  const expenseEntries = entries.filter((e) => ["food", "drinks", "other_expense", "adjustment"].includes(e.category));
  const dealerEntries = entries.filter((e) => e.category === "dealer_earnings");
  const name = (pid: string) => db.players.find((p) => p.id === pid)?.name ?? "?";
  const addEntry = (d: EntryDraft) => dispatch({ type: "entry:add", entry: {
    id: d.id, gameId: game.id, category: d.category, amount: d.amount === "" ? null : Number(d.amount), originalText: d.originalText || `$${d.amount}`,
    verification: d.verification, deductFromRake: d.category === "dealer_earnings" ? d.deductFromRake : undefined,
    dealerName: d.category === "dealer_earnings" ? d.dealerName || undefined : undefined, dealerPlayerId: d.category === "dealer_earnings" ? d.dealerPlayerId : undefined, notes: d.notes || undefined,
  } });

  const endGame = () => {
    const finish = clockNow();
    const hours = game.startedAt ? Math.round(((Date.now() - new Date(game.startedAt).getTime()) / 3600000) * 100) / 100 : durationFromTimes(game.startTime, finish);
    dispatch({ type: "game:end", id: game.id, finishTime: finish, endedAt: new Date().toISOString(), durationHours: hours });
    setDialog(null);
    nav(`/games/${game.id}`);
  };

  return (
    <>
      <div className="page-head" style={{ marginBottom: 10 }}>
        <div>
          <div className="crumbs"><Link to="/games">‹ Games</Link></div>
          <h1 style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>{fmtDate(game.date)} <span className="badge badge-live">In progress</span></h1>
          <div className="sub">Started {game.startTime}{game.location ? ` · ${game.location}` : ""} · {att.length} players seated</div>
        </div>
        <div className="live-clock" aria-live="off"><span>{elapsed(game.startedAt, game.startTime)}</span><small>elapsed</small></div>
      </div>

      {syncError && <Card className="stack-item"><p className="error" style={{ margin: 0 }}>A change did not reach the server: {syncError}</p></Card>}

      <div className="live-actions">
        <button className="btn btn-primary" onClick={() => setDialog({ kind: "buyin" })}><IcoPlayers /> Buy-in / add player</button>
        <button className="btn" onClick={() => setDialog({ kind: "rake" })}><IcoChip /> Add rake</button>
        <button className="btn" onClick={() => setDialog({ kind: "expense" })}><IcoFood /> Add expense</button>
        <button className="btn" onClick={() => setDialog({ kind: "dealer" })}><IcoDealer /> Add dealer</button>
        <Link className="btn" to={`/games/${game.id}/edit`}><IcoCoins /> Edit details</Link>
        <button className="btn btn-end" onClick={() => setDialog({ kind: "end" })}>■ End Game</button>
      </div>

      <div className="grid grid-stats">
        <div className="stat"><div className="stat-ico"><IcoChip /></div><div className="stat-body"><div className="stat-label">Rake so far</div><div className="stat-value">{money(f.grossRake, true)}</div></div></div>
        <div className="stat"><div className="stat-ico"><IcoPlayers /></div><div className="stat-body"><div className="stat-label">Buy-ins</div><div className="stat-value">{money(pot.buyIns, true)}</div><div className="stat-sub">{pot.seated} seated · {pot.cashedOut} cashed out</div></div></div>
        <div className="stat"><div className="stat-ico"><IcoCoins /></div><div className="stat-body"><div className="stat-label">Chips in play</div><div className="stat-value">{money(Math.max(pot.inPlay, 0), true)}</div><div className="stat-sub">buy-ins − cash-outs − rake</div></div></div>
        <div className="stat stat-green"><div className="stat-ico"><IcoCoins /></div><div className="stat-body"><div className="stat-label">Net so far</div><div className="stat-value">{money(f.netDistributable, true)}</div><div className="stat-sub">{f.expenses ? `after ${money(f.expenses, true)} expenses` : "no expenses yet"}</div></div></div>
      </div>

      <div className="grid grid-2-1 mt">
        <Card title={`Table (${att.length})`} actions={<button className="btn btn-sm" onClick={() => setDialog({ kind: "player" })}><IcoPlus /> Seat player (no buy-in)</button>}>
          {att.length ? att.map((a) => {
            const r = byPlayer.get(a.playerId);
            const out = r?.cashOut != null;
            return (
              <div key={a.playerId} className={`seat ${out ? "out" : ""}`}>
                <Initial name={name(a.playerId)} size={36} />
                <div>
                  <div className="seat-name">{name(a.playerId)}{a.notes ? <span className="faint"> · {a.notes}</span> : null}</div>
                  <div className="seat-sub">{r ? `${r.buyInCount} buy-in${r.buyInCount === 1 ? "" : "s"} · ${money(r.buyIns, true)} in` : "no buy-in recorded"}{out ? ` · ${money(r!.cashOut!, true)} out` : ""}</div>
                </div>
                <div className="seat-amts">
                  {out ? <div className={r!.net! >= 0 ? "net-pos" : "net-neg"}>{signedMoney(r!.net!)}</div> : <div className="muted">in play</div>}
                </div>
                <div className="seat-cashout" style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-sm" onClick={() => setDialog({ kind: "buyin", playerId: a.playerId })}>+ Buy-in</button>
                  {!out && <button className="btn btn-sm btn-primary" onClick={() => setDialog({ kind: "cashout", playerId: a.playerId })}>Cash out</button>}
                </div>
              </div>
            );
          }) : <p className="muted">No one seated yet. Tap “Buy-in / add player” to start.</p>}
          {pot.hasData && (
            <p className="rule" style={{ marginTop: 10 }}>
              Pot check: {money(pot.buyIns, true)} bought in, {money(pot.cashOuts, true)} cashed out, {money(pot.rake, true)} rake.
              {pot.seated === 0 ? (Math.abs(pot.unaccounted) < 0.5 ? " Everything accounted for." : ` ${signedMoney(pot.unaccounted)} unaccounted for.`) : ` ${money(Math.max(pot.inPlay, 0), true)} still on the table.`}
            </p>
          )}
        </Card>

        <div className="stack">
          <Card title="Rake" actions={<button className="btn btn-sm" onClick={() => setDialog({ kind: "rake" })}><IcoPlus /> Add</button>}>
            {rakeEntries.length ? rakeEntries.map((e) => <div key={e.id} className="money-row"><span>{e.originalText || "Rake"}</span><strong>{money(e.amount)}</strong><button className="remove" aria-label="Remove" onClick={() => dispatch({ type: "entry:remove", id: e.id })}>−</button></div>) : <p className="muted">Add rake as you take it, or once at the end.</p>}
          </Card>
          <Card title="Expenses" actions={<button className="btn btn-sm" onClick={() => setDialog({ kind: "expense" })}><IcoPlus /> Add</button>}>
            {expenseEntries.length ? expenseEntries.map((e) => <div key={e.id} className="money-row"><span>{e.originalText || CATEGORY_LABEL[e.category]}<span className="faint"> · {CATEGORY_LABEL[e.category]}</span></span><strong>{e.category === "adjustment" ? signedMoney(e.amount) : money(e.amount)}</strong><button className="remove" aria-label="Remove" onClick={() => dispatch({ type: "entry:remove", id: e.id })}>−</button></div>) : <p className="muted">Food, drinks, snacks, anything bought for the night.</p>}
          </Card>
          <Card title="Dealer" actions={<button className="btn btn-sm" onClick={() => setDialog({ kind: "dealer" })}><IcoPlus /> Add</button>}>
            {dealerEntries.length ? dealerEntries.map((e) => <div key={e.id} className="money-row"><span>{e.dealerName || "Dealer"}<span className="faint"> · {e.deductFromRake ? "from rake" : "tips"}</span></span><strong>{money(e.amount)}</strong><button className="remove" aria-label="Remove" onClick={() => dispatch({ type: "entry:remove", id: e.id })}>−</button></div>) : <p className="muted">No dealer recorded.</p>}
          </Card>
        </div>
      </div>

      {dialog?.kind === "buyin" && <BuyInModal gameId={game.id} playerId={dialog.playerId} onClose={() => setDialog(null)} />}
      {dialog?.kind === "cashout" && <CashOutModal gameId={game.id} playerId={dialog.playerId} onClose={() => setDialog(null)} />}
      {dialog?.kind === "rake" && <AmountModal title="Add rake" placeholder="Rake taken (AUD)" onClose={() => setDialog(null)} onSave={(amount, note) => { addEntry({ id: uid(), category: "rake", amount: String(amount), originalText: note || `$${amount}`, verification: "verified", deductFromRake: false, notes: "", dealerName: "", dealerPlayerId: null }); setDialog(null); }} />}
      {dialog?.kind === "expense" && <ExpenseModal onClose={() => setDialog(null)} onAdd={(e) => { addEntry(e); setDialog(null); }} />}
      {dialog?.kind === "dealer" && <DealerModal onClose={() => setDialog(null)} onAdd={(e) => { addEntry(e); }} />}
      {dialog?.kind === "player" && <AddPlayerModal players={db.players} onClose={() => setDialog(null)} onPick={(p) => { dispatch({ type: "attendance:add", attendance: { gameId: game.id, playerId: p.id } }); setDialog(null); }} onCreate={(p) => { dispatch({ type: "player:save", player: p }); dispatch({ type: "attendance:add", attendance: { gameId: game.id, playerId: p.id } }); setDialog(null); }} />}
      {dialog?.kind === "end" && (
        <ConfirmDialog title="End the game?" confirmLabel="End Game"
          message={<>Finish time will be set to <strong>{clockNow()}</strong>{pot.seated > 0 ? <>. <strong>{pot.seated} player{pot.seated === 1 ? " has" : "s have"} not cashed out</strong>, you can still add cash-outs afterwards from the game record.</> : "."} Rake so far {money(f.grossRake)}; you can adjust everything later.</>}
          onCancel={() => setDialog(null)} onConfirm={endGame} />
      )}
    </>
  );
}

/* ---------- small dialogs ---------- */

function AmountModal({ title, placeholder, onClose, onSave }: { title: string; placeholder: string; onClose: () => void; onSave: (amount: number, note: string) => void }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const ok = amount !== "" && !isNaN(Number(amount)) && Number(amount) >= 0;
  return (
    <Modal title={title} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!ok} onClick={() => onSave(Number(amount), note.trim())}>Save</button></>}>
      <div className="form-grid">
        <Field label="Amount (AUD)" className="span-4"><div className="input-money"><span>$</span><input className="input" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={placeholder} onKeyDown={(e) => { if (e.key === "Enter" && ok) onSave(Number(amount), note.trim()); }} /></div></Field>
        <Field label="Note (optional)" className="span-4"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. first hour" /></Field>
      </div>
    </Modal>
  );
}

function BuyInModal({ gameId, playerId, onClose }: { gameId: string; playerId?: string; onClose: () => void }) {
  const { db, dispatch } = useStore();
  const [pid, setPid] = useState(playerId ?? "");
  const [q, setQ] = useState("");
  const [amount, setAmount] = useState("");
  const [creating, setCreating] = useState(false);
  const seated = new Set(db.attendance.filter((a) => a.gameId === gameId).map((a) => a.playerId));
  const count = useMemo(() => { const m = new Map<string, number>(); for (const a of db.attendance) m.set(a.playerId, (m.get(a.playerId) ?? 0) + 1); return m; }, [db.attendance]);
  const list = useMemo(() => {
    const n = norm(q);
    return [...db.players].filter((p) => !n || norm(p.name).includes(n) || p.aliases.some((a) => norm(a).includes(n)))
      .sort((a, b) => Number(seated.has(b.id)) - Number(seated.has(a.id)) || (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0) || a.name.localeCompare(b.name)).slice(0, 12);
  }, [db.players, q, count]); // eslint-disable-line react-hooks/exhaustive-deps
  const ok = !!pid && amount !== "" && !isNaN(Number(amount)) && Number(amount) > 0;
  const save = () => {
    if (!seated.has(pid)) dispatch({ type: "attendance:add", attendance: { gameId, playerId: pid } });
    dispatch({ type: "tx:add", tx: { id: uid(), gameId, playerId: pid, kind: "buy_in", amount: Number(amount), at: new Date().toISOString() } });
    onClose();
  };
  const created = (p: Player) => { dispatch({ type: "player:save", player: p }); setPid(p.id); setCreating(false); };
  if (creating) return <AddPlayerModal initial={q} players={db.players} onClose={() => setCreating(false)} onPick={(p) => { setPid(p.id); setCreating(false); }} onCreate={created} />;
  return (
    <Modal title="Buy-in" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!ok} onClick={save}>Add buy-in</button></>}>
      {pid ? (
        <div className="seat" style={{ borderBottom: 0, paddingTop: 0 }}><Initial name={db.players.find((p) => p.id === pid)?.name ?? "?"} size={36} /><div className="seat-name">{db.players.find((p) => p.id === pid)?.name}</div><button className="btn btn-sm" onClick={() => setPid("")}>Change</button></div>
      ) : (
        <>
          <Search value={q} onChange={setQ} placeholder="Who is buying in?" />
          <div className="mini-list mt-sm" style={{ maxHeight: 240, overflow: "auto" }}>
            {list.map((p) => <button key={p.id} type="button" className="mini-btn" onClick={() => setPid(p.id)}><Initial name={p.name} />{p.name}{seated.has(p.id) && <span className="faint">seated</span>}</button>)}
            <button type="button" className="mini-btn" style={{ color: "var(--blue-bright)" }} onClick={() => setCreating(true)}><span className="ini" style={{ background: "transparent", color: "var(--blue-bright)" }}>+</span>New player{q.trim() ? ` “${q.trim()}”` : ""}</button>
          </div>
        </>
      )}
      <Field label="Buy-in amount (AUD)" className="mt-sm"><div className="input-money"><span>$</span><input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 100" onKeyDown={(e) => { if (e.key === "Enter" && ok) save(); }} /></div></Field>
    </Modal>
  );
}

function CashOutModal({ gameId, playerId, onClose }: { gameId: string; playerId: string; onClose: () => void }) {
  const { db, dispatch } = useStore();
  const [amount, setAmount] = useState("");
  const p = db.players.find((x) => x.id === playerId);
  const r = playerResults(db, gameId).find((x) => x.playerId === playerId);
  const ok = amount !== "" && !isNaN(Number(amount)) && Number(amount) >= 0;
  const save = () => { dispatch({ type: "tx:add", tx: { id: uid(), gameId, playerId, kind: "cash_out", amount: Number(amount), at: new Date().toISOString() } }); onClose(); };
  const net = ok && r ? Number(amount) - r.buyIns : null;
  return (
    <Modal title={`Cash out ${p?.name ?? ""}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!ok} onClick={save}>Cash out</button></>}>
      <p className="muted">Bought in {money(r?.buyIns ?? 0)} over {r?.buyInCount ?? 0} buy-in{(r?.buyInCount ?? 0) === 1 ? "" : "s"}.</p>
      <Field label="Chips cashed out (AUD)"><div className="input-money"><span>$</span><input className="input" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0 if busted" onKeyDown={(e) => { if (e.key === "Enter" && ok) save(); }} /></div></Field>
      {net != null && <p className={`rule ${net >= 0 ? "pos" : "neg"}`} style={{ marginTop: 8 }}>Result for the night: {signedMoney(net)}</p>}
    </Modal>
  );
}

export type { FinancialEntry };
