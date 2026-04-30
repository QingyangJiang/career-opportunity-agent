import { prisma } from "@/lib/db/prisma";
import { toAgentRunDTO } from "@/lib/agent/serializers";
import { toEvidenceDTO } from "@/lib/evidence/serializers";
import { listMemories } from "@/lib/memory/service";
import { getLLMProvider } from "@/lib/llm/provider";
import { providerMetadata, type LLMProviderConfig } from "@/lib/llm/config";
import type {
  AssessmentDraft,
  DecisionDraft,
  MatchResult,
  MemorySuggestionDraft,
  OpenQuestionDraft,
  OpportunityDraft,
  RiskDraft
} from "@/lib/llm/types";
import type { AgentRunDTO, EvidenceDTO } from "@/lib/types";
import { parseJsonArray, stringifyJson } from "@/lib/utils/json";
import { normalizeText } from "@/lib/utils/normalize";

function opportunityDataFromDraft(draft: OpportunityDraft) {
  return {
    type: draft.type,
    company: draft.company,
    businessUnit: draft.businessUnit ?? null,
    roleTitle: draft.roleTitle,
    sourceChannel: draft.sourceChannel ?? null,
    sourceUrl: draft.sourceUrl ?? null,
    status: draft.status,
    location: draft.location ?? null,
    salaryRange: draft.salaryRange ?? null,
    directionTagsJson: stringifyJson(draft.directionTags),
    responsibilitiesJson: stringifyJson(draft.responsibilities),
    requirementsJson: stringifyJson(draft.requirements),
    rawSummary: draft.rawSummary
  };
}

function mergeIds(...groups: string[][]) {
  return Array.from(new Set(groups.flat().filter(Boolean)));
}

async function upsertOpportunityForEvidence(evidence: EvidenceDTO, draft: OpportunityDraft) {
  const existingLink = await prisma.opportunityEvidence.findFirst({
    where: { evidenceId: evidence.id },
    orderBy: { createdAt: "desc" }
  });

  if (existingLink) {
    const opportunity = await prisma.opportunity.update({
      where: { id: existingLink.opportunityId },
      data: opportunityDataFromDraft(draft)
    });
    await prisma.opportunityMemoryMatch.deleteMany({ where: { opportunityId: opportunity.id } });
    return opportunity;
  }

  const opportunities = await prisma.opportunity.findMany();
  const existingOpportunity = opportunities.find(
    (opportunity) =>
      normalizeText(opportunity.company) === normalizeText(draft.company) &&
      normalizeText(opportunity.roleTitle) === normalizeText(draft.roleTitle)
  );

  if (existingOpportunity) {
    const opportunity = await prisma.opportunity.update({
      where: { id: existingOpportunity.id },
      data: opportunityDataFromDraft(draft)
    });
    await prisma.opportunityEvidence.upsert({
      where: {
        opportunityId_evidenceId: {
          opportunityId: opportunity.id,
          evidenceId: evidence.id
        }
      },
      create: {
        opportunityId: opportunity.id,
        evidenceId: evidence.id
      },
      update: {}
    });
    await prisma.opportunityMemoryMatch.deleteMany({ where: { opportunityId: opportunity.id } });
    return opportunity;
  }

  const opportunity = await prisma.opportunity.create({
    data: opportunityDataFromDraft(draft)
  });
  await prisma.opportunityEvidence.create({
    data: {
      opportunityId: opportunity.id,
      evidenceId: evidence.id
    }
  });
  return opportunity;
}

async function createStep<T>(
  agentRunId: string,
  stepName: string,
  inputSummary: string,
  fn: () => Promise<T>,
  runtimeMetadata?: () => unknown
): Promise<T> {
  try {
    const output = await fn();
    await prisma.agentStep.create({
      data: {
        agentRunId,
        stepName,
        inputSummary,
        outputJson: stringifyJson(runtimeMetadata ? { result: output, providerRuntime: runtimeMetadata() } : output),
        status: "completed"
      }
    });
    return output;
  } catch (error) {
    await prisma.agentStep.create({
      data: {
        agentRunId,
        stepName,
        inputSummary,
        outputJson: stringifyJson(runtimeMetadata ? { providerRuntime: runtimeMetadata() } : {}),
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error)
      }
    });
    throw error;
  }
}

