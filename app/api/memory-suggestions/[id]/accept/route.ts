import { NextResponse } from "next/server";
import { acceptMemorySuggestion } from "@/lib/memory/service";

interface Params {
  params: { id: string };
}

export async function POST(request: Request, { params }: Params) {
  const body = await request.json().catch(() => ({}));
  const result = await acceptMemorySuggestion(params.id, body);
  return NextResponse.json(result);
}
