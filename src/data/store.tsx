import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import type { Attendance, DB, Distribution, FinancialEntry, Game, Player, Settings } from "../types";
import { buildSeed } from "./seed";

const KEY = "cambo-poker:v2";

export type Action =
  | { type: "replace"; db: DB }
  | { type: "settings"; settings: Settings }
  | { type: "game:save"; game: Game; attendance: Attendance[]; entries: FinancialEntry[]; distributions: Distribution[] }
  | { type: "game:delete"; id: string }
  | { type: "player:save"; player: Player }
  | { type: "player:merge"; keepId: string; removeId: string }
  | { type: "entry:verify"; id: string; verification: FinancialEntry["verification"] }
  | { type: "distribution:verify"; id: string; verification: Distribution["verification"] }
  | { type: "game:resolveNote"; id: string; index: number };

function reducer(db: DB, a: Action): DB {
  switch (a.type) {
    case "replace": return a.db;
    case "settings": return { ...db, settings: a.settings };
    case "game:save": {
      const exists = db.games.some((g) => g.id === a.game.id);
      return {
        ...db,
        games: exists ? db.games.map((g) => (g.id === a.game.id ? a.game : g)) : [...db.games, a.game],
        attendance: [...db.attendance.filter((x) => x.gameId !== a.game.id), ...a.attendance],
        entries: [...db.entries.filter((x) => x.gameId !== a.game.id), ...a.entries],
        distributions: [...db.distributions.filter((x) => x.gameId !== a.game.id), ...a.distributions],
      };
    }
    case "game:delete":
      return {
        ...db,
        games: db.games.filter((g) => g.id !== a.id),
        attendance: db.attendance.filter((x) => x.gameId !== a.id),
        entries: db.entries.filter((x) => x.gameId !== a.id),
        distributions: db.distributions.filter((x) => x.gameId !== a.id),
      };
    case "player:save": {
      const exists = db.players.some((p) => p.id === a.player.id);
      return { ...db, players: exists ? db.players.map((p) => (p.id === a.player.id ? a.player : p)) : [...db.players, a.player] };
    }
    case "player:merge": {
      const keep = db.players.find((p) => p.id === a.keepId), gone = db.players.find((p) => p.id === a.removeId);
      if (!keep || !gone) return db;
      const merged: Player = { ...keep, aliases: [...new Set([...keep.aliases, gone.name, ...gone.aliases])],
        notes: [keep.notes, gone.notes && `Merged from "${gone.name}": ${gone.notes}`].filter(Boolean).join("\n") };
      const seenGames = new Set(db.attendance.filter((x) => x.playerId === keep.id).map((x) => x.gameId));
      const attendance = db.attendance.flatMap((x) => {
        if (x.playerId !== gone.id) return [x];
        if (seenGames.has(x.gameId)) return [];
        return [{ ...x, playerId: keep.id }];
      });
      return {
        ...db, attendance,
        players: db.players.filter((p) => p.id !== gone.id).map((p) => (p.id === keep.id ? merged : p)),
        games: db.games.map((g) => (g.dealerPlayerId === gone.id ? { ...g, dealerPlayerId: keep.id } : g)),
      };
    }
    case "entry:verify":
      return { ...db, entries: db.entries.map((e) => (e.id === a.id ? { ...e, verification: a.verification } : e)) };
    case "distribution:verify":
      return { ...db, distributions: db.distributions.map((d) => (d.id === a.id ? { ...d, verification: a.verification } : d)) };
    case "game:resolveNote":
      return { ...db, games: db.games.map((g) => (g.id === a.id ? { ...g, reviewNotes: g.reviewNotes.filter((_, i) => i !== a.index) } : g)) };
    default: return db;
  }
}

export interface Store { db: DB; dispatch: (a: Action) => void; storageOk: boolean }
const Ctx = createContext<Store | null>(null);

function load(): { db: DB; ok: boolean } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DB;
      if (parsed && parsed.version === 1 && Array.isArray(parsed.games)) return { db: parsed, ok: true };
    }
    const seed = buildSeed();
    localStorage.setItem(KEY, JSON.stringify(seed));
    return { db: seed, ok: true };
  } catch {
    return { db: buildSeed(), ok: false };
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [init] = useMemo(() => [load()], []);
  const [db, dispatch] = useReducer(reducer, init.db);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* reported via storageOk */ }
  }, [db]);
  const value = useMemo(() => ({ db, dispatch, storageOk: init.ok }), [db, init.ok]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside provider");
  return s;
}

export const playerName = (db: DB, id: string | null | undefined): string =>
  (id && db.players.find((p) => p.id === id)?.name) || "–";

/** Dealer names for a game: from dealer-earnings entries when present, else the game's own dealer field. */
export function dealersFor(db: DB, game: Game): Array<{ name: string; playerId: string | null; amount: number | null; entryId?: string }> {
  const fromEntries = db.entries
    .filter((e) => e.gameId === game.id && e.category === "dealer_earnings")
    .map((e) => ({ name: e.dealerName || (e.dealerPlayerId ? playerName(db, e.dealerPlayerId) : "") || game.dealerName || "Dealer", playerId: e.dealerPlayerId ?? null, amount: e.amount, entryId: e.id }));
  if (fromEntries.length) return fromEntries;
  const name = game.dealerPlayerId ? playerName(db, game.dealerPlayerId) : game.dealerName;
  return name ? [{ name, playerId: game.dealerPlayerId, amount: null }] : [];
}
