import { NextResponse } from "next/server";
import { analyzeEvidence } from "@/lib/agent/analyzeEvidence";

interface Params {
  params: { id: string };
}

export async function POST(_request: Request, { params }: Params) {
  const run = await analyzeEvidence(params.id);
  return NextResponse.json(run, { status: 201 });
}
