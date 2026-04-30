import { NextResponse } from "next/server";
import { listOpportunities } from "@/lib/opportunity/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const opportunities = await listOpportunities();
  return NextResponse.json(opportunities);
}
