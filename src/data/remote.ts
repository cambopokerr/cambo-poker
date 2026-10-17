/**
 * Supabase persistence. The reducer in store.tsx stays the source of truth for shape;
 * this file translates each action into targeted table writes and loads everything back.
 */
import type { Attendance, DB, Distribution, FinancialEntry, Game, Player, PlayerTransaction, Settings } from "../types";
import { DEFAULT_SETTINGS } from "./seed";
import { supabase } from "../lib/supabase";
import type { Action } from "./store";

type Row = Record<string, unknown>;
const num = (v: unknown): number | null => (v == null ? null : Number(v));

// ---------- row <-> type ----------
const toGameRow = (g: Game): Row => ({
  id: g.id, date: g.date, original_date_text: g.originalDateText, start_time: g.startTime, finish_time: g.finishTime,
  duration_hours: g.durationHours, duration_source: g.durationSource, dealer_player_id: g.dealerPlayerId, dealer_name: g.dealerName,
  location: g.location ?? null, notes: g.notes, source_text: g.sourceText, review_notes: g.reviewNotes, updated_at: new Date().toISOString(),
  status: g.status ?? null, started_at: g.startedAt ?? null, ended_at: g.endedAt ?? null, dealing_hours: g.dealingHours ?? null,
});
const fromGameRow = (r: Row): Game => ({
  id: r.id as string, date: (r.date as string | null) ?? null, originalDateText: (r.original_date_text as string) ?? "", startTime: (r.start_time as string) ?? "",
  finishTime: (r.finish_time as string) ?? "", durationHours: num(r.duration_hours), durationSource: (r.duration_source as Game["durationSource"]) ?? null,
  dealerPlayerId: (r.dealer_player_id as string | null) ?? null, dealerName: (r.dealer_name as string) ?? "", location: (r.location as string | null) ?? undefined,
  notes: (r.notes as string) ?? "", sourceText: (r.source_text as string) ?? "", reviewNotes: (r.review_notes as string[]) ?? [],
  status: (r.status as Game["status"]) ?? undefined, startedAt: (r.started_at as string | null) ?? undefined, endedAt: (r.ended_at as string | null) ?? undefined, dealingHours: (r.dealing_hours as Record<string, number> | null) ?? undefined,
});
const toTxRow = (t: PlayerTransaction): Row => ({ id: t.id, game_id: t.gameId, player_id: t.playerId, kind: t.kind, amount: t.amount, at: t.at, notes: t.notes ?? null });
const fromTxRow = (r: Row): PlayerTransaction => ({ id: r.id as string, gameId: r.game_id as string, playerId: r.player_id as string, kind: r.kind as PlayerTransaction["kind"], amount: Number(r.amount), at: r.at as string, notes: (r.notes as string) ?? undefined });
const toPlayerRow = (p: Player): Row => ({ id: p.id, name: p.name, aliases: p.aliases, notes: p.notes, is_host: p.isHost });
const fromPlayerRow = (r: Row): Player => ({ id: r.id as string, name: r.name as string, aliases: (r.aliases as string[]) ?? [], notes: (r.notes as string) ?? "", isHost: !!r.is_host });
const toAttRow = (a: Attendance): Row => ({ game_id: a.gameId, player_id: a.playerId, arrival: a.arrival ?? null, departure: a.departure ?? null, notes: a.notes ?? null });
const fromAttRow = (r: Row): Attendance => ({ gameId: r.game_id as string, playerId: r.player_id as string, arrival: (r.arrival as string) ?? undefined, departure: (r.departure as string) ?? undefined, notes: (r.notes as string) ?? undefined });
const toEntryRow = (e: FinancialEntry): Row => ({
  id: e.id, game_id: e.gameId, category: e.category, amount: e.amount, original_text: e.originalText, verification: e.verification,
  deduct_from_rake: e.deductFromRake ?? null, dealer_name: e.dealerName ?? null, dealer_player_id: e.dealerPlayerId ?? null, notes: e.notes ?? null,
});
const fromEntryRow = (r: Row): FinancialEntry => ({
  id: r.id as string, gameId: r.game_id as string, category: r.category as FinancialEntry["category"], amount: num(r.amount), originalText: (r.original_text as string) ?? "",
  verification: r.verification as FinancialEntry["verification"], deductFromRake: r.deduct_from_rake == null ? undefined : !!r.deduct_from_rake,
  dealerName: (r.dealer_name as string) ?? undefined, dealerPlayerId: (r.dealer_player_id as string | null) ?? undefined, notes: (r.notes as string) ?? undefined,
});
const toDistRow = (d: Distribution): Row => ({ id: d.id, game_id: d.gameId, recipient: d.recipient, amount: d.amount, type: d.type, original_text: d.originalText, verification: d.verification, notes: d.notes ?? null });
const fromDistRow = (r: Row): Distribution => ({ id: r.id as string, gameId: r.game_id as string, recipient: r.recipient as string, amount: num(r.amount), type: r.type as Distribution["type"], originalText: (r.original_text as string) ?? "", verification: r.verification as Distribution["verification"], notes: (r.notes as string) ?? undefined });

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

