import { NextResponse } from "next/server";
import { sendMessage } from "@/lib/chat/service";
import type { CareerAgentMode } from "@/lib/agent/router/types";
import { normalizeProviderConfig } from "@/lib/llm/config";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = String(body.input ?? "").trim();
    const threadId = body.threadId ? String(body.threadId) : null;
    const mode = (body.mode ?? "auto") as CareerAgentMode;
    const providerConfig = normalizeProviderConfig(body.providerConfig);

    if (!input) {
      return NextResponse.json({ error: "input is required" }, { status: 400 });
    }

    const result = await sendMessage(threadId, input, mode, { triggerType: "chat", providerConfig });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chat send failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
