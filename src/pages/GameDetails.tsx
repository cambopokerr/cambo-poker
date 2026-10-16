import { Fragment, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { dealersFor, useStore } from "../data/store";
import { computeGame, distributionsFor, entriesFor } from "../lib/finance";
import { fmtDate, fmtHours, money, signedMoney } from "../lib/format";
import { CATEGORY_LABEL } from "../types";
import { Card, ConfirmDialog, Empty, Initial, Stat, StatusBadge, Tabs, VerifyBadge } from "../components/ui";
import { IcoChevron, IcoChip, IcoCoins, IcoDealer, IcoFood, IcoHome } from "../components/icons";

type Tab = "overview" | "players" | "financials" | "notes";

export default function GameDetails() {
  const { id } = useParams();
  const nav = useNavigate();
  const { db, dispatch } = useStore();
  const [confirm, setConfirm] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const game = db.games.find((g) => g.id === id);
  if (!game) return <Empty title="Game not found" action={<Link className="btn" to="/games">Back to games</Link>} />;

  const f = computeGame(db, game);
  const entries = entriesFor(db, game.id);
  const dists = distributionsFor(db, game.id);
  const att = db.attendance.filter((a) => a.gameId === game.id);
  const dealerList = dealersFor(db, game);
  const hostDealers = dealerList.filter((d) => d.playerId && db.players.find((x) => x.id === d.playerId)?.isHost);
  const dealer = dealerList.length ? dealerList.map((d) => d.name).join(hostDealers.length > 1 ? " & " : ", ") + (hostDealers.length > 1 ? " (alternating)" : "") : "–";
  const hosts = db.settings.hosts;
  const equal = hosts.every((h) => Math.abs((db.settings.split[h] ?? 0) - 1 / hosts.length) < 1e-6);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs"><Link to="/games">‹ Games</Link></div>
          <h1 style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>{fmtDate(game.date)} <StatusBadge status={f.status} /></h1>
          <div className="sub">
            {game.startTime || "start ?"}{game.finishTime ? ` – ${game.finishTime}` : ""} ({fmtHours(game.durationHours)}{game.durationSource === "computed" ? ", from times" : ""}) · {att.length} players · Dealer {dealer}
            {game.originalDateText && game.originalDateText !== game.date && <> · written as “{game.originalDateText}”</>}
          </div>
        </div>
        <div className="actions">
          {game.location && <span className="chip"><IcoHome style={{ width: 14, height: 14 }} /> {game.location}</span>}
          <Link className="btn" to={`/games/${game.id}/edit`}>Edit</Link>
          <button className="btn btn-danger" onClick={() => setConfirm(true)}>Delete</button>
        </div>
      </div>

      <Tabs value={tab} onChange={setTab} options={[{ value: "overview", label: "Overview" }, { value: "players", label: `Players (${att.length})` }, { value: "financials", label: "Financials" }, { value: "notes", label: "Notes" }]} />

      {f.reasons.length > 0 && tab !== "notes" && (
        <Card title="Needs review" className="stack-item" >
          <ul className="review-list">
            {f.reasons.map((r, i) => {
              const noteIdx = game.reviewNotes.indexOf(r);
              return (
                <li key={i}><span style={{ flex: 1 }}>{r}</span>
                  {noteIdx >= 0 && <button className="btn btn-sm" onClick={() => dispatch({ type: "game:resolveNote", id: game.id, index: noteIdx })}>Resolved</button>}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {tab === "overview" && (
        <>
          <div className="grid grid-stats mt">
            <Stat icon={<IcoChip />} label="Total rake" value={f.hasRake ? money(f.grossRake) : "?"} sub={f.adjustments ? `${signedMoney(f.adjustments)} adjustments` : undefined} />
            <Stat icon={<IcoFood />} label="Food & drinks" value={money(f.food + f.drinks)} sub={[f.food && `Food ${money(f.food)}`, f.drinks && `Drinks ${money(f.drinks)}`, f.otherExpense && `Other ${money(f.otherExpense)}`].filter(Boolean).join(" · ") || "none recorded"} />
            <Stat icon={<IcoDealer />} label="Dealer earnings" value={f.dealerEarnings ? money(f.dealerEarnings, true) : "–"} sub={f.dealerEarnings ? (f.dealerDeducted ? `${money(f.dealerDeducted)} from rake` : `Dealer ${dealer} · not from rake`) : undefined} />
            <Stat icon={<IcoCoins />} label="Net profit" value={f.hasRake ? money(f.netDistributable) : "–"} tone={f.status === "reconciled" ? "green" : "default"} />
            <Stat icon={<IcoCoins />} label={equal ? "Profit each" : "Shares"} value={f.hasRake ? (equal ? money(f.shares[hosts[0]]) : hosts.map((h) => `${h[0]} ${money(f.shares[h], true)}`).join(" · ")) : "–"} sub={f.recordedDistribution != null ? `Recorded split ${money(f.recordedDistribution)}` : "No split written in the note"} />
          </div>
          <div className="grid grid-2 mt">
            <Card title="Financial summary">
              <dl className="kv">
                <dt>Gross rake</dt><dd>{f.hasRake ? money(f.grossRake) : <span className="muted">not recorded</span>}</dd>
                <dt>Cash adjustments</dt><dd>{f.adjustments ? signedMoney(f.adjustments) : "–"}</dd>
                <dt>Food</dt><dd>{f.food ? money(f.food) : "–"}</dd>
                <dt>Drinks & snacks</dt><dd>{f.drinks ? money(f.drinks) : "–"}</dd>
                <dt>Other expenses</dt><dd>{f.otherExpense ? money(f.otherExpense) : "–"}</dd>
                <dt>Dealer paid from rake</dt><dd>{f.dealerDeducted ? money(f.dealerDeducted) : "–"}</dd>
                <dt><strong>Net distributable</strong></dt><dd><strong className={f.status === "reconciled" ? "pos" : ""}>{f.hasRake ? money(f.netDistributable) : "–"}</strong></dd>
                {hosts.map((h) => <Fragment key={h}><dt>{h} ({Math.round((db.settings.split[h] ?? 0) * 100)}%)</dt><dd>{f.hasRake ? money(f.shares[h]) : "–"}</dd></Fragment>)}
                <dt>Recorded split</dt><dd>{f.recordedDistribution == null ? <span className="muted">none written</span> : money(f.recordedDistribution)}</dd>
                {f.variance != null && <><dt>Variance</dt><dd className={Math.abs(f.variance) > db.settings.reconcileTolerance ? "neg" : "pos"}>{signedMoney(f.variance)}</dd></>}
              </dl>
              <p className="rule" style={{ marginTop: 12 }}><code>net = rake + adjustments − expenses − dealer paid from rake</code></p>
            </Card>
            <div className="stack">
            <Card title={`Dealer${dealerList.length === 1 ? "" : "(s)"}`} actions={<Link className="btn btn-sm" to={`/games/${game.id}/edit`}>Edit</Link>}>
              {dealerList.length ? (
                <div className="mini-list">
                  {dealerList.map((d, i) => (
                    <div key={i} className="mini-static">
                      <Initial name={d.name} />
                      <span>{d.name}{d.playerId && db.players.find((x) => x.id === d.playerId)?.isHost && <span className="faint"> · owner</span>}</span>
                      <span className="num">{d.amount == null ? <span className="faint">no amount</span> : money(d.amount)}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="muted">No dealer recorded.</p>}
            </Card>
            <Card title={`Players (${att.length})`} actions={<button className="btn btn-sm" onClick={() => setTab("players")}>Full list</button>}>
              <div className="chips">
                {att.map((a) => { const p = db.players.find((x) => x.id === a.playerId); return (
                  <Link key={a.playerId} to={`/players/${a.playerId}`} className={`chip ${p?.isHost ? "chip-host" : ""}`} title={a.notes}>{p?.name ?? "?"}{a.notes && <span className="faint"> · {a.notes}</span>}</Link>
                ); })}
                {!att.length && <span className="muted">No players recorded.</span>}
              </div>
            </Card>
            </div>
          </div>
        </>
      )}

      {tab === "players" && (
        <Card title={`Players (${att.length})`} className="mt" actions={<Link className="btn btn-sm" to={`/games/${game.id}/edit`}>Edit attendance</Link>}>
          <div className="table-wrap only-desktop"><table className="table">
            <thead><tr><th>Name</th><th>Arrival</th><th>Departure</th><th>Notes</th><th className="td-chev" /></tr></thead>
            <tbody>
              {att.map((a) => { const p = db.players.find((x) => x.id === a.playerId); return (
                <tr key={a.playerId} className="clickable" onClick={() => nav(`/players/${a.playerId}`)}>
                  <td><Initial name={p?.name ?? "?"} />{p?.name ?? "?"}{p?.isHost && <> <span className="badge badge-host badge-plain">Host</span></>}{game.dealerPlayerId === a.playerId && <> <span className="badge badge-neutral badge-plain">Dealer</span></>}</td>
                  <td className="muted">{a.arrival || game.startTime || "–"}</td>
                  <td className="muted">{a.departure || game.finishTime || "–"}</td>
                  <td className="muted">{a.notes ?? "–"}</td>
                  <td className="td-chev">›</td>
                </tr>
              ); })}
            </tbody>
          </table></div>
          <div className="list only-mobile">
            {att.map((a) => { const p = db.players.find((x) => x.id === a.playerId); return (
              <button key={a.playerId} type="button" className="list-row" onClick={() => nav(`/players/${a.playerId}`)}>
                <Initial name={p?.name ?? "?"} size={36} />
                <span className="list-main"><span className="list-title">{p?.name ?? "?"}</span><span className="list-sub">{a.notes ?? (p?.isHost ? "Host" : "")}</span></span>
                <IcoChevron className="chev" />
              </button>); })}
          </div>
        </Card>
      )}

      {tab === "financials" && (
        <div className="grid grid-2 mt">
          <Card title="Financial entries" actions={<span className="muted" style={{ fontSize: 13 }}>Click a badge to toggle verification</span>}>
            {entries.length ? (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Category</th><th className="num">Amount</th><th>Original text</th><th>Status</th></tr></thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id}>
                      <td>{CATEGORY_LABEL[e.category]}{e.category === "dealer_earnings" && <div className="faint" style={{ fontSize: 12 }}>{e.deductFromRake ? "paid from rake" : "tips, not deducted"}</div>}</td>
                      <td className="num">{e.amount == null ? <span className="neg">?</span> : e.category === "adjustment" ? signedMoney(e.amount) : money(e.amount)}</td>
                      <td><span className="mono">{e.originalText}</span>{e.notes && <div className="faint" style={{ fontSize: 12 }}>{e.notes}</div>}</td>
                      <td><VerifyBadge v={e.verification} onToggle={() => dispatch({ type: "entry:verify", id: e.id, verification: e.verification === "verified" ? "needs_review" : "verified" })} /></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            ) : <p className="muted">No financial entries.</p>}
          </Card>
          <Card title="Recorded profit distribution">
            {dists.length ? (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Recipient</th><th className="num">Amount</th><th>Original text</th><th>Status</th></tr></thead>
                <tbody>
                  {dists.map((d) => (
                    <tr key={d.id}>
                      <td>{d.recipient}{d.type === "pooled_total" && <div className="faint" style={{ fontSize: 12 }}>total before split</div>}</td>
                      <td className="num">{money(d.amount)}</td>
                      <td><span className="mono">{d.originalText}</span>{d.notes && <div className="faint" style={{ fontSize: 12 }}>{d.notes}</div>}</td>
                      <td><VerifyBadge v={d.verification} onToggle={() => dispatch({ type: "distribution:verify", id: d.id, verification: d.verification === "verified" ? "needs_review" : "verified" })} /></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            ) : <p className="muted">The note did not say how the profit was split. The shares on the Overview tab are calculated, not recorded.</p>}
          </Card>
        </div>
      )}

      {tab === "notes" && (
        <div className="grid grid-2 mt">
          <Card title="Notes">{game.notes ? <p style={{ whiteSpace: "pre-wrap" }}>{game.notes}</p> : <p className="muted">No notes.</p>}
            {game.reviewNotes.length > 0 && <><h3 style={{ margin: "14px 0 8px" }}>Open questions</h3><ul className="review-list">{game.reviewNotes.map((r, i) => <li key={i}><span style={{ flex: 1 }}>{r}</span><button className="btn btn-sm" onClick={() => dispatch({ type: "game:resolveNote", id: game.id, index: i })}>Resolved</button></li>)}</ul></>}
          </Card>
          <Card title="Original note (as imported)">{game.sourceText ? <pre className="source">{game.sourceText}</pre> : <p className="muted">This game was created in the app, not imported.</p>}</Card>
        </div>
      )}

      {confirm && (
        <ConfirmDialog title="Delete this game?" message={<>This removes the game, its attendance, financial entries and distributions for <strong>{fmtDate(game.date)}</strong>. This cannot be undone.</>}
          onCancel={() => setConfirm(false)} onConfirm={() => { dispatch({ type: "game:delete", id: game.id }); nav("/games"); }} />
      )}
    </>
  );
}
