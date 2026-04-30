import { NextResponse } from "next/server";
import { listAgentRuns } from "@/lib/agent/analyzeEvidence";

export const dynamic = "force-dynamic";

export async function GET() {
  const runs = await listAgentRuns();
  return NextResponse.json(runs);
}
