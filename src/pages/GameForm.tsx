import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useStore } from "../data/store";
import { durationFromTimes, parseClock } from "../lib/finance";
import { money, todayISO, uid } from "../lib/format";
import { findPlayerByName, norm } from "../lib/names";
import type { GameDraft } from "../lib/ai";
import type { Attendance, Category, Distribution, FinancialEntry, Game, Player, Verification } from "../types";
import { CATEGORY_LABEL } from "../types";
import { Card, Field, Initial, Modal, Search } from "../components/ui";
import { IcoChevron, IcoPlus } from "../components/icons";

export interface EntryDraft { id: string; category: Category; amount: string; originalText: string; verification: Verification; deductFromRake: boolean; notes: string; dealerName: string; dealerPlayerId: string | null }
interface DistDraft { id: string; recipient: string; amount: string; originalText: string; verification: Verification; pooled: boolean }
interface AttDraft { playerId: string; notes: string }
type Step = 1 | 2 | 3;
const EXPENSE_CATS: Category[] = ["food", "drinks", "other_expense", "adjustment"];

export default function GameForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const { db, dispatch } = useStore();
  const existing = id ? db.games.find((g) => g.id === id) : undefined;
  const editing = !!existing;
  const hosts = db.settings.hosts;
  const [qs] = useSearchParams();
  const qDealers: Array<{ type: "host" | "other"; name: string; amount: string }> = (() => {
    try { const raw = qs.get("dealers"); return raw ? JSON.parse(raw) : []; } catch { return []; }
  })();

  // A draft proposed by the AI note reader (Paste a note). Every field below starts from it but stays editable.
  const draft = !existing ? (useLocation().state as { draft?: GameDraft } | null)?.draft : undefined;
  const resolved = useMemo(() => {
    if (!draft) return null;
    const att: AttDraft[] = []; const created: Player[] = [];
    for (const p of draft.players) {
      let pl = findPlayerByName(db.players, p.name) ?? created.find((c) => norm(c.name) === norm(p.name));
      if (!pl) { pl = { id: `p-${uid()}`, name: p.name, aliases: [], notes: "", isHost: false }; created.push(pl); }
      if (!att.some((a) => a.playerId === pl!.id)) att.push({ playerId: pl.id, notes: p.note });
    }
    return { att, created };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [step, setStep] = useState<Step>(1);
  // --- step 1 ---
  const [date, setDate] = useState(draft ? draft.date ?? todayISO() : existing?.date ?? todayISO());
  const [noDate, setNoDate] = useState(draft ? draft.date == null : existing ? existing.date == null : false);
  const [odt, setOdt] = useState(draft?.dateAsWritten ?? existing?.originalDateText ?? "");
  const [start, setStart] = useState(draft?.startTime ?? existing?.startTime ?? "");
  const [finish, setFinish] = useState(draft?.finishTime ?? existing?.finishTime ?? "");
  const [hours, setHours] = useState(draft ? (draft.hours != null ? String(draft.hours) : "") : existing?.durationSource === "recorded" && existing.durationHours != null ? String(existing.durationHours) : "");
  const [location, setLocation] = useState(draft ? draft.location ?? "" : existing ? existing.location ?? "" : "Home game");
  const [notes, setNotes] = useState(draft?.notes ?? existing?.notes ?? "");
  const [dealSplit, setDealSplit] = useState<"half" | "custom">(existing?.dealingHours ? "custom" : "half");
  const [dealHours, setDealHours] = useState<Record<string, string>>(() => Object.fromEntries(hosts.map((h) => [h, existing?.dealingHours?.[h] != null ? String(existing.dealingHours[h]) : ""])));
  // --- step 2 ---
  const [att, setAtt] = useState<AttDraft[]>(() => resolved?.att ?? db.attendance.filter((a) => a.gameId === id).map((a) => ({ playerId: a.playerId, notes: a.notes ?? "" })));
  const [newPlayers, setNewPlayers] = useState<Player[]>(resolved?.created ?? []);
  const [pq, setPq] = useState("");
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [addPlayerOpen, setAddPlayerOpen] = useState(false);
  // --- step 3 ---
  const existingEntries = db.entries.filter((e) => e.gameId === id);
  const rakeExisting = existingEntries.find((e) => e.category === "rake");
  const [rake, setRake] = useState(draft ? (draft.rake.amount == null ? "" : String(draft.rake.amount)) : rakeExisting?.amount == null ? "" : String(rakeExisting.amount));
  const [rakeText, setRakeText] = useState(draft?.rake.asWritten ?? rakeExisting?.originalText ?? "");
  const [rakeVerified, setRakeVerified] = useState(draft ? draft.rake.verified : rakeExisting ? rakeExisting.verification === "verified" : true);
  const [entries, setEntries] = useState<EntryDraft[]>(() => {
    if (draft) {
      const hostsP = db.players.filter((p) => p.isHost);
      const alternating = draft.dealers.filter((d) => d.isHost).length > 1;
      return [
        ...draft.expenses.map((e): EntryDraft => ({ id: uid(), category: e.category, amount: e.amount == null ? "" : String(e.amount), originalText: e.asWritten, verification: e.verified ? "verified" : "needs_review", deductFromRake: false, notes: "", dealerName: "", dealerPlayerId: null })),
        ...draft.dealers.map((d): EntryDraft => { const host = findPlayerByName(hostsP, d.name); return { id: uid(), category: "dealer_earnings", amount: d.amount == null ? "" : String(d.amount), originalText: d.asWritten, verification: "verified", deductFromRake: d.paidFromRake, notes: alternating && host ? "Alternating" : "", dealerName: host?.name ?? d.name, dealerPlayerId: host?.id ?? null }; }),
      ];
    }
    const base = existingEntries.filter((e) => e.category !== "rake").map((e) => ({ id: e.id, category: e.category, amount: e.amount == null ? "" : String(e.amount), originalText: e.originalText, verification: e.verification, deductFromRake: !!e.deductFromRake, notes: e.notes ?? "", dealerName: e.dealerName ?? (e.category === "dealer_earnings" ? (existing?.dealerName ?? "") : ""), dealerPlayerId: e.dealerPlayerId ?? (e.category === "dealer_earnings" ? existing?.dealerPlayerId ?? null : null) }));
    if (!existing) {
      for (const d of qDealers) {
        const host = d.type === "host" ? db.players.find((p) => p.isHost && p.name === d.name) : undefined;
        base.push({ id: uid(), category: "dealer_earnings", amount: d.amount ?? "", originalText: d.amount ? `$${d.amount}` : "", verification: "verified", deductFromRake: db.settings.dealerPaidFromRakeByDefault, notes: qDealers.filter((x) => x.type === "host").length > 1 && d.type === "host" ? "Alternating" : "", dealerName: host?.name ?? d.name, dealerPlayerId: host?.id ?? null });
      }
    }
    return base;
  });
  const [dists, setDists] = useState<DistDraft[]>(() => draft
    ? draft.payouts.map((p) => ({ id: uid(), recipient: p.recipient === "pooled" ? "Hosts (pooled)" : (hosts.find((h) => norm(h) === norm(p.recipient)) ?? p.recipient), amount: p.amount == null ? "" : String(p.amount), originalText: p.asWritten, verification: (p.verified ? "verified" : "needs_review") as Verification, pooled: p.recipient === "pooled" }))
    : db.distributions.filter((d) => d.gameId === id).map((d) => ({ id: d.id, recipient: d.recipient, amount: d.amount == null ? "" : String(d.amount), originalText: d.originalText, verification: d.verification, pooled: d.type === "pooled_total" })));
  const [showSplit, setShowSplit] = useState(dists.length > 0);
  const [reviewNotes, setReviewNotes] = useState<string[]>(draft?.openQuestions ?? existing?.reviewNotes ?? []);
  const [expenseModal, setExpenseModal] = useState(false);
  const [dealerModal, setDealerModal] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const allPlayers = useMemo(() => [...db.players, ...newPlayers].sort((a, b) => a.name.localeCompare(b.name)), [db.players, newPlayers]);
  const nameOf = (pid: string) => allPlayers.find((p) => p.id === pid)?.name ?? "?";
  const checked = new Set(att.map((a) => a.playerId));
  const visiblePlayers = useMemo(() => {
    const q = norm(pq);
    const list = allPlayers.filter((p) => !q || norm(p.name).includes(q) || p.aliases.some((a) => norm(a).includes(q)));
    // checked first, then by how often they come
    const count = new Map<string, number>();
    for (const a of db.attendance) count.set(a.playerId, (count.get(a.playerId) ?? 0) + 1);
    return list.sort((a, b) => Number(checked.has(b.id)) - Number(checked.has(a.id)) || (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0) || a.name.localeCompare(b.name));
  }, [allPlayers, pq, att, db.attendance]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (pid: string) => setAtt((xs) => (xs.some((a) => a.playerId === pid) ? xs.filter((a) => a.playerId !== pid) : [...xs, { playerId: pid, notes: "" }]));
  const addNewPlayer = (p: Player) => { setNewPlayers((xs) => [...xs, p]); setAtt((xs) => [...xs, { playerId: p.id, notes: "" }]); setPq(""); };

  const computed = start && finish ? durationFromTimes(start, finish) : null;
  const expenses = entries.filter((e) => e.category !== "dealer_earnings");
  const dealers = entries.filter((e) => e.category === "dealer_earnings");
  const sum = (xs: EntryDraft[]) => xs.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const netPreview = (Number(rake) || 0) - sum(expenses.filter((e) => e.category !== "adjustment")) + sum(expenses.filter((e) => e.category === "adjustment")) - sum(dealers.filter((e) => e.deductFromRake));

  const validateStep = (s: Step): string[] => {
    const errs: string[] = [];
    if (s === 1) {
      if (!noDate && !/^\d{4}-\d{2}-\d{2}$/.test(date)) errs.push("Enter a valid date, or tick “date unknown”.");
      if (noDate && !odt.trim()) errs.push("If the date is unknown, write how it appeared in the note.");
      if (start && parseClock(start) == null) errs.push("Start time must look like 5pm or 5:20pm.");
      if (finish && parseClock(finish) == null) errs.push("Finish time must look like 12:30am.");
      if (hours && (isNaN(Number(hours)) || Number(hours) <= 0)) errs.push("Hours must be a positive number.");
      if (dealSplit === "custom") for (const h of hosts) { const v = dealHours[h] ?? ""; if (v !== "" && (isNaN(Number(v)) || Number(v) < 0)) errs.push(`${h}'s dealing hours must be 0 or more.`); }
    }
    if (s === 3) {
      if (rake !== "" && (isNaN(Number(rake)) || Number(rake) < 0)) errs.push("Rake must be a number of 0 or more.");
      for (const e of entries) if (e.amount !== "" && isNaN(Number(e.amount))) errs.push(`Amount “${e.amount}” is not a number.`);
      for (const d of dists) if (d.amount !== "" && isNaN(Number(d.amount))) errs.push(`Split amount “${d.amount}” is not a number.`);
    }
    return errs;
  };
  const next = () => { const errs = validateStep(step); setErrors(errs); if (!errs.length) { setStep((s) => (s + 1) as Step); window.scrollTo({ top: 0 }); } };
  const back = () => { setErrors([]); setStep((s) => (s - 1) as Step); window.scrollTo({ top: 0 }); };

  const save = () => {
    const errs = [...validateStep(1), ...validateStep(3)];
    setErrors(errs);
    if (errs.length) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    const gid = existing?.id ?? `g-${uid()}`;
    const recHours = hours ? Number(hours) : null;
    const primaryDealer = dealers[0];
    const game: Game = {
      id: gid, date: noDate ? null : date, originalDateText: odt.trim() || (noDate ? "" : date),
      startTime: start.trim(), finishTime: finish.trim(),
      durationHours: recHours ?? computed, durationSource: recHours != null ? "recorded" : computed != null ? "computed" : null,
      dealerPlayerId: primaryDealer?.dealerPlayerId ?? null, dealerName: primaryDealer ? (primaryDealer.dealerName || nameOf(primaryDealer.dealerPlayerId ?? "")) : "",
      location: location.trim() || undefined, notes: notes.trim(), sourceText: draft?.sourceText ?? existing?.sourceText ?? "", reviewNotes: reviewNotes.map((r) => r.trim()).filter(Boolean),
      status: existing?.status, startedAt: existing?.startedAt, endedAt: existing?.endedAt,
      dealingHours: dealSplit === "custom" && hosts.some((h) => (dealHours[h] ?? "") !== "") ? Object.fromEntries(hosts.filter((h) => (dealHours[h] ?? "") !== "").map((h) => [h, Number(dealHours[h])])) : undefined,
    };
    const attendance: Attendance[] = att.map((a) => ({ gameId: gid, playerId: a.playerId, notes: a.notes.trim() || undefined }));
    const fin: FinancialEntry[] = [
      { id: rakeExisting?.id ?? uid(), gameId: gid, category: "rake", amount: rake === "" ? null : Number(rake), originalText: rakeText.trim() || (rake === "" ? "" : `$${rake}`), verification: rake === "" ? "needs_review" : rakeVerified ? "verified" : "needs_review" },
      ...entries.map((e): FinancialEntry => ({
        id: e.id, gameId: gid, category: e.category, amount: e.amount === "" ? null : Number(e.amount),
        originalText: e.originalText.trim() || (e.amount === "" ? "" : `$${e.amount}`), verification: e.amount === "" ? "needs_review" : e.verification,
        deductFromRake: e.category === "dealer_earnings" ? e.deductFromRake : undefined,
        dealerName: e.category === "dealer_earnings" ? (e.dealerName || undefined) : undefined,
        dealerPlayerId: e.category === "dealer_earnings" ? e.dealerPlayerId : undefined,
        notes: e.notes.trim() || undefined,
      })),
    ];
    const distributions: Distribution[] = dists.filter((d) => d.amount !== "").map((d) => ({
      id: d.id, gameId: gid, recipient: d.pooled ? "Hosts (pooled)" : d.recipient, amount: Number(d.amount),
      type: d.pooled ? "pooled_total" : "recipient_share", originalText: d.originalText.trim() || `$${d.amount}`, verification: d.verification,
    }));
    for (const p of newPlayers) if (attendance.some((a) => a.playerId === p.id)) dispatch({ type: "player:save", player: p });
    dispatch({ type: "game:save", game, attendance, entries: fin, distributions });
    if (draft) {
      const at = new Date(`${game.date ?? todayISO()}T12:00:00`).toISOString();
      for (const t of draft.transactions) {
        const p = findPlayerByName(allPlayers, t.player);
        if (p && attendance.some((a) => a.playerId === p.id)) dispatch({ type: "tx:add", tx: { id: uid(), gameId: gid, playerId: p.id, kind: t.kind, amount: t.amount, at, notes: "From the pasted note" } });
      }
    }
    nav(`/games/${gid}`);
  };

  const cancelTo = editing ? `/games/${id}` : "/games";

  return (
    <div className="wizard">
      <div className="wizard-head">
        <Link to={cancelTo} className="icon-btn" aria-label="Cancel">‹</Link>
        <h1 style={{ fontSize: 22 }}>{editing ? "Edit Game" : draft ? "Check the game" : "New Game"}</h1>
        <span />
      </div>
      <ol className="stepper" aria-label="Steps">
        {([1, 2, 3] as Step[]).map((s) => (
          <li key={s} className={s === step ? "on" : s < step ? "done" : ""}>
            <button type="button" onClick={() => { if (s < step) { setErrors([]); setStep(s); } }}><span className="dot">{s}</span>{s === 1 ? "Details" : s === 2 ? "Players" : "Financials"}</button>
          </li>
        ))}
      </ol>

      {draft && step === 1 && <Card><p style={{ margin: 0 }}><strong>Filled in from your note by the AI.</strong> Go through the three steps and check every figure against the note. {resolved?.created.length ? `${resolved.created.length} new player${resolved.created.length === 1 ? "" : "s"} will be added.` : ""} Nothing is saved until you press Save Game.</p></Card>}
      {errors.length > 0 && <Card><ul className="review-list">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul></Card>}

      {step === 1 && (
        <Card title="Game Details">
          <div className="form-grid">
            <Field label="Date *"><input className="input" type="date" value={date} disabled={noDate} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Date as written" hint="Keep the original text if it was unclear"><input className="input" value={odt} onChange={(e) => setOdt(e.target.value)} placeholder="e.g. fri 25/10/26" /></Field>
            <Field label="Start time"><input className="input" value={start} onChange={(e) => setStart(e.target.value)} placeholder="5pm" /></Field>
            <Field label="End time"><input className="input" value={finish} onChange={(e) => setFinish(e.target.value)} placeholder="12:30am" /></Field>
            <Field label="Hours (if recorded)" hint={computed != null && !hours ? `Computed from times: ${computed} h` : "Leave blank to compute from start and end"}><input className="input" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="7" /></Field>
            <Field label="Location"><input className="input" list="locations" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Home game" /><datalist id="locations"><option value="Home game" /></datalist></Field>
            <label className="check span-2" style={{ alignSelf: "end", paddingBottom: 10 }}><input type="checkbox" checked={noDate} onChange={(e) => setNoDate(e.target.checked)} /> Date unknown</label>
            <Field label="Notes" className="span-4"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add any notes…" /></Field>
            {hosts.length > 1 && (
              <div className="span-4">
                <div className="field-label" style={{ marginBottom: 6 }}>Dealing split (for $/hour)</div>
                <div className="seg" style={{ display: "flex" }}>
                  <button type="button" className={dealSplit === "half" ? "active" : ""} onClick={() => setDealSplit("half")}>Alternated, half each</button>
                  <button type="button" className={dealSplit === "custom" ? "active" : ""} onClick={() => setDealSplit("custom")}>Set hours</button>
                </div>
                {dealSplit === "custom" && (
                  <div className="form-grid" style={{ marginTop: 10 }}>
                    {hosts.map((h) => <Field key={h} label={`${h} dealt (hours)`} className="span-2"><input className="input" inputMode="decimal" value={dealHours[h] ?? ""} onChange={(e) => setDealHours((x) => ({ ...x, [h]: e.target.value }))} placeholder="0" /></Field>)}
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card title={`Players (${att.length})`} actions={<button type="button" className="btn btn-sm" onClick={() => setAddPlayerOpen(true)}><IcoPlus /> Add Player</button>}>
          <Search value={pq} onChange={setPq} placeholder="Search players…" className="grow" />
          <div className="checklist mt-sm">
            {visiblePlayers.map((p) => {
              const on = checked.has(p.id);
              const a = att.find((x) => x.playerId === p.id);
              return (
                <div key={p.id} className={`check-row ${on ? "on" : ""}`}>
                  <label className="check-main">
                    <input type="checkbox" checked={on} onChange={() => toggle(p.id)} />
                    <Initial name={p.name} />
                    <span className="check-name">{p.name}{p.isHost && <span className="badge badge-host badge-plain" style={{ marginLeft: 8 }}>Host</span>}{a?.notes && <span className="faint"> · {a.notes}</span>}</span>
                  </label>
                  {on && <button type="button" className="icon-btn sm" aria-label={`Note for ${p.name}`} onClick={() => setNoteFor(noteFor === p.id ? null : p.id)}><IcoChevron style={{ transform: noteFor === p.id ? "rotate(90deg)" : undefined }} /></button>}
                  {on && noteFor === p.id && (
                    <input className="input check-note" autoFocus value={a?.notes ?? ""} onChange={(e) => setAtt((xs) => xs.map((x) => (x.playerId === p.id ? { ...x, notes: e.target.value } : x)))} placeholder="late 8pm / leaves at 9pm / Nicole's spot" />
                  )}
                </div>
              );
            })}
            {!visiblePlayers.length && (
              <div className="empty"><p>No player called “{pq}”.</p><button type="button" className="btn btn-primary" onClick={() => setAddPlayerOpen(true)}>Add “{pq.trim()}” as a new player</button></div>
            )}
          </div>
        </Card>
      )}

      {step === 3 && (
        <>
          <Card title="Rake">
            <div className="form-grid">
              <Field label="Total rake (AUD) *" className="span-2"><div className="input-money"><span>$</span><input className="input" inputMode="decimal" value={rake} onChange={(e) => setRake(e.target.value)} placeholder="0" /></div></Field>
              <Field label="As written (optional)" className="span-2"><input className="input" value={rakeText} onChange={(e) => setRakeText(e.target.value)} placeholder="e.g. “$1084 each”" /></Field>
              <label className="check span-4"><input type="checkbox" checked={rakeVerified} onChange={(e) => setRakeVerified(e.target.checked)} /> Verified figure (untick if the note was ambiguous)</label>
            </div>
          </Card>

          <Card title="Expenses" actions={<button type="button" className="btn btn-sm" onClick={() => setExpenseModal(true)}><IcoPlus /> Add Expense</button>}>
            {expenses.length ? (
              <div className="line-list">
                {expenses.map((e) => (
                  <div key={e.id} className="line-row">
                    <button type="button" className="remove" aria-label="Remove" onClick={() => setEntries((xs) => xs.filter((x) => x.id !== e.id))}>−</button>
                    <div><div>{e.originalText && e.originalText !== `$${e.amount}` ? e.originalText : CATEGORY_LABEL[e.category]}</div><div className="faint" style={{ fontSize: 12 }}>{CATEGORY_LABEL[e.category]}{e.verification === "needs_review" ? " · needs review" : ""}</div></div>
                    <div className="num">{e.amount === "" ? <span className="neg">?</span> : `${e.category === "adjustment" && Number(e.amount) > 0 ? "+" : ""}${money(Number(e.amount))}`}</div>
                  </div>
                ))}
              </div>
            ) : <p className="muted">No expenses yet. Food, drinks and snacks, other costs, or a cash adjustment.</p>}
          </Card>

          <Card title="Dealer Earnings" actions={<button type="button" className="btn btn-sm" onClick={() => setDealerModal(true)}><IcoPlus /> Add Dealer</button>}>
            {dealers.length ? (
              <div className="line-list">
                {dealers.map((e) => (
                  <div key={e.id} className="line-row">
                    <button type="button" className="remove" aria-label="Remove" onClick={() => setEntries((xs) => xs.filter((x) => x.id !== e.id))}>−</button>
                    <div><div>{e.dealerName || nameOf(e.dealerPlayerId ?? "") || "Dealer"}</div><div className="faint" style={{ fontSize: 12 }}>{e.deductFromRake ? "Paid from rake" : "Tips, not deducted"}{e.notes ? ` · ${e.notes}` : ""}</div></div>
                    <div className="num">{e.amount === "" ? <span className="neg">?</span> : money(Number(e.amount))}</div>
                  </div>
                ))}
              </div>
            ) : <p className="muted">No dealer recorded for this game.</p>}
          </Card>

          <Card title="Recorded split" actions={<button type="button" className="btn btn-sm" onClick={() => { setShowSplit((v) => !v); if (!dists.length) setDists(hosts.map((h) => ({ id: uid(), recipient: h, amount: "", originalText: "", verification: "verified" as Verification, pooled: false }))); }}>{showSplit ? "Hide" : "Add what was paid out"}</button>}>
            {showSplit ? (
              <div className="form-grid">
                {dists.map((d, i) => (
                  <Field key={d.id} label={d.pooled ? "Total before split" : `${d.recipient} received`} className="span-2">
                    <div className="input-money"><span>$</span><input className="input" inputMode="decimal" value={d.amount} onChange={(e) => setDists((xs) => xs.map((x, k) => (k === i ? { ...x, amount: e.target.value } : x)))} placeholder="0" /></div>
                  </Field>
                ))}
                <p className="rule span-4">Optional. Lets the app check the split against the calculated net ({money(netPreview)}).</p>
              </div>
            ) : <p className="muted">Calculated net so far: <strong>{money(netPreview)}</strong> → {hosts.map((h) => `${h} ${money(netPreview * (db.settings.split[h] ?? 0))}`).join(" · ")}</p>}
          </Card>

          <Card title="Open questions (optional)">
            <textarea value={reviewNotes.join("\n")} onChange={(e) => setReviewNotes(e.target.value.split("\n"))} placeholder="One per line. Any line here keeps the game in “Needs review” until resolved." />
          </Card>
        </>
      )}

      <div className="wizard-foot">
        {step > 1 ? <button type="button" className="btn btn-lg" onClick={back}>Back</button> : <Link className="btn btn-lg" to={cancelTo}>Cancel</Link>}
        {step < 3 ? <button type="button" className="btn btn-primary btn-lg" onClick={next}>Next</button> : <button type="button" className="btn btn-primary btn-lg" onClick={save}>Save Game</button>}
      </div>

      {addPlayerOpen && <AddPlayerModal initial={pq} players={allPlayers} onClose={() => setAddPlayerOpen(false)} onPick={(p) => { if (!checked.has(p.id)) toggle(p.id); setAddPlayerOpen(false); setPq(""); }} onCreate={(p) => { addNewPlayer(p); setAddPlayerOpen(false); }} />}
      {expenseModal && <ExpenseModal onClose={() => setExpenseModal(false)} onAdd={(e) => { setEntries((xs) => [...xs, e]); setExpenseModal(false); }} />}
      {dealerModal && <DealerModal onClose={() => setDealerModal(false)} onAdd={(e) => { setEntries((xs) => [...xs, e]); setDealerModal(false); }} />}
    </div>
  );
}

/* ---------- modals ---------- */

export function AddPlayerModal({ initial = "", players, onClose, onPick, onCreate }: { initial?: string; players: Player[]; onClose: () => void; onPick: (p: Player) => void; onCreate: (p: Player) => void }) {
  const [q, setQ] = useState(initial);
  const [name, setName] = useState(initial);
  const [notes, setNotes] = useState("");
  const matches = useMemo(() => { const n = norm(q); return n ? players.filter((p) => norm(p.name).includes(n) || p.aliases.some((a) => norm(a).includes(n))).slice(0, 6) : []; }, [q, players]);
  const exists = findPlayerByName(players, name);
  const create = () => { if (!name.trim() || exists) return; onCreate({ id: `p-${uid()}`, name: name.trim(), aliases: [], notes: notes.trim(), isHost: false }); };
  return (
    <Modal title="Add Player" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!name.trim() || !!exists} onClick={create}>Save</button></>}>
      <Field label="Search existing player"><Search value={q} onChange={(v) => { setQ(v); setName(v); }} placeholder="Search by name…" /></Field>
      {matches.length > 0 && (
        <div className="mini-list mt-sm">{matches.map((p) => <button key={p.id} type="button" className="mini-btn" onClick={() => onPick(p)}><Initial name={p.name} />{p.name}{p.aliases.length ? <span className="faint"> · aka {p.aliases.join(", ")}</span> : null}<IcoChevron className="chev" /></button>)}</div>
      )}
      <div className="field-label" style={{ margin: "16px 0 8px" }}>Or add a new player</div>
      <div className="form-grid">
        <Field label="Name *" className="span-4"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex" />{exists && <span className="error">“{exists.name}” already exists, pick them above.</span>}</Field>
        <Field label="Notes" className="span-4"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add any notes…" /></Field>
      </div>
    </Modal>
  );
}

export function ExpenseModal({ onClose, onAdd }: { onClose: () => void; onAdd: (e: EntryDraft) => void }) {
  const [category, setCategory] = useState<Category>("food");
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [verified, setVerified] = useState(true);
  const ok = amount !== "" && !isNaN(Number(amount));
  return (
    <Modal title="Add Expense" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!ok} onClick={() => onAdd({ id: uid(), category, amount, originalText: desc.trim() || `$${amount}`, verification: verified ? "verified" : "needs_review", deductFromRake: false, notes: "", dealerName: "", dealerPlayerId: null })}>Save</button></>}>
      <div className="form-grid">
        <Field label="Category *" className="span-4"><select value={category} onChange={(e) => setCategory(e.target.value as Category)}>{EXPENSE_CATS.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select></Field>
        <Field label="Amount (AUD) *" className="span-4" hint={category === "adjustment" ? "Positive adds cash to the pot (e.g. tips the hosts kept), negative removes it." : undefined}><div className="input-money"><span>$</span><input className="input" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></div></Field>
        <Field label="Description" className="span-4"><input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Pizza, drinks, snacks" /></Field>
        <label className="check span-4"><input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} /> Verified figure</label>
      </div>
    </Modal>
  );
}

export function DealerModal({ onClose, onAdd }: { onClose: () => void; onAdd: (e: EntryDraft) => void }) {
  const { db } = useStore();
  const hosts = db.players.filter((p) => p.isHost);
  const [type, setType] = useState<"owner" | "alternating" | "external">("owner");
  const [hostId, setHostId] = useState(hosts[0]?.id ?? "");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [perHost, setPerHost] = useState<Record<string, string>>({});
  const [fromRake, setFromRake] = useState(db.settings.dealerPaidFromRakeByDefault);
  const [notes, setNotes] = useState("");
  const numOk = (v: string) => v !== "" && !isNaN(Number(v));
  const ok = type === "alternating" ? hosts.some((h) => numOk(perHost[h.id] ?? "")) : numOk(amount) && (type === "owner" ? !!hostId : !!name.trim());
  const submit = () => {
    if (type === "alternating") {
      for (const h of hosts) {
        const v = perHost[h.id] ?? "";
        if (!numOk(v)) continue;
        onAdd({ id: uid(), category: "dealer_earnings", amount: v, originalText: `$${v}`, verification: "verified", deductFromRake: fromRake, notes: ["Alternating", notes.trim()].filter(Boolean).join(" · "), dealerName: h.name, dealerPlayerId: h.id });
      }
      return;
    }
    const host = hosts.find((h) => h.id === hostId);
    onAdd({ id: uid(), category: "dealer_earnings", amount, originalText: `$${amount}`, verification: "verified", deductFromRake: fromRake, notes: notes.trim(), dealerName: type === "owner" ? host?.name ?? "" : name.trim(), dealerPlayerId: type === "owner" ? hostId : null });
  };
  return (
    <Modal title="Add Dealer" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!ok} onClick={submit}>Save</button></>}>
      <div className="form-grid">
        <div className="span-4"><div className="field-label" style={{ marginBottom: 6 }}>Dealer type</div>
          <div className="seg" style={{ display: "flex" }}>
            <button type="button" className={type === "owner" ? "active" : ""} onClick={() => setType("owner")}>One owner</button>
            <button type="button" className={type === "alternating" ? "active" : ""} onClick={() => setType("alternating")}>Alternating ({hosts.map((h) => h.name).join(" & ")})</button>
            <button type="button" className={type === "external" ? "active" : ""} onClick={() => setType("external")}>External</button>
          </div></div>
        {type === "owner" && <Field label="Dealer *" className="span-4"><select value={hostId} onChange={(e) => setHostId(e.target.value)}>{hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></Field>}
        {type === "external" && <Field label="Dealer name *" className="span-4"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ian L" /></Field>}
        {type === "alternating"
          ? hosts.map((h) => <Field key={h.id} label={`${h.name} earned (AUD)`} className="span-2"><div className="input-money"><span>$</span><input className="input" inputMode="decimal" value={perHost[h.id] ?? ""} onChange={(e) => setPerHost((x) => ({ ...x, [h.id]: e.target.value }))} placeholder="0" /></div></Field>)
          : <Field label="Payment (AUD) *" className="span-4"><div className="input-money"><span>$</span><input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></div></Field>}
        {type === "alternating" && <p className="rule span-4">One line per owner. Leave an owner blank if they did not deal this night.</p>}
        <label className="check span-4"><input type="checkbox" checked={fromRake} onChange={(e) => setFromRake(e.target.checked)} /> Paid out of the rake (reduces profit). Leave unticked for tips the dealer kept.</label>
        <Field label="Notes" className="span-4"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Main dealer for the night" /></Field>
      </div>
    </Modal>
  );
}
