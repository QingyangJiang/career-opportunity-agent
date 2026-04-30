import { NextResponse } from "next/server";
import { deleteMemory, getMemory, updateMemory } from "@/lib/memory/service";

interface Params {
  params: { id: string };
}

export async function GET(_request: Request, { params }: Params) {
  const memory = await getMemory(params.id);
  if (!memory) return NextResponse.json({ error: "Memory not found" }, { status: 404 });
  return NextResponse.json(memory);
}

export async function PATCH(request: Request, { params }: Params) {
  const body = await request.json();
  const memory = await updateMemory(params.id, body, body.changeReason ?? "Updated from Memories page");
  return NextResponse.json(memory);
}

export async function DELETE(_request: Request, { params }: Params) {
  await deleteMemory(params.id);
  return NextResponse.json({ ok: true });
}
