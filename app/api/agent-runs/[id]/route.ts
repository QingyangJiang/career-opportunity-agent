import { NextResponse } from "next/server";
import { getAgentRun } from "@/lib/agent/analyzeEvidence";

interface Params {
  params: { id: string };
}

export async function GET(_request: Request, { params }: Params) {
  const run = await getAgentRun(params.id);
  if (!run) return NextResponse.json({ error: "AgentRun not found" }, { status: 404 });
  return NextResponse.json(run);
}
