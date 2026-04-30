import { NextResponse } from "next/server";
import { deleteChatThread, getChatThread, updateChatThreadModelConfig, updateChatThreadStatus } from "@/lib/chat/service";
import { normalizeProviderConfig } from "@/lib/llm/config";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { threadId: string } }) {
  const thread = await getChatThread(params.threadId);
  if (!thread) return NextResponse.json({ error: "ChatThread not found" }, { status: 404 });
  return NextResponse.json(thread);
}

export async function PATCH(request: Request, { params }: { params: { threadId: string } }) {
  const body = await request.json();
  if (body.modelConfig) {
    const thread = await updateChatThreadModelConfig(params.threadId, normalizeProviderConfig(body.modelConfig));
    return NextResponse.json(thread);
  }
  const status = body.status === "archived" ? "archived" : "active";
  const thread = await updateChatThreadStatus(params.threadId, status);
  return NextResponse.json(thread);
}

export async function DELETE(_request: Request, { params }: { params: { threadId: string } }) {
  await deleteChatThread(params.threadId);
  return NextResponse.json({ ok: true });
}
