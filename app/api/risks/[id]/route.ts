import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { toRiskDTO } from "@/lib/opportunity/serializers";

interface Params {
  params: { id: string };
}

export async function PATCH(request: Request, { params }: Params) {
  const body = await request.json();
  const risk = await prisma.risk.update({
    where: { id: params.id },
    data: {
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.mitigation !== undefined ? { mitigation: body.mitigation } : {})
    }
  });
  return NextResponse.json(toRiskDTO(risk));
}
