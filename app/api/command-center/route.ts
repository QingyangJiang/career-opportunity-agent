import { NextResponse } from "next/server";
import { getCommandCenterData } from "@/lib/command-center/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getCommandCenterData();
  return NextResponse.json(data);
}
