import { NextResponse } from "next/server";
import { rollbackMemory } from "@/lib/memory/service";

interface Params {
  params: { id: string };
}

export async function POST(request: Request, { params }: Params) {
  const body = await request.json();
  if (!body.versionId) {
    return NextResponse.json({ error: "versionId is required" }, { status: 400 });
  }
  const memory = await rollbackMemory(params.id, body.versionId);
  return NextResponse.json(memory);
}
