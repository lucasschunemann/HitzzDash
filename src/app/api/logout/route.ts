import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/auth";

/** Sai; com ?modo=admin volta direto para a aba de administrador do login. */
export async function GET(req: Request) {
  const admin = new URL(req.url).searchParams.get("modo") === "admin";
  const res = NextResponse.redirect(new URL(admin ? "/login?modo=admin" : "/login", req.url), 303);
  res.cookies.delete(AUTH_COOKIE);
  return res;
}
