/**
 * Reads a pasted poker-night note with Claude and returns a structured draft for the New Game form.
 *
 * Rules the model is held to (and that the form enforces again):
 *  - never invent a figure: anything not written in the note is null and goes to "open questions";
 *  - keep the text exactly as written next to every number (the "as written" fields);
 *  - the draft is a proposal only; nothing is saved until the person reviews it in the form.
 */
import type { Category, Player } from "../types";
import { todayISO } from "./format";

export const AI_MODEL = "claude-sonnet-5-5";
const API_URL = "https://api.anthropic.com/v1/messages";

export type ExpenseCat = Exclude<Category, "rake" | "dealer_earnings">;

export interface GameDraft {
  date: string | null;
  dateAsWritten: string;
  startTime: string;
  finishTime: string;
  hours: number | null;
  location: string | null;
  notes: string;
  players: Array<{ name: string; note: string }>;
  rake: { amount: number | null; asWritten: string; verified: boolean };
  expenses: Array<{ category: ExpenseCat; amount: number | null; asWritten: string; verified: boolean }>;
  dealers: Array<{ name: string; isHost: boolean; amount: number | null; asWritten: string; paidFromRake: boolean }>;
  payouts: Array<{ recipient: string; amount: number | null; asWritten: string; verified: boolean }>;
  transactions: Array<{ player: string; kind: "buy_in" | "rebuy" | "cash_out"; amount: number }>;
  openQuestions: string[];
  /** The note exactly as pasted. Saved on the game as its source. */
  sourceText: string;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["date", "dateAsWritten", "startTime", "finishTime", "hours", "location", "notes", "players", "rake", "expenses", "dealers", "payouts", "transactions", "openQuestions"],
  properties: {
    date: { type: ["string", "null"], description: "yyyy-mm-dd, or null if no usable date is written." },
    dateAsWritten: { type: "string", description: "The date text exactly as it appears in the note, e.g. '20/03'. Empty if none." },
    startTime: { type: "string", description: "Start time as written, e.g. '7pm' or '5:20pm'. Empty if not written." },
    finishTime: { type: "string", description: "Finish time as written, e.g. '12:30am'. Empty if not written." },
    hours: { type: ["number", "null"], description: "Hours played ONLY if the note states a duration (e.g. '5 hours'). Do not compute it." },
    location: { type: ["string", "null"], description: "Where it was played if written, else null." },
    notes: { type: "string", description: "Anything in the note that is not a player, a figure or a date. Empty if none." },
    players: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "note"], properties: { name: { type: "string", description: "Name exactly as written (fix only obvious typos of a known player and mention it in note)." }, note: { type: "string", description: "Text in brackets or after the name, e.g. 'coming 9pm', 'Adam friend', 'LATE'. Empty if none." } } } },
    rake: { type: "object", additionalProperties: false, required: ["amount", "asWritten", "verified"], properties: { amount: { type: ["number", "null"] }, asWritten: { type: "string" }, verified: { type: "boolean", description: "false when the note is ambiguous about whether this figure is the rake (e.g. it says 'profit')." } } },
    expenses: { type: "array", items: { type: "object", additionalProperties: false, required: ["category", "amount", "asWritten", "verified"], properties: { category: { type: "string", enum: ["food", "drinks", "other_expense", "adjustment"] }, amount: { type: ["number", "null"], description: "Positive number for a cost. For 'adjustment' the sign matters: positive adds cash to the pot, negative removes it." }, asWritten: { type: "string" }, verified: { type: "boolean" } } } },
    dealers: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "isHost", "amount", "asWritten", "paidFromRake"], properties: { name: { type: "string" }, isHost: { type: "boolean", description: "true if the dealer is one of the hosts." }, amount: { type: ["number", "null"], description: "What the dealer earned, if written." }, asWritten: { type: "string" }, paidFromRake: { type: "boolean", description: "true ONLY if the note says the dealer was paid out of the rake. Tips kept by the dealer are false." } } } },
    payouts: { type: "array", description: "What the hosts took home, if written. '$X each' = one row per host with that amount. A single total that was split = one row with recipient 'pooled'.", items: { type: "object", additionalProperties: false, required: ["recipient", "amount", "asWritten", "verified"], properties: { recipient: { type: "string", description: "A host's name, or 'pooled'." }, amount: { type: ["number", "null"] }, asWritten: { type: "string" }, verified: { type: "boolean" } } } },
    transactions: { type: "array", description: "Player buy-ins, rebuys and cash-outs ONLY if the note writes them per player. Usually empty.", items: { type: "object", additionalProperties: false, required: ["player", "kind", "amount"], properties: { player: { type: "string" }, kind: { type: "string", enum: ["buy_in", "rebuy", "cash_out"] }, amount: { type: "number" } } } },
    openQuestions: { type: "array", items: { type: "string" }, description: "One line per thing that is unclear, missing, conflicting or assumed. Written for the host to check." },
  },
};

