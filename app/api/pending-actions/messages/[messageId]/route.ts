import { NextResponse } from "next/server";
import { getPendingActionsForMessage } from "@/lib/pending-actions/service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { messageId: string } }) {
  const actions = await getPendingActionsForMessage(params.messageId);
  return NextResponse.json(actions);
}
