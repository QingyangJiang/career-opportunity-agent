import { NextResponse } from "next/server";
import { createMemory, listMemories } from "@/lib/memory/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedStatus = searchParams.get("status");
  const memories = await listMemories({
    search: searchParams.get("search"),
    type: searchParams.get("type"),
    tag: searchParams.get("tag"),
    status: requestedStatus === "all" ? null : requestedStatus ?? "active"
  });
  return NextResponse.json(memories);
}

export async function POST(request: Request) {
  const body = await request.json();
  const memory = await createMemory(body, body.changeReason ?? "Created from Memories page");
  return NextResponse.json(memory, { status: 201 });
}
