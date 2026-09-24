const intFmt = new Intl.NumberFormat("pt-BR");
const compactFmt = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

export const fmtInt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : intFmt.format(Math.round(n)));
export const fmtCompact = (n: number | null | undefined) => (n === null || n === undefined ? "—" : compactFmt.format(n));
export const fmtRatio = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: n >= 10 ? 0 : 1 }).format(n)}×`;
export const fmtScore = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${n > 0 ? "+" : ""}${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
export const fmtPct = (n: number | null | undefined, digits = 1) =>
  n === null || n === undefined ? "—" : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits }).format(n * 100)}%`;
export const fmtDate = (t: number) => new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
export const fmtDateTime = (t: number) => new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
export const fmtDuration = (s: number | null | undefined) => (s === null || s === undefined ? "—" : s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, "0")}`);

export function fmtAgo(t: number, now = Date.now()) {
  const d = (now - t) / 1000;
  if (d < 60) return "agora";
  if (d < 3600) return `há ${Math.floor(d / 60)} min`;
  if (d < 86400) return `há ${Math.floor(d / 3600)} h`;
  const days = Math.floor(d / 86400);
  if (days < 30) return `há ${days} ${days === 1 ? "dia" : "dias"}`;
  const m = Math.floor(days / 30);
  return `há ${m} ${m === 1 ? "mês" : "meses"}`;
}
