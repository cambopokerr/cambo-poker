/**
 * Exports for analysis outside the app: a multi-sheet Excel workbook and a plain-text report
 * that can be pasted into an AI chat. Both contain only what is recorded; flagged figures stay flagged.
 */
import type { DB, Game } from "../types";
import { CATEGORY_LABEL, STATUS_LABEL } from "../types";
import { computeGame, computeTotals, hourly, hourlyTotals, missingInfo, playerResults } from "./finance";
import { fmtDate, fmtHours, money } from "./format";

type Row = Record<string, string | number | null>;

function dealerNames(db: DB, g: Game): string[] {
  const es = db.entries.filter((e) => e.gameId === g.id && e.category === "dealer_earnings");
  const names = es.map((e) => e.dealerName || (e.dealerPlayerId ? db.players.find((p) => p.id === e.dealerPlayerId)?.name ?? "" : "")).filter(Boolean);
  if (names.length) return [...new Set(names)];
  const primary = g.dealerPlayerId ? db.players.find((p) => p.id === g.dealerPlayerId)?.name : g.dealerName;
  return primary ? [primary] : [];
}

function sorted(games: Game[]): Game[] {
  return [...games].sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
}

export function buildSheets(db: DB, games: Game[] = db.games): Record<string, Row[]> {
  const gs = sorted(games);
  const ids = new Set(gs.map((g) => g.id));
  const name = (pid: string | null | undefined) => (pid ? db.players.find((p) => p.id === pid)?.name ?? "" : "");
  const hosts = db.settings.hosts;

  const Games: Row[] = gs.map((g) => {
    const f = computeGame(db, g);
    const h = hourly(db, g, f);
    const players = db.attendance.filter((a) => a.gameId === g.id);
    return {
      game_id: g.id, date: g.date ?? "", date_as_written: g.originalDateText, weekday: g.date ? fmtDate(g.date).split(",")[0] : "",
      start: g.startTime, finish: g.finishTime, hours: g.durationHours ?? null, hours_source: g.durationSource ?? "",
      location: g.location ?? "", players: players.length, player_names: players.map((a) => name(a.playerId)).join(", "),
      dealers: dealerNames(db, g).join(" & "),
      gross_rake: f.hasRake ? f.grossRake : null, food: f.food, drinks_snacks: f.drinks, other_expenses: f.otherExpense, expenses_total: f.expenses,
      cash_adjustments: f.adjustments, dealer_earnings: f.dealerEarnings, dealer_paid_from_rake: f.dealerDeducted,
      net_profit: f.hasRake ? f.netDistributable : null,
      ...Object.fromEntries(hosts.map((hn) => [`share_${hn}`, f.hasRake ? Number(f.shares[hn].toFixed(2)) : null])),
      recorded_split: f.recordedDistribution, variance: f.variance,
      profit_per_hour: h ? Number(h.netPerHour.toFixed(2)) : null,
      ...Object.fromEntries(hosts.map((hn) => [`${hn}_per_hour`, h ? Number(h.perHost[hn].perHour.toFixed(2)) : null])),
      status: STATUS_LABEL[f.status], open_questions: g.reviewNotes.join(" | "), missing: missingInfo(db, g).map((m) => m.label).join(", "),
      notes: g.notes, original_note: g.sourceText,
    };
  });

  const Players: Row[] = db.players.map((p) => {
    const att = db.attendance.filter((a) => a.playerId === p.id && ids.has(a.gameId));
    const dates = att.map((a) => db.games.find((g) => g.id === a.gameId)?.date ?? "").filter(Boolean).sort();
    const tx = db.transactions.filter((t) => t.playerId === p.id && ids.has(t.gameId));
    const buyIns = tx.filter((t) => t.kind !== "cash_out").reduce((s, t) => s + t.amount, 0);
    const cashOuts = tx.filter((t) => t.kind === "cash_out").reduce((s, t) => s + t.amount, 0);
    return { player_id: p.id, name: p.name, aliases: p.aliases.join(", "), host: p.isHost ? "yes" : "no", games_attended: att.length, first_game: dates[0] ?? "", last_game: dates[dates.length - 1] ?? "", total_buy_ins: tx.length ? buyIns : null, total_cash_outs: tx.length ? cashOuts : null, net_result: tx.length ? cashOuts - buyIns : null, notes: p.notes };
  }).sort((a, b) => Number(b.games_attended) - Number(a.games_attended) || String(a.name).localeCompare(String(b.name)));

  const Attendance: Row[] = gs.flatMap((g) => db.attendance.filter((a) => a.gameId === g.id).map((a) => ({ game_id: g.id, date: g.date ?? "", date_as_written: g.originalDateText, player: name(a.playerId), note: a.notes ?? "" })));

  const Money: Row[] = gs.flatMap((g) => db.entries.filter((e) => e.gameId === g.id).map((e) => ({
    game_id: g.id, date: g.date ?? "", category: CATEGORY_LABEL[e.category], amount: e.amount, as_written: e.originalText, verification: e.verification === "verified" ? "verified" : "needs review",
    dealer: e.category === "dealer_earnings" ? (e.dealerName || name(e.dealerPlayerId)) : "", dealer_paid_from_rake: e.category === "dealer_earnings" ? (e.deductFromRake ? "yes" : "no") : "", notes: e.notes ?? "",
  })));

  const Payouts: Row[] = gs.flatMap((g) => db.distributions.filter((d) => d.gameId === g.id).map((d) => ({ game_id: g.id, date: g.date ?? "", recipient: d.recipient, type: d.type === "pooled_total" ? "total before split" : "share", amount: d.amount, as_written: d.originalText, verification: d.verification === "verified" ? "verified" : "needs review" })));

  const BuyIns: Row[] = gs.flatMap((g) => {
    const rs = playerResults(db, g.id);
    return rs.map((r) => ({ game_id: g.id, date: g.date ?? "", player: name(r.playerId), buy_ins_total: r.buyIns, rebuys: r.rebuyCount, cash_out: r.cashOut, result: r.net, still_in_play: r.inPlay ? "yes" : "no" }));
  });

  const t = computeTotals(db, gs);
  const ht = hourlyTotals(db, gs);
  const Summary: Row[] = [
    { item: "Business", value: db.settings.businessName }, { item: "Hosts", value: hosts.join(" & ") },
    { item: "Profit split", value: hosts.map((h) => `${h} ${Math.round((db.settings.split[h] ?? 0) * 100)}%`).join(", ") },
    { item: "Games", value: t.games }, { item: "Completed (fully verified) games", value: t.reconciledGames },
    { item: "Player attendances", value: t.attendances },
    { item: "Gross rake, verified", value: t.rakeVerified }, { item: "Gross rake, needs review", value: t.rakeUnverified },
    { item: "Expenses, verified", value: t.expensesVerified }, { item: "Expenses, needs review", value: t.expensesUnverified },
    { item: "Dealer earnings, verified", value: t.dealerEarningsVerified }, { item: "Dealer earnings, needs review", value: t.dealerEarningsUnverified },
    { item: "Net profit, verified games only", value: Number(t.netVerified.toFixed(2)) }, { item: "Net profit, games still needing review (indicative)", value: Number(t.netUnverified.toFixed(2)) },
    ...hosts.map((h) => ({ item: `${h} share, verified`, value: Number((t.sharesVerified[h] ?? 0).toFixed(2)) })),
    { item: "Profit per hour (nights with hours)", value: ht.games ? Number(ht.netPerHour.toFixed(2)) : null }, { item: "Nights with hours", value: ht.games }, { item: "Nights without hours (excluded)", value: ht.excluded },
    { item: "Rule", value: "net = rake + adjustments - expenses - dealer paid from rake" },
    { item: "Exported", value: new Date().toISOString() },
  ];

  return { Summary, Games, Players, Attendance, Money, Payouts, "Buy-ins": BuyIns };
}

