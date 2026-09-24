/**
 * Modo Claude Code: a análise dos vídeos, o resumo semanal e os roteiros são feitos numa sessão
 * do Claude Code (assinatura do Claude, sem custo de API). O app prepara os insumos em
 * data/claude-code/, o Claude Code lê, escreve o JSON e grava de volta pelo CLI (scripts/cc.ts),
 * que valida com os MESMOS schemas do modo API.
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { and, desc, eq, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { DATA_DIR, mediaAbs } from "@/lib/paths";
import { AnalysisSchema, type Analysis } from "@/lib/analysis-schema";
import { CompactSchema, expandCompact, COMPACT_GUIDE } from "@/lib/analysis-compact";
import { ANALYSIS_SYSTEM, inputModeOf } from "./analyze";
import { loadVideos, type VideoRow } from "./data";
import type { Insights } from "./insights";
import { structureSignature } from "@/lib/patterns";
import { getInsights, labelFor } from "./insights";
import { DigestSchema, DIGEST_SYSTEM, startOfWeek } from "./digest";
import {
  PlanSchema,
  ScriptSchema,
  PLAN_SYSTEM,
  SCRIPT_SYSTEM,
  pickVideos,
  analysesFor,
  requestText,
  saveScript,
  getScript,
  type ScriptInput,
  type Plan,
} from "./scriptgen";
import { SCRIPT_CATEGORIES, type ScriptCategory } from "@/lib/taxonomy";
import { bump } from "./events";
import { readImage, frameKey } from "./storage";
import { getSettings, setSettings } from "./settings";

export const CC_DIR = path.join(DATA_DIR, "claude-code");
export const CC_MODEL = "claude-code";

const rel = (p: string) => (p.startsWith(process.cwd() + path.sep) ? path.relative(process.cwd(), p) : p);
const writeJson = (file: string, data: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
};

/* ---------------------------------------------------------------- vídeos */

/** Vídeos reais aguardando análise no Claude Code (outras etapas já resolvidas). */
export async function awaitingAnalysis() {
  const settled = new Set(["done", "skipped", "failed", "blocked"]);
  const proc = await db.select().from(schema.processing).where(eq(schema.processing.analysis, "external")).all();
  const { byId } = await loadVideos();
  return proc
    .filter((p) => settled.has(p.media) && settled.has(p.transcript) && settled.has(p.frames))
    .map((p) => byId.get(p.videoId))
    .filter((v): v is VideoRow => Boolean(v) && !v!.isDemo)
    .sort((a, b) => b.publishedAt - a.publishedAt);
}

/**
 * Arquivo do frame: o original no disco do worker ou, se ele não existir (ex.: rotina na nuvem
 * analisando vídeos processados no Mac), a cópia WebP guardada no banco.
 */
async function frameSource(rel: string): Promise<string | Buffer> {
  const abs = mediaAbs(rel);
  if (fs.existsSync(abs)) return abs;
  const img = await readImage(frameKey(rel));
  if (!img) throw new Error(`Frame indisponível no disco e no banco: ${rel}`);
  return Buffer.from(img.data);
}

/** Folha de contato: os frames-chave numa grade única, numerados com o tempo (1 imagem por vídeo). */
async function contactSheet(frames: { path: string; t: number }[], out: string) {
  const sharp = (await import("sharp")).default;
  const W = 216;
  const H = 384;
  const cols = Math.min(5, frames.length);
  const rows = Math.ceil(frames.length / cols);
  const tiles = await Promise.all(
    frames.map(async (f, i) => {
      const img = await sharp(await frameSource(f.path)).resize(W, H, { fit: "cover" }).jpeg().toBuffer();
      const label = Buffer.from(
        `<svg width="${W}" height="30"><rect width="${W}" height="30" fill="rgba(0,0,0,0.72)"/><text x="8" y="21" font-family="Helvetica, Arial" font-size="17" font-weight="700" fill="#fff">${i + 1} · ${f.t.toFixed(1)}s</text></svg>`,
      );
      return [
        { input: img, left: (i % cols) * (W + 4), top: Math.floor(i / cols) * (H + 4) },
        { input: label, left: (i % cols) * (W + 4), top: Math.floor(i / cols) * (H + 4) },
      ];
    }),
  );
  await sharp({ create: { width: cols * (W + 4) - 4, height: rows * (H + 4) - 4, channels: 3, background: "#111" } })
    .composite(tiles.flat())
    .jpeg({ quality: 82 })
    .toFile(out);
}

