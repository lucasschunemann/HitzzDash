import { describe, it, expect } from "vitest";
import { normalizeReel } from "@/server/apify";
import { classifySpeech } from "@/server/scribe";

// Item no formato do dataset do apify/instagram-reel-scraper (campos conferidos no schema do actor)
const item = {
  id: "3456789012345678901",
  type: "Video",
  shortCode: "DAbCdEf1234",
  caption: "Chegou a coleção Inverno ❄️ #botas #inverno",
  hashtags: ["botas", "inverno"],
  mentions: ["usehitzz"],
  url: "https://www.instagram.com/p/DAbCdEf1234/",
  commentsCount: 42,
  likesCount: 1234,
  videoViewCount: 9000,
  videoPlayCount: 48000,
  igPlayCount: 47000,
  timestamp: "2026-09-20T13:02:11.000Z",
  videoDuration: 17.4,
  isPinned: false,
  paidPartnership: false,
  sponsors: [],
  musicInfo: { artist_name: "Artista", song_name: "Música", uses_original_audio: false, audio_id: "123" },
  displayUrl: "https://scontent.cdninstagram.com/x.jpg",
  videoUrl: "https://scontent.cdninstagram.com/x.mp4",
  productType: "clips",
  ownerUsername: "agui.com.br",
};

describe("normalizeReel", () => {
  it("mapeia os campos do actor e prefere videoPlayCount", () => {
    const r = normalizeReel(item)!;
    expect(r.id).toBe("3456789012345678901");
    expect(r.views).toBe(48000);
    expect(r.likes).toBe(1234);
    expect(r.publishedAt).toBe(Date.parse("2026-09-20T13:02:11.000Z"));
    expect(r.music).toEqual({ artist: "Artista", song: "Música", usesOriginalAudio: false, audioId: "123" });
    expect(r.hashtags).toEqual(["botas", "inverno"]);
    expect(r.remoteVideoUrl).toContain(".mp4");
  });
  it("likes ocultos (-1) viram null; views ausentes viram null", () => {
    const r = normalizeReel({ ...item, likesCount: -1, videoPlayCount: undefined, igPlayCount: undefined, videoViewCount: undefined })!;
    expect(r.likes).toBeNull();
    expect(r.views).toBeNull();
  });
  it("marca parceria paga como patrocinado", () => {
    expect(normalizeReel({ ...item, paidPartnership: true })!.isSponsored).toBe(true);
    expect(normalizeReel({ ...item, sponsors: [{ username: "x" }] })!.isSponsored).toBe(true);
  });
  it("ignora itens com erro, sem data ou que não são vídeo", () => {
    expect(normalizeReel({ ...item, error: "not_found" })).toBeNull();
    expect(normalizeReel({ ...item, timestamp: undefined })).toBeNull();
    expect(normalizeReel({ ...item, type: "Image" })).toBeNull();
  });
});

describe("classifySpeech", () => {
  it("poucas palavras = sem fala", () => {
    expect(classifySpeech({ wordCount: 2, speechSeconds: 0.8, audioEvents: ["música"] }, null)).toBe("none");
  });
  it("música licenciada com letra não conta como fala", () => {
    expect(classifySpeech({ wordCount: 40, speechSeconds: 12, audioEvents: [] }, { usesOriginalAudio: false, song: "Hit do verão" })).toBe("lyrics");
  });
  it("áudio original com várias palavras = fala", () => {
    expect(classifySpeech({ wordCount: 35, speechSeconds: 10, audioEvents: [] }, { usesOriginalAudio: true, song: null })).toBe("speech");
  });
});

import { spreadPicks } from "@/server/media";

describe("frames-chave cobrem o vídeo inteiro", () => {
  it("cortes concentrados no começo não deixam o fim descoberto", () => {
    const picks = spreadPicks(32, [3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8]);
    expect(Math.max(...picks)).toBeGreaterThan(26);
    expect(picks.length).toBe(7);
  });
  it("usa o corte de cena quando existe na faixa; sem corte, o meio da faixa", () => {
    const [p1, p2, p3] = spreadPicks(12, [4.2, 8.1]);
    expect(p1).toBeCloseTo(4.4, 1);
    expect(p2).toBeGreaterThan(8.1);
    expect(p2).toBeLessThan(8.4);
    expect(p3).toBe(10.5);
  });
});
