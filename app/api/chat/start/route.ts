import { NextResponse } from "next/server";
import { sendMessage } from "@/lib/chat/service";
import type { CareerAgentMode } from "@/lib/agent/router/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const input = String(body.input ?? "").trim();
    const mode = (body.mode ?? "auto") as CareerAgentMode;

    if (!input) {
      return NextResponse.json({ redirectTo: "/chat/new" });
    }

    const result = await sendMessage(null, input, mode, { triggerType: "home_quick_start" });
    return NextResponse.json({
      redirectTo: `/chat/${result.thread.id}`,
      thread: result.thread,
      userMessage: result.userMessage,
      assistantMessage: result.assistantMessage
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start chat.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
