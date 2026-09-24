/** Login por senha única da equipe (DASHBOARD_PASSWORD). O cookie guarda só um hash da senha. */
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