function segments(words: { text: string; start: number; type: string }[]) {
  const out: string[] = [];
  let cur: typeof words = [];
  for (const w of words.filter((x) => x.type === "word")) {
    cur.push(w);
    if (/[.!?]$/.test(w.text) || cur.length >= 12) {
      out.push(`[${cur[0].start.toFixed(1)}s] ${cur.map((x) => x.text).join(" ")}`);
      cur = [];
    }
  }
  if (cur.length) out.push(`[${cur[0].start.toFixed(1)}s] ${cur.map((x) => x.text).join(" ")}`);
  return out;
}

/** Prepara os insumos de um vídeo: folha de contato + input.json. */
export async function prepareVideo(id: string) {
  const { byId } = await loadVideos();
  const r = byId.get(id);
  if (!r) throw new Error(`Vídeo ${id} não existe`);
  const v = (await db.select().from(schema.videos).where(eq(schema.videos.id, id)).get())!;
  const tr = await db.select().from(schema.transcripts).where(eq(schema.transcripts.videoId, id)).get();
  const fr = await db.select().from(schema.frames).where(eq(schema.frames.videoId, id)).get();
  const dir = path.join(CC_DIR, "videos", id.replace(/[^\w.-]/g, "_"));
  fs.mkdirSync(dir, { recursive: true });
  const frames = fr?.items?.length ? fr.items : v.thumbnailPath ? [{ path: v.thumbnailPath, t: 0 }] : [];
  const sheet = path.join(dir, "frames.jpg");
  if (frames.length) await contactSheet(frames, sheet);
  const mode = inputModeOf({
    transcript: tr ? { text: tr.text, words: tr.words ?? null, speechKind: tr.speechKind } : null,
    frames: fr?.items ?? [],
  } as Parameters<typeof inputModeOf>[0]);
  const sc = r.score;
  writeJson(path.join(dir, "input.json"), {
    id,
    conta: `@${r.handle}`,
    publicado_em: new Date(r.publishedAt).toISOString(),
    duracao_s: r.durationSec,
    legenda: r.caption ?? "",
    hashtags: r.hashtags,
    audio: v.music ?? null,
    metricas: { views: r.views, curtidas: r.likes, comentarios: r.comments, compartilhamentos: r.shares, seguidores: r.followers },
    score_outlier: sc
      ? { faixa: sc.band, razao_vs_mediana: sc.ratio && Number(sc.ratio.toFixed(2)), score_normalizado: sc.score && Number(sc.score.toFixed(2)), ainda_maturando: sc.maturing, base: sc.basis, tamanho_linha_de_base: sc.baselineN }
      : null,
    modo_de_entrada:
      mode === "speech" ? "fala transcrita + frames + legenda" : mode === "visual" ? "SEM FALA: use texto na tela, sequência de cenas e legenda" : "SEM VÍDEO: só legenda e capa (confiança baixa)",
    transcricao: !tr
      ? "indisponível"
      : tr.speechKind === "speech"
        ? segments(tr.words ?? [])
        : tr.speechKind === "lyrics"
          ? `Só música com letra (não é fala do criador): "${tr.text.slice(0, 300)}"`
          : "Sem fala detectada (só trilha/efeitos).",
    folha_de_frames: frames.length ? { arquivo: rel(sheet), quadros: frames.map((f, i) => ({ n: i + 1, t: f.t })) } : null,
    saida: rel(path.join(dir, "analysis.json")),
  });
  return { dir: rel(dir), sheet: frames.length ? rel(sheet) : null, input: rel(path.join(dir, "input.json")), output: rel(path.join(dir, "analysis.json")) };
}

function readJson(file: string): unknown {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) throw new Error(`Arquivo não encontrado: ${file}`);
  try {
    return JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch (e) {
    throw new Error(`JSON inválido em ${file}: ${(e as Error).message}`);
  }
}

function readRefs(file: string): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function explain(err: z.ZodError) {
  return err.issues
    .slice(0, 12)
    .map((i) => `- ${i.path.join(".") || "(raiz)"}: ${i.message}`)
    .join("\n");
}

/** Valida e grava a análise escrita pelo Claude Code (mesmo schema do modo API). */
export async function saveAnalysis(id: string, file: string) {
  const parsed = AnalysisSchema.safeParse(readJson(file));
  if (!parsed.success) throw new Error(`A análise não bate com o schema:\n${explain(parsed.error)}`);
  return saveAnalysisData(id, parsed.data);
}

