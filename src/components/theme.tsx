"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Sun, Moon, Monitor, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { THEME_KEY as KEY } from "@/lib/theme-script";

export type ThemePref = "system" | "light" | "dark";

type Ctx = { pref: ThemePref; resolved: "light" | "dark"; setPref: (p: ThemePref) => void };
const ThemeCtx = createContext<Ctx>({ pref: "system", resolved: "light", setPref: () => {} });
export const useTheme = () => useContext(ThemeCtx);

function systemDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>("system");
  const [sysDark, setSysDark] = useState(false);

  useEffect(() => {
    try {
      const t = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- preferência salva no navegador (não existe no SSR)
      if (t === "light" || t === "dark") setPrefState(t);
    } catch {}
    setSysDark(systemDark());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => setSysDark(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const setPref = useCallback((p: ThemePref) => {
    const root = document.documentElement;
    root.classList.add("theme-transition");
    if (p === "system") delete root.dataset.theme;
    else root.dataset.theme = p;
    try {
      if (p === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, p);
    } catch {}
    setPrefState(p);
    window.setTimeout(() => root.classList.remove("theme-transition"), 320);
  }, []);

  const resolved = pref === "system" ? (sysDark ? "dark" : "light") : pref;
  return <ThemeCtx.Provider value={{ pref, resolved, setPref }}>{children}</ThemeCtx.Provider>;
}

/** Botão compacto: alterna claro ↔ escuro com o ícone girando. */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolved, setPref } = useTheme();
  const dark = resolved === "dark";
  return (
    <button
      onClick={() => setPref(dark ? "light" : "dark")}
      className={cn("relative grid size-8 place-items-center overflow-hidden rounded-[6px] text-ink-2 transition-colors hover:bg-hover hover:text-ink active:scale-95", className)}
      aria-label={dark ? "Mudar para o tema claro" : "Mudar para o tema escuro"}
      title={dark ? "Tema claro" : "Tema escuro"}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={resolved}
          initial={{ rotate: -90, scale: 0.4, opacity: 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          exit={{ rotate: 90, scale: 0.4, opacity: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 26 }}
          className="grid place-items-center"
        >
          {dark ? <Moon className="size-4" /> : <Sun className="size-4" />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

const OPTIONS: { value: ThemePref; label: string; icon: ReactNode }[] = [
  { value: "system", label: "Sistema", icon: <Monitor className="size-3.5" /> },
  { value: "light", label: "Claro", icon: <Sun className="size-3.5" /> },
  { value: "dark", label: "Escuro", icon: <Moon className="size-3.5" /> },
];

/** Três opções em linha (menus e barra lateral). */
export function ThemeSegment() {
  const { pref, setPref } = useTheme();
  return (
    <div role="radiogroup" aria-label="Tema" className="relative flex rounded-[7px] bg-hover p-0.5">
      {OPTIONS.map((o) => {
        const on = pref === o.value;
        return (
          <button key={o.value} role="radio" aria-checked={on} onClick={() => setPref(o.value)} title={o.label} className={cn("relative z-10 grid h-6 flex-1 place-items-center rounded-[5px] transition-colors", on ? "text-ink" : "text-ink-3 hover:text-ink-2")}>
            {on && <motion.span layoutId="theme-seg" transition={{ type: "spring", stiffness: 500, damping: 36 }} className="absolute inset-0 -z-10 rounded-[5px] bg-surface shadow-sm ring-1 ring-hairline" />}
            {o.icon}
            <span className="sr-only">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Seletor de aparência com miniaturas (Configurações). */
export function ThemePicker() {
  const { pref, setPref } = useTheme();
  return (
    <div role="radiogroup" aria-label="Aparência" className="grid grid-cols-3 gap-3 sm:max-w-[520px]">
      {OPTIONS.map((o) => {
        const on = pref === o.value;
        return (
          <button key={o.value} role="radio" aria-checked={on} onClick={() => setPref(o.value)} className="group text-left">
            <div className={cn("relative aspect-[4/3] overflow-hidden rounded-[10px] ring-1 transition-all duration-200 group-hover:-translate-y-0.5 group-active:scale-[0.98]", on ? "ring-2 ring-ink" : "ring-hairline-strong group-hover:ring-ink-3")}>
              {o.value === "system" ? (
                <div className="flex size-full">
                  <Mini dark={false} />
                  <Mini dark />
                </div>
              ) : (
                <Mini dark={o.value === "dark"} />
              )}
              <AnimatePresence>
                {on && (
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: "spring", stiffness: 500, damping: 22 }} className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-accent text-on-accent shadow-sm">
                    <Check className="size-3" strokeWidth={3} />
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            <div className={cn("mt-2 flex items-center gap-1.5 text-[13px]", on ? "font-medium text-ink" : "text-ink-2")}>
              {o.icon}
              {o.label}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function Mini({ dark }: { dark: boolean }) {
  const bg = dark ? "#191919" : "#ffffff";
  const side = dark ? "#202020" : "#f8f8f7";
  const line = dark ? "rgba(255,255,255,.14)" : "rgba(55,53,47,.12)";
  const ink = dark ? "rgba(255,255,255,.75)" : "rgba(47,46,43,.85)";
  return (
    <div className="flex size-full min-w-0 flex-1" style={{ background: bg }}>
      <div className="w-[28%] space-y-1 p-1.5" style={{ background: side }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-1 rounded-full" style={{ background: line, width: `${80 - i * 12}%` }} />
        ))}
      </div>
      <div className="flex-1 space-y-1.5 p-2">
        <div className="h-1.5 w-1/2 rounded-full" style={{ background: ink }} />
        <div className="h-1 w-5/6 rounded-full" style={{ background: line }} />
        <div className="h-1 w-2/3 rounded-full" style={{ background: line }} />
        <div className="mt-2 grid grid-cols-2 gap-1">
          <div className="h-5 rounded-[3px]" style={{ border: `1px solid ${line}` }} />
          <div className="h-5 rounded-[3px]" style={{ border: `1px solid ${line}` }} />
        </div>
      </div>
    </div>
  );
}
