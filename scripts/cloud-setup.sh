#!/bin/bash
# Script de preparo do ambiente de nuvem do Claude Code (rotina semanal do HitzzDash).
# Cole este conteúdo no campo "Setup script" do ambiente em claude.ai/code.
# Roda como root no Ubuntu 24.04, uma vez; o resultado fica em cache por ~7 dias.
# Instala ffmpeg e compila o whisper.cpp; baixa os modelos para /opt/whisper/models.
set -u
mkdir -p /opt/whisper/models

# ffmpeg (áudio e frames-chave)
(apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ffmpeg) > /tmp/setup-ffmpeg.log 2>&1 &

# modelos do Whisper (large-v3-turbo quantizado + VAD Silero)
(
  cd /opt/whisper/models
  curl -fsSL --retry 3 -o ggml-large-v3-turbo-q5_0.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin
  curl -fsSL --retry 3 -o ggml-silero-v5.1.2.bin https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin
) > /tmp/setup-models.log 2>&1 &

# whisper-cli compilado do código-fonte
(
  git clone --depth 1 https://github.com/ggml-org/whisper.cpp /opt/whisper/src &&
    cmake -S /opt/whisper/src -B /opt/whisper/build -DCMAKE_BUILD_TYPE=Release -DWHISPER_BUILD_TESTS=OFF -DBUILD_SHARED_LIBS=OFF &&
    cmake --build /opt/whisper/build -j 4 --target whisper-cli &&
    ln -sf /opt/whisper/build/bin/whisper-cli /usr/local/bin/whisper-cli
) > /tmp/setup-whisper.log 2>&1 &

wait
command -v ffmpeg >/dev/null && echo "ffmpeg ok" || echo "ffmpeg FALHOU (ver /tmp/setup-ffmpeg.log)"
command -v whisper-cli >/dev/null && echo "whisper-cli ok" || echo "whisper-cli FALHOU (ver /tmp/setup-whisper.log)"
ls -la /opt/whisper/models || true
exit 0