async function persistAssessment(opportunityId: string, draft: AssessmentDraft) {
  return prisma.assessment.create({
    data: {
      opportunityId,
      overallScore: draft.overallScore,
      directionMatchScore: draft.directionMatchScore,
      experienceMatchScore: draft.experienceMatchScore,
      compensationMatchScore: draft.compensationMatchScore,
      ownerSpaceScore: draft.ownerSpaceScore,
      summary: draft.summary,
      strongMatchesJson: stringifyJson(draft.strongMatches),
      weakMatchesJson: stringifyJson(draft.weakMatches)
    }
  });
}

async function persistRisks(opportunityId: string, evidenceId: string, drafts: RiskDraft[]) {
  const existing = await prisma.risk.findMany({ where: { opportunityId, status: "active" } });
  for (const draft of drafts.slice(0, 3)) {
    const evidenceIds = draft.evidenceIds.length ? draft.evidenceIds : [evidenceId];
    const match = existing.find((risk) => normalizeText(risk.title) === normalizeText(draft.title));
    if (match) {
      await prisma.risk.update({
        where: { id: match.id },
        data: {
          description: draft.description,
          severity: draft.severity,
          likelihood: draft.likelihood,
          mitigation: draft.mitigation ?? match.mitigation,
          evidenceIdsJson: stringifyJson(mergeIds(parseJsonArray<string>(match.evidenceIdsJson), evidenceIds))
        }
      });
      continue;
    }
    await prisma.risk.create({
      data: {
        opportunityId,
        title: draft.title,
        description: draft.description,
        severity: draft.severity,
        likelihood: draft.likelihood,
        mitigation: draft.mitigation ?? null,
        status: "active",
        evidenceIdsJson: stringifyJson(evidenceIds)
      }
    });
  }
}

async function persistOpenQuestions(opportunityId: string, drafts: OpenQuestionDraft[]) {
  const existing = await prisma.openQuestion.findMany({
    where: { opportunityId, status: { in: ["unasked", "asked"] } }
  });
  for (const draft of drafts.slice(0, 5)) {
    const match = existing.find((question) => normalizeText(question.question) === normalizeText(draft.question));
    if (match) {
      await prisma.openQuestion.update({
        where: { id: match.id },
        data: {
          target: draft.target,
          priority: draft.priority,
          answer: draft.answer ?? match.answer
        }
      });
      continue;
    }
    await prisma.openQuestion.create({
      data: {
        opportunityId,
        question: draft.question,
        target: draft.target,
        priority: draft.priority,
        status: draft.status,
        answer: draft.answer ?? null
      }
    });
  }
}

async function persistDecision(opportunityId: string, evidenceId: string, draft: DecisionDraft) {
  const evidenceIds = draft.evidenceIds.length ? draft.evidenceIds : [evidenceId];
  const existing = await prisma.decision.findFirst({
    where: { opportunityId, decision: draft.decision },
    orderBy: { createdAt: "desc" }
  });
  if (existing) {
    return prisma.decision.update({
      where: { id: existing.id },
      data: {
        confidence: draft.confidence,
        rationale: draft.rationale,
        evidenceIdsJson: stringifyJson(mergeIds(parseJsonArray<string>(existing.evidenceIdsJson), evidenceIds))
      }
    });
  }
  return prisma.decision.create({
    data: {
      opportunityId,
      decision: draft.decision,
      confidence: draft.confidence,
      rationale: draft.rationale,
      evidenceIdsJson: stringifyJson(evidenceIds)
    }
  });
}

async function persistMatches(opportunityId: string, evidenceId: string, matchResult: MatchResult) {
  if (!matchResult.matches.length) return;
  await prisma.opportunityMemoryMatch.createMany({
    data: matchResult.matches.map((match) => ({
      opportunityId,
      memoryId: match.memoryId ?? null,
      memoryTitle: match.memoryTitle ?? null,
      requirement: match.requirement,
      strength: match.strength,
      rationale: match.rationale,
      evidenceIdsJson: stringifyJson(match.evidenceIds.length ? match.evidenceIds : [evidenceId])
    }))
  });
}