async function saveAnalysisData(id: string, d: Analysis) {
  const v = await db.select().from(schema.videos).where(eq(schema.videos.id, id)).get();
  if (!v) throw new Error(`Vídeo ${id} não existe`);
  const tr = await db.select().from(schema.transcripts).where(eq(schema.transcripts.videoId, id)).get();
  const fr = await db.select().from(schema.frames).where(eq(schema.frames.videoId, id)).get();
  const inputMode = inputModeOf({ transcript: tr ? { text: tr.text, words: null, speechKind: tr.speechKind } : null, frames: fr?.items ?? [] } as Parameters<typeof inputModeOf>[0]);
  if (inputMode === "caption_only") d.confidence = "low";
  const row = {
    videoId: id,
    data: d,
    hookType: d.hook.type,
    theme: d.theme,
    format: d.format,
    ctaType: d.cta.type,
    offerType: d.fashion.offerType,
    confidence: d.confidence,
    inputMode,
    model: CC_MODEL,
    createdAt: Date.now(),
  };
  await db.insert(schema.analyses).values(row).onConflictDoUpdate({ target: schema.analyses.videoId, set: row }).run();
  await db.update(schema.processing).set({ analysis: "done", lastError: null, errorStage: null, updatedAt: Date.now() }).where(eq(schema.processing.videoId, id)).run();
  await bump("videos");
  return { hookType: d.hook.type, theme: d.theme, confidence: d.confidence };
}

/* ---------------------------------------------------------------- guias */

/** Escreve os guias e schemas que o Claude Code lê antes de trabalhar. */
export function writeGuides() {
  fs.mkdirSync(CC_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(CC_DIR, "ANALISE.md"),
    `# Como analisar um Reel\n\n${ANALYSIS_SYSTEM}\n\n## Formato da resposta\n\nEscreva um único objeto JSON que valide contra \`analysis.schema.json\` (todos os campos são obrigatórios; use "" ou [] quando não houver; campos que aceitam null podem ser null).\nA folha de frames mostra os quadros em ordem, numerados com o tempo em segundos: use esses tempos nos beats e em onScreenText.\n`,
  );
  writeJson(path.join(CC_DIR, "analysis.schema.json"), z.toJSONSchema(AnalysisSchema));
  fs.writeFileSync(
    path.join(CC_DIR, "RESUMO.md"),
    `# Resumo semanal\n\n${DIGEST_SYSTEM}\n\nO input traz tabelas (veja as chaves *_colunas) e vídeos com apelidos (v1, v2…). Cite só esses apelidos.\n\nMolde (JSON compacto):\n{"headline":"…","summary":"2-3 frases com números","patterns":[{"title":"…","insight":"…","evidence":"n vídeos, contas, score/razão","strength":"forte|moderada|fraca|anedótica","videoIds":["v1","v2"],"action":"o que gravar"}],"watchOut":["…"],"nextSteps":["…"]}\n`,
  );
  fs.writeFileSync(
    path.join(CC_DIR, "ROTEIRO.md"),
    `# Roteiro de Reel\n\nDuas etapas, nesta ordem.\n\n## 1. plan\n${PLAN_SYSTEM}\n\n## 2. script\n${SCRIPT_SYSTEM}\n\nO input traz tabelas (chaves *_colunas) e vídeos com apelidos (v1…). Cite só os apelidos em evidenceIds.\n\nMolde (JSON compacto):\n{"plan":{"datasetReading":"…","opportunities":[{"title":"…","rationale":"…","evidenceIds":["v1"]}],"chosen":{"theme":"<tema>","topic":"…","hookType":"<hook>","hookIdea":"…","angle":"…","format":"<formato>","structure":["hook","product_reveal","offer","cta"],"offerType":"<oferta>","ctaType":"<cta>","durationSec":15},"decisions":[{"decision":"tema|hook|ângulo|formato|estrutura|oferta|cta|duração|áudio","choice":"…","why":"…","stats":"números","evidenceIds":["v1"]}],"expected":{"rationale":"…","confidence":"baixa|média|alta","risks":["…"]}},"script":{"title":"…","onScreenHook":"…","spokenHook":"","totalDurationSec":15,"audio":{"type":"speech|voiceover|music|trend_format|speech_plus_music","direction":"…"},"scenes":[{"durationSec":3,"role":"hook","shot":"…","onScreenText":"…","speech":"","notes":""}],"cta":{"type":"<cta>","text":"…"},"caption":"…","hashtags":["…"],"altHooks":["…"],"productionNotes":["…"]}}\n\nEnums de hook/tema/formato/oferta/cta: os mesmos do guia de análise (npm run -s cc -- guides imprime).\n`,
  );
  return rel(CC_DIR);
}


