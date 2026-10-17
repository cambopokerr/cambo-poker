import { Fragment, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { dealersFor, useStore } from "../data/store";
import { computeGame, distributionsFor, entriesFor, hourly, playerResults, potCheck } from "../lib/finance";
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
  const results = new Map(playerResults(db, game.id).map((r) => [r.playerId, r]));
  const pot = potCheck(db, game.id);
  const entries = entriesFor(db, game.id);
  const dists = distributionsFor(db, game.id);
  const att = db.attendance.filter((a) => a.gameId === game.id);
  const dealerList = dealersFor(db, game);
  const hostDealers = dealerList.filter((d) => d.playerId && db.players.find((x) => x.id === d.playerId)?.isHost);
  const dealer = dealerList.length ? dealerList.map((d) => d.name).join(hostDealers.length > 1 ? " & " : ", ") + (hostDealers.length > 1 ? " (alternating)" : "") : "–";
  const hosts = db.settings.hosts;
  const hr = hourly(db, game, f);
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

      {game.status === "live" && <div className="live-banner"><div><strong>This game is in progress.</strong> <span className="muted">Add players, buy-ins, rake and expenses from the live dashboard.</span></div><Link className="btn btn-primary" to={`/games/${game.id}/live`}>Open live game</Link></div>}
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
            <Card title="Per hour" actions={<Link className="btn btn-sm" to={`/games/${game.id}/edit`}>Edit</Link>}>
              {hr ? (
                <>
                  <dl className="kv">
                    <dt>Night length</dt><dd>{fmtHours(hr.hours)}{hr.source === "computed" ? <span className="faint"> · from start and finish</span> : null}</dd>
                    <dt><strong>Profit per hour</strong></dt><dd><strong>{money(hr.netPerHour)}</strong></dd>
                    {hosts.map((h) => <Fragment key={h}><dt>{h} per hour</dt><dd>{money(hr.perHost[h].perHour)}<span className="faint"> · dealt {fmtHours(hr.perHost[h].hoursDealt)}{hr.perHost[h].tips ? ` · tips ${money(hr.perHost[h].tipsPerHour)}/h` : ""}</span></dd></Fragment>)}
                  </dl>
                  <p className="rule" style={{ marginTop: 10 }}>{hr.custom ? "Dealing hours were set by hand for this night." : "Hosts alternate one hour on, one off, so each is credited half the night. Edit the game to change."}</p>
                </>
              ) : <p className="muted" style={{ margin: 0 }}>{game.status === "live" ? "Available once the game ends." : !f.hasRake ? "Needs a rake figure." : "No finish time or hours recorded, so this night is left out of hourly averages. Add a finish time to include it."}</p>}
            </Card>
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
            <thead><tr><th>Name</th><th>Arrival</th><th>Departure</th><th className="num">Buy-ins</th><th className="num">Cash-out</th><th className="num">Result</th><th>Notes</th><th className="td-chev" /></tr></thead>
            <tbody>
              {att.map((a) => { const p = db.players.find((x) => x.id === a.playerId); return (
                <tr key={a.playerId} className="clickable" onClick={() => nav(`/players/${a.playerId}`)}>
                  <td><Initial name={p?.name ?? "?"} />{p?.name ?? "?"}{p?.isHost && <> <span className="badge badge-host badge-plain">Host</span></>}{game.dealerPlayerId === a.playerId && <> <span className="badge badge-neutral badge-plain">Dealer</span></>}</td>
                  <td className="muted">{a.arrival || game.startTime || "–"}</td>
                  <td className="muted">{a.departure || game.finishTime || "–"}</td>
                  <td className="num">{results.get(a.playerId)?.buyIns ? <>{money(results.get(a.playerId)!.buyIns, true)}{results.get(a.playerId)!.rebuyCount ? <span className="faint"> · {results.get(a.playerId)!.rebuyCount} rebuy{results.get(a.playerId)!.rebuyCount === 1 ? "" : "s"}</span> : null}</> : <span className="faint">–</span>}</td>
                  <td className="num">{results.get(a.playerId)?.cashOut != null ? money(results.get(a.playerId)!.cashOut!, true) : <span className="faint">–</span>}</td>
                  <td className={`num ${results.get(a.playerId)?.net == null ? "" : results.get(a.playerId)!.net! >= 0 ? "pos" : "neg"}`}>{results.get(a.playerId)?.net == null ? <span className="faint">–</span> : signedMoney(results.get(a.playerId)!.net!)}</td>
                  <td className="muted">{a.notes ?? "–"}</td>
                  <td className="td-chev">›</td>
                </tr>
              ); })}
            </tbody>
          </table></div>
          {pot.hasData && <p className="rule" style={{ marginTop: 10 }}>Pot check: {money(pot.buyIns, true)} bought in · {money(pot.cashOuts, true)} cashed out · {money(pot.rake, true)} rake · {Math.abs(pot.unaccounted) < 0.5 && pot.seated === 0 ? "all accounted for" : `${signedMoney(pot.unaccounted)} unaccounted${pot.seated ? ` (${pot.seated} not cashed out)` : ""}`}.</p>}
          <div className="list only-mobile">
            {att.map((a) => { const p = db.players.find((x) => x.id === a.playerId); const r = results.get(a.playerId); return (
              <button key={a.playerId} type="button" className="list-row" onClick={() => nav(`/players/${a.playerId}`)}>
                <Initial name={p?.name ?? "?"} size={36} />
                <span className="list-main"><span className="list-title">{p?.name ?? "?"}</span><span className="list-sub">{r ? `${money(r.buyIns, true)} in${r.rebuyCount ? ` (${r.rebuyCount} rebuy${r.rebuyCount === 1 ? "" : "s"})` : ""}${r.cashOut != null ? ` · ${money(r.cashOut, true)} out` : ""}` : (a.notes ?? (p?.isHost ? "Host" : ""))}</span></span>
                {r?.net != null && <span className={`list-amt ${r.net >= 0 ? "pos" : "neg"}`}>{signedMoney(r.net)}</span>}
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
