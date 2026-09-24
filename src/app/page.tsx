import Link from "next/link";
import { connection } from "next/server";
import { ArrowRight, RefreshCw, Sparkles, PenLine, CircleAlert, CircleCheck, Clock3, Loader } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { Card, Pill, SectionTitle, EmptyState, Stat } from "@/components/ui";
import { EvidenceBadge } from "@/components/badges";
import { ApiButton } from "@/components/actions";
import { VideoCard, VideoChip } from "@/components/video-card";
import { OutlierScatter } from "@/components/charts";
import { getInsights } from "@/server/insights";
import { latestDigest } from "@/server/digest";
import { loadVideos, toClientRow, requestNow } from "@/server/data";
import { db, schema } from "@/db";
import { EVIDENCE_HINT } from "@/lib/patterns";
import { GROUPS } from "@/lib/taxonomy";
import { fmtAgo } from "@/lib/format";
import { hasKey, analyzerMode } from "@/server/env";
import { ccSummary } from "@/server/claude-code";
import { ClaudeCodeCard } from "@/components/claude-code-card";

export default async function TodayPage() {
  await connection();
  const ins = await getInsights();
  const digest = await latestDigest();
  const { rows, byId } = await loadVideos();
  const accounts = await db.select().from(schema.accounts).all();
  const scriptCount = (await db.select({ id: schema.scripts.id }).from(schema.scripts).all()).length;
  const client = (id: string) => {
    const r = byId.get(id);
    return r ? toClientRow(r) : null;
  };
  const outliers = (ins.outliersWeek.length >= 3 ? ins.outliersWeek : ins.outliersRecent).map(toClientRow);
  const outlierIds = outliers.map((o) => o.id);
  const recent = rows.filter((r) => r.publishedAt > requestNow() - 60 * 86_400_000).map(toClientRow);
  const today = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="mx-auto max-w-[1320px] pb-24">
      <PageHeader
        title="Hoje"
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="first-letter:uppercase">{today}</span>
            <span className="text-ink-3">·</span>
            <span>
              {ins.totals.analyzed} vídeos analisados de {ins.totals.accounts} contas
            </span>
            {ins.totals.demo > 0 && <Pill tone="warn">inclui {ins.totals.demo} vídeos de demonstração</Pill>}
          </span>
        }
        actions={
          <>
            <ApiButton url="/api/refresh" icon={<RefreshCw className="size-3.5" />} success="Coleta iniciada para {accounts} contas">
              Atualizar agora
            </ApiButton>
            <Link href="/scripts?new=1" className="inline-flex h-8 items-center gap-1.5 rounded-[6px] bg-accent px-3 text-[13.5px] font-medium text-on-accent shadow-sm transition-[background-color,transform] duration-150 hover:bg-accent-hover active:scale-[0.97]">
              <PenLine className="size-3.5" /> Gerar roteiro
            </Link>
          </>
        }
      />

      {analyzerMode() === "claude_code" && (
        <div className="mb-10 px-page">
          <ClaudeCodeCard {...(await ccSummary())} />
        </div>
      )}

      <div className="stagger mb-14 grid grid-cols-2 gap-3 px-page md:gap-4 xl:grid-cols-4">
        <Card interactive className="p-5">
          <Stat label="Vídeos analisados" value={ins.totals.analyzed} sub={`de ${ins.totals.videos} coletados`} />
        </Card>
        <Card interactive className="p-5">
          <Stat label="Outliers em 7 dias" value={ins.outliersWeek.length} sub="acima do normal da própria conta" />
        </Card>
        <Card interactive className="p-5">
          <Stat label="Contas monitoradas" value={accounts.filter((a) => a.active).length} sub={`${accounts.filter((a) => a.group === "competitor").length} concorrentes diretos`} />
        </Card>
        <Link href="/scripts" className="group rounded-[var(--radius-card)] bg-surface p-5 ring-1 ring-hairline block-hover">
          <Stat
            label="Roteiros gerados"
            value={scriptCount}
            sub={
              <span className="inline-flex items-center gap-1 transition-colors group-hover:text-ink">
                ver histórico <ArrowRight className="nudge size-3" />
              </span>
            }
          />
        </Link>
      </div>

      <div className="grid gap-12 px-page xl:grid-cols-[1.5fr_1fr] xl:gap-10">
        {/* Resumo semanal */}
        <Card className="p-6 md:p-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-2">
              <Sparkles className="size-3.5" /> Resumo da semana
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-ink-3">{digest.saved ? `gerado ${fmtAgo(digest.createdAt)}${digest.generator === "heuristic" ? " (sem IA)" : digest.generator === "claude-code" ? " pelo Claude Code" : ""}` : "calculado agora (sem IA)"}</span>
              <ApiButton url="/api/digest" size="sm" variant="ghost" success="Resumo na fila; aparece aqui quando ficar pronto">
                Regenerar
              </ApiButton>
            </div>
          </div>
          <h2 className="text-[24px] font-bold leading-[1.25] tracking-[-0.02em] text-ink md:text-[26px]">{digest.data.headline}</h2>
          <p className="mt-3 max-w-[68ch] text-[15px] leading-[1.7] text-ink-2">{digest.data.summary}</p>
          <ol className="mt-8 space-y-7">
            {digest.data.patterns.map((p, i) => (
              <li key={i} className="flex gap-4">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-semibold text-ink-2 tabular">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-semibold text-ink">{p.title}</span>
                    <EvidenceBadge level={p.strength} hint={EVIDENCE_HINT[p.strength]} />
                  </div>
                  <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{p.insight}</p>
                  <p className="mt-1 text-[12.5px] text-ink-3 tabular">{p.evidence}</p>
                  <p className="mt-2.5 flex items-start gap-2 text-[14px] font-medium text-ink">
                    <ArrowRight className="mt-[3px] size-3.5 shrink-0" />
                    {p.action}
                  </p>
                  {p.videoIds.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {p.videoIds.map((id) => {
                        const r = client(id);
                        return r ? <VideoChip key={id} row={r} list={p.videoIds} /> : null;
                      })}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {digest.data.watchOut.length > 0 && (
            <div className="mt-8 flex gap-3 rounded-[8px] bg-surface-2 p-4">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
              <div>
                <div className="mb-1 text-[13px] font-semibold text-ink">Cuidado com</div>
                <ul className="space-y-1 text-[13.5px] leading-relaxed text-ink-2">
                  {digest.data.watchOut.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </Card>

        {/* Oportunidades */}
        <section aria-labelledby="opps">
          <SectionTitle id="opps" hint="Onde há mais chance de performar agora">
            Oportunidades recomendadas
          </SectionTitle>
          <div className="stagger space-y-3">
            {ins.opportunities.length === 0 && (
              <Card>
                <EmptyState icon={<Sparkles className="size-5" />} title="Sem oportunidades claras ainda">
                  Colete e analise mais vídeos para os padrões aparecerem.
                </EmptyState>
              </Card>
            )}
            {ins.opportunities.map((o) => {
              const q = new URLSearchParams({ new: "1", ...(o.seed.theme ? { theme: o.seed.theme } : {}), ...(o.seed.hookType ? { hook: o.seed.hookType } : {}) });
              return (
                <Card key={o.id} interactive className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-[15px] font-semibold leading-snug text-ink">{o.title}</h3>
                    <EvidenceBadge level={o.evidence} hint={EVIDENCE_HINT[o.evidence]} />
                  </div>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">{o.why}</p>
                  <p className="mt-2 text-[13.5px] font-medium text-ink">{o.action}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-1.5">
                    {o.ids.slice(0, 3).map((id) => {
                      const r = client(id);
                      return r ? <VideoChip key={id} row={r} list={o.ids} /> : null;
                    })}
                    <Link href={`/scripts?${q}`} className="group ml-auto inline-flex h-7 items-center gap-1 rounded-[6px] px-2 text-[13px] font-medium text-ink transition-colors hover:bg-hover">
                      Gerar roteiro <ArrowRight className="nudge size-3.5" />
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      </div>

      {/* Outliers */}
      <section className="mt-20 px-page" aria-labelledby="outliers">
        <SectionTitle
          id="outliers"
          hint={ins.outliersWeek.length >= 3 ? "Publicados nos últimos 7 dias, acima do normal da própria conta" : "Poucos outliers nesta semana; mostrando breakouts dos últimos 30 dias"}
          action={<SeeAll href="/videos?band=breakout">Ver todos</SeeAll>}
        >
          Outliers {ins.outliersWeek.length >= 3 ? "da semana" : "recentes"}
        </SectionTitle>
        {outliers.length ? (
          <div className="no-scrollbar bleed-page px-page stagger flex gap-4 overflow-x-auto pb-2 pt-1">
            {outliers.map((r) => (
              <VideoCard key={r.id} row={r} list={outlierIds} size="sm" />
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState title="Nenhum outlier recente">Quando um vídeo passar de 2× a mediana da conta, ele aparece aqui e você recebe uma notificação.</EmptyState>
          </Card>
        )}
      </section>

      <section className="mt-20 px-page" aria-labelledby="scatter">
        <SectionTitle id="scatter" hint="Cada ponto é um Reel. Acima de 0 = melhor que a mediana da própria conta.">
          Desempenho ao longo do tempo
        </SectionTitle>
        <Card className="p-4 md:p-6">
          <OutlierScatter rows={recent} now={requestNow()} />
        </Card>
      </section>

      {/* Status */}
      <section className="mt-20 px-page" aria-labelledby="status">
        <SectionTitle
          id="status"
          hint={hasKey("apify") ? "Coleta automática configurada em Configurações" : "Configure APIFY_TOKEN para coletar dados reais"}
          action={<SeeAll href="/accounts#gerenciar">Gerenciar contas</SeeAll>}
        >
          Status da última atualização
        </SectionTitle>
        <div className="border-t border-hairline">
          {accounts.map((a) => {
            const vids = rows.filter((r) => r.accountId === a.id);
            const pending = vids.filter((r) => ["pending", "running", "blocked", "failed"].some((s) => Object.values(r.status).includes(s as never))).length;
            const Icon = a.lastScrapeStatus === "running" ? Loader : a.lastScrapeStatus === "error" ? CircleAlert : a.lastScrapedAt ? CircleCheck : Clock3;
            return (
              <div key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-hairline px-2 py-3 text-[14px] transition-colors hover:bg-hover">
                <Icon className={`size-4 ${a.lastScrapeStatus === "error" ? "text-bad" : a.lastScrapedAt ? "text-good" : "text-ink-3"} ${a.lastScrapeStatus === "running" ? "animate-spin" : ""}`} />
                <Link href={`/videos?account=${a.id}`} className="link-underline min-w-32 font-medium text-ink">
                  @{a.handle}
                </Link>
                <span className="text-ink-3">{GROUPS[a.group]}</span>
                <span className="text-ink-2">{a.lastScrapedAt ? `coletado ${fmtAgo(a.lastScrapedAt)}` : a.isDemo ? "só dados de demonstração" : "nunca coletado"}</span>
                <span className="ml-auto text-[13px] text-ink-3 tabular">
                  {vids.length} vídeos{pending ? ` · ${pending} com etapas pendentes` : ""}
                </span>
                {a.lastError && <span className="w-full pl-8 text-[12.5px] text-bad">{a.lastError}</span>}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function SeeAll({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="group inline-flex shrink-0 items-center gap-1 rounded-[6px] px-2 py-1 text-[13px] font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink">
      {children} <ArrowRight className="nudge size-3.5" />
    </Link>
  );
}
