import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AccountGroup } from "@/db/schema";
import { median } from "@/lib/scoring";
import { loadVideos } from "./data";
import { normalizeHandle } from "./collect";
import { bump } from "./events";
import { hasKey } from "./env";
import { scrapeAccount } from "./boot";
import { setSettings } from "./settings";

export async function accountStats(now = Date.now()) {
  const { rows } = await loadVideos();
  const accounts = await db.select().from(schema.accounts).all();
  const weeks = 8;
  return accounts.map((a) => {
    const vids = rows.filter((r) => r.accountId === a.id);
    const recent = vids.filter((r) => r.publishedAt >= now - weeks * 7 * 86_400_000);
    const mature = vids.filter((r) => !r.isPinned && now - r.publishedAt >= 48 * 3_600_000).slice(0, 30);
    const views = mature.map((r) => r.views).filter((v): v is number => v !== null);
    const scored = vids.filter((r) => r.score?.band && r.score.band !== "maturing" && !r.isPinned);
    const hits = scored.filter((r) => r.score?.band === "above" || r.score?.band === "breakout");
    const mix = (k: "format" | "hookType" | "theme") => {
      const m: Record<string, number> = {};
      for (const r of vids) if (r[k]) m[r[k]!] = (m[r[k]!] ?? 0) + 1;
      return m;
    };
    const engs = mature.map((r) => r.score?.secondary.engagementRate).filter((x): x is number => x !== null && x !== undefined);
    const vpf = mature.map((r) => r.score?.secondary.viewsPerFollower).filter((x): x is number => x !== null && x !== undefined);
    const hookMix = mix("hookType");
    const topHook = Object.entries(hookMix).sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
    return {
      id: a.id,
      handle: a.handle,
      group: a.group,
      fullName: a.fullName,
      followers: a.followers,
      avatar: a.avatarUrl ?? (a.avatarPath ? `/api/media/${a.avatarPath}` : null),
      active: a.active,
      isDemo: a.isDemo,
      lastScrapedAt: a.lastScrapedAt,
      lastScrapeStatus: a.lastScrapeStatus,
      lastError: a.lastError,
      videos: vids.length,
      postsPerWeek: recent.length / weeks,
      medianViews: median(views),
      outlierRate: scored.length ? hits.length / scored.length : null,
      breakouts: scored.filter((r) => r.score?.band === "breakout").length,
      medianEngagement: median(engs),
      viewsPerFollower: median(vpf),
      formatMix: mix("format"),
      topHook,
      speechShare: vids.length ? vids.filter((r) => r.speechKind === "speech").length / vids.length : null,
    };
  });
}
export type AccountStat = Awaited<ReturnType<typeof accountStats>>[number];

export async function addAccount(input: string, group: AccountGroup) {
  const handle = normalizeHandle(input);
  if (!handle) throw new Error("Handle inválido. Use o @ ou o link do perfil do Instagram.");
  const exists = await db.select().from(schema.accounts).where(eq(schema.accounts.handle, handle)).get();
  if (exists) throw new Error(`@${handle} já está cadastrada.`);
  const acc = await db.insert(schema.accounts).values({ handle, group, createdAt: Date.now(), active: true }).returning().get();
  if (group === "own") await setSettings({ ownHandle: handle });
  await bump("accounts");
  const queued = hasKey("apify") ? Boolean(await scrapeAccount(acc.id)) : false;
  return { account: acc, queued };
}
