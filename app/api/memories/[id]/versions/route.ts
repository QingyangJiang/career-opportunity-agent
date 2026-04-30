import { NextResponse } from "next/server";
import { listMemoryVersions } from "@/lib/memory/service";

interface Params {
  params: { id: string };
}

export async function GET(_request: Request, { params }: Params) {
  const versions = await listMemoryVersions(params.id);
  return NextResponse.json(versions);
}
