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
