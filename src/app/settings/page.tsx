import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { RotateCw, Trash2, Database, Lock } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { SectionTitle, Card } from "@/components/ui";
import { ApiButton } from "@/components/actions";
import { ThemePicker } from "@/components/theme";
import { isOwner } from "@/server/role";
import { IntegrationList, SettingsForm, QueuePanel, type Integration } from "@/components/settings-panels";
import { AddAccountForm, AccountTable } from "@/components/account-manager";
import { ENV_VARS, hasKey, anthropicModel, transcriberMode, analyzerMode } from "@/server/env";
import { hasWhisper, WHISPER_MODEL_NAME } from "@/server/whisper";
import { isVercel } from "@/server/host";
import { isRemoteDb } from "@/db";
import { fmtAgo } from "@/lib/format";
import { hasFfmpeg } from "@/server/media";
import { getSettings } from "@/server/settings";
import { accountStats } from "@/server/accounts";
import { loadVideos } from "@/server/data";
import { SCRIBE_MODEL } from "@/server/scribe";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  await connection();
  if (!(await isOwner())) {
    return (
      <div className="mx-auto max-w-[1040px] pb-24">
        <PageHeader title="Configurações" subtitle="Preferências deste navegador." />
        <div className="space-y-16 px-page">
          <section>
            <SectionTitle hint="Claro, escuro ou seguindo o sistema. A escolha fica salva neste navegador.">Aparência</SectionTitle>
            <ThemePicker />
          </section>
          <section className="flex max-w-[640px] gap-3 rounded-[10px] bg-surface-2 p-5 text-[14px] leading-relaxed text-ink-2">
            <Lock className="mt-0.5 size-4 shrink-0 text-ink-3" />
            <p>
              Contas monitoradas, coleta e processamento são gerenciados pelo responsável pelo dashboard. Os dados, padrões e o resumo são atualizados <b className="font-medium text-ink">toda segunda-feira de madrugada</b>.
            </p>
          </section>
        </div>
      </div>
    );
  }
  const ff = await hasFfmpeg();
  const settings = await getSettings();
  const cloud: Integration[] = [
    { key: "database", label: "Banco compartilhado (Turso)", env: "DATABASE_URL", purpose: "O mesmo banco que o Mac usa para gravar", configured: isRemoteDb(), detail: "" },
    { key: "images", label: "Imagens no banco", env: null, purpose: "Capas, frames e avatares comprimidos em WebP, guardados no Turso e servidos pelo próprio site", configured: isRemoteDb(), detail: "" },
    { key: "password", label: "Senha da equipe", env: "DASHBOARD_PASSWORD", purpose: "Login do dashboard", configured: Boolean(process.env.DASHBOARD_PASSWORD), detail: "" },
    {
      key: "worker",
      label: "Processamento no Mac",
      env: null,
      purpose: "Coleta, Whisper, frames e análise rodam no Mac: npm run cc -- work e “processe os pendentes do Hitzz” no Claude Code",
      configured: Boolean(settings.workerLastSeenAt),
      detail: settings.workerLastSeenAt ? `última execução ${fmtAgo(settings.workerLastSeenAt)}` : "ainda não rodou",
    },
  ];
  const tMode = transcriberMode();
  const aMode = analyzerMode();
  const whisper = await hasWhisper();
  const integrations: Integration[] = [
    { key: "apify", label: ENV_VARS.apify.label, env: ENV_VARS.apify.env, purpose: ENV_VARS.apify.purpose, configured: hasKey("apify"), detail: "actors apify/instagram-reel-scraper e instagram-profile-scraper · plano gratuito tem crédito mensal" },
    tMode === "local"
      ? { key: "transcriber", label: "Transcrição: Whisper local (grátis)", env: null, purpose: "Roda no seu Mac, sem custo", configured: whisper, detail: whisper ? WHISPER_MODEL_NAME : "rode npm run setup:whisper" }
      : { key: "transcriber", label: "Transcrição: ElevenLabs Scribe", env: ENV_VARS.elevenlabs.env, purpose: "API paga", configured: hasKey("elevenlabs"), detail: `modelo ${SCRIBE_MODEL}, português` },
    aMode === "claude_code"
      ? { key: "analyzer", label: "Análise e roteiros: Claude Code (grátis)", env: null, purpose: "Feitos numa sessão do Claude Code com a sua assinatura; sem chave de API", configured: true, detail: "diga “processe os pendentes do Hitzz” no Claude Code" }
      : { key: "analyzer", label: "Análise e roteiros: API da Anthropic", env: ENV_VARS.anthropic.env, purpose: "Automático, pago por uso", configured: hasKey("anthropic"), detail: `modelo ${anthropicModel()}` },
    { key: "ffmpeg", label: "ffmpeg", env: null, purpose: "Extração de áudio e frames-chave (local)", configured: ff, detail: ff ? "encontrado no PATH" : "instale com brew install ffmpeg" },
  ];
  const stats = await accountStats();
  const demo = (await loadVideos()).rows.filter((r) => r.isDemo).length;
  return (
    <div className="mx-auto max-w-[1040px] pb-24">
      <PageHeader title="Configurações" subtitle="Integrações, contas, agendamento e fila de processamento. As chaves ficam só no arquivo .env e nunca aparecem aqui." />
      <div className="space-y-16 px-page">
        <section>
          <SectionTitle hint="Claro, escuro ou seguindo o sistema. A escolha fica salva neste navegador.">Aparência</SectionTitle>
          <ThemePicker />
        </section>

        <section>
          <SectionTitle hint="Edite o .env na raiz do projeto e reinicie o app para aplicar">Integrações</SectionTitle>
          <IntegrationList items={isVercel() ? cloud : integrations} />
          <p className="mt-4 max-w-[80ch] text-[12.5px] leading-relaxed text-ink-3">
            Opcional: com <code className="font-mono">ELEVENLABS_API_KEY</code> a transcrição passa a usar o Scribe; com <code className="font-mono">ANTHROPIC_API_KEY</code> a análise e os roteiros viram automáticos pela API. Para forçar um modo, use <code className="font-mono">TRANSCRIBER=local|elevenlabs</code> e <code className="font-mono">ANALYZER=claude_code|api</code>.
          </p>
        </section>

        <section>
          <SectionTitle>Preferências</SectionTitle>
          <SettingsForm initial={settings} apify={hasKey("apify") || isVercel()} />
        </section>

        <section id="contas">
          <SectionTitle hint="Adicione ou remova quando quiser. Grupo: concorrente direto, referência ou conta própria.">Contas monitoradas</SectionTitle>
          <div className="mb-5">
            <Suspense>
              <AddAccountForm />
            </Suspense>
          </div>
          <AccountTable accounts={stats} />
        </section>

        <section id="fila" className="scroll-mt-20">
          <SectionTitle
            hint="Coletas, processamento de cada vídeo (mídia → transcrição → frames → análise) e roteiros. Falhas temporárias são repetidas com espera crescente."
            action={
              <ApiButton url="/api/process-pending" size="sm" icon={<RotateCw className="size-3.5" />} success="{queued} vídeo(s) enviados para a fila">
                Retomar pendentes
              </ApiButton>
            }
          >
            Fila de processamento
          </SectionTitle>
          <QueuePanel />
        </section>

        <section>
          <SectionTitle hint="Vídeos sintéticos para o dashboard funcionar antes da primeira coleta. A primeira coleta real de cada conta já apaga os demos dela.">Dados de demonstração</SectionTitle>
          <Card className="flex flex-wrap items-center gap-3 p-5">
            <Database className="size-4 text-ink-3" />
            <span className="flex-1 text-[13px] text-ink-2">{demo ? `${demo} vídeos de demonstração no banco.` : "Nenhum vídeo de demonstração no banco."}</span>
            {demo > 0 ? (
              <ApiButton url="/api/demo" body={{ action: "remove" }} variant="danger" size="sm" icon={<Trash2 className="size-3.5" />} confirm="Remover todos os vídeos de demonstração? Vídeos reais não são afetados." success="{removed} vídeos de demonstração removidos">
                Remover demonstração
              </ApiButton>
            ) : (
              <ApiButton url="/api/demo" body={{ action: "restore" }} size="sm" success="Dados de demonstração restaurados">
                Restaurar demonstração
              </ApiButton>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}
