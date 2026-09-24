/**
 * Login por senha. Duas senhas: a da equipe (DASHBOARD_PASSWORD, só leitura) e a do dono
 * (OWNER_PASSWORD, pode coletar, pedir IA e mudar configurações). O cookie guarda só um hash.
 */
export const AUTH_COOKIE = "hitzz_auth";

export async function authToken(password: string) {
  const data = new TextEncoder().encode(`hitzz-dashboard:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Comparação em tempo constante, para não vazar o token por diferença de tempo. */
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export type Role = "owner" | "team";

/** Senhas configuradas; a do dono só vale se for diferente da da equipe. */
export function passwords() {
  const team = process.env.DASHBOARD_PASSWORD?.trim() || null;
  const owner = process.env.OWNER_PASSWORD?.trim() || null;
  return { team, owner: owner && owner !== team ? owner : null };
}

/** Papel do cookie. Sem senha configurada (uso local no Mac), quem abre o app é o dono. */
export async function roleOf(cookie: string | undefined): Promise<Role | null> {
  const { team, owner } = passwords();
  if (!team) return "owner";
  if (!cookie) return null;
  if (owner && safeEqual(cookie, await authToken(owner))) return "owner";
  if (safeEqual(cookie, await authToken(team))) return "team";
  return null;
}
