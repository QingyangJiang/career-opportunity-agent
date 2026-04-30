import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { toMemorySuggestionDTO } from "@/lib/memory/serializers";
import { normalizeStringArray, stringifyJson } from "@/lib/utils/json";

interface Params {
  params: { id: string };
}

export async function PATCH(request: Request, { params }: Params) {
  const body = await request.json();
  const suggestion = await prisma.memorySuggestion.update({
    where: { id: params.id },
    data: {
      ...(body.suggestedType !== undefined ? { suggestedType: body.suggestedType } : {}),
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.content !== undefined ? { content: body.content } : {}),
      ...(body.tags !== undefined ? { tagsJson: stringifyJson(normalizeStringArray(body.tags)) } : {}),
      ...(body.confidence !== undefined ? { confidence: Number(body.confidence) } : {}),
      ...(body.reason !== undefined ? { reason: body.reason } : {}),
      ...(body.sourceEvidenceIds !== undefined
        ? { sourceEvidenceIdsJson: stringifyJson(normalizeStringArray(body.sourceEvidenceIds)) }
        : {})
    }
  });
  return NextResponse.json(toMemorySuggestionDTO(suggestion));
}
