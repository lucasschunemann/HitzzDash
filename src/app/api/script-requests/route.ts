import { pendingScriptRequests } from "@/server/claude-code";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await pendingScriptRequests());
}
