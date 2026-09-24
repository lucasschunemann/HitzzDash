"use client";

import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { motion, useReducedMotion, animate } from "motion/react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { cn } from "@/lib/cn";

export const spring = { type: "spring" as const, stiffness: 420, damping: 34, mass: 0.8 };
export const softSpring = { type: "spring" as const, stiffness: 260, damping: 30 };

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
  icon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-[6px] font-medium transition-[background-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0",
        size === "sm" ? "h-7 px-2 text-[12.5px]" : "h-8 px-3 text-[13.5px]",
        variant === "primary" && "bg-accent text-on-accent shadow-sm hover:bg-accent-hover",
        variant === "secondary" && "bg-surface text-ink ring-1 ring-hairline-strong hover:bg-hover",
        variant === "ghost" && "text-ink-2 hover:bg-hover hover:text-ink",
        variant === "danger" && "bg-surface text-bad ring-1 ring-hairline-strong hover:bg-bad/8",
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("size-3.5 animate-spin", className)} viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Card({ className, children, interactive, ...rest }: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div className={cn("rounded-[var(--radius-card)] bg-surface ring-1 ring-hairline", interactive && "block-hover", className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, hint, action, id }: { children: ReactNode; hint?: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 id={id} className="text-[17px] font-semibold tracking-[-0.012em] text-ink">
          {children}
        </h2>
        {hint && <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-ink-3">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function Pill({ children, tone = "neutral", className, title }: { children: ReactNode; tone?: "neutral" | "accent" | "good" | "warn" | "bad" | "blue" | "outline"; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-[4px] px-1.5 text-[12px] font-medium leading-none",
        tone === "neutral" && "bg-accent-soft text-ink-2",
        tone === "accent" && "bg-ink/[0.07] text-ink ring-1 ring-inset ring-ink/15",
        tone === "good" && "bg-good/12 text-good",
        tone === "warn" && "bg-warn/14 text-warn",
        tone === "bad" && "bg-bad/12 text-bad",
        tone === "blue" && "bg-[var(--band-below)]/14 text-[var(--band-below)]",
        tone === "outline" && "text-ink-3 ring-1 ring-inset ring-hairline-strong",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

/** Contador animado (respeita prefers-reduced-motion). */
export function AnimatedNumber({ value, format = (n) => new Intl.NumberFormat("pt-BR").format(Math.round(n)), className }: { value: number; format?: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const prev = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) {
      el.textContent = format(value);
      return;
    }
    const c = animate(prev.current, value, {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => (el.textContent = format(v)),
    });
    prev.current = value;
    return () => c.stop();
  }, [value, reduce, format]);
  return <span ref={ref} className={cn("tabular", className)}>{format(0)}</span>;
}

export function Tip({ content, children, side = "top" }: { content: ReactNode; children: ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  if (!content) return <>{children}</>;
  return (
    <Tooltip.Root delayDuration={250}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          sideOffset={6}
          className="tooltip z-[80] max-w-72 rounded-[6px] px-2 py-1 text-[12px] font-medium leading-snug"
        >
          {content}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; icon?: ReactNode }[]; className?: string; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("relative inline-flex rounded-[7px] bg-accent-soft p-0.5", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn("relative z-10 inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-[13px] font-medium transition-colors", active ? "text-ink" : "text-ink-3 hover:text-ink-2")}
          >
            {active && <motion.span layoutId={`seg-${label}`} transition={spring} className="absolute inset-0 -z-10 rounded-[5px] bg-surface shadow-sm ring-1 ring-hairline" />}
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="page-in flex flex-col items-center justify-center px-6 py-16 text-center">
      {icon && <div className="mb-4 grid size-12 place-items-center rounded-[10px] bg-accent-soft text-ink-3 [&_svg]:size-5.5">{icon}</div>}
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {children && <div className="mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-ink-2">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-[4px] bg-accent-soft px-1.5 py-px font-sans text-[11px] font-medium text-ink-3">{children}</kbd>;
}

export function Stat({ label, value, sub, format }: { label: string; value: number | null; sub?: ReactNode; format?: (n: number) => string }) {
  return (
    <div>
      <div className="text-[13px] text-ink-2">{label}</div>
      <div className="mt-2 text-[32px] font-semibold leading-none tracking-[-0.03em] text-ink">{value === null ? "—" : <AnimatedNumber value={value} format={format} />}</div>
      {sub && <div className="mt-2 text-[12.5px] text-ink-3">{sub}</div>}
    </div>
  );
}

/** Revela o conteúdo na primeira vez que entra na tela (gráficos que "desenham" na entrada). */
export function useInView<T extends Element>(margin = "-40px") {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      (e) => {
        if (e.some((x) => x.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen, margin]);
  return [ref, seen] as const;
}
