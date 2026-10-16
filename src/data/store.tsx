import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Attendance, DB, Distribution, FinancialEntry, Game, Player, PlayerTransaction, Settings } from "../types";
import { buildSeed } from "./seed";
import { REMOTE_ENABLED, supabase } from "../lib/supabase";
import { loadRemote, myProfile, persist, remoteIsEmpty, replaceAll, type Profile } from "./remote";

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
  | { type: "game:resolveNote"; id: string; index: number }
  | { type: "game:start"; game: Game }
  | { type: "game:end"; id: string; finishTime: string; endedAt: string; durationHours: number | null }
  | { type: "attendance:add"; attendance: Attendance }
  | { type: "attendance:remove"; gameId: string; playerId: string }
  | { type: "entry:add"; entry: FinancialEntry }
  | { type: "entry:remove"; id: string }
  | { type: "tx:add"; tx: PlayerTransaction }
  | { type: "tx:remove"; id: string };

export function reducer(db: DB, a: Action): DB {
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
        transactions: db.transactions.filter((x) => x.gameId !== a.id),
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
        entries: db.entries.map((e) => (e.dealerPlayerId === gone.id ? { ...e, dealerPlayerId: keep.id } : e)),
      };
    }
    case "entry:verify":
      return { ...db, entries: db.entries.map((e) => (e.id === a.id ? { ...e, verification: a.verification } : e)) };
    case "distribution:verify":
      return { ...db, distributions: db.distributions.map((d) => (d.id === a.id ? { ...d, verification: a.verification } : d)) };
    case "game:resolveNote":
      return { ...db, games: db.games.map((g) => (g.id === a.id ? { ...g, reviewNotes: g.reviewNotes.filter((_, i) => i !== a.index) } : g)) };
    case "game:start": return { ...db, games: [...db.games, a.game] };
    case "game:end":
      return { ...db, games: db.games.map((g) => (g.id === a.id ? { ...g, status: "ended", endedAt: a.endedAt, finishTime: a.finishTime || g.finishTime, durationHours: a.durationHours ?? g.durationHours, durationSource: a.durationHours != null ? "computed" : g.durationSource } : g)) };
    case "attendance:add":
      return db.attendance.some((x) => x.gameId === a.attendance.gameId && x.playerId === a.attendance.playerId) ? db : { ...db, attendance: [...db.attendance, a.attendance] };
    case "attendance:remove":
      return { ...db, attendance: db.attendance.filter((x) => !(x.gameId === a.gameId && x.playerId === a.playerId)), transactions: db.transactions.filter((t) => !(t.gameId === a.gameId && t.playerId === a.playerId)) };
    case "entry:add": return { ...db, entries: [...db.entries, a.entry] };
    case "entry:remove": return { ...db, entries: db.entries.filter((e) => e.id !== a.id) };
    case "tx:add": return { ...db, transactions: [...db.transactions, a.tx] };
    case "tx:remove": return { ...db, transactions: db.transactions.filter((t) => t.id !== a.id) };
    default: return db;
  }
}

export type Status = "loading" | "signed_out" | "pending" | "ready" | "error";

export interface Store {
  db: DB;
  dispatch: (a: Action) => void;
  remote: boolean;
  status: Status;
  session: Session | null;
  profile: Profile | null;
  error: string | null;
  syncError: string | null;
  storageOk: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}
const Ctx = createContext<Store | null>(null);

const EMPTY: DB = { ...buildSeed(), games: [], players: [], attendance: [], entries: [], distributions: [], transactions: [] };

function loadLocal(): { db: DB; ok: boolean } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DB;
      if (parsed && parsed.version === 1 && Array.isArray(parsed.games)) return { db: { ...parsed, transactions: parsed.transactions ?? [] }, ok: true };
    }
    const seed = buildSeed();
    localStorage.setItem(KEY, JSON.stringify(seed));
    return { db: seed, ok: true };
  } catch {
    return { db: buildSeed(), ok: false };
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const remote = REMOTE_ENABLED;
  const [init] = useMemo(() => [remote ? { db: EMPTY, ok: true } : loadLocal()], [remote]);
  const [db, rawDispatch] = useReducer(reducer, init.db);
  const dbRef = useRef(db);
  dbRef.current = db;
  const [status, setStatus] = useState<Status>(remote ? "loading" : "ready");
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    if (remote) return;
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* reported via storageOk */ }
  }, [db, remote]);

  const refresh = useCallback(async () => {
    if (!remote) return;
    try {
      const p = await myProfile();
      setProfile(p);
      if (!p) { setStatus("signed_out"); return; }
      if (!p.approved) { setStatus("pending"); return; }
      if (await remoteIsEmpty()) await replaceAll(buildSeed()); // first ever load: bring in the 28 recorded games
      rawDispatch({ type: "replace", db: await loadRemote() });
      setError(null);
      setStatus("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [remote]);

  useEffect(() => {
    if (!remote) return;
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => { setSession(data.session); if (!data.session) setStatus("signed_out"); else void refresh(); });
    const { data: sub } = sb.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      if (!s) { setStatus("signed_out"); setProfile(null); rawDispatch({ type: "replace", db: EMPTY }); }
      else void refresh();
    });
    const onFocus = () => { if (document.visibilityState === "visible" && dbRef.current.games.length) void refresh(); };
    document.addEventListener("visibilitychange", onFocus);
    return () => { sub.subscription.unsubscribe(); document.removeEventListener("visibilitychange", onFocus); };
  }, [remote, refresh]);

  const dispatch = useCallback((a: Action) => {
    const prev = dbRef.current;
    const next = reducer(prev, a);
    rawDispatch(a);
    if (!remote) return;
    persist(a, prev, next)
      .then(() => setSyncError(null))
      .catch((e) => { setSyncError(e instanceof Error ? e.message : String(e)); void refresh(); });
  }, [remote, refresh]);

  const signOut = useCallback(async () => { if (remote) await supabase().auth.signOut(); }, [remote]);

  const value = useMemo<Store>(() => ({ db, dispatch, remote, status, session, profile, error, syncError, storageOk: init.ok, refresh, signOut }),
    [db, dispatch, remote, status, session, profile, error, syncError, init.ok, refresh, signOut]);
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
