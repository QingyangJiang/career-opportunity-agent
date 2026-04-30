import type { Evidence } from "@prisma/client";
import type { EvidenceDTO } from "@/lib/types";

export function toEvidenceDTO(evidence: Evidence): EvidenceDTO {
  return {
    id: evidence.id,
    type: evidence.type,
    title: evidence.title,
    content: evidence.content,
    sourceUrl: evidence.sourceUrl,
    createdAt: evidence.createdAt.toISOString(),
    updatedAt: evidence.updatedAt.toISOString()
  };
}
