/**
 * Financial rules for Cambo Poker. Every number shown in the app is derived here
 * from the source records; nothing is stored twice.
 *
 * RULES
 *  1. Gross rake            = sum of 'rake' entries with an amount.
 *  2. Expenses              = food + drinks & snacks + other expenses.
 *  3. Adjustments           = signed sum of 'adjustment' entries (+ adds cash to the pot, - removes it).
 *  4. Dealer earnings       = sum of 'dealer_earnings' entries. They reduce profit ONLY when the entry is
 *                             marked "paid from rake" (deductFromRake). Tips the dealer kept for themselves
 *                             are reported but never deducted, so they are never double-counted.
 *  5. Net distributable     = gross rake + adjustments - expenses - dealer earnings paid from rake.
 *  6. Recorded distribution = what the note says was actually split (sum of recipient shares, or a pooled total).
 *  7. Status:
 *       incomplete   - no rake amount at all.
 *       needs_review - any entry/distribution flagged, any open review note, no usable date, or the
 *                      recorded distribution differs from the computed net by more than the tolerance.
 *       reconciled   - everything verified and consistent.
 *  8. "Verified" totals on the Dashboard/Financials include only entries marked verified. Flagged amounts are
 *     shown separately as "needs review" and never mixed into verified totals.
 */
import { CATEGORY_LABEL } from "../types";
import type { DB, Distribution, FinancialEntry, Game, GameStatus, Settings } from "../types";