function systemPrompt(players: Player[], hosts: string[], today: string): string {
  const known = players.map((p) => p.name).sort().join(", ");
  return [
    "You read hand-written notes from a private home poker business and turn each note into a structured game record.",
    "The business is run by the hosts: " + hosts.join(" and ") + ". Profit is split between them.",
    "",
    "Absolute rules:",
    "1. Never invent, estimate or compute a figure. If it is not written, the amount is null and you add an open question.",
    "2. Copy every figure's text exactly as written into the asWritten field.",
    "3. A list of names is the attendance list. Text in brackets or after a name is that player's note. 'X's friend' is a player called exactly that.",
    "4. Money words: 'rake' is the rake. 'profit' alone is ambiguous (could be rake or after costs): record it as the rake with verified=false and an open question. 'spilt' means split. '-107 food' means a $107 food expense. '$X each' means each host received X (payouts, one row per host).",
    "5. If the year is missing, use " + today.slice(0, 4) + " and add an open question saying the year was assumed. Dates are written day/month.",
    "6. Match player names to the known list when the spelling is clearly the same person (Kaliob / Kailob). Keep the name as the known spelling and put 'written as ...' in the player note. Do not merge different people.",
    "7. Do not compute hours from start and finish times; the app does that. Fill hours only when the note states them.",
    "8. If nothing in the note looks like a poker game, return empty lists and explain in openQuestions.",
    "9. Always answer by calling the record_game tool, never with prose.",
    "10. Open questions are for things that affect the money or the date: conflicting figures, unexplained gaps, labels that could mean two things, assumed years, unknown names. A missing finish time, location or dealer is normal and is not a question.",
    "",
    "Known players: " + (known || "none yet") + ".",
    "Today's date: " + today + ".",
  ].join("\n");
}

export class AiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) { super(message); this.status = status; }
}

export async function parseGameNote(note: string, apiKey: string, players: Player[], hosts: string[]): Promise<GameDraft> {
  const today = todayISO();
  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 4000,
        system: systemPrompt(players, hosts, today),
        messages: [{ role: "user", content: "Read this poker note and record the game:\n\n" + note }],
        tools: [{ name: "record_game", description: "Record the structured game read from the note. Always call this exactly once.", input_schema: SCHEMA }],
      }),
    });
  } catch {
    throw new AiError("Could not reach the AI service. Check the internet connection and try again.");
  }
  if (!res.ok) {
    let detail = "";
    try { detail = ((await res.json()) as { error?: { message?: string } }).error?.message ?? ""; } catch { /* ignore */ }
    if (res.status === 401) throw new AiError("The AI key was rejected. Check the key in Settings.", 401);
    if (res.status === 429) throw new AiError("The AI service is busy or the account is out of credit. Try again in a minute.", 429);
    throw new AiError(detail || `The AI service returned an error (${res.status}).`, res.status);
  }
  const body = (await res.json()) as { content?: Array<{ type: string; name?: string; input?: unknown; text?: string }> };
  const call = body.content?.find((c) => c.type === "tool_use" && c.name === "record_game");
  if (call?.input) return normalise(call.input as Partial<GameDraft>, note);
  // Fallback: the model answered in text. Accept a JSON object in it.
  const text = body.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n") ?? "";
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return normalise(JSON.parse(m[0]) as Partial<GameDraft>, note); } catch { /* fall through */ } }
  throw new AiError("The AI did not return a game. Try again, or log it by hand.");
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : null);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Defensive clean-up: the model is forced to the schema, but nothing downstream should trust that. */
function normalise(d: Partial<GameDraft>, source: string): GameDraft {
  const date = str(d.date);
  return {
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    dateAsWritten: str(d.dateAsWritten),
    startTime: str(d.startTime), finishTime: str(d.finishTime),
    hours: num(d.hours), location: d.location == null ? null : str(d.location) || null, notes: str(d.notes),
    players: arr<{ name: unknown; note: unknown }>(d.players).map((p) => ({ name: str(p?.name).trim(), note: str(p?.note).trim() })).filter((p) => p.name),
    rake: { amount: num(d.rake?.amount), asWritten: str(d.rake?.asWritten), verified: bool(d.rake?.verified, false) },
    expenses: arr<{ category: unknown; amount: unknown; asWritten: unknown; verified: unknown }>(d.expenses)
      .filter((e) => ["food", "drinks", "other_expense", "adjustment"].includes(str(e?.category)))
      .map((e) => ({ category: str(e.category) as ExpenseCat, amount: num(e.amount), asWritten: str(e.asWritten), verified: bool(e.verified, false) })),
    dealers: arr<{ name: unknown; isHost: unknown; amount: unknown; asWritten: unknown; paidFromRake: unknown }>(d.dealers)
      .map((x) => ({ name: str(x?.name).trim(), isHost: bool(x?.isHost, false), amount: num(x?.amount), asWritten: str(x?.asWritten), paidFromRake: bool(x?.paidFromRake, false) })).filter((x) => x.name),
    payouts: arr<{ recipient: unknown; amount: unknown; asWritten: unknown; verified: unknown }>(d.payouts)
      .map((x) => ({ recipient: str(x?.recipient).trim(), amount: num(x?.amount), asWritten: str(x?.asWritten), verified: bool(x?.verified, false) })).filter((x) => x.recipient),
    transactions: arr<{ player: unknown; kind: unknown; amount: unknown }>(d.transactions)
      .filter((t) => ["buy_in", "rebuy", "cash_out"].includes(str(t?.kind)) && num(t?.amount) != null)
      .map((t) => ({ player: str(t.player).trim(), kind: str(t.kind) as "buy_in" | "rebuy" | "cash_out", amount: num(t.amount) as number })).filter((t) => t.player),
    openQuestions: arr<unknown>(d.openQuestions).map(str).map((s) => s.trim()).filter(Boolean),
    sourceText: source,
  };
}
