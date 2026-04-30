import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { toOpenQuestionDTO } from "@/lib/opportunity/serializers";

interface Params {
  params: { id: string };
}

export async function PATCH(request: Request, { params }: Params) {
  const body = await request.json();
  const question = await prisma.openQuestion.update({
    where: { id: params.id },
    data: {
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.answer !== undefined ? { answer: body.answer, status: "answered" } : {})
    }
  });
  return NextResponse.json(toOpenQuestionDTO(question));
}
