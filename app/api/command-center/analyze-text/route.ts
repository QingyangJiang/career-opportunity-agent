import { NextResponse } from "next/server";
import { analyzeEvidence } from "@/lib/agent/analyzeEvidence";
import { createEvidence } from "@/lib/evidence/service";
import { inferEvidenceType, titleFromInput } from "@/lib/career-agent/evidenceDetection";

export async function POST(request: Request) {
  const body = await request.json();
  const content = String(body.content ?? "").trim();
  if (!content) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const evidence = await createEvidence({
    type: body.type ?? inferEvidenceType(content),
    title: body.title ?? titleFromInput(content),
    content,
    sourceUrl: body.sourceUrl ?? null
  });
  const run = await analyzeEvidence(evidence.id);

  return NextResponse.json({ evidence, run }, { status: 201 });
}
