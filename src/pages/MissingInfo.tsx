import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../data/store";
import { distributionsFor, durationFromTimes, entriesFor, missingInfo, parseClock } from "../lib/finance";
import { fmtDate, uid } from "../lib/format";
import type { FinancialEntry, Game } from "../types";
import { Card, Field, StatusBadge } from "../components/ui";
import { computeGame } from "../lib/finance";

/** Every blank that keeps a game from counting fully, laid out with a box to fill in. Saves one game at a time. */
export default function MissingInfo() {
  const { db } = useStore();
  const games = useMemo(() => db.games.filter((g) => missingInfo(db, g).length).sort((a, b) => (b.date ?? "9999").localeCompare(a.date ?? "9999")), [db]);
  const count = games.reduce((s, g) => s + missingInfo(db, g).length, 0);
  return (
    <div className="wizard" style={{ maxWidth: 860 }}>
      <div className="wizard-head">
        <Link to="/" className="icon-btn" aria-label="Back">‹</Link>
        <h1 style={{ fontSize: 22 }}>Missing info</h1>
        <span />
      </div>
      <Card>
        {games.length
          ? <p style={{ margin: 0 }}><strong>{count} blank{count === 1 ? "" : "s"} across {games.length} game{games.length === 1 ? "" : "s"}.</strong> These were not written in the original notes. Fill in what you know and press Save on each game. Leave anything you do not know.</p>
          : <p style={{ margin: 0 }}>Nothing missing. Every game has a date, a length and all its amounts.</p>}
      </Card>
      {games.map((g) => <GameRow key={g.id} game={g} />)}
    </div>
  );
}

function GameRow({ game }: { game: Game }) {
  const { db, dispatch } = useStore();
  const items = missingInfo(db, game);
  const entries = entriesFor(db, game.id);
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [finish, setFinish] = useState("");
  const [hours, setHours] = useState("");
  const [rake, setRake] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const f = computeGame(db, game);

  const dirty = date || start || finish || hours || rake || Object.values(amounts).some((v) => v !== "");
  const save = () => {
    setErr(null);
    if (start && parseClock(start) == null) return setErr("Start time must look like 5pm.");
    if (finish && parseClock(finish) == null) return setErr("Finish time must look like 12:30am.");
    if (hours && (isNaN(Number(hours)) || Number(hours) <= 0)) return setErr("Hours must be a positive number.");
    if (rake && (isNaN(Number(rake)) || Number(rake) < 0)) return setErr("Rake must be a number.");
    for (const v of Object.values(amounts)) if (v !== "" && isNaN(Number(v))) return setErr(`“${v}” is not a number.`);
    const next: Game = { ...game };
    if (date) { next.date = date; if (!next.originalDateText) next.originalDateText = date; }
    if (start) next.startTime = start.trim();
    if (finish) next.finishTime = finish.trim();
    const rec = hours ? Number(hours) : null;
    const computed = next.startTime && next.finishTime ? durationFromTimes(next.startTime, next.finishTime) : null;
    if (rec != null) { next.durationHours = rec; next.durationSource = "recorded"; }
    else if ((finish || start) && computed != null) { next.durationHours = computed; next.durationSource = "computed"; }
    let es: FinancialEntry[] = entries.map((e) => (amounts[e.id] != null && amounts[e.id] !== "" ? { ...e, amount: Number(amounts[e.id]), originalText: e.originalText || `$${amounts[e.id]}`, notes: [e.notes, "Filled in later from memory"].filter(Boolean).join(" · ") } : e));
    if (rake) es = [...es, { id: uid(), gameId: game.id, category: "rake", amount: Number(rake), originalText: `$${rake}`, verification: "verified", notes: "Filled in later from memory" }];
    dispatch({ type: "game:save", game: next, attendance: db.attendance.filter((a) => a.gameId === game.id), entries: es, distributions: distributionsFor(db, game.id) });
    setDate(""); setStart(""); setFinish(""); setHours(""); setRake(""); setAmounts({}); setSaved(true);
  };

  return (
    <Card>
      <div className="missing-game">
        <div className="missing-head">
          <div><Link to={`/games/${game.id}`}><strong>{fmtDate(game.date)}</strong></Link>{game.originalDateText && game.date == null ? <span className="faint"> · written “{game.originalDateText}”</span> : null}<span className="faint"> · {game.startTime || "no start time"}{game.finishTime ? ` to ${game.finishTime}` : ""}</span></div>
          <StatusBadge status={f.status} />
        </div>
        {game.sourceText && <details><summary className="faint" style={{ cursor: "pointer" }}>Show the original note</summary><pre className="source" style={{ marginTop: 8 }}>{game.sourceText}</pre></details>}
        <div className="missing-fields">
          {items.some((i) => i.kind === "date") && <Field label="Date"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>}
          {items.some((i) => i.kind === "hours") && <>
            {!game.startTime && <Field label="Start time"><input className="input" value={start} onChange={(e) => setStart(e.target.value)} placeholder="5pm" /></Field>}
            <Field label={`Finish time${game.startTime ? ` (started ${game.startTime})` : ""}`}><input className="input" value={finish} onChange={(e) => setFinish(e.target.value)} placeholder="12:30am" /></Field>
            <Field label="Or hours played"><input className="input" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="6" /></Field>
          </>}
          {items.some((i) => i.kind === "rake") && <Field label="Rake (AUD)"><div className="input-money"><span>$</span><input className="input" inputMode="decimal" value={rake} onChange={(e) => setRake(e.target.value)} placeholder="0" /></div></Field>}
          {items.filter((i) => i.kind === "amount").map((i) => <Field key={i.entryId} label={`${i.label} (AUD)`}><div className="input-money"><span>$</span><input className="input" inputMode="decimal" value={amounts[i.entryId!] ?? ""} onChange={(e) => setAmounts((x) => ({ ...x, [i.entryId!]: e.target.value }))} placeholder="0" /></div></Field>)}
        </div>
        {err && <p className="error" style={{ margin: 0 }}>{err}</p>}
        <div className="card-actions" style={{ justifyContent: "flex-end" }}>
          {saved && !dirty && <span className="faint">Saved.</span>}
          <button type="button" className="btn btn-primary" disabled={!dirty} onClick={save}>Save</button>
        </div>
      </div>
    </Card>
  );
}