// ---------- load ----------
export async function loadRemote(): Promise<DB> {
  const sb = supabase();
  const [settings, players, games, attendance, entries, distributions, transactions] = await Promise.all([
    sb.from("settings").select("data").eq("id", 1).maybeSingle(),
    sb.from("players").select("*").order("name"),
    sb.from("games").select("*").order("date", { ascending: true, nullsFirst: false }),
    sb.from("attendance").select("*"),
    sb.from("entries").select("*"),
    sb.from("distributions").select("*"),
    sb.from("player_transactions").select("*").order("at"),
  ]);
  return {
    version: 1,
    settings: ((must(settings, "settings") as { data: Settings } | null)?.data) ?? DEFAULT_SETTINGS,
    players: (must(players, "players") as Row[]).map(fromPlayerRow),
    games: (must(games, "games") as Row[]).map(fromGameRow),
    attendance: (must(attendance, "attendance") as Row[]).map(fromAttRow),
    entries: (must(entries, "entries") as Row[]).map(fromEntryRow),
    distributions: (must(distributions, "distributions") as Row[]).map(fromDistRow),
    transactions: (must(transactions, "transactions") as Row[]).map(fromTxRow),
  };
}

export async function remoteIsEmpty(): Promise<boolean> {
  const { count, error } = await supabase().from("games").select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return (count ?? 0) === 0;
}

// ---------- write ----------
async function chunked<T>(rows: T[], fn: (part: T[]) => Promise<void>, size = 500) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

/** Replace everything (used for the first import, JSON restore and reset). */
export async function replaceAll(db: DB): Promise<void> {
  const sb = supabase();
  must(await sb.from("games").delete().neq("id", ""), "clear games");       // cascades attendance/entries/distributions
  must(await sb.from("players").delete().neq("id", ""), "clear players");
  await chunked(db.players.map(toPlayerRow), async (p) => { must(await sb.from("players").insert(p), "players"); });
  await chunked(db.games.map(toGameRow), async (p) => { must(await sb.from("games").insert(p), "games"); });
  await chunked(db.attendance.map(toAttRow), async (p) => { must(await sb.from("attendance").insert(p), "attendance"); });
  await chunked(db.entries.map(toEntryRow), async (p) => { must(await sb.from("entries").insert(p), "entries"); });
  await chunked(db.distributions.map(toDistRow), async (p) => { must(await sb.from("distributions").insert(p), "distributions"); });
  await chunked((db.transactions ?? []).map(toTxRow), async (p) => { must(await sb.from("player_transactions").insert(p), "transactions"); });
  must(await sb.from("settings").upsert({ id: 1, data: db.settings, updated_at: new Date().toISOString() }), "settings");
}