/* ---------------------------------------------------------------- insumos enxutos (resumo e roteiros) */

/** Apelidos curtos (v1, v2…) no lugar dos IDs de 19 dígitos do Instagram: ~8 tokens → ~2 por citação. */
class Refs {
  private toRef = new Map<string, string>();
  private toId = new Map<string, string>();
  ref(id: string) {
    let r = this.toRef.get(id);
    if (!r) {
      r = `v${this.toRef.size + 1}`;
      this.toRef.set(id, r);
      this.toId.set(r, id);
    }
    return r;
  }
  refs(ids: string[]) {
    return ids.map((i) => this.ref(i));
  }
  json() {
    return Object.fromEntries(this.toId);
  }
}

/** Converte apelidos de volta para IDs reais (aceita também IDs reais). */
function unref(ids: string[], map: Record<string, string>) {
  return ids.map((x) => map[x.trim()] ?? x.trim());
}

const r2 = (n: number | null | undefined) => (n == null ? null : Math.round(n * 100) / 100);

/** Estatísticas em tabelas (linhas como arrays, cabeçalho uma vez), só categorias com n ≥ 2. */
function statsTable(ins: Insights, refs: Refs) {
  const row = (s: Insights["hooks"][number]) => [s.key, s.n, s.nAccounts, r2(s.medianScore), r2(s.ciLow), r2(s.ciHigh), Math.round(s.hitRate * 100), s.evidence, refs.refs(s.topIds.slice(0, 2))];
  const dim = (list: Insights["hooks"]) => list.filter((s) => s.n >= 2).slice(0, 10).map(row);
  return {
    colunas: "chave,n,contas,score_mediano,ic90_min,ic90_max,%acima,evidência,exemplos",
    totais: ins.totals,
    hooks: dim(ins.hooks),
    formatos: dim(ins.formats),
    temas: dim(ins.themes),
    ofertas: dim(ins.offers),
    ctas: dim(ins.ctas),
    estruturas: dim(ins.structures.slice(0, 6)),
    tendencias: ins.themeTrends.filter((t) => t.recentN + t.prevN >= 2).slice(0, 8).map((t) => [t.key, t.status, t.recentN, t.prevN, r2(t.recentScore), r2(t.prevScore), refs.refs(t.ids.slice(0, 2))]),
    tendencias_colunas: "tema,status,recentes,anteriores,score_recente,score_anterior,exemplos",
    lacunas: ins.gaps.slice(0, 8).map((g) => [g.dimension, g.key, g.kind, g.marketN, g.ownN, r2(g.medianScore), refs.refs(g.ids.slice(0, 2))]),
    lacunas_colunas: "dimensão,chave,tipo,n_mercado,n_própria,score_mediano,exemplos",
    padroes: ins.topPatterns.map((p) => [p.label, p.dimension, r2(p.lift), p.n, p.nAccounts, p.evidence, refs.refs(p.ids.slice(0, 3))]),
    padroes_colunas: "rótulo,dimensão,lift,n,contas,evidência,exemplos",
  };
}

/** Linha compacta de vídeo citável. */
function videoRow(v: VideoRow, refs: Refs, extra?: { estrutura?: string | null; rep?: string }) {
  return [
    refs.ref(v.id),
    `@${v.handle}`,
    new Date(v.publishedAt).toISOString().slice(5, 10),
    r2(v.score?.ratio),
    r2(v.score?.score),
    v.score?.band ?? null,
    v.hookType,
    v.theme,
    v.format,
    v.offerType,
    v.ctaType,
    (v.hookText ?? "").slice(0, 70),
    (v.topic ?? "").slice(0, 70),
    ...(extra ? [extra.estrutura ?? null, extra.rep ?? null] : []),
  ];
}
const VIDEO_COLS = "ref,conta,data,razão_vs_mediana,score,faixa,hook,tema,formato,oferta,cta,hook_texto,assunto";

const writeMin = (file: string, data: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
};

/* ---------------------------------------------------------------- resumo */

