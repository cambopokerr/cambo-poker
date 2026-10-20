import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../data/store";
import { computeGame, distributionsFor, entriesFor } from "../lib/finance";
import { fmtDate, fmtHours, money } from "../lib/format";
import { CATEGORY_LABEL, type Game } from "../types";
import { Card, StatusBadge } from "../components/ui";
import { IcoChevron } from "../components/icons";

/**
 * Everything that still needs a human decision, one card per game, with the original note beside it.
 * Resolving a question or ticking a figure as verified saves straight away.
 */
export default function Review() {
  const { db } = useStore();
  const games = useMemo(() => db.games
    .filter((g) => g.status !== "live")
    .map((g) => ({ g, f: computeGame(db, g) }))
    .filter(({ g, f }) => f.status === "needs_review" || f.status === "incomplete" || g.reviewNotes.length)
    .sort((a, b) => (a.g.date ?? "9999").localeCompare(b.g.date ?? "9999")), [db]);
  const [openId, setOpenId] = useState<string | null>(games[0]?.g.id ?? null);
  const total = games.reduce((s, { g }) => s + g.reviewNotes.length + entriesFor(db, g.id).filter((e) => e.verification !== "verified" || e.amount == null).length + distributionsFor(db, g.id).filter((d) => d.verification !== "verified").length, 0);

  return (
    <div className="wizard" style={{ maxWidth: 960 }}>
      <div className="wizard-head">
        <Link to="/" className="icon-btn" aria-label="Back">‹</Link>
        <h1 style={{ fontSize: 22 }}>Needs review</h1>
        <span />
      </div>
      <Card>
        {games.length
          ? <p style={{ margin: 0 }}><strong>{total} item{total === 1 ? "" : "s"} across {games.length} game{games.length === 1 ? "" : "s"}.</strong> Each card shows the note exactly as written next to what the app made of it. Press <em>Resolved</em> on a question once you are happy, or <em>Verified</em> on a figure. To change a number, open <em>Edit</em>.</p>
          : <p style={{ margin: 0 }}>Nothing to review. Every game is complete.</p>}
      </Card>
      {games.map(({ g, f }) => <ReviewCard key={g.id} game={g} status={f.status} open={openId === g.id} onToggle={() => setOpenId(openId === g.id ? null : g.id)} />)}
    </div>
  );
}

function ReviewCard({ game, status, open, onToggle }: { game: Game; status: ReturnType<typeof computeGame>["status"]; open: boolean; onToggle: () => void }) {
  const { db, dispatch } = useStore();
  const entries = entriesFor(db, game.id);
  const dists = distributionsFor(db, game.id);
  const flagged = entries.filter((e) => e.verification !== "verified" || e.amount == null);
  const flaggedD = dists.filter((d) => d.verification !== "verified");
  const count = game.reviewNotes.length + flagged.length + flaggedD.length;
  const name = (pid: string | null | undefined) => (pid ? db.players.find((p) => p.id === pid)?.name ?? "" : "");

  return (
    <Card>
      <button type="button" className="review-head" onClick={onToggle} aria-expanded={open}>
        <div>
          <strong>{game.date ? fmtDate(game.date) : "No date"}</strong>
          <span className="faint"> · written “{game.originalDateText || "no date"}”{game.startTime ? ` · ${game.startTime}${game.finishTime ? ` to ${game.finishTime}` : ""}` : ""}{game.durationHours != null ? ` · ${fmtHours(game.durationHours)}` : ""}</span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span className="badge badge-needs_review">{count} to check</span>
          <StatusBadge status={status} />
          <IcoChevron className="chev" style={{ transform: open ? "rotate(90deg)" : undefined }} />
        </div>
      </button>

      {open && (
        <div className="review-body">
          <div>
            <div className="field-label" style={{ marginBottom: 6 }}>Original note</div>
            {game.sourceText ? <pre className="source" style={{ maxHeight: 420 }}>{game.sourceText}</pre> : <p className="muted">Created in the app, no note.</p>}
            <div className="card-actions" style={{ marginTop: 10 }}>
              <Link className="btn btn-sm" to={`/games/${game.id}`}>Open game</Link>
              <Link className="btn btn-sm btn-primary" to={`/games/${game.id}/edit`}>Edit</Link>
            </div>
          </div>
          <div className="stack">
            {game.reviewNotes.length > 0 && (
              <div>
                <div className="field-label" style={{ marginBottom: 6 }}>Open questions</div>
                <ul className="review-list">
                  {game.reviewNotes.map((q, i) => <li key={i}><span style={{ flex: 1 }}>{q}</span><button className="btn btn-sm" onClick={() => dispatch({ type: "game:resolveNote", id: game.id, index: i })}>Resolved</button></li>)}
                </ul>
              </div>
            )}
            {(flagged.length > 0 || flaggedD.length > 0) && (
              <div>
                <div className="field-label" style={{ marginBottom: 6 }}>Figures to confirm</div>
                <div className="line-list">
                  {flagged.map((e) => (
                    <div key={e.id} className="line-row review-row">
                      <span />
                      <div><div>{CATEGORY_LABEL[e.category]}{e.category === "dealer_earnings" && (e.dealerName || name(e.dealerPlayerId)) ? ` · ${e.dealerName || name(e.dealerPlayerId)}` : ""}</div><div className="faint" style={{ fontSize: 12 }}>written “{e.originalText || "nothing"}”{e.notes ? ` · ${e.notes}` : ""}</div></div>
                      <div className="num">{e.amount == null ? <span className="neg">?</span> : money(e.amount)}</div>
                      {e.amount == null
                        ? <Link className="btn btn-sm" to="/games/missing">Fill in</Link>
                        : <button className="btn btn-sm" onClick={() => dispatch({ type: "entry:verify", id: e.id, verification: "verified" })}>Verified</button>}
                    </div>
                  ))}
                  {flaggedD.map((d) => (
                    <div key={d.id} className="line-row review-row">
                      <span />
                      <div><div>{d.type === "pooled_total" ? "Split total" : `${d.recipient} received`}</div><div className="faint" style={{ fontSize: 12 }}>written “{d.originalText || "nothing"}”{d.notes ? ` · ${d.notes}` : ""}</div></div>
                      <div className="num">{d.amount == null ? <span className="neg">?</span> : money(d.amount)}</div>
                      <button className="btn btn-sm" onClick={() => dispatch({ type: "distribution:verify", id: d.id, verification: "verified" })}>Verified</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <div className="field-label" style={{ marginBottom: 6 }}>What the app has</div>
              <dl className="kv">
                <dt>Players</dt><dd style={{ textAlign: "left" }}>{db.attendance.filter((a) => a.gameId === game.id).map((a) => name(a.playerId) + (a.notes ? ` (${a.notes})` : "")).join(", ") || "none"}</dd>
                {entries.map((e) => <EntryLine key={e.id} label={CATEGORY_LABEL[e.category] + (e.category === "dealer_earnings" ? ` · ${e.dealerName || name(e.dealerPlayerId) || "dealer"}${e.deductFromRake ? " (from rake)" : " (tips)"}` : "")} amount={e.amount} />)}
                {dists.map((d) => <EntryLine key={d.id} label={d.type === "pooled_total" ? "Recorded split total" : `${d.recipient} received`} amount={d.amount} />)}
                {game.notes && <><dt>Notes</dt><dd style={{ textAlign: "left" }}>{game.notes}</dd></>}
              </dl>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function EntryLine({ label, amount }: { label: string; amount: number | null }) {
  return <><dt>{label}</dt><dd>{amount == null ? <span className="neg">?</span> : money(amount)}</dd></>;
}
