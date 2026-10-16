import type { Player } from "../types";

export const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Damerau–Levenshtein (a swapped pair of letters counts as one edit). */
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
    }
  return dp[m][n];
}

const first = (s: string) => norm(s).replace(/'s\b/g, "").split(/[\s(/]/)[0];
const isRelation = (s: string) => /friend|unresolved|\bor\b/i.test(s);

/**
 * Pairs of players whose names look alike, for manual review only; nothing is merged automatically.
 * Deliberately strict: one edit apart (incl. a swapped pair) on names of 4+ letters, a short form
 * (Phil / Philip), or the same first name written two ways (Chris / Chris (Asian)).
 */
export function possibleDuplicates(players: Player[]): Array<[Player, Player, string]> {
  const out: Array<[Player, Player, string]> = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const A = players[i], B = players[j];
      if (isRelation(A.name) || isRelation(B.name)) continue;
      const a = first(A.name), b = first(B.name);
      if (!a || !b) continue;
      if (a === b) {
        if (norm(A.name) !== norm(B.name)) out.push([A, B, "same first name"]);
        continue;
      }
      if (Math.min(a.length, b.length) < 4) continue;
      const d = editDistance(a, b);
      if (d <= 1) out.push([A, B, "one letter different"]);
      else if ((a.startsWith(b) || b.startsWith(a)) && Math.abs(a.length - b.length) <= 3) out.push([A, B, "one is a short form of the other"]);
    }
  }
  return out;
}

export function findPlayerByName(players: Player[], name: string): Player | undefined {
  const n = norm(name);
  return players.find((p) => norm(p.name) === n || p.aliases.some((a) => norm(a) === n));
}
