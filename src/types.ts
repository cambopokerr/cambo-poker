export type ID = string;

export type Verification = "verified" | "needs_review";

export type Category =
  | "rake"
  | "food"
  | "drinks"
  | "other_expense"
  | "adjustment"
  | "dealer_earnings";

export const CATEGORY_LABEL: Record<Category, string> = {
  rake: "Rake",
  food: "Food",
  drinks: "Drinks & snacks",
  other_expense: "Other expense",
  adjustment: "Cash adjustment",
  dealer_earnings: "Dealer earnings",
};

export interface FinancialEntry {
  id: ID;
  gameId: ID;
  category: Category;
  /** Normalised amount in AUD. null = could not be confidently interpreted. Adjustments are signed (+ adds to pot). */
  amount: number | null;
  /** The figure exactly as it appeared in the original note. */
  originalText: string;
  verification: Verification;
  /** dealer_earnings only: true if the dealer was paid out of the rake (so it reduces distributable profit). */
  deductFromRake?: boolean;
  /** dealer_earnings only: who dealt for this payment (a game can have several dealers). */
  dealerName?: string;
  dealerPlayerId?: ID | null;
  notes?: string;
}

export type DistributionType = "recipient_share" | "pooled_total";

export interface Distribution {
  id: ID;
  gameId: ID;
  /** Host name, or "Hosts (pooled)" for a total that was split. */
  recipient: string;
  amount: number | null;
  type: DistributionType;
  originalText: string;
  verification: Verification;
  notes?: string;
}

export interface Attendance {
  gameId: ID;
  playerId: ID;
  arrival?: string;
  departure?: string;
  notes?: string;
}

export interface Game {
  id: ID;
  /** ISO date yyyy-mm-dd, or null when the note had no usable date. */
  date: string | null;
  originalDateText: string;
  startTime: string;
  finishTime: string;
  /** Hours. null when neither recorded nor computable. */
  durationHours: number | null;
  durationSource: "recorded" | "computed" | null;
  dealerPlayerId: ID | null;
  dealerName: string;
  /** Where it was played, e.g. "Home game". Optional; imported games have none recorded. */
  location?: string;
  notes: string;
  /** The raw note this game was imported from (empty for games created in the app). */
  sourceText: string;
  /** Outstanding questions about this record. Any entry here means "Needs review". */
  reviewNotes: string[];
  /** "live" while the night is running (Start Game pressed, End Game not yet). Absent/"ended" otherwise. */
  status?: "live" | "ended";
  startedAt?: string;
  endedAt?: string;
}

/** A player's money movement during a game: buying in or cashing out. */
export interface PlayerTransaction {
  id: ID;
  gameId: ID;
  playerId: ID;
  kind: "buy_in" | "cash_out";
  amount: number;
  at: string;
  notes?: string;
}

export interface Player {
  id: ID;
  name: string;
  aliases: string[];
  notes: string;
  isHost: boolean;
}

export interface Settings {
  businessName: string;
  hosts: string[];
  /** Share of distributable profit per host, keyed by host name. Must sum to 1. */
  split: Record<string, number>;
  currency: "AUD";
  /** Default for new dealer-earnings entries: is the dealer paid from the rake? */
  dealerPaidFromRakeByDefault: boolean;
  /** Treat a game as reconciled when |computed net - recorded distribution| <= this many dollars. */
  reconcileTolerance: number;
}

export interface DB {
  version: number;
  settings: Settings;
  games: Game[];
  players: Player[];
  attendance: Attendance[];
  entries: FinancialEntry[];
  distributions: Distribution[];
  transactions: PlayerTransaction[];
}

export type GameStatus = "live" | "reconciled" | "needs_review" | "incomplete";

export const STATUS_LABEL: Record<GameStatus, string> = {
  live: "In progress",
  reconciled: "Completed",
  needs_review: "Needs review",
  incomplete: "Incomplete",
};
