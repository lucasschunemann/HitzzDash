/**
 * Onde o app está rodando. Na Vercel ele só serve o dashboard (sem disco, sem ffmpeg/Whisper,
 * sem processo em segundo plano); o processamento roda no Mac, que consome a mesma fila no banco.
 */
export const isVercel = () => Boolean(process.env.VERCEL);
export const isWorkerHost = () => !isVercel();
