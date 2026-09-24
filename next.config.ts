import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client", "libsql", "sharp"],
  images: { unoptimized: true },
  devIndicators: false,
  // modelos do Whisper e dados locais nunca entram no bundle das funções
  outputFileTracingExcludes: { "*": ["models/**", "data/**", "scripts/**", "tests/**"] },
};

export default nextConfig;
