import "server-only";
import { cookies } from "next/headers";
import { AUTH_COOKIE, roleOf, type Role } from "@/lib/auth";

/**
 * Quem está usando: o dono (Lucas) ou a equipe. Ações que gastam tokens do Claude, créditos da
 * Apify ou mudam a configuração ficam só com o dono; a equipe consulta dados, padrões e roteiros.
 */
export async function getRole(): Promise<Role> {
  return (await roleOf((await cookies()).get(AUTH_COOKIE)?.value)) ?? "team";
}

export async function isOwner() {
  return (await getRole()) === "owner";
}

/** Nas rotas da API: devolve 403 para quem não é o dono, ou null para seguir. */
export async function ownerOnly(): Promise<Response | null> {
  if (await isOwner()) return null;
  return Response.json({ error: "Só o administrador do dashboard pode fazer isso. Os dados são atualizados toda segunda-feira de madrugada." }, { status: 403 });
}