export interface GameFinance {
  grossRake: number;
  food: number;
  drinks: number;
  otherExpense: number;
  expenses: number;
  adjustments: number;
  dealerEarnings: number;
  dealerDeducted: number;
  netDistributable: number;
  hasRake: boolean;
  recordedDistribution: number | null;
  variance: number | null; // netDistributable - recordedDistribution
  /** Model share per host from netDistributable. */
  shares: Record<string, number>;
  unverifiedEntryCount: number;
  nullAmountCount: number;
  status: GameStatus;
  reasons: string[];
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const amt = (e: { amount: number | null }) => e.amount ?? 0;

export function entriesFor(db: DB, gameId: string): FinancialEntry[] {
  return db.entries.filter((e) => e.gameId === gameId);
}
export function distributionsFor(db: DB, gameId: string): Distribution[] {
  return db.distributions.filter((d) => d.gameId === gameId);
}

export function recordedDistributionTotal(dists: Distribution[]): number | null {
  const withAmt = dists.filter((d) => d.amount != null);
  if (withAmt.length === 0) return null;
  return sum(withAmt.map(amt));
}

export function computeGame(db: DB, game: Game, settings: Settings = db.settings): GameFinance {
  const entries = entriesFor(db, game.id);
  const dists = distributionsFor(db, game.id);
  const by = (c: FinancialEntry["category"]) => entries.filter((e) => e.category === c);

  const rakeEntries = by("rake");
  const grossRake = sum(rakeEntries.map(amt));
  const food = sum(by("food").map(amt));
  const drinks = sum(by("drinks").map(amt));
  const otherExpense = sum(by("other_expense").map(amt));
  const adjustments = sum(by("adjustment").map(amt));
  const dealerAll = by("dealer_earnings");
  const dealerEarnings = sum(dealerAll.map(amt));
  const dealerDeducted = sum(dealerAll.filter((e) => e.deductFromRake).map(amt));
  const expenses = food + drinks + otherExpense;
  const netDistributable = grossRake + adjustments - expenses - dealerDeducted;
  const hasRake = rakeEntries.some((e) => e.amount != null);

  const recordedDistribution = recordedDistributionTotal(dists);
  const variance = recordedDistribution == null ? null : netDistributable - recordedDistribution;

  const shares: Record<string, number> = {};
  for (const h of settings.hosts) shares[h] = netDistributable * (settings.split[h] ?? 0);

  const reasons: string[] = [];
  const unverifiedEntryCount =
    entries.filter((e) => e.verification === "needs_review").length +
    dists.filter((d) => d.verification === "needs_review").length;
  const nullAmountCount = entries.filter((e) => e.amount == null).length + dists.filter((d) => d.amount == null).length;

  if (!hasRake) reasons.push("No rake amount recorded.");
  if (game.date == null) reasons.push("No usable date (original text kept).");
  if (unverifiedEntryCount) reasons.push(`${unverifiedEntryCount} amount(s) still marked needs review.`);
  if (nullAmountCount) reasons.push(`${nullAmountCount} figure(s) could not be interpreted as a number.`);
  if (variance != null && Math.abs(variance) > settings.reconcileTolerance)
    reasons.push(
      `Computed net ${netDistributable.toFixed(2)} differs from recorded split ${recordedDistribution!.toFixed(2)} by ${variance.toFixed(2)}.`,
    );
  for (const n of game.reviewNotes) reasons.push(n);

  let status: GameStatus = "reconciled";
  if (game.status === "live") status = "live";
  else if (!hasRake) status = "incomplete";
  else if (reasons.length) status = "needs_review";

  return {
    grossRake, food, drinks, otherExpense, expenses, adjustments, dealerEarnings, dealerDeducted,
    netDistributable, hasRake, recordedDistribution, variance, shares, unverifiedEntryCount, nullAmountCount,
    status, reasons,
  };
}

export interface Totals {
  games: number;
  reconciledGames: number;
  attendances: number;
  rakeVerified: number;
  rakeUnverified: number;
  expensesVerified: number;
  expensesUnverified: number;
  adjustmentsVerified: number;
  adjustmentsUnverified: number;
  dealerEarningsVerified: number;
  dealerEarningsUnverified: number;
  /** Net distributable summed over reconciled games only. */
  netVerified: number;
  /** Net distributable summed over games that still need review (indicative only). */
  netUnverified: number;
  recordedDistributions: number;
  sharesVerified: Record<string, number>;
  byCategory: Record<string, { verified: number; unverified: number }>;
}

export function computeTotals(db: DB, games: Game[] = db.games): Totals {
  const ids = new Set(games.map((g) => g.id));
  const entries = db.entries.filter((e) => ids.has(e.gameId));
  const byCategory: Totals["byCategory"] = {};
  const bucket = (key: string, e: FinancialEntry) => {
    byCategory[key] ??= { verified: 0, unverified: 0 };
    byCategory[key][e.verification === "verified" ? "verified" : "unverified"] += amt(e);
  };
  for (const e of entries) bucket(e.category, e);
  const get = (k: string) => byCategory[k] ?? { verified: 0, unverified: 0 };
  const exp = ["food", "drinks", "other_expense"].map(get);

  let netVerified = 0, netUnverified = 0, reconciled = 0;
  const sharesVerified: Record<string, number> = {};
  for (const h of db.settings.hosts) sharesVerified[h] = 0;
  for (const g of games) {
    const f = computeGame(db, g);
    if (f.status === "reconciled") {
      netVerified += f.netDistributable; reconciled++;
      for (const h of db.settings.hosts) sharesVerified[h] += f.shares[h];
    } else netUnverified += f.netDistributable;
  }
  const recordedDistributions = sum(
    db.distributions.filter((d) => ids.has(d.gameId)).map(amt),
  );
  return {
    games: games.length,
    reconciledGames: reconciled,
    attendances: db.attendance.filter((a) => ids.has(a.gameId)).length,
    rakeVerified: get("rake").verified,
    rakeUnverified: get("rake").unverified,
    expensesVerified: sum(exp.map((x) => x.verified)),
    expensesUnverified: sum(exp.map((x) => x.unverified)),
    adjustmentsVerified: get("adjustment").verified,
    adjustmentsUnverified: get("adjustment").unverified,
    dealerEarningsVerified: get("dealer_earnings").verified,
    dealerEarningsUnverified: get("dealer_earnings").unverified,
    netVerified, netUnverified, recordedDistributions, sharesVerified, byCategory,
  };
}

export function monthKey(date: string | null): string {
  return date ? date.slice(0, 7) : "unknown";
}

export interface MonthRow {
  month: string; // yyyy-mm or "unknown"
  games: number;
  rake: number;
  expenses: number;
  net: number;
  netVerified: number;
}

export function monthlySeries(db: DB, games: Game[] = db.games): MonthRow[] {
  const map = new Map<string, MonthRow>();
  for (const g of games) {
    const k = monthKey(g.date);
    const row = map.get(k) ?? { month: k, games: 0, rake: 0, expenses: 0, net: 0, netVerified: 0 };
    const f = computeGame(db, g);
    row.games++; row.rake += f.grossRake; row.expenses += f.expenses; row.net += f.netDistributable;
    if (f.status === "reconciled") row.netVerified += f.netDistributable;
    map.set(k, row);
  }
  return [...map.values()].sort((a, b) => (a.month === "unknown" ? 1 : b.month === "unknown" ? -1 : a.month.localeCompare(b.month)));
}

/** Parse "7pm", "5:20pm", "12:30am", "1am" to minutes after midnight; null if unparseable. */
export function parseClock(t: string): number | null {
  const m = t.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ap = m[3];
  if (h > 24 || min > 59) return null;
  if (ap === "pm" && h !== 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  return h * 60 + min;
}

/** Duration in hours from start/finish strings, assuming finish after start (crossing midnight allowed). */
export function durationFromTimes(start: string, finish: string): number | null {
  const s = parseClock(start), f = resolveFinish(start, finish);
  if (s == null || f == null) return null;
  let d = f - s;
  if (d <= 0) d += 24 * 60;
  return Math.round((d / 60) * 100) / 100;
}

const LONGEST_NIGHT_MIN = 14 * 60;

/**
 * A finish time typed without am/pm ("9", "9:45", "12") is read as the evening/after-midnight reading
 * that gives a plausible night length (up to 14 h) from the start time: "9" after a 2pm start is 9pm,
 * "1" after a 5pm start is 1am. Times with am/pm are taken as written.
 */
export function resolveFinish(start: string, finish: string): number | null {
  const raw = finish.trim().toLowerCase();
  if (/(am|pm)$/.test(raw)) return parseClock(raw);
  const bare = parseClock(raw);
  const s = parseClock(start);
  if (bare == null) return null;
  if (s == null || bare >= 13 * 60) return bare;
  const h = Math.floor(bare / 60), min = bare % 60;
  const candidates = [((h % 12) + 12) * 60 + min, (h % 12) * 60 + min]; // pm first, then am (12 → 12pm then 12am)
  for (const c of candidates) { let d = c - s; if (d <= 0) d += 24 * 60; if (d > 0 && d <= LONGEST_NIGHT_MIN) return c; }
  return candidates[0];
}

/** "9:45" typed after a 6pm start becomes "9:45pm" so the record reads unambiguously. */
export function normaliseFinish(start: string, finish: string): string {
  const raw = finish.trim();
  if (!raw || /(am|pm)$/i.test(raw)) return raw;
  const m = resolveFinish(start, raw);
  if (m == null) return raw;
  const h24 = Math.floor(m / 60), min = m % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}${min ? ":" + String(min).padStart(2, "0") : ""}${h24 < 12 ? "am" : "pm"}`;
}

/** Buy-ins, rebuys, cash-outs and net per player for one game. A player is "in play" until their latest movement is a cash-out. */
export interface PlayerResult { playerId: string; buyIns: number; buyInCount: number; rebuyCount: number; lastBuyIn: number | null; cashOut: number | null; inPlay: boolean; net: number | null }
export function playerResults(db: DB, gameId: string): PlayerResult[] {
  const map = new Map<string, PlayerResult>();
  for (const t of db.transactions.filter((x) => x.gameId === gameId).sort((a, b) => a.at.localeCompare(b.at))) {
    const r = map.get(t.playerId) ?? { playerId: t.playerId, buyIns: 0, buyInCount: 0, rebuyCount: 0, lastBuyIn: null, cashOut: null, inPlay: true, net: null };
    if (t.kind === "cash_out") { r.cashOut = (r.cashOut ?? 0) + t.amount; r.inPlay = false; }
    else { r.buyIns += t.amount; r.lastBuyIn = t.amount; r.inPlay = true; if (t.kind === "rebuy" || r.buyInCount > 0) r.rebuyCount++; else r.buyInCount++; }
    map.set(t.playerId, r);
  }
  for (const r of map.values()) r.net = r.inPlay ? null : (r.cashOut ?? 0) - r.buyIns;
  return [...map.values()];
}

/** Chips in versus chips out: buy-ins should equal cash-outs plus rake once everyone has cashed out. */
export interface PotCheck { buyIns: number; cashOuts: number; rake: number; inPlay: number; unaccounted: number; seated: number; cashedOut: number; hasData: boolean }
export function potCheck(db: DB, gameId: string): PotCheck {
  const rs = playerResults(db, gameId);
  const buyIns = sum(rs.map((r) => r.buyIns));
  const cashOuts = sum(rs.map((r) => r.cashOut ?? 0));
  const rake = sum(db.entries.filter((e) => e.gameId === gameId && e.category === "rake").map(amt));
  const cashedOut = rs.filter((r) => !r.inPlay).length;
  return { buyIns, cashOuts, rake, inPlay: buyIns - cashOuts - rake, unaccounted: buyIns - cashOuts - rake, seated: rs.length - cashedOut, cashedOut, hasData: rs.length > 0 };
}

/** Lifetime net for a player across every game with cash-out data. */
export function playerLifetime(db: DB, playerId: string): { games: number; buyIns: number; cashOut: number; net: number } {
  let games = 0, buyIns = 0, cashOut = 0;
  const byGame = new Map<string, PlayerResult>();
  for (const g of db.games) for (const r of playerResults(db, g.id)) if (r.playerId === playerId && !r.inPlay) byGame.set(g.id, r);
  for (const r of byGame.values()) { games++; buyIns += r.buyIns; cashOut += r.cashOut ?? 0; }
  return { games, buyIns, cashOut, net: cashOut - buyIns };
}


/* ---------- hourly ---------- */

export interface HostHourly { share: number; hoursDealt: number; perHour: number; tips: number; tipsPerHour: number }
export interface Hourly {
  hours: number;
  source: "recorded" | "computed" | "estimated";
  /** Net distributable per hour of the night. */
  netPerHour: number;
  /** true when dealingHours was set by hand for this game; false = alternated, half each. */
  custom: boolean;
  perHost: Record<string, HostHourly>;
}

/**
 * Per-hour view of one game. null when the night has no usable length (no finish time and no recorded hours),
 * so games with unknown hours never skew an hourly average. The hosts alternate dealing (one hour on, one off),
 * so each is credited half the night unless game.dealingHours says otherwise.
 */
export function hourly(db: DB, game: Game, f: GameFinance = computeGame(db, game)): Hourly | null {
  if (game.status === "live" || game.durationHours == null || game.durationHours <= 0 || !f.hasRake) return null;
  const hours = game.durationHours;
  const hosts = db.settings.hosts;
  const custom = !!game.dealingHours && hosts.some((h) => game.dealingHours![h] != null);
  const tipsFor = (h: string) => {
    const hp = db.players.find((p) => p.isHost && p.name === h);
    return sum(entriesFor(db, game.id).filter((e) => e.category === "dealer_earnings" && (e.dealerPlayerId === hp?.id || (!e.dealerPlayerId && e.dealerName === h))).map(amt));
  };
  const perHost: Record<string, HostHourly> = {};
  for (const h of hosts) {
    const hoursDealt = custom ? Math.max(game.dealingHours?.[h] ?? 0, 0) : hours / hosts.length;
    const share = f.shares[h] ?? 0;
    const tips = tipsFor(h);
    perHost[h] = { share, hoursDealt, perHour: share / hours, tips, tipsPerHour: hoursDealt > 0 ? tips / hoursDealt : 0 };
  }
  return { hours, source: game.durationSource ?? "computed", netPerHour: f.netDistributable / hours, custom, perHost };
}

export interface HourlyTotals { games: number; excluded: number; hours: number; net: number; netPerHour: number; perHost: Record<string, { perHour: number; hoursDealt: number; tipsPerHour: number }> }

/** Hours-weighted average over the games that have a usable length. `excluded` counts the ones left out. */
export function hourlyTotals(db: DB, games: Game[] = db.games): HourlyTotals {
  let hours = 0, net = 0, n = 0, excluded = 0;
  const acc: Record<string, { share: number; hoursDealt: number; tips: number }> = {};
  for (const g of games) {
    const h = hourly(db, g);
    if (!h) { if (g.status !== "live") excluded++; continue; }
    n++; hours += h.hours; net += h.netPerHour * h.hours;
    for (const [name, x] of Object.entries(h.perHost)) {
      acc[name] ??= { share: 0, hoursDealt: 0, tips: 0 };
      acc[name].share += x.share; acc[name].hoursDealt += x.hoursDealt; acc[name].tips += x.tips;
    }
  }
  const perHost = Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, { perHour: hours ? v.share / hours : 0, hoursDealt: v.hoursDealt, tipsPerHour: v.hoursDealt ? v.tips / v.hoursDealt : 0 }]));
  return { games: n, excluded, hours, net, netPerHour: hours ? net / hours : 0, perHost };
}

/* ---------- series for graphs ---------- */

export interface GamePoint { id: string; label: string; date: string; netPerHour: number | null; players: number; buyIns: number; cashOuts: number; net: number; hasTx: boolean }

/** One point per dated game, oldest first. */
export function gameSeries(db: DB, games: Game[] = db.games): GamePoint[] {
  return games
    .filter((g) => g.date != null && g.status !== "live")
    .sort((a, b) => a.date!.localeCompare(b.date!))
    .map((g) => {
      const f = computeGame(db, g);
      const h = hourly(db, g, f);
      const pc = potCheck(db, g.id);
      const d = new Date(g.date! + "T12:00:00");
      return { id: g.id, label: `${d.getDate()} ${d.toLocaleString("en-AU", { month: "short" })}`, date: g.date!, netPerHour: h ? Math.round(h.netPerHour) : null, players: db.attendance.filter((a) => a.gameId === g.id).length, buyIns: pc.buyIns, cashOuts: pc.cashOuts, net: f.netDistributable, hasTx: pc.hasData };
    });
}

/** Players ranked by how many of the given games they came to. */
export function attendanceLeaders(db: DB, games: Game[] = db.games, n = 10): Array<{ playerId: string; name: string; games: number }> {
  const ids = new Set(games.map((g) => g.id));
  const count = new Map<string, number>();
  for (const a of db.attendance) if (ids.has(a.gameId)) count.set(a.playerId, (count.get(a.playerId) ?? 0) + 1);
  return [...count.entries()]
    .map(([playerId, games]) => ({ playerId, name: db.players.find((p) => p.id === playerId)?.name ?? "?", games }))
    .filter((x) => !db.players.find((p) => p.id === x.playerId)?.isHost)
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name))
    .slice(0, n);
}


/* ---------- missing values ---------- */

export type MissingKind = "date" | "hours" | "rake" | "amount";
export interface MissingItem { kind: MissingKind; label: string; entryId?: string }

/** Blanks that stop a game from being fully counted. Open questions are separate (they live in reviewNotes). */
export function missingInfo(db: DB, game: Game): MissingItem[] {
  if (game.status === "live") return [];
  const out: MissingItem[] = [];
  if (game.date == null) out.push({ kind: "date", label: "Date" });
  if (game.durationHours == null) out.push({ kind: "hours", label: "Finish time or hours" });
  const es = entriesFor(db, game.id);
  const rake = es.filter((e) => e.category === "rake");
  if (!rake.length) out.push({ kind: "rake", label: "Rake" });
  for (const e of es) if (e.amount == null) out.push({ kind: "amount", label: e.category === "rake" ? "Rake" : `${CATEGORY_LABEL[e.category]}${e.originalText ? ` (“${e.originalText}”)` : ""}`, entryId: e.id });
  return out;
}


/* ---------- usual times ---------- */

/**
 * The hosts' standing pattern, used only when a night has no finish time and no recorded hours:
 * Friday games run 5pm to about midnight; Saturday games 2pm to somewhere between 9pm and midnight (10:30pm taken as the middle).
 * Any game that uses this is marked "estimated" so it can be told apart from recorded facts.
 */
export const USUAL_TIMES: Record<number, { start: string; finish: string; label: string }> = {
  5: { start: "5pm", finish: "12am", label: "Friday: 5pm to midnight" },
  6: { start: "2pm", finish: "10:30pm", label: "Saturday: 2pm to about 10:30pm (9pm to midnight range)" },
};

export function usualTimesFor(game: Game): { start: string; finish: string; label: string } | null {
  if (!game.date) return null;
  const [y, m, d] = game.date.split("-").map(Number);
  return USUAL_TIMES[new Date(y, m - 1, d).getDay()] ?? null;
}
