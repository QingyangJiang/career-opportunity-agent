import { prisma } from "@/lib/db/prisma";
import type { OpportunityDTO, OpportunityDetailDTO } from "@/lib/types";
import { toEvidenceDTO } from "@/lib/evidence/serializers";
import {
  toAssessmentDTO,
  toDecisionDTO,
  toOpenQuestionDTO,
  toOpportunityDTO,
  toOpportunityMemoryMatchDTO,
  toRiskDTO
} from "@/lib/opportunity/serializers";

export async function listOpportunities(): Promise<OpportunityDTO[]> {
  const items = await prisma.opportunity.findMany({
    orderBy: { updatedAt: "desc" }
  });
  return items.map(toOpportunityDTO);
}

export async function getOpportunityDetail(id: string): Promise<OpportunityDetailDTO | null> {
  const opportunity = await prisma.opportunity.findUnique({
    where: { id },
    include: {
      assessments: { orderBy: { createdAt: "desc" }, take: 1 },
      risks: { orderBy: { createdAt: "desc" } },
      openQuestions: { orderBy: [{ priority: "desc" }, { createdAt: "desc" }] },
      decisions: { orderBy: { createdAt: "desc" }, take: 1 },
      memoryMatches: { orderBy: [{ strength: "asc" }, { createdAt: "desc" }] },
      evidenceLinks: {
        include: { evidence: true },
        orderBy: { createdAt: "desc" }
      }
    }
  });
  if (!opportunity) return null;

  return {
    ...toOpportunityDTO(opportunity),
    latestAssessment: opportunity.assessments[0] ? toAssessmentDTO(opportunity.assessments[0]) : null,
    risks: opportunity.risks.map(toRiskDTO),
    openQuestions: opportunity.openQuestions.map(toOpenQuestionDTO),
    decisions: opportunity.decisions.map(toDecisionDTO),
    memoryMatches: opportunity.memoryMatches.map(toOpportunityMemoryMatchDTO),
    evidence: opportunity.evidenceLinks.map((link) => toEvidenceDTO(link.evidence))
  };
}
