import { NextResponse } from "next/server";
import { AUTH_COOKIE, authToken, safeEqual } from "@/lib/auth";

export async function POST(req: Request) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");
  const expected = process.env.DASHBOARD_PASSWORD?.trim();
  const target = new URL(next.startsWith("/") && !next.startsWith("//") ? next : "/", req.url);
  if (!expected || !safeEqual(await authToken(password), await authToken(expected))) {
    // pequena espera para desestimular tentativa e erro
    await new Promise((r) => setTimeout(r, 600));
    const back = new URL("/login", req.url);
    back.searchParams.set("erro", "1");
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
