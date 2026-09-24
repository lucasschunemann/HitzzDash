import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { Card, Pill, SectionTitle, EmptyState } from "@/components/ui";
import { EvidenceBadge } from "@/components/badges";
import { Heatmap } from "@/components/charts";
import { VideoChip } from "@/components/video-card";
import { RankingCard, TrendList, EvidenceLegend, type LabeledStat } from "@/components/patterns-view";
import { getInsights, labelFor, DIM_LABEL, type Dimension } from "@/server/insights";
import { loadVideos, toClientRow, type ClientVideoRow } from "@/server/data";
import { EVIDENCE_HINT, type GroupStat } from "@/lib/patterns";
import { HOOK_TYPES, THEMES, FORMATS } from "@/lib/taxonomy";
import { fmtPct, fmtScore } from "@/lib/format";

export const metadata: Metadata = { title: "Padrões" };

export default async function PatternsPage() {
  await connection();
  const ins = await getInsights();
  const { byId } = await loadVideos();
  const rows: Record<string, ClientVideoRow> = {};
  const add = (ids: string[]) => ids.forEach((id) => byId.get(id) && (rows[id] = toClientRow(byId.get(id)!)));
  const lab = (dim: Dimension, list: GroupStat[]): LabeledStat[] => list.map((s) => (add(s.topIds), { ...s, label: labelFor(dim, s.key) }));
  const hooks = lab("hookType", ins.hooks);
  const formats = lab("format", ins.formats);
  const themes = lab("theme", ins.themes);
  const ctas = lab("ctaType", ins.ctas.filter((c) => c.key !== "none" || c.n >= 5));
  const offers = lab("offerType", ins.offers);
  const structures = lab("structure", ins.structures.slice(0, 8));
  ins.topPatterns.forEach((p) => add(p.ids));
  ins.themeTrends.forEach((t) => add(t.ids));
  ins.gaps.forEach((g) => add(g.ids));
  ins.openings.forEach((o) => add(o.ids));
  const themeLabels = Object.fromEntries(Object.entries(THEMES));
  const hookLabels = Object.fromEntries(Object.entries(HOOK_TYPES).map(([k, v]) => [k, v.label]));
  const formatLabels = Object.fromEntries(Object.entries(FORMATS));

  if (ins.totals.analyzed < 3) {
    return (
      <div>
        <PageHeader title="Padrões" />
        <EmptyState title="Ainda não há vídeos analisados suficientes">Adicione contas e rode uma coleta. Os padrões aparecem a partir de alguns vídeos analisados.</EmptyState>
      </div>
    );
  }

  const nav = [
    ["importam", "Os que importam"],
    ["hooks", "Hooks"],
    ["formatos", "Formatos"],
    ["temas", "Temas"],
    ["estruturas", "Estruturas"],
    ["ctas", "CTAs"],
    ["ofertas", "Ofertas"],
    ["lacunas", "Lacunas"],
    ["metodo", "Método"],
  ];

  return (
    <div className="mx-auto max-w-[1280px] pb-20">
      <PageHeader
        title="Padrões"
        subtitle={
          <>
            Baseado em {ins.totals.market} vídeos de concorrentes e referências{ins.totals.demo ? ` (${ins.totals.demo} de demonstração)` : ""}. A conta própria entra só nas lacunas e comparações.
          </>
        }
      />
      <nav className="scrollbar-thin -mt-1 mb-6 flex gap-1.5 overflow-x-auto px-4 md:px-8" aria-label="Seções">
        {nav.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="h-7 shrink-0 rounded-full bg-surface px-3 text-[12.5px] font-medium leading-7 text-ink-2 shadow-sm ring-1 ring-hairline hover:text-ink">
            {label}
          </a>
        ))}
      </nav>

      <div className="space-y-9 px-4 md:px-8">
        <section id="importam" className="scroll-mt-20">
          <SectionTitle hint="Ranqueados por diferença de score × tamanho de amostra × força da evidência. Padrões que descrevem os mesmos vídeos são agrupados.">
            Os padrões que importam agora
          </SectionTitle>
          <div className="grid gap-3 md:grid-cols-2">
            {ins.topPatterns.map((p, i) => (
              <Card key={p.id} className="p-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-[12px] font-semibold text-ink-2 tabular">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Pill>{DIM_LABEL[p.dimension]}</Pill>
                      <span className="text-[14px] font-semibold text-ink">{p.label}</span>
                    </div>
                    <p className="mt-1 text-[12.5px] text-ink-2">{p.statement}</p>
                    {p.alsoAs.length > 0 && <p className="mt-0.5 text-[12px] text-ink-3">Os mesmos vídeos também aparecem como {p.alsoAs.join(", ")}.</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <EvidenceBadge level={p.evidence} hint={p.evidenceHint} />
                      <span className="text-[12px] text-ink-3 tabular">
                        {p.n} vídeos · {p.nAccounts} contas · {fmtPct(p.hitRate, 0)} acima do normal
                      </span>
                    </div>
                    <p className="mt-2 flex items-start gap-1.5 text-[12.5px] font-medium text-ink">
                      <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-accent" />
                      {p.action}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {p.ids.slice(0, 3).map((id) => (rows[id] ? <VideoChip key={id} row={rows[id]} list={p.ids} /> : null))}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
          {ins.weakPatterns.length > 0 && (
            <p className="mt-3 text-[12.5px] text-ink-2">
              <span className="font-medium text-ink">Abaixo do geral: </span>
              {ins.weakPatterns.map((p) => `${DIM_LABEL[p.dimension].toLowerCase()} "${p.label}" (${fmtScore(p.lift)}, n=${p.n})`).join(" · ")}
            </p>
          )}
        </section>

        <section id="hooks" className="grid scroll-mt-20 gap-5 lg:grid-cols-2">
          <RankingCard title="Tipos de hook" hint="Score mediano por tipo de abertura" stats={hooks} rows={rows} scriptParam="hook" />
          <Card className="p-4 md:p-5">
            <SectionTitle hint="Hooks que mais cresceram na janela recente (3 semanas) contra a anterior">Hooks em movimento</SectionTitle>
            <TrendList trends={ins.hookTrends} labelOf={hookLabels} rows={rows} />
          </Card>
        </section>

        <section id="formatos" className="grid scroll-mt-20 gap-5 lg:grid-cols-2">
          <RankingCard title="Formatos" hint="Score mediano por formato de vídeo" stats={formats} rows={rows} />
          <Card className="p-4 md:p-5">
            <SectionTitle hint="Janela recente (3 semanas) contra a anterior">Formatos em movimento</SectionTitle>
            <TrendList trends={ins.formatTrends} labelOf={formatLabels} rows={rows} />
          </Card>
        </section>

        <section id="temas" className="scroll-mt-20 space-y-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <RankingCard title="Temas" hint="Score mediano por tema central" stats={themes} rows={rows} scriptParam="theme" />
            <Card className="p-4 md:p-5">
              <SectionTitle hint="Temas ganhando tração e acelerando (volume e score recentes vs anteriores)">Temas em movimento</SectionTitle>
              <TrendList trends={ins.themeTrends} labelOf={themeLabels} rows={rows} />
            </Card>
          </div>
          <Card className="p-4 md:p-5">
            <SectionTitle hint="Quantos vídeos de cada tema o mercado publicou por semana. Passe o mouse para ver o score médio.">Temas por semana</SectionTitle>
            <Heatmap weeks={ins.heat.weeks} rows={ins.heat.rows} labels={themeLabels} />
          </Card>
        </section>

        <section id="estruturas" className="grid scroll-mt-20 gap-5 lg:grid-cols-2">
          <RankingCard title="Estruturas de vídeo" hint="Sequência de beats (a partir de 3 vídeos com a mesma sequência)" stats={structures} rows={rows} />
          <Card className="p-4 md:p-5">
            <SectionTitle hint="Trechos que se repetem nas aberturas de vídeos acima do normal (números e preços normalizados)">Frases de abertura recorrentes</SectionTitle>
            {ins.openings.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-ink-3">Nenhuma frase se repete em 2+ vídeos de sucesso ainda.</p>
            ) : (
              <div className="divide-y divide-hairline">
                {ins.openings.map((o) => (
                  <div key={o.phrase} className="flex flex-wrap items-center gap-3 py-2.5">
                    <span className="text-[13.5px] font-medium text-ink">“{o.phrase}…”</span>
                    <span className="text-[12px] text-ink-3 tabular">
                      {o.hits} de {o.total} vídeos com essa abertura foram acima do normal
                    </span>
                    <span className="ml-auto flex gap-1">
                      {o.ids.slice(0, 2).map((id) => (rows[id] ? <VideoChip key={id} row={rows[id]} list={o.ids} /> : null))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>

        <section id="ctas" className="grid scroll-mt-20 gap-5 lg:grid-cols-2">
          <RankingCard title="CTAs por score" hint="Score mediano dos vídeos por tipo de CTA" stats={ctas} rows={rows} />
          <RankingCard title="CTAs por engajamento" hint="Qual CTA mais converte em curtidas e comentários por view" stats={[...ctas].sort((a, b) => (b.medianEngagement ?? 0) - (a.medianEngagement ?? 0))} rows={rows} metric="engagement" />
        </section>

        <section id="ofertas" className="scroll-mt-20">
          <RankingCard title="Tipos de oferta" hint="Desconto, lançamento, frete, parcelamento… qual performa melhor" stats={offers} rows={rows} />
        </section>

        <section id="lacunas" className="scroll-mt-20">
          <SectionTitle hint="Temas, formatos e hooks que funcionam no mercado e a UseHitzz não usa, ou que quase ninguém explora">Lacunas</SectionTitle>
          {ins.gaps.length === 0 ? (
            <Card>
              <EmptyState title="Nenhuma lacuna clara">Adicione a conta própria em Configurações para comparar a cobertura.</EmptyState>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {ins.gaps.slice(0, 10).map((g) => {
                const dim = g.dimension as Dimension;
                const label = labelFor(dim, g.key);
                return (
                  <Card key={`${g.dimension}:${g.key}`} className="p-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Pill>{DIM_LABEL[dim]}</Pill>
                      <span className="text-[14px] font-semibold">{label}</span>
                      <Pill tone={g.kind.startsWith("concorrentes") ? "accent" : "outline"}>{g.kind}</Pill>
                    </div>
                    <p className="mt-1.5 text-[12.5px] text-ink-2 tabular">
                      Mercado: {g.marketN} vídeos ({fmtPct(g.marketShare, 0)}) · UseHitzz: {g.ownN} ({fmtPct(g.ownShare, 0)})
                      {g.medianScore !== null && ` · score mediano no mercado ${fmtScore(g.medianScore)}`}
                    </p>
                    {g.kind === "mercado pouco explora" && <p className="mt-1 text-[12px] text-ink-3">Pouca amostra: é uma aposta de diferenciação, não um padrão comprovado.</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {g.ids.map((id) => (rows[id] ? <VideoChip key={id} row={rows[id]} list={g.ids} /> : null))}
                      {(dim === "theme" || dim === "hookType") && (
                        <Link href={`/scripts?new=1&${dim === "theme" ? "theme" : "hook"}=${g.key}`} className="ml-auto inline-flex items-center gap-1 text-[12.5px] font-medium text-accent-ink hover:underline">
                          Roteiro <ArrowRight className="size-3.5" />
                        </Link>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        <section id="metodo" className="scroll-mt-20">
          <Card className="p-5">
            <SectionTitle>Como ler estes números</SectionTitle>
            <div className="space-y-2 text-[13px] leading-relaxed text-ink-2">
              <p>
                <b className="text-ink">Score</b> compara cada vídeo com a mediana das últimas publicações maduras da própria conta, em escala log₂, dividido pela dispersão típica da conta. 0 é o normal da conta; +1 é cerca de uma “oscilação típica” acima. Assim uma conta pequena e uma grande ficam na mesma régua.
              </p>
              <p>
                <b className="text-ink">Correlação não é causa.</b> Com {ins.totals.accounts} contas, muitos padrões refletem o estilo de uma marca. Por isso cada padrão mostra quantas contas o sustentam e o intervalo de confiança (bootstrap, 90%).
              </p>
            </div>
            <div className="mt-4">
              <EvidenceLegend />
            </div>
            <p className="mt-3 text-[12px] text-ink-3">{EVIDENCE_HINT.anedótica}</p>
          </Card>
        </section>
      </div>
    </div>
  );
}
