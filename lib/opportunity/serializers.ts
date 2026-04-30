import type {
  Assessment,
  Decision,
  Opportunity,
  OpportunityMemoryMatch,
  OpenQuestion,
  Risk
} from "@prisma/client";
import type {
  AssessmentDTO,
  DecisionDTO,
  OpportunityDTO,
  OpportunityMemoryMatchDTO,
  OpenQuestionDTO,
  RiskDTO
} from "@/lib/types";
import { parseJsonArray } from "@/lib/utils/json";

export function toOpportunityDTO(opportunity: Opportunity): OpportunityDTO {
  return {
    id: opportunity.id,
    type: opportunity.type,
    company: opportunity.company,
    businessUnit: opportunity.businessUnit,
    roleTitle: opportunity.roleTitle,
    sourceChannel: opportunity.sourceChannel,
    sourceUrl: opportunity.sourceUrl,
    status: opportunity.status,
    location: opportunity.location,
    salaryRange: opportunity.salaryRange,
    directionTags: parseJsonArray<string>(opportunity.directionTagsJson),
    responsibilities: parseJsonArray<string>(opportunity.responsibilitiesJson),
    requirements: parseJsonArray<string>(opportunity.requirementsJson),
    rawSummary: opportunity.rawSummary,
    createdAt: opportunity.createdAt.toISOString(),
    updatedAt: opportunity.updatedAt.toISOString()
  };
}

export function toAssessmentDTO(assessment: Assessment): AssessmentDTO {
  return {
    id: assessment.id,
    opportunityId: assessment.opportunityId,
    overallScore: assessment.overallScore,
    directionMatchScore: assessment.directionMatchScore,
    experienceMatchScore: assessment.experienceMatchScore,
    compensationMatchScore: assessment.compensationMatchScore,
    ownerSpaceScore: assessment.ownerSpaceScore,
    summary: assessment.summary,
    strongMatches: parseJsonArray<unknown>(assessment.strongMatchesJson),
    weakMatches: parseJsonArray<unknown>(assessment.weakMatchesJson),
    createdAt: assessment.createdAt.toISOString()
  };
}

export function toRiskDTO(risk: Risk): RiskDTO {
  const firstEvidenceId = parseJsonArray<string>(risk.evidenceIdsJson)[0] ?? null;
  return {
    id: risk.id,
    opportunityId: risk.opportunityId,
    title: risk.title,
    description: risk.description,
    severity: risk.severity,
    likelihood: risk.likelihood,
    mitigation: risk.mitigation,
    status: risk.status,
    evidenceIds: parseJsonArray<string>(risk.evidenceIdsJson),
    sourceOpportunityId: risk.opportunityId,
    sourceEvidenceId: firstEvidenceId,
    createdAt: risk.createdAt.toISOString(),
    updatedAt: risk.updatedAt.toISOString()
  };
}

export function toOpenQuestionDTO(question: OpenQuestion): OpenQuestionDTO {
  return {
    id: question.id,
    opportunityId: question.opportunityId,
    question: question.question,
    target: question.target,
    priority: question.priority,
    status: question.status,
    answer: question.answer,
    sourceOpportunityId: question.opportunityId,
    createdAt: question.createdAt.toISOString()
  };
}

export function toDecisionDTO(decision: Decision): DecisionDTO {
  return {
    id: decision.id,
    opportunityId: decision.opportunityId,
    decision: decision.decision,
    confidence: decision.confidence,
    rationale: decision.rationale,
    evidenceIds: parseJsonArray<string>(decision.evidenceIdsJson),
    createdAt: decision.createdAt.toISOString()
  };
}

export function toOpportunityMemoryMatchDTO(match: OpportunityMemoryMatch): OpportunityMemoryMatchDTO {
  return {
    id: match.id,
    opportunityId: match.opportunityId,
    memoryId: match.memoryId,
    requirement: match.requirement,
    memoryTitle: match.memoryTitle,
    strength: match.strength,
    rationale: match.rationale,
    evidenceIds: parseJsonArray<string>(match.evidenceIdsJson),
    createdAt: match.createdAt.toISOString()
  };
}
