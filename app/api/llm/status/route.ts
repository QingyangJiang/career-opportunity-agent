import { NextResponse } from "next/server";
import { isDeepSeekConfigured } from "@/lib/llm/config";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    deepseekConfigured: isDeepSeekConfigured()
  });
}