export async function prepareDigest() {
  const ins = await getInsights();
  const { byId } = await loadVideos();
  const refs = new Refs();
  const stats = statsTable(ins, refs);
  const ids = new Set<string>();
  for (const p of ins.topPatterns) p.ids.slice(0, 3).forEach((i) => ids.add(i));
  for (const o of ins.outliersRecent.slice(0, 8)) ids.add(o.id);
  for (const o of ins.opportunities) o.ids.slice(0, 2).forEach((i) => ids.add(i));
  const dir = path.join(CC_DIR, "digest");
  const videos = [...ids].map((i) => byId.get(i)).filter((x): x is VideoRow => Boolean(x)).map((v) => videoRow(v, refs));
  writeMin(path.join(dir, "input.json"), { estatisticas: stats, videos_colunas: VIDEO_COLS, videos, saida: rel(path.join(dir, "digest.json")) });
  writeMin(path.join(dir, "refs.json"), refs.json());
  return { input: rel(path.join(dir, "input.json")), output: rel(path.join(dir, "digest.json")) };
}

export async function saveDigest(file: string) {
  const parsed = DigestSchema.safeParse(readJson(file));
  if (!parsed.success) throw new Error(`O resumo não bate com o schema:\n${explain(parsed.error)}`);
  const { byId } = await loadVideos();
  const refMap = readRefs(path.join(CC_DIR, "digest", "refs.json"));
  let removed = 0;
  for (const p of parsed.data.patterns) {
    p.videoIds = unref(p.videoIds, refMap);
    const ok = p.videoIds.filter((id) => byId.has(id));
    removed += p.videoIds.length - ok.length;
    p.videoIds = ok;
  }
  await db.insert(schema.digests).values({ weekStart: startOfWeek(Date.now()), data: parsed.data, generator: CC_MODEL, createdAt: Date.now() }).run();
  await bump("patterns");
  return { patterns: parsed.data.patterns.length, removedIds: removed };
}

/* ---------------------------------------------------------------- roteiros */

export async function createScriptRequest(input: ScriptInput, opts: { kind?: string; parentId?: number | null; reusePlanOf?: number | null } = {}) {
  const row = await db
    .insert(schema.scriptRequests)
    .values({ input: input as unknown as Record<string, unknown>, kind: opts.kind ?? "new", parentId: opts.parentId ?? null, reusePlanOf: opts.reusePlanOf ?? null, createdAt: Date.now() })
    .returning()
    .get();
  await bump("scripts");
  return row;
}

/**
 * Lote semanal de roteiros base: N pedidos variados a partir das tendências e padrões da
 * análise mais recente (oportunidades, temas e hooks em alta, padrões fortes, lacunas).
 * Idempotente por semana: rodar de novo na mesma semana não duplica.
 */
export async function createWeeklyScriptRequests(n = 10, opts: { force?: boolean } = {}) {
  const batch = new Date(startOfWeek(Date.now())).toISOString().slice(0, 10);
  const settings = await getSettings();
  if (settings.weeklyScriptsBatch === batch && !opts.force) return { batch, created: 0, skipped: "lote desta semana já foi criado" };
  const ins = await getInsights();
  if (ins.totals.analyzed < 3) return { batch, created: 0, skipped: "poucos vídeos analisados" };

  type Seed = { theme?: string; hook?: string; category?: ScriptCategory; why: string };
  const seeds: Seed[] = [];
  const seen = new Set<string>();
  // até n-3 pautas vêm dos dados; as 3 últimas vagas ficam para categorias de negócio
  let cap = Math.max(1, n - 3);
  const add = (x: Seed) => {
    const k = `${x.theme ?? ""}|${x.hook ?? ""}|${x.category ?? ""}`;
    if (seen.has(k) || seeds.length >= cap) return;
    seen.add(k);
    seeds.push(x);
  };
  const hookLead = ins.topPatterns.find((p) => p.dimension === "hookType")?.key;
  for (const o of ins.opportunities) add({ theme: o.seed.theme, hook: o.seed.hookType, why: `Oportunidade: ${o.title}` });
  for (const t of ins.themeTrends.filter((t) => t.status === "acelerando" || t.status === "ganhando tração" || t.status === "novo")) add({ theme: t.key, hook: hookLead, why: `Tema ${t.status}: ${labelFor("theme", t.key)}` });
  for (const t of ins.hookTrends.filter((t) => t.status === "acelerando" || t.status === "ganhando tração" || t.status === "novo")) add({ hook: t.key, why: `Hook ${t.status}: ${labelFor("hookType", t.key)}` });
  for (const p of ins.topPatterns.filter((p) => p.dimension === "theme" || p.dimension === "hookType")) add(p.dimension === "theme" ? { theme: p.key, why: `Padrão forte: ${p.label}` } : { hook: p.key, why: `Padrão forte: ${p.label}` });
  for (const g of ins.gaps.filter((g) => g.dimension === "theme" || g.dimension === "hookType")) add(g.dimension === "theme" ? { theme: g.key, why: `Lacuna (${g.kind}): ${labelFor("theme", g.key)}` } : { hook: g.key, why: `Lacuna (${g.kind}): ${labelFor("hookType", g.key)}` });
  // completa com categorias de negócio, para o lote cobrir lançamento, promoção, uso etc.
  cap = n;
  for (const c of ["launch", "promotion", "styling", "social_proof", "brand_daily", "seasonal", "promo_trip"] as ScriptCategory[]) add({ category: c, why: `Categoria: ${SCRIPT_CATEGORIES[c]}` });

  const avoid: NonNullable<ScriptInput["avoid"]> = [];
  for (const x of seeds) {
    const input: ScriptInput = {
      mode: x.category ? "category" : "auto",
      category: x.category,
      tone: "natural",
      seedTheme: x.theme,
      seedHook: x.hook,
      brief: x.why,
      avoid: avoid.slice(),
      batch,
    };
    await createScriptRequest(input, { kind: "weekly" });
    avoid.push({ theme: x.theme, hookType: x.hook });
  }
  await setSettings({ weeklyScriptsBatch: batch });
  return { batch, created: seeds.length };
}

