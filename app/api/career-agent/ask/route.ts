import { NextResponse } from "next/server";
import { askCareerAgent } from "@/lib/career-agent/ask";

export async function POST(request: Request) {
  const body = await request.json();
  const question = String(body.question ?? "").trim();
  const answer = await askCareerAgent(question);
  return NextResponse.json(answer);
}
