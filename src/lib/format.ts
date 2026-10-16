const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 });
const aud0 = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

export const money = (n: number | null | undefined, whole = false): string =>
  n == null || Number.isNaN(n) ? "–" : (whole ? aud0 : aud).format(n);

export const signedMoney = (n: number | null | undefined): string =>
  n == null ? "–" : (n > 0 ? "+" : "") + money(n);

export function fmtDate(iso: string | null, fallback = "Date unknown"): string {
  if (!iso) return fallback;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
export function fmtDateShort(iso: string | null): string {
  if (!iso) return "–";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" });
}
export function fmtMonth(key: string): string {
  if (key === "unknown") return "Unknown date";
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-AU", { month: "short", year: "numeric" });
}
export const fmtHours = (h: number | null): string => (h == null ? "–" : `${h % 1 === 0 ? h : h.toFixed(1)} h`);
export const pct = (n: number): string => `${Math.round(n * 100)}%`;
export const todayISO = (): string => new Date().toISOString().slice(0, 10);
export const uid = (): string => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
