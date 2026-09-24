import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, roleOf } from "@/lib/auth";

/**
 * Protege o dashboard com a senha da equipe. Sem DASHBOARD_PASSWORD o acesso é livre (uso local);
 * na Vercel a senha é obrigatória: sem ela, nada é servido.
 */
export async function proxy(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD?.trim();
  if (!password) {
    if (process.env.VERCEL) return new NextResponse("Defina DASHBOARD_PASSWORD nas variáveis de ambiente do projeto na Vercel.", { status: 503 });
    return NextResponse.next();
  }
  if (await roleOf(req.cookies.get(AUTH_COOKIE)?.value)) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = req.nextUrl.pathname === "/" ? "" : `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico).*)"],
};
