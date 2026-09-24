import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { connection } from "next/server";
import "./globals.css";
import { Shell } from "@/components/shell";
import { THEME_SCRIPT } from "@/lib/theme-script";
import { isOwner } from "@/server/role";
import { ENV_VARS, hasKey, transcriberMode } from "@/server/env";
import { hasWhisper } from "@/server/whisper";
import { isVercel } from "@/server/host";
import { isRemoteDb } from "@/db";
import { hasFfmpeg } from "@/server/media";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "UseHitzz · Inteligência de conteúdo", template: "%s · UseHitzz" },
  description: "O que está funcionando nos Reels do nicho de calçados, e o que produzir a seguir.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#191919" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await connection();
  // Só o que impede o app de funcionar: ElevenLabs e Anthropic são opcionais (Whisper local e Claude Code)
  const missing: { env: string; label: string; purpose: string }[] = [];
  const vercel = isVercel();
  if (vercel) {
    if (!isRemoteDb()) missing.push({ env: "DATABASE_URL", label: "Turso", purpose: "Banco compartilhado com a atualização semanal" });
    if (!process.env.DASHBOARD_PASSWORD) missing.push({ env: "DASHBOARD_PASSWORD", label: "Senha", purpose: "Login da equipe" });
  } else {
    if (!hasKey("apify")) missing.push(ENV_VARS.apify);
    if (transcriberMode() === "local" && !(await hasWhisper())) missing.push({ env: "npm run setup:whisper", label: "Whisper", purpose: "Transcrição local gratuita" });
    if (transcriberMode() === "elevenlabs" && !hasKey("elevenlabs")) missing.push(ENV_VARS.elevenlabs);
  }
  const ffmpeg = vercel ? true : await hasFfmpeg();
  return (
    <html lang="pt-BR" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <Shell status={{ missing, ffmpeg, live: vercel ? "poll" : "sse", auth: Boolean(process.env.DASHBOARD_PASSWORD), owner: await isOwner() }}>{children}</Shell>
      </body>
    </html>
  );
}
