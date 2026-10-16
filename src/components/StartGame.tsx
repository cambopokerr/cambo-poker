import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../data/store";
import { todayISO, uid } from "../lib/format";
import type { Game } from "../types";
import { Field, Modal } from "./ui";

/** "h:mma" in the same style the notes use: 5pm, 5:20pm, 12:30am. */
export function clockNow(d = new Date()): string {
  const h24 = d.getHours(), m = d.getMinutes();
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}${m ? ":" + String(m).padStart(2, "0") : ""}${h24 < 12 ? "am" : "pm"}`;
}

export function liveGame(games: Game[]): Game | undefined {
  return games.find((g) => g.status === "live");
}

/** Start a game right now: creates the record and opens the live dashboard. */
export default function StartGameModal({ onClose }: { onClose: () => void }) {
  const { db, dispatch } = useStore();
  const nav = useNavigate();
  const [location, setLocation] = useState("Home game");
  const [notes, setNotes] = useState("");
  const existing = liveGame(db.games);

  const start = () => {
    const now = new Date();
    const game: Game = {
      id: `g-${uid()}`, date: todayISO(), originalDateText: todayISO(), startTime: clockNow(now), finishTime: "",
      durationHours: null, durationSource: null, dealerPlayerId: null, dealerName: "", location: location.trim() || undefined,
      notes: notes.trim(), sourceText: "", reviewNotes: [], status: "live", startedAt: now.toISOString(),
    };
    dispatch({ type: "game:start", game });
    onClose();
    nav(`/games/${game.id}/live`);
  };

  if (existing) {
    return (
      <Modal title="A game is already running" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Close</button><button className="btn btn-primary" onClick={() => { onClose(); nav(`/games/${existing.id}/live`); }}>Open live game</button></>}>
        <p>Started at {existing.startTime}. End it from the live dashboard before starting another.</p>
      </Modal>
    );
  }
  return (
    <Modal title="Start Game" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={start}>Start now</button></>}>
      <div className="form-grid">
        <Field label="Location" className="span-4"><input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Home game" /></Field>
        <Field label="Notes (optional)" className="span-4"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything about tonight" /></Field>
      </div>
      <p className="rule" style={{ marginTop: 10 }}>The clock starts now ({clockNow()}). Add players, buy-ins, rake and expenses as the night goes, then press End Game.</p>
    </Modal>
  );
}

/** "Log a Game" chooser: run a live game now, type up a past one, or paste a note for the AI to read. */
export function LogGameModal({ onClose }: { onClose: () => void }) {
  const { db } = useStore();
  const nav = useNavigate();
  const [start, setStart] = useState(false);
  const existing = liveGame(db.games);
  const go = (to: string) => { onClose(); nav(to); };
  if (start) return <StartGameModal onClose={onClose} />;
  return (
    <Modal title="Log a Game" onClose={onClose}>
      <div className="choices">
        {existing
          ? <button type="button" className="choice" onClick={() => go(`/games/${existing.id}/live`)}><span className="choice-ico live">▶</span><span><strong>Open the live game</strong><small>Started {existing.startTime}. End it before starting another.</small></span></button>
          : <button type="button" className="choice" onClick={() => setStart(true)}><span className="choice-ico live">▶</span><span><strong>Start a live game</strong><small>Playing now. Add buy-ins, rebuys, rake and expenses as the night goes.</small></span></button>}
        <button type="button" className="choice" onClick={() => go("/games/new")}><span className="choice-ico">✎</span><span><strong>Log a past game</strong><small>Type the details in yourself: date, players, rake, costs, dealer.</small></span></button>
        <button type="button" className="choice" onClick={() => go("/games/paste")}><span className="choice-ico">✦</span><span><strong>Paste a note</strong><small>Paste the night's note and let the AI fill the form. You check it before saving.</small></span></button>
      </div>
    </Modal>
  );
}