export async function pendingScriptRequests() {
  return await db.select().from(schema.scriptRequests).where(eq(schema.scriptRequests.status, "pending")).orderBy(schema.scriptRequests.createdAt).all();
}

export async function prepareScriptRequest(id: number) {
  const req = await db.select().from(schema.scriptRequests).where(and(eq(schema.scriptRequests.id, id), eq(schema.scriptRequests.status, "pending"))).get();
  if (!req) throw new Error(`Pedido de roteiro ${id} não existe ou já foi atendido`);
  const input = req.input as unknown as ScriptInput;
  const { rows } = await loadVideos();
  const vids = pickVideos(rows, input);
  const ans = await analysesFor(vids.map((v) => v.id));
  const reuse = req.reusePlanOf ? ((await getScript(req.reusePlanOf))?.plan as Plan | undefined) : undefined;
  const dir = path.join(CC_DIR, "scripts", String(id));
  const refs = new Refs();
  const stats = statsTable(await getInsights(), refs);
  const videos = vids.slice(0, 30).map((v) => {
    const a = ans.get(v.id);
    return videoRow(v, refs, { estrutura: v.beatRoles.length ? structureSignature(v.beatRoles) : null, rep: a?.replicable?.[0] });
  });
  writeMin(path.join(dir, "input.json"), {
    pedido: await requestText(input),
    tipo: req.kind === "tone" ? "Reescrever o roteiro com outro tom, MANTENDO o plano abaixo (copie o plan como está)" : req.kind === "alternative" ? "Alternativa: escolha um caminho diferente dos já usados" : req.kind === "regenerate" ? "Nova versão do mesmo pedido" : "Roteiro novo",
    plano_existente: reuse ?? null,
    estatisticas: stats,
    videos_colunas: `${VIDEO_COLS},estrutura,replicável`,
    videos,
    saida: rel(path.join(dir, "script.json")),
  });
  writeMin(path.join(dir, "refs.json"), refs.json());
  return { input: rel(path.join(dir, "input.json")), output: rel(path.join(dir, "script.json")) };
}

export async function saveScriptRequest(id: number, file: string) {
  const req = await db.select().from(schema.scriptRequests).where(eq(schema.scriptRequests.id, id)).get();
  if (!req || req.status !== "pending") throw new Error(`Pedido de roteiro ${id} não existe ou já foi atendido`);
  const parsed = z.object({ plan: PlanSchema, script: ScriptSchema }).safeParse(readJson(file));
  if (!parsed.success) throw new Error(`O roteiro não bate com o schema:\n${explain(parsed.error)}`);
  const refMap = readRefs(path.join(CC_DIR, "scripts", String(id), "refs.json"));
  for (const d of parsed.data.plan.decisions) d.evidenceIds = unref(d.evidenceIds, refMap);
  for (const o of parsed.data.plan.opportunities) o.evidenceIds = unref(o.evidenceIds, refMap);
  const row = await saveScript(req.input as unknown as ScriptInput, parsed.data.plan, parsed.data.script, { parentId: req.parentId, generator: "claude-code", model: "Claude Code" });
  await db.update(schema.scriptRequests).set({ status: "done", scriptId: row.id }).where(eq(schema.scriptRequests.id, id)).run();
  await bump("scripts");
  const ev = row.evidence as { items: unknown[]; removedIds: string[]; originality: { maxSimilarity: number } };
  return { scriptId: row.id, title: row.title, evidence: ev.items.length, removedIds: ev.removedIds.length, originality: Math.round(ev.originality.maxSimilarity * 100) };
}

