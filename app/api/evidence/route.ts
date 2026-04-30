import { NextResponse } from "next/server";
import { createEvidence, listEvidence } from "@/lib/evidence/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const items = await listEvidence();
  return NextResponse.json(items);
}

export async function POST(request: Request) {
  const body = await request.json();
  const evidence = await createEvidence(body);
  return NextResponse.json(evidence, { status: 201 });
}
