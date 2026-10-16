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
  if (!hasRake) status = "incomplete";
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
  const s = parseClock(start), f = parseClock(finish);
  if (s == null || f == null) return null;
  let d = f - s;
  if (d <= 0) d += 24 * 60;
  return Math.round((d / 60) * 100) / 100;
}