async function persistSuggestions(agentRunId: string, evidenceId: string, drafts: MemorySuggestionDraft[]) {
  const allowedSuggestionTypes = new Set([
    "ProfileFact",
    "Skill",
    "ProjectClaim",
    "Preference",
    "Constraint",
    "CareerGoal",
    "CurrentTask",
    "ComparisonTarget",
    "HistoricalConclusion"
  ]);
  const evidence = await prisma.evidence.findUnique({ where: { id: evidenceId } });
  const durableSignal = ["以后", "长期", "优先", "不考虑", "目标", "记住", "偏好", "约束"].some((signal) =>
    `${evidence?.title ?? ""} ${evidence?.content ?? ""}`.includes(signal)
  );
  if (!durableSignal) return;
  const existing = await prisma.memorySuggestion.findMany({ where: { status: "pending" } });
  for (const draft of drafts.filter((item) => allowedSuggestionTypes.has(item.suggestedType)).slice(0, 3)) {
    const sourceEvidenceIds = draft.sourceEvidenceIds.length ? draft.sourceEvidenceIds : [evidenceId];
    const normalizedContent = normalizeText(`${draft.title} ${draft.content}`);
    const match = existing.find((suggestion) => {
      const suggestionEvidenceIds = parseJsonArray<string>(suggestion.sourceEvidenceIdsJson).sort().join("|");
      return (
        suggestion.suggestedType === draft.suggestedType &&
        normalizeText(`${suggestion.title} ${suggestion.content}`) === normalizedContent &&
        suggestionEvidenceIds === [...sourceEvidenceIds].sort().join("|")
      );
    });
    if (match) {
      await prisma.memorySuggestion.update({
        where: { id: match.id },
        data: {
          agentRunId,
          tagsJson: stringifyJson(draft.tags),
          confidence: draft.confidence,
          reason: draft.reason,
          sourceEvidenceIdsJson: stringifyJson(mergeIds(parseJsonArray<string>(match.sourceEvidenceIdsJson), sourceEvidenceIds))
        }
      });
      continue;
    }
    await prisma.memorySuggestion.create({
      data: {
        agentRunId,
        suggestedType: draft.suggestedType,
        title: draft.title,
        content: draft.content,
        tagsJson: stringifyJson(draft.tags),
        confidence: draft.confidence,
        reason: draft.reason,
        sourceEvidenceIdsJson: stringifyJson(sourceEvidenceIds),
        status: "pending"
      }
    });
  }
}

export interface AnalyzeEvidenceOptions {
  agentRunId?: string;
  triggerType?: string;
  sourceMessageText?: string;
  chatThreadId?: string;
  sourceMessageId?: string;
  detectedIntent?: string;
  actionPlan?: string[];
  providerConfig?: LLMProviderConfig;
}

