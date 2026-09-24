import type { Metadata } from "next";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";
  const error = sp.erro === "1";
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-bg px-4">
      <form action="/api/login" method="post" className="squircle w-full max-w-sm rounded-[20px] bg-surface p-7 shadow-lg ring-1 ring-hairline">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="squircle grid size-9 place-items-center rounded-[10px] bg-accent text-[15px] font-bold text-white">H</span>
          <div>
            <div className="text-[15px] font-semibold">UseHitzz</div>
            <div className="text-[12px] text-ink-3">Inteligência de conteúdo</div>
          </div>
        </div>
        <label htmlFor="password" className="mb-1.5 block text-[12.5px] font-medium text-ink-2">
          Senha da equipe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoFocus
          required
          autoComplete="current-password"
          className="h-10 w-full rounded-[10px] bg-surface-2 px-3 text-[14px] ring-1 ring-hairline outline-none focus:ring-2 focus:ring-[var(--focus)]"
        />
        <input type="hidden" name="next" value={next} />
        {error && (
          <p role="alert" className="mt-2 text-[12.5px] text-bad">
            Senha incorreta.
          </p>
        )}
        <button type="submit" className="squircle mt-4 h-10 w-full rounded-[10px] bg-accent text-[14px] font-medium text-white shadow-sm hover:bg-accent-hover active:scale-[0.98]">
          Entrar
        </button>
      </form>
    </div>
  );
}