export async function ccSummary() {
  const last = await db.select().from(schema.digests).orderBy(desc(schema.digests.createdAt)).limit(1).get();
  return {
    videos: (await awaitingAnalysis()).length,
    scripts: (await pendingScriptRequests()).length,
    lastDigest: last ? { createdAt: last.createdAt, generator: last.generator } : null,
  };
}

/* ---------------------------------------------------------------- lotes econômicos */

/**
 * Folha de contato enxuta: 2 quadros do hook + até 6 espalhados, 180×320 em 4 colunas
 * (~730×650 px ≈ 630 tokens de imagem, contra ~1.100 da folha completa).
 */
async function compactSheet(frames: { path: string; t: number }[], out: string) {
  const sorted = [...frames].sort((x, y) => x.t - y.t);
  const hook = sorted.filter((f) => f.t < 3);
  const rest = sorted.filter((f) => f.t >= 3);
  const pickHook = hook.length > 2 ? [hook[0], hook[hook.length - 1]] : hook;
  const n = Math.min(6, rest.length);
  const pickRest = Array.from({ length: n }, (_, i) => rest[Math.round((i * (rest.length - 1)) / Math.max(1, n - 1))]).filter((f, i, a) => a.indexOf(f) === i);
  const chosen = [...pickHook, ...pickRest];
  const sharp = (await import("sharp")).default;
  const W = 180;
  const H = 320;
  const cols = Math.min(4, chosen.length);
  const rows = Math.ceil(chosen.length / cols);
  const tiles = await Promise.all(
    chosen.map(async (f, i) => {
      const img = await sharp(await frameSource(f.path)).resize(W, H, { fit: "cover" }).jpeg().toBuffer();
      const label = Buffer.from(`<svg width="${W}" height="24"><rect width="${W}" height="24" fill="rgba(0,0,0,0.72)"/><text x="6" y="17" font-family="Helvetica, Arial" font-size="15" font-weight="700" fill="#fff">${i + 1} · ${f.t.toFixed(1)}s</text></svg>`);
      const left = (i % cols) * (W + 3);
      const top = Math.floor(i / cols) * (H + 3);
      return [{ input: img, left, top }, { input: label, left, top }];
    }),
  );
  await sharp({ create: { width: cols * (W + 3) - 3, height: rows * (H + 3) - 3, channels: 3, background: "#111" } })
    .composite(tiles.flat())
    .jpeg({ quality: 78 })
    .toFile(out);
  return chosen;
}

const fmtN = (n: number | null | undefined) => (n == null ? "—" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));

/** Transcrição resumida: começo e fim (hook e CTA) com tempos, no máximo ~700 caracteres. */
function compactTranscript(words: { text: string; start: number; type: string }[]) {
  const segs = segments(words);
  const full = segs.join(" | ");
  if (full.length <= 700) return full;
  let head = "";
  for (const sg of segs) {
    if ((head + sg).length > 500) break;
    head += (head ? " | " : "") + sg;
  }
  let tail = "";
  for (const sg of [...segs].reverse()) {
    if ((sg + tail).length > 170) break;
    tail = sg + (tail ? " | " : "") + tail;
  }
  return `${head} | … | ${tail}`;
}

const STALE_CLAIM_MS = 30 * 60_000;

/**
 * Reserva até `limit` vídeos pendentes para um analista (atômico: dois subagentes nunca pegam o
 * mesmo vídeo), gera as folhas enxutas e devolve um texto único e compacto com guia + insumos.
 */
