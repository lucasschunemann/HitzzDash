export async function register() {
  // Na Vercel não há processo contínuo: fila e agenda rodam no Mac (npm run cc -- work).
  if (process.env.NEXT_RUNTIME === "nodejs" && !process.env.VERCEL) {
    const { boot } = await import("./server/boot");
    await boot();
  }
}
