import { NextResponse } from "next/server";
import { createChatThread, listChatThreads } from "@/lib/chat/service";
import { normalizeProviderConfig } from "@/lib/llm/config";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const includeArchived = searchParams.get("includeArchived") === "true";
  const rawStatus = searchParams.get("status");
  const status = rawStatus === "active" || rawStatus === "archived" ? rawStatus : undefined;
  const threads = await listChatThreads(includeArchived, status);
  return NextResponse.json(threads);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : undefined;
  const thread = await createChatThread(title, body.modelConfig ? normalizeProviderConfig(body.modelConfig) : undefined);
  return NextResponse.json(thread);
}
