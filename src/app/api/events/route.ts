import { latestChange } from "@/server/events";

export const dynamic = "force-dynamic";

/** Server-Sent Events: avisa o navegador quando o banco muda (novos vídeos, status da fila, etc.). */
export async function GET(req: Request) {
  const enc = new TextEncoder();
  let last = (await latestChange())?.id ?? 0;
  let timer: ReturnType<typeof setInterval>;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(`retry: 3000\nevent: ready\ndata: ${last}\n\n`));
      timer = setInterval(async () => {
        try {
          const cur = (await latestChange())?.id ?? 0;
          if (cur !== last) {
            last = cur;
            controller.enqueue(enc.encode(`event: change\ndata: ${cur}\n\n`));
          } else {
            controller.enqueue(enc.encode(`: ping\n\n`));
          }
        } catch {
          clearInterval(timer);
        }
      }, 1500);
      req.signal.addEventListener("abort", () => {
        clearInterval(timer);
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      clearInterval(timer);
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
