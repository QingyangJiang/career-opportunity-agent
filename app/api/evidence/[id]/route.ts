import { NextResponse } from "next/server";
import { deleteEvidence, getEvidence, updateEvidence } from "@/lib/evidence/service";

interface Params {
  params: { id: string };
}

export async function GET(_request: Request, { params }: Params) {
  const evidence = await getEvidence(params.id);
  if (!evidence) return NextResponse.json({ error: "Evidence not found" }, { status: 404 });
  return NextResponse.json(evidence);
}

export async function PATCH(request: Request, { params }: Params) {
  const body = await request.json();
  const evidence = await updateEvidence(params.id, body);
  return NextResponse.json(evidence);
}

export async function DELETE(_request: Request, { params }: Params) {
  await deleteEvidence(params.id);
  return NextResponse.json({ ok: true });
}
