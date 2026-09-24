import type { Metadata } from "next";
import Link from "next/link";
import { passwords } from "@/lib/auth";

export const metadata: Metadata = { title: "Entrar" };

const ERRORS: Record<string, string> = {
  "1": "Senha incorreta. Tente de novo.",
  admin: "Senha de administrador incorreta.",
  "sem-admin": "O acesso de administrador ainda não foi configurado (OWNER_PASSWORD).",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";
  const admin = sp.modo === "admin";
  const error = typeof sp.erro === "string" ? ERRORS[sp.erro] ?? ERRORS["1"] : null;
  const hasOwner = Boolean(passwords().owner);
  const tab = (on: boolean) =>
    `relative z-10 flex h-8 flex-1 items-center justify-center rounded-[5px] text-[13.5px] font-medium transition-colors ${on ? "bg-surface text-ink shadow-sm ring-1 ring-hairline" : "text-ink-3 hover:text-ink-2"}`;
  const href = (modo: string) => `/login?modo=${modo}${next !== "/" ? `&next=${encodeURIComponent(next)}` : ""}`;
  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-5">
      <form action="/api/login" method="post" className="w-full max-w-[340px] py-16">
        <span className="mb-8 grid size-11 place-items-center rounded-[9px] bg-accent text-[20px] font-bold text-on-accent">H</span>
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.025em] text-ink">Entrar no UseHitzz</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">Inteligência de conteúdo dos Reels do nicho de calçados.</p>

        <div role="tablist" aria-label="Tipo de acesso" className="mt-10 flex rounded-[7px] bg-accent-soft p-0.5">
          <Link href={href("equipe")} role="tab" aria-selected={!admin} className={tab(!admin)} replace>
            Equipe
          </Link>
          <Link href={href("admin")} role="tab" aria-selected={admin} className={tab(admin)} replace>
            Administrador
          </Link>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
          {admin ? "Coleta, análises, roteiros com IA, contas e configurações." : "Consulta de vídeos, padrões, resumo e roteiros da semana."}
        </p>

        <label htmlFor="password" className="mb-1.5 mt-6 block text-[12.5px] font-medium text-ink-2">
          {admin ? "Senha de administrador" : "Senha da equipe"}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoFocus
          required
          autoComplete="current-password"
          placeholder="Digite a senha"
          className="h-10 w-full rounded-[6px] bg-surface px-3 text-[15px] text-ink ring-1 ring-hairline-strong outline-none transition-shadow placeholder:text-ink-3 focus:ring-2 focus:ring-[var(--focus)]"
        />
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="role" value={admin ? "owner" : "team"} />
        {error && (
          <p role="alert" className="page-in mt-2.5 text-[13px] text-bad">
            {error}
          </p>
        )}
        {admin && !hasOwner && !error && <p className="mt-2.5 text-[13px] text-warn">{ERRORS["sem-admin"]}</p>}
        <button type="submit" className="mt-4 h-10 w-full rounded-[6px] bg-accent text-[14.5px] font-medium text-on-accent shadow-sm transition-[background-color,transform] duration-150 hover:bg-accent-hover active:scale-[0.98]">
          Continuar
        </button>
        <p className="mt-8 text-[12.5px] text-ink-3">Acesso restrito à equipe UseHitzz.</p>
      </form>
    </div>
  );
}
