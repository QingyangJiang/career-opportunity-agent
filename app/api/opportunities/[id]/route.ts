import { NextResponse } from "next/server";
import { getOpportunityDetail } from "@/lib/opportunity/service";

interface Params {
  params: { id: string };
}

export async function GET(_request: Request, { params }: Params) {
  const opportunity = await getOpportunityDetail(params.id);
  if (!opportunity) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
  return NextResponse.json(opportunity);
}
