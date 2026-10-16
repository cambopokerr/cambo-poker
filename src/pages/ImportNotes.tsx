import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../data/store";
import { AiError, parseGameNote, type GameDraft } from "../lib/ai";
import { money } from "../lib/format";
import { findPlayerByName } from "../lib/names";
import { CATEGORY_LABEL } from "../types";
import { Card } from "../components/ui";

/**
 * Paste a hand-written game note; Claude proposes a structured game; the person reviews it here,
 * then finishes in the normal New Game form (where every field can still be changed) before anything is saved.
 */
export default function ImportNotes() {
  const { db } = useStore();
  const nav = useNavigate();
  const key = db.settings.anthropicApiKey?.trim() ?? "";
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<GameDraft | null>(null);

  const read = async () => {
    setError(null); setDraft(null); setBusy(true);
    try {
      setDraft(await parseGameNote(note.trim(), key, db.players, db.settings.hosts));
    } catch (e) {
      setError(e instanceof AiError ? e.message : "Something went wrong reading the note. Try again.");
    } finally { setBusy(false); }
  };

  const open = () => { if (draft) nav("/games/new", { state: { draft } }); };
  const amt = (n: number | null, text: string) => (n == null ? <span className="neg">? {text && <span className="faint">({text})</span>}</span> : <>{money(n)}{text && text !== `$${n}` ? <span className="faint"> · {text}</span> : null}</>);

  return (
    <div className="wizard">
      <div className="wizard-head">
        <Link to="/games" className="icon-btn" aria-label="Back">‹</Link>
        <h1 style={{ fontSize: 22 }}>Paste a note</h1>
        <span />
      </div>

      {!key && (
        <Card><p style={{ margin: 0 }}>The AI reader is not set up yet. Add the Anthropic API key under <Link to="/settings">Settings</Link>, then come back here.</p></Card>
      )}

      <Card title="The night's note">
        <textarea className="paste-area" value={note} onChange={(e) => setNote(e.target.value)} placeholder={"Poker 7pm - 20/03\nEthan\nHarry\nKailob\nFredo (coming 9pm)\n\n$775 rake, -107 food"} disabled={busy} />
        <p className="rule" style={{ marginTop: 10 }}>Paste it exactly as written. Claude reads it the same way the 28 original notes were read: nothing gets invented, and anything unclear becomes an open question for you to check.</p>
        <div className="card-actions" style={{ marginTop: 10, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-primary" disabled={!key || busy || note.trim().length < 5} onClick={() => void read()}>{busy ? "Reading…" : draft ? "Read again" : "Read with AI"}</button>
        </div>
        {error && <p className="error" style={{ marginTop: 10 }}>{error}</p>}
      </Card>

      {draft && (
        <>
          <Card title="What the AI read">
            <dl className="draft-grid" style={{ margin: 0 }}>
              <div><dt>Date</dt><dd>{draft.date ?? <span className="neg">unknown</span>}{draft.dateAsWritten && <span className="faint"> · written “{draft.dateAsWritten}”</span>}</dd></div>
              <div><dt>Time</dt><dd>{draft.startTime || "–"}{draft.finishTime ? ` to ${draft.finishTime}` : ""}{draft.hours != null ? ` · ${draft.hours} h` : ""}</dd></div>
              <div><dt>Rake</dt><dd>{amt(draft.rake.amount, draft.rake.asWritten)}{!draft.rake.verified && draft.rake.amount != null && <span className="badge badge-needs_review" style={{ marginLeft: 8 }}>check</span>}</dd></div>
              {draft.location && <div><dt>Location</dt><dd>{draft.location}</dd></div>}
            </dl>
          </Card>

          <Card title={`Players (${draft.players.length})`}>
            {draft.players.length ? (
              <div className="chips">
                {draft.players.map((p, i) => {
                  const known = findPlayerByName(db.players, p.name);
                  return <span key={i} className={`badge badge-plain ${known ? "" : "badge-new"}`} title={known ? "Existing player" : "Will be added as a new player"}>{p.name}{p.note && <span className="faint"> · {p.note}</span>}{!known && <span className="faint"> · new</span>}</span>;
                })}
              </div>
            ) : <p className="muted">No players found in the note.</p>}
          </Card>

          <Card title="Money">
            <div className="line-list">
              {draft.expenses.map((e, i) => <div key={`e${i}`} className="line-row"><span /><div>{CATEGORY_LABEL[e.category]}{!e.verified && <span className="faint"> · needs review</span>}</div><div className="num">{amt(e.amount, e.asWritten)}</div></div>)}
              {draft.dealers.map((d, i) => <div key={`d${i}`} className="line-row"><span /><div>Dealer: {d.name}<span className="faint"> · {d.paidFromRake ? "paid from rake" : "tips, not deducted"}</span></div><div className="num">{amt(d.amount, d.asWritten)}</div></div>)}
              {draft.payouts.map((p, i) => <div key={`p${i}`} className="line-row"><span /><div>{p.recipient === "pooled" ? "Hosts (pooled total)" : `${p.recipient} received`}{!p.verified && <span className="faint"> · needs review</span>}</div><div className="num">{amt(p.amount, p.asWritten)}</div></div>)}
              {draft.transactions.map((t, i) => <div key={`t${i}`} className="line-row"><span /><div>{t.player}<span className="faint"> · {t.kind === "cash_out" ? "cash out" : t.kind === "rebuy" ? "rebuy" : "buy-in"}</span></div><div className="num">{money(t.amount)}</div></div>)}
              {!draft.expenses.length && !draft.dealers.length && !draft.payouts.length && !draft.transactions.length && <p className="muted" style={{ margin: 0 }}>Only the rake was written. No expenses, dealer or payouts found.</p>}
            </div>
          </Card>

          <Card title={`Open questions (${draft.openQuestions.length})`}>
            {draft.openQuestions.length ? <ul className="review-list">{draft.openQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul> : <p className="muted">Nothing flagged. Still check the figures against the note before saving.</p>}
          </Card>

          <div className="wizard-foot">
            <button type="button" className="btn btn-lg" onClick={() => setDraft(null)}>Discard</button>
            <button type="button" className="btn btn-primary btn-lg" onClick={open}>Check in the form</button>
          </div>
        </>
      )}
    </div>
  );
}