export async function packVideos(opts: { limit: number }) {
  // reservas abandonadas (subagente que parou) voltam para a fila
  await db
    .update(schema.processing)
    .set({ analysis: "external" })
    .where(and(eq(schema.processing.analysis, "running"), lte(schema.processing.updatedAt, Date.now() - STALE_CLAIM_MS)))
    .run();
  const pool = await awaitingAnalysis();
  const claimed: VideoRow[] = [];
  for (const v of pool) {
    if (claimed.length >= opts.limit) break;
    const r = await db
      .update(schema.processing)
      .set({ analysis: "running", updatedAt: Date.now() })
      .where(and(eq(schema.processing.videoId, v.id), eq(schema.processing.analysis, "external")))
      .run();
    if (r.rowsAffected) claimed.push(v);
  }
  if (!claimed.length) return { count: 0, text: "Nada pendente." };
  const out = path.join(CC_DIR, "lotes", `lote-${Date.now().toString(36)}.jsonl`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const blocks: string[] = [];
  for (const [i, r] of claimed.entries()) {
    const v = (await db.select().from(schema.videos).where(eq(schema.videos.id, r.id)).get())!;
    const tr = await db.select().from(schema.transcripts).where(eq(schema.transcripts.videoId, r.id)).get();
    const fr = await db.select().from(schema.frames).where(eq(schema.frames.videoId, r.id)).get();
    const dir = path.join(CC_DIR, "videos", r.id.replace(/[^\w.-]/g, "_"));
    fs.mkdirSync(dir, { recursive: true });
    const frames = fr?.items?.length ? fr.items : v.thumbnailPath ? [{ path: v.thumbnailPath, t: 0 }] : [];
    const sheet = path.join(dir, "f.jpg");
    const chosen = frames.length ? await compactSheet(frames, sheet) : [];
    const sc = r.score;
    const scoreTxt = !sc || sc.band === null ? "sem score" : sc.band === "maturing" ? `maturing (base ${sc.baselineN})` : `${sc.band} ${sc.ratio?.toFixed(1)}× (base ${sc.baselineN})`;
    const music = v.music?.usesOriginalAudio === false && v.music?.song ? `música "${v.music.song}"` : "áudio original";
    const fala = !tr
      ? "indisponível"
      : tr.speechKind === "speech"
        ? compactTranscript(tr.words ?? [])
        : tr.speechKind === "lyrics"
          ? "SÓ MÚSICA COM LETRA (não é fala)"
          : tr.speechKind === "no_audio"
            ? "SEM ÁUDIO"
            : "SEM FALA";
    const caption = (r.caption ?? "").replace(/\s+/g, " ").slice(0, 280);
    blocks.push(
      [
        `## ${i + 1} id=${r.id} @${r.handle} · ${new Date(r.publishedAt).toISOString().slice(0, 10)} · ${r.durationSec ? Math.round(r.durationSec) + "s" : "?"} · views ${fmtN(r.views)} · likes ${fmtN(r.likes)} · com ${fmtN(r.comments)} · ${scoreTxt} · ${music}`,
        `legenda: ${caption || "—"}`,
        `fala: ${fala}`,
        chosen.length ? `frames: ${rel(sheet)} (${chosen.map((f, k) => `${k + 1}=${f.t.toFixed(1)}s`).join(" ")})` : "frames: nenhum (use legenda; conf low)",
      ].join("\n"),
    );
  }
  const text = `${COMPACT_GUIDE}\n\nSAÍDA: escreva ${claimed.length} linha(s) JSONL em ${rel(out)} e rode: npm run -s cc -- save-batch ${rel(out)}\n\n${blocks.join("\n\n")}`;
  return { count: claimed.length, text, out: rel(out) };
}

/** Valida e grava um lote JSONL no formato compacto. Resposta curta: uma linha por vídeo. */
export async function saveBatch(file: string) {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) throw new Error(`Arquivo não encontrado: ${file}`);
  const raw = fs.readFileSync(abs, "utf8").trim();
  let items: unknown[];
  try {
    items = raw.startsWith("[") ? JSON.parse(raw) : raw.split(/\n+/).filter(Boolean).map((l) => JSON.parse(l));
  } catch (e) {
    throw new Error(`JSON inválido: ${(e as Error).message}`);
  }
  const lines: string[] = [];
  let ok = 0;
  for (const it of items) {
    const id = (it as { id?: string })?.id ?? "?";
    const parsed = CompactSchema.safeParse(it);
    if (!parsed.success) {
      lines.push(`ERRO ${id}: ${parsed.error.issues.slice(0, 4).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
      continue;
    }
    try {
      const r = await saveAnalysisData(parsed.data.id, expandCompact(parsed.data));
      lines.push(`ok ${id} ${r.hookType}/${r.theme}/${r.confidence}`);
      ok++;
    } catch (e) {
      lines.push(`ERRO ${id}: ${(e as Error).message.slice(0, 200)}`);
    }
  }
  return { ok, total: items.length, text: lines.join("\n") };
}
