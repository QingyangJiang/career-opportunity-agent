import { NextResponse } from "next/server";
import { rejectMemorySuggestion } from "@/lib/memory/service";

interface Params {
  params: { id: string };
}

export async function POST(_request: Request, { params }: Params) {
  const suggestion = await rejectMemorySuggestion(params.id);
  return NextResponse.json(suggestion);
}
