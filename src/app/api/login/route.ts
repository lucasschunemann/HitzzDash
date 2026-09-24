import { NextResponse } from "next/server";
import { AUTH_COOKIE, authToken, passwords, safeEqual } from "@/lib/auth";

/**
 * Login pelas abas Equipe / Administrador. Na aba de administrador só a senha do dono entra;
 * na da equipe, a senha da equipe (ou a do dono, que entra como administrador).
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");
  const wantsOwner = form.get("role") === "owner";
  const { team, owner } = passwords();
  const target = new URL(next.startsWith("/") && !next.startsWith("//") ? next : "/", req.url);
  const given = await authToken(password);
  const isOwner = Boolean(owner) && safeEqual(given, await authToken(owner!));
  const isTeam = Boolean(team) && safeEqual(given, await authToken(team!));
  const expected = isOwner ? owner : isTeam && !wantsOwner ? team : null;
  if (!expected) {
    // pequena espera para desestimular tentativa e erro
    await new Promise((r) => setTimeout(r, 600));
    const back = new URL("/login", req.url);
    back.searchParams.set("erro", wantsOwner ? (owner ? "admin" : "sem-admin") : "1");
    if (wantsOwner) back.searchParams.set("modo", "admin");
    if (next !== "/") back.searchParams.set("next", next);
    return NextResponse.redirect(back, 303);
  }
  const res = NextResponse.redirect(target, 303);
  res.cookies.set(AUTH_COOKIE, await authToken(expected), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