export async function analyzeEvidence(evidenceId: string, options: AnalyzeEvidenceOptions = {}): Promise<AgentRunDTO> {
  const evidenceRecord = await prisma.evidence.findUniqueOrThrow({ where: { id: evidenceId } });
  const evidence = toEvidenceDTO(evidenceRecord);
  const run = options.agentRunId
    ? await prisma.agentRun.update({
        where: { id: options.agentRunId },
        data: {
          inputJson: stringifyJson({
            evidenceId,
            sourceMessageText: options.sourceMessageText,
            chatThreadId: options.chatThreadId,
            sourceMessageId: options.sourceMessageId,
            provider: providerMetadata(options.providerConfig)
          }),
          triggerType: options.triggerType,
          detectedIntent: options.detectedIntent,
          actionPlanJson: stringifyJson(options.actionPlan ?? []),
          sourceMessageText: options.sourceMessageText,
          chatThreadId: options.chatThreadId,
          sourceMessageId: options.sourceMessageId
        }
      })
    : await prisma.agentRun.create({
        data: {
          workflowType: "Analyze Evidence",
          inputJson: stringifyJson({ evidenceId, provider: providerMetadata(options.providerConfig) }),
          triggerType: options.triggerType ?? "evidence_analyze",
          detectedIntent: options.detectedIntent ?? "analyze_evidence",
          actionPlanJson: stringifyJson(options.actionPlan ?? []),
          sourceMessageText: options.sourceMessageText,
          chatThreadId: options.chatThreadId,
          sourceMessageId: options.sourceMessageId,
          status: "running"
        }
      });

  const provider = getLLMProvider();

  try {
    await createStep(run.id, "classify_evidence", evidence.title, () => provider.classifyEvidence(evidence), () => provider.metadata);

    const { draft, opportunityId } = await createStep(run.id, "extract_opportunity", evidence.title, async () => {
      const opportunityDraft = await provider.extractOpportunity(evidence);
      const opportunity = await upsertOpportunityForEvidence(evidence, opportunityDraft);
      return { draft: opportunityDraft, opportunityId: opportunity.id };
    }, () => provider.metadata);

    await createStep(run.id, "extract_role_signals", draft.roleTitle, () =>
      provider.extractRoleSignals(evidence, draft)
    , () => provider.metadata);

    const memories = await listMemories({ status: "active" });

    const matchResult = await createStep(run.id, "match_with_memories", `${draft.roleTitle} vs active memories`, async () => {
      const result = await provider.matchOpportunityWithMemories(draft, memories);
      await persistMatches(opportunityId, evidence.id, result);
      return result;
    }, () => provider.metadata);

    const assessment = await createStep(run.id, "generate_assessment", draft.roleTitle, async () => {
      const result = await provider.generateAssessment(draft, memories, matchResult);
      const persisted = await persistAssessment(opportunityId, result);
      return { ...result, id: persisted.id, opportunityId };
    }, () => provider.metadata);

    const risks = await createStep(run.id, "generate_risks", draft.roleTitle, async () => {
      const result = await provider.generateRisks(draft, memories, assessment);
      await persistRisks(opportunityId, evidence.id, result);
      return result;
    }, () => provider.metadata);

    const openQuestions = await createStep(run.id, "generate_open_questions", draft.roleTitle, async () => {
      const result = await provider.generateOpenQuestions(draft, risks);
      await persistOpenQuestions(opportunityId, result);
      return result;
    }, () => provider.metadata);

    const decision = await createStep(run.id, "generate_decision", draft.roleTitle, async () => {
      const result = await provider.generateDecision(draft, assessment, risks);
      const persisted = await persistDecision(opportunityId, evidence.id, result);
      return { ...result, id: persisted.id, opportunityId };
    }, () => provider.metadata);

    await createStep(run.id, "suggest_memory_updates", draft.roleTitle, async () => {
      const result = await provider.suggestMemoryUpdates(evidence, draft, assessment);
      await persistSuggestions(run.id, evidence.id, result);
      return result;
    }, () => provider.metadata);

    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "completed" }
    });
  } catch (error) {
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "failed" }
    });
    throw error;
  }

  const fullRun = await prisma.agentRun.findUniqueOrThrow({
    where: { id: run.id },
    include: {
      steps: { orderBy: { createdAt: "asc" } },
      suggestions: { orderBy: { createdAt: "asc" } },
      chatThread: true,
      sourceMessage: true
    }
  });
  return toAgentRunDTO(fullRun);
}

export async function getAgentRun(id: string): Promise<AgentRunDTO | null> {
  const run = await prisma.agentRun.findUnique({
    where: { id },
    include: {
      steps: { orderBy: { createdAt: "asc" } },
      suggestions: { orderBy: { createdAt: "asc" } },
      chatThread: true,
      sourceMessage: true
    }
  });
  return run ? toAgentRunDTO(run) : null;
}

export async function listAgentRuns(): Promise<AgentRunDTO[]> {
  const runs = await prisma.agentRun.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      steps: { orderBy: { createdAt: "asc" } },
      suggestions: { orderBy: { createdAt: "asc" } },
      chatThread: true,
      sourceMessage: true
    }
  });
  return runs.map(toAgentRunDTO);
}
