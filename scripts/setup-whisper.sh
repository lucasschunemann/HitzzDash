#!/usr/bin/env bash
# Instala o whisper.cpp e baixa os modelos usados na transcrição local (gratuita).
#   - ggml-large-v3-turbo-q5_0.bin (~550 MB): boa qualidade em português, rápido no Apple Silicon
#   - ggml-silero-v5.1.2.bin (~1 MB): detecção de voz (separa fala de trilha)
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p models

if ! command -v whisper-cli >/dev/null 2>&1; then
  echo "Instalando whisper-cpp via Homebrew..."
  brew install whisper-cpp
fi

fetch() {
  local url="$1" out="models/$2"
  if [ -s "$out" ]; then echo "✓ $2 já existe"; return; fi
  echo "Baixando $2..."
  curl -fL --progress-bar -o "$out.part" "$url"
  mv "$out.part" "$out"
}

fetch https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin ggml-large-v3-turbo-q5_0.bin
fetch https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin ggml-silero-v5.1.2.bin
echo "Pronto. Reinicie o app para usar a transcrição local."
