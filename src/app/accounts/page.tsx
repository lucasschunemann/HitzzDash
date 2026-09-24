import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { PageHeader } from "@/components/shell";
import { Card, SectionTitle, Pill } from "@/components/ui";
import { CompareBars, MixBars } from "@/components/charts";
import { AddAccountForm, AccountTable } from "@/components/account-manager";
import { accountStats } from "@/server/accounts";
import { GROUPS, FORMATS, hookLabel } from "@/lib/taxonomy";
import { fmtCompact, fmtPct } from "@/lib/format";
import { ApiButton } from "@/components/actions";
import { RefreshCw } from "lucide-react";

export const metadata: Metadata = { title: "Concorrentes" };

export default async function AccountsPage() {
  await connection();
  const stats = await accountStats();
  const order = { own: 0, competitor: 1, reference: 2 } as const;
  const sorted = [...stats].sort((a, b) => order[a.group] - order[b.group] || (b.medianViews ?? 0) - (a.medianViews ?? 0));
  const own = stats.find((s) => s.group === "own");
  const comps = stats.filter((s) => s.group === "competitor");
  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const bench = {
    ppw: avg(comps.map((c) => c.postsPerWeek)),
    outlier: avg(comps.map((c) => c.outlierRate)),
    eng: avg(comps.map((c) => c.medianEngagement)),
    vpf: avg(comps.map((c) => c.viewsPerFollower)),
  };
  const label = (s: (typeof stats)[number]) => `@${s.handle}`;
  const hl = own ? String(own.id) : undefined;

  return (
    <div className="mx-auto max-w-[1280px] pb-20">
      <PageHeader
        title="Concorrentes"
        subtitle="Compare frequência, alcance típico e taxa de outliers entre as contas, e veja onde a UseHitzz está."
        actions={
          <ApiButton url="/api/refresh" icon={<RefreshCw className="size-3.5" />} success="Coleta iniciada para {accounts} contas">
            Coletar todas
          </ApiButton>
        }
      />
      <div className="space-y-8 px-4 md:px-8">
        {own && (
          <section>
            <SectionTitle hint="Média dos concorrentes diretos como referência">@{own.handle} contra os concorrentes diretos</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Posts por semana", mine: own.postsPerWeek, them: bench.ppw, fmt: (n: number) => n.toFixed(1).replace(".", ",") },
                { label: "Taxa de outliers", mine: own.outlierRate, them: bench.outlier, fmt: (n: number) => fmtPct(n, 0) },
                { label: "Engajamento / view", mine: own.medianEngagement, them: bench.eng, fmt: (n: number) => fmtPct(n) },
                { label: "Views / seguidor", mine: own.viewsPerFollower, them: bench.vpf, fmt: (n: number) => n.toFixed(2).replace(".", ",") },
              ].map((k) => {
                const diff = k.mine !== null && k.them ? k.mine / k.them - 1 : null;
                return (
                  <Card key={k.label} className="p-4">
                    <div className="text-[12px] font-medium text-ink-3">{k.label}</div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-[24px] font-semibold tracking-[-0.02em] tabular">{k.mine === null ? "—" : k.fmt(k.mine)}</span>
                      {diff !== null && (
                        <span className={`text-[12px] font-medium tabular ${diff >= 0 ? "text-good" : "text-bad"}`}>
                          {diff >= 0 ? "+" : ""}
                          {Math.round(diff * 100)}%
                        </span>
                      )}
                    </div>
                    <div className="text-[12px] text-ink-3 tabular">concorrentes: {k.them === null ? "—" : k.fmt(k.them)}</div>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        <section className="grid gap-5 lg:grid-cols-2">
          <Card className="p-4 md:p-5">
            <SectionTitle hint="Mediana das últimas 30 publicações maduras (sem fixados). Referências ficam na tabela abaixo: a escala delas achataria as barras.">Views típicas</SectionTitle>
            <CompareBars items={sorted.filter((s) => s.group !== "reference").map((s) => ({ key: String(s.id), label: label(s), value: s.medianViews, sub: s.followers ? `${fmtCompact(s.followers)} seg.` : undefined }))} highlight={hl} />
          </Card>
          <Card className="p-4 md:p-5">
            <SectionTitle hint="Publicações nas últimas 8 semanas ÷ 8">Frequência de postagem</SectionTitle>
            <CompareBars items={sorted.map((s) => ({ key: String(s.id), label: label(s), value: s.postsPerWeek }))} unit="perWeek" highlight={hl} />
          </Card>
          <Card className="p-4 md:p-5">
            <SectionTitle hint="Parcela dos vídeos acima do normal ou breakout da própria conta">Taxa de outliers</SectionTitle>
            <CompareBars items={sorted.map((s) => ({ key: String(s.id), label: label(s), value: s.outlierRate, sub: `${s.breakouts} breakouts` }))} unit="pct" highlight={hl} />
          </Card>
          <Card className="p-4 md:p-5">
            <SectionTitle hint="Três formatos mais usados no conjunto; o resto em Outros">Mix de formatos</SectionTitle>
            <MixBars rows={sorted.map((s) => ({ key: String(s.id), label: label(s), mix: s.formatMix }))} labels={FORMATS} />
          </Card>
        </section>

        <section>
          <SectionTitle hint="Resumo por conta">Visão geral</SectionTitle>
          <Card className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead>
                <tr className="border-b border-hairline text-left text-[11.5px] text-ink-3">
                  <th className="px-4 py-2 font-medium">Conta</th>
                  <th className="px-3 py-2 font-medium">Grupo</th>
                  <th className="px-3 py-2 text-right font-medium">Seguidores</th>
                  <th className="px-3 py-2 text-right font-medium">Views típicas</th>
                  <th className="px-3 py-2 text-right font-medium">Posts/sem</th>
                  <th className="px-3 py-2 text-right font-medium">Outliers</th>
                  <th className="px-3 py-2 text-right font-medium">Eng./view</th>
                  <th className="px-3 py-2 text-right font-medium">Com fala</th>
                  <th className="px-3 py-2 font-medium">Hook mais usado</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((s) => (
                  <tr key={s.id} className={`border-b border-hairline last:border-0 ${s.group === "own" ? "bg-accent-soft/40" : ""}`}>
                    <td className="px-4 py-2 font-medium">
                      @{s.handle} {s.isDemo && <Pill tone="warn">demo</Pill>}
                    </td>
                    <td className="px-3 py-2 text-ink-2">{GROUPS[s.group]}</td>
                    <td className="px-3 py-2 text-right tabular">{fmtCompact(s.followers)}</td>
                    <td className="px-3 py-2 text-right tabular">{fmtCompact(s.medianViews)}</td>
                    <td className="px-3 py-2 text-right tabular">{s.postsPerWeek.toFixed(1).replace(".", ",")}</td>
                    <td className="px-3 py-2 text-right tabular">{fmtPct(s.outlierRate, 0)}</td>
                    <td className="px-3 py-2 text-right tabular">{fmtPct(s.medianEngagement)}</td>
                    <td className="px-3 py-2 text-right tabular">{fmtPct(s.speechShare, 0)}</td>
                    <td className="px-3 py-2 text-ink-2">{hookLabel(s.topHook)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>

        <section id="gerenciar">
          <SectionTitle hint="Concorrente direto, referência do mercado ou conta própria. Novas contas entram na fila de coleta na hora.">Gerenciar contas</SectionTitle>
          <div className="mb-3">
            <Suspense>
              <AddAccountForm />
            </Suspense>
          </div>
          <AccountTable accounts={sorted} />
        </section>
      </div>
    </div>
  );
}
