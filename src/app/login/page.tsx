import type { Metadata } from "next";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";
  const error = sp.erro === "1";
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-bg px-5">
      <form action="/api/login" method="post" className="page-in w-full max-w-[340px] py-16">
        <span className="mb-8 grid size-11 place-items-center rounded-[9px] bg-accent text-[20px] font-bold text-on-accent">H</span>
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.025em] text-ink">Entrar no UseHitzz</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">Inteligência de conteúdo dos Reels do nicho de calçados.</p>
        <label htmlFor="password" className="mb-1.5 mt-10 block text-[12.5px] font-medium text-ink-2">
          Senha da equipe
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
        {error && (
          <p role="alert" className="page-in mt-2.5 text-[13px] text-bad">
            Senha incorreta. Tente de novo.
          </p>
        )}
        <button type="submit" className="mt-4 h-10 w-full rounded-[6px] bg-accent text-[14.5px] font-medium text-on-accent shadow-sm transition-[background-color,transform] duration-150 hover:bg-accent-hover active:scale-[0.98]">
          Continuar
        </button>
        <p className="mt-8 text-[12.5px] text-ink-3">Acesso restrito à equipe UseHitzz.</p>
      </form>
    </div>
  );
}