export async function exportExcel(db: DB, games: Game[] = db.games, filename = `cambo-poker-${new Date().toISOString().slice(0, 10)}.xlsx`) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const [sheet, rows] of Object.entries(buildSheets(db, games))) {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ note: "nothing recorded" }]);
    const cols = Object.keys(rows[0] ?? { note: "" });
    ws["!cols"] = cols.map((c) => ({ wch: Math.min(60, Math.max(c.length, ...rows.slice(0, 200).map((r) => String(r[c] ?? "").length)) + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, sheet);
  }
  XLSX.writeFile(wb, filename);
}

/** A compact, readable report for pasting into an AI chat. */
export function buildTextReport(db: DB, games: Game[] = db.games): string {
  const gs = sorted(games);
  const hosts = db.settings.hosts;
  const t = computeTotals(db, gs);
  const ht = hourlyTotals(db, gs);
  const name = (pid: string) => db.players.find((p) => p.id === pid)?.name ?? "?";
  const L: string[] = [];
  L.push(`${db.settings.businessName.toUpperCase()} · DATA EXPORT · ${new Date().toLocaleDateString("en-AU")}`);
  L.push(`Hosts: ${hosts.join(" & ")}. Profit split ${hosts.map((h) => `${h} ${Math.round((db.settings.split[h] ?? 0) * 100)}%`).join(", ")}. All amounts AUD.`);
  L.push("Rule: net profit = rake + cash adjustments - expenses - dealer earnings paid from rake. Dealer tips kept by the dealer are reported but not deducted.");
  L.push("Figures marked (?) were unclear in the original hand-written note and need checking. Games are 'Completed' only when every figure is verified and no questions are open.");
  L.push("");
  L.push("SUMMARY");
  L.push(`Games: ${t.games} (${t.reconciledGames} completed). Player attendances: ${t.attendances}. Distinct players: ${db.players.filter((p) => !p.isHost).length}.`);
  L.push(`Gross rake: ${money(t.rakeVerified + t.rakeUnverified)} (${money(t.rakeUnverified)} needs review). Expenses: ${money(t.expensesVerified + t.expensesUnverified)}. Dealer earnings: ${money(t.dealerEarningsVerified + t.dealerEarningsUnverified)}.`);
  L.push(`Net profit, completed games only: ${money(t.netVerified)}. Indicative net from games still needing review: ${money(t.netUnverified)}.`);
  L.push(`Profit per hour: ${ht.games ? `${money(ht.netPerHour)}/h over ${ht.games} nights with hours (${hosts.map((h) => `${h} ${money(ht.perHost[h]?.perHour ?? 0)}/h`).join(", ")}); ${ht.excluded} nights without a finish time excluded` : "not available (no nights with hours)"}.`);
  L.push("");
  L.push("GAMES (oldest first)");
  for (const g of gs) {
    const f = computeGame(db, g);
    const h = hourly(db, g, f);
    const att = db.attendance.filter((a) => a.gameId === g.id);
    const es = db.entries.filter((e) => e.gameId === g.id);
    const q = (v: string) => (v === "verified" ? "" : " (?)");
    const parts: string[] = [];
    parts.push(`${g.date ? fmtDate(g.date) : `No date (written "${g.originalDateText}")`}${g.startTime ? ` · ${g.startTime}${g.finishTime ? `-${g.finishTime}` : ""}` : ""}${g.durationHours != null ? ` · ${fmtHours(g.durationHours)}` : " · length unknown"} · ${STATUS_LABEL[f.status]}`);
    parts.push(`  Players (${att.length}): ${att.map((a) => name(a.playerId) + (a.notes ? ` [${a.notes}]` : "")).join(", ") || "none listed"}`);
    const rake = es.filter((e) => e.category === "rake");
    const exp = es.filter((e) => ["food", "drinks", "other_expense"].includes(e.category));
    const adj = es.filter((e) => e.category === "adjustment");
    const dl = es.filter((e) => e.category === "dealer_earnings");
    parts.push(`  Rake: ${rake.length ? rake.map((e) => (e.amount == null ? `? ("${e.originalText}")` : money(e.amount) + q(e.verification))).join(" + ") : "not recorded"}`);
    if (exp.length) parts.push(`  Expenses: ${exp.map((e) => `${CATEGORY_LABEL[e.category]} ${e.amount == null ? "?" : money(e.amount)}${q(e.verification)}${e.originalText && e.originalText !== `$${e.amount}` ? ` ("${e.originalText}")` : ""}`).join(", ")}`);
    if (adj.length) parts.push(`  Cash adjustments: ${adj.map((e) => `${e.amount == null ? "?" : money(e.amount)}${q(e.verification)} ("${e.originalText}")`).join(", ")}`);
    if (dl.length) parts.push(`  Dealer: ${dl.map((e) => `${e.dealerName || name(e.dealerPlayerId ?? "") || "hired dealer (unnamed)"} ${e.amount == null ? "?" : money(e.amount)}${e.deductFromRake ? " paid from rake" : " tips, not deducted"}`).join("; ")}`);
    parts.push(`  Net profit: ${f.hasRake ? money(f.netDistributable) : "n/a"}${f.hasRake ? ` → ${hosts.map((hn) => `${hn} ${money(f.shares[hn])}`).join(", ")}` : ""}${f.recordedDistribution != null ? ` · recorded split ${money(f.recordedDistribution)}${f.variance != null && Math.abs(f.variance) > db.settings.reconcileTolerance ? ` (differs by ${money(f.variance)})` : ""}` : ""}${h ? ` · ${money(h.netPerHour)}/h` : ""}`);
    const rs = playerResults(db, g.id);
    if (rs.length) parts.push(`  Buy-ins: ${rs.map((r) => `${name(r.playerId)} in ${money(r.buyIns)}${r.rebuyCount ? ` (${r.rebuyCount} rebuy${r.rebuyCount === 1 ? "" : "s"})` : ""}${r.cashOut != null ? ` out ${money(r.cashOut)}` : ", still in"}`).join("; ")}`);
    if (g.reviewNotes.length) parts.push(`  Open questions: ${g.reviewNotes.join(" | ")}`);
    if (g.notes) parts.push(`  Notes: ${g.notes}`);
    L.push(...parts, "");
  }
  L.push("PLAYERS BY ATTENDANCE");
  const count = new Map<string, number>();
  const gids = new Set(gs.map((g) => g.id));
  for (const a of db.attendance) if (gids.has(a.gameId)) count.set(a.playerId, (count.get(a.playerId) ?? 0) + 1);
  const ranked = [...count.entries()].map(([pid, n]) => ({ p: db.players.find((x) => x.id === pid), n })).filter((x) => x.p && !x.p.isHost).sort((a, b) => b.n - a.n || a.p!.name.localeCompare(b.p!.name));
  L.push(ranked.map((x) => `${x.p!.name} ${x.n}`).join(", "));
  return L.join("\n");
}
