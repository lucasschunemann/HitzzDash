/**
 * Atualização semanal: rotina do Claude Code na nuvem, toda segunda às 3h (Brasília, UTC-3,
 * sem horário de verão) = segunda 06:00 UTC. Coleta, análise, resumo e os 10 roteiros base.
 */
export const WEEKLY_UPDATE_LABEL = "toda segunda-feira às 3h";

/** Próxima segunda 06:00 UTC depois de `now`. */
export function nextWeeklyUpdate(now = Date.now()) {
  const d = new Date(now);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 6, 0, 0));
  const daysToMonday = (1 - target.getUTCDay() + 7) % 7;
  target.setUTCDate(target.getUTCDate() + daysToMonday);
  if (target.getTime() <= now) target.setUTCDate(target.getUTCDate() + 7);
  return target.getTime();
}

/** "segunda, 28/09 às 3h" no horário de Brasília. */
export function fmtNextWeeklyUpdate(now = Date.now()) {
  const t = new Date(nextWeeklyUpdate(now));
  const day = t.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
  return `segunda, ${day} às 3h`;
}
