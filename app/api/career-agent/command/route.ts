import { NextResponse } from "next/server";
import { CareerAgentRouter } from "@/lib/agent/router/CareerAgentRouter";
import type { CareerAgentMode } from "@/lib/agent/router/types";

export async function POST(request: Request) {
  const body = await request.json();
  const input = String(body.input ?? "").trim();
  const mode = (body.mode ?? "auto") as CareerAgentMode;
  if (!input) {
    return NextResponse.json({ error: "input is required" }, { status: 400 });
  }

  const router = new CareerAgentRouter();
  const result = await router.execute(input, mode);
  return NextResponse.json(result);
}
