import { prisma } from "@/lib/db/prisma";
import type { EvidenceDTO } from "@/lib/types";
import { toEvidenceDTO } from "@/lib/evidence/serializers";

export interface EvidenceInput {
  type: string;
  title: string;
  content: string;
  sourceUrl?: string | null;
}

export async function listEvidence(): Promise<EvidenceDTO[]> {
  const items = await prisma.evidence.findMany({
    orderBy: { updatedAt: "desc" }
  });
  return items.map(toEvidenceDTO);
}

export async function getEvidence(id: string): Promise<EvidenceDTO | null> {
  const evidence = await prisma.evidence.findUnique({ where: { id } });
  return evidence ? toEvidenceDTO(evidence) : null;
}

export async function createEvidence(input: EvidenceInput): Promise<EvidenceDTO> {
  const evidence = await prisma.evidence.create({
    data: {
      type: input.type,
      title: input.title,
      content: input.content,
      sourceUrl: input.sourceUrl || null
    }
  });
  return toEvidenceDTO(evidence);
}

export async function updateEvidence(id: string, input: Partial<EvidenceInput>): Promise<EvidenceDTO> {
  const evidence = await prisma.evidence.update({
    where: { id },
    data: {
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.sourceUrl !== undefined ? { sourceUrl: input.sourceUrl || null } : {})
    }
  });
  return toEvidenceDTO(evidence);
}

export async function deleteEvidence(id: string): Promise<void> {
  await prisma.evidence.delete({ where: { id } });
}