/** Push one reducer action to the database. prev/next are the states before and after the reducer ran. */
export async function persist(a: Action, prev: DB, next: DB): Promise<void> {
  const sb = supabase();
  switch (a.type) {
    case "replace": return replaceAll(a.db);
    case "settings": must(await sb.from("settings").upsert({ id: 1, data: a.settings, updated_at: new Date().toISOString() }), "settings"); return;
    case "game:save": {
      must(await sb.from("games").upsert(toGameRow(a.game)), "game");
      must(await sb.from("attendance").delete().eq("game_id", a.game.id), "attendance clear");
      must(await sb.from("entries").delete().eq("game_id", a.game.id), "entries clear");
      must(await sb.from("distributions").delete().eq("game_id", a.game.id), "distributions clear");
      if (a.attendance.length) must(await sb.from("attendance").insert(a.attendance.map(toAttRow)), "attendance");
      if (a.entries.length) must(await sb.from("entries").insert(a.entries.map(toEntryRow)), "entries");
      if (a.distributions.length) must(await sb.from("distributions").insert(a.distributions.map(toDistRow)), "distributions");
      return;
    }
    case "game:delete": must(await sb.from("games").delete().eq("id", a.id), "delete game"); return;
    case "player:save": must(await sb.from("players").upsert(toPlayerRow(a.player)), "player"); return;
    case "player:merge": {
      const kept = next.players.find((p) => p.id === a.keepId);
      if (!kept) return;
      must(await sb.from("players").upsert(toPlayerRow(kept)), "merge player");
      const rows = next.attendance.filter((x) => x.playerId === a.keepId).map(toAttRow);
      if (rows.length) must(await sb.from("attendance").upsert(rows), "merge attendance");
      must(await sb.from("games").update({ dealer_player_id: a.keepId }).eq("dealer_player_id", a.removeId), "merge dealer");
      must(await sb.from("entries").update({ dealer_player_id: a.keepId }).eq("dealer_player_id", a.removeId), "merge entry dealer");
      must(await sb.from("players").delete().eq("id", a.removeId), "remove merged player");
      return;
    }
    case "entry:verify": must(await sb.from("entries").update({ verification: a.verification }).eq("id", a.id), "verify entry"); return;
    case "distribution:verify": must(await sb.from("distributions").update({ verification: a.verification }).eq("id", a.id), "verify split"); return;
    case "game:resolveNote": {
      const g = next.games.find((x) => x.id === a.id);
      if (g) must(await sb.from("games").update({ review_notes: g.reviewNotes }).eq("id", a.id), "resolve note");
      return;
    }
    case "game:start": must(await sb.from("games").insert(toGameRow(a.game)), "start game"); return;
    case "game:end": {
      const g = next.games.find((x) => x.id === a.id);
      if (g) must(await sb.from("games").update(toGameRow(g)).eq("id", a.id), "end game");
      return;
    }
    case "attendance:add": must(await sb.from("attendance").upsert(toAttRow(a.attendance)), "seat player"); return;
    case "attendance:remove":
      must(await sb.from("player_transactions").delete().eq("game_id", a.gameId).eq("player_id", a.playerId), "remove player money");
      must(await sb.from("attendance").delete().eq("game_id", a.gameId).eq("player_id", a.playerId), "unseat player");
      return;
    case "entry:add": must(await sb.from("entries").insert(toEntryRow(a.entry)), "add entry"); return;
    case "entry:remove": must(await sb.from("entries").delete().eq("id", a.id), "remove entry"); return;
    case "tx:add": must(await sb.from("player_transactions").insert(toTxRow(a.tx)), "add transaction"); return;
    case "tx:remove": must(await sb.from("player_transactions").delete().eq("id", a.id), "remove transaction"); return;
    default: { void prev; return; }
  }
}

// ---------- access (profiles) ----------
export interface Profile { user_id: string; email: string; approved: boolean; created_at: string }
export async function myProfile(): Promise<Profile | null> {
  const { data: { user } } = await supabase().auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase().from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Profile | null) ?? { user_id: user.id, email: user.email ?? "", approved: false, created_at: new Date().toISOString() };
}
export async function listProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase().from("profiles").select("*").order("created_at");
  if (error) throw new Error(error.message);
  return data as Profile[];
}
export async function setApproved(userId: string, approved: boolean): Promise<void> {
  const { error } = await supabase().from("profiles").update({ approved }).eq("user_id", userId);
  if (error) throw new Error(error.message);
}
export async function removeProfile(userId: string): Promise<void> {
  const { error } = await supabase().from("profiles").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
}
