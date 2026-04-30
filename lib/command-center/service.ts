import { prisma } from "@/lib/db/prisma";
import { toAgentRunDTO } from "@/lib/agent/serializers";
import { toChatThreadDTO } from "@/lib/chat/serializers";
import { toMemorySuggestionDTO } from "@/lib/memory/serializers";
import {
  toOpenQuestionDTO,
  toOpportunityDTO,
  toRiskDTO
} from "@/lib/opportunity/serializers";
import type {
  AgentRunDTO,
  ChatThreadDTO,
  MemorySuggestionDTO,
  OpenQuestionDTO,
  OpportunityDTO,
  RiskDTO
} from "@/lib/types";
import { normalizeText } from "@/lib/utils/normalize";
import { getPendingCountsByThread, getPendingReviewSummary, type PendingReviewSummary } from "@/lib/pending-actions/service";

export interface InboxRiskItem extends RiskDTO {
  opportunityTitle: string;
  company: string;
}

export interface InboxQuestionItem extends OpenQuestionDTO {
  opportunityTitle: string;
  company: string;
}

export interface CommandCenterData {
  stats: {
    memoriesCount: number;
    evidenceCount: number;
    opportunitiesCount: number;
    pendingMemorySuggestionsCount: number;
    activeRisksCount: number;
    openQuestionsCount: number;
  };
  actionInbox: {
    pendingMemorySuggestions: MemorySuggestionDTO[];
    highSeverityRisks: InboxRiskItem[];
    unansweredOpenQuestions: InboxQuestionItem[];
    recentlyUpdatedOpportunities: OpportunityDTO[];
  };
  recentAgentRuns: AgentRunDTO[];
  recentOpportunities: OpportunityDTO[];
  recentConversations: ChatThreadDTO[];
  pendingReviewSummary: PendingReviewSummary;
}

function uniqueByNormalized<T>(items: T[], key: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const normalized = normalizeText(key(item));
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export async function getCommandCenterData(): Promise<CommandCenterData> {
  const [
    memoriesCount,
    evidenceCount,
    opportunitiesCount,
    pendingMemorySuggestionsCount,
    activeRisksCount,
    openQuestionsCount,
    pendingMemorySuggestions,
    highSeverityRisks,
    unansweredOpenQuestions,
    recentlyUpdatedOpportunities,
    recentAgentRuns,
    recentOpportunities,
    recentConversations,
    pendingReviewSummary
  ] = await Promise.all([
    prisma.memory.count({ where: { status: "active" } }),
    prisma.evidence.count(),
    prisma.opportunity.count(),
    prisma.memorySuggestion.count({ where: { status: "pending" } }),
    prisma.risk.count({ where: { status: "active" } }),
    prisma.openQuestion.count({ where: { status: { not: "answered" } } }),
    prisma.memorySuggestion.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "desc" },
      take: 6
    }),
    prisma.risk.findMany({
      where: { severity: "high", status: "active" },
      include: { opportunity: true },
      orderBy: { createdAt: "desc" },
      take: 6
    }),
    prisma.openQuestion.findMany({
      where: { status: { not: "answered" } },
      include: { opportunity: true },
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prisma.opportunity.findMany({
      orderBy: { updatedAt: "desc" },
      take: 6
    }),
    prisma.agentRun.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        steps: { orderBy: { createdAt: "asc" } },
        suggestions: { orderBy: { createdAt: "asc" } },
        chatThread: true,
        sourceMessage: true
      },
      take: 5
    }),
    prisma.opportunity.findMany({
      orderBy: { createdAt: "desc" },
      take: 5
    }),
    prisma.chatThread.findMany({
      where: { status: "active" },
      orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
      take: 5
    }),
    getPendingReviewSummary()
  ]);
  const recentConversationCounts = await getPendingCountsByThread(recentConversations.map((thread) => thread.id));

  return {
    stats: {
      memoriesCount,
      evidenceCount,
      opportunitiesCount,
      pendingMemorySuggestionsCount,
      activeRisksCount,
      openQuestionsCount
    },
    actionInbox: {
      pendingMemorySuggestions: uniqueByNormalized(
        pendingMemorySuggestions.map(toMemorySuggestionDTO),
        (suggestion) => `${suggestion.suggestedType} ${suggestion.title} ${suggestion.content}`
      ),
      highSeverityRisks: uniqueByNormalized(
        highSeverityRisks.map((risk) => ({
          ...toRiskDTO(risk),
          opportunityTitle: risk.opportunity.roleTitle,
          company: risk.opportunity.company
        })),
        (risk) => `${risk.opportunityId} ${risk.title}`
      ),
      unansweredOpenQuestions: uniqueByNormalized(
        unansweredOpenQuestions
          .sort((a, b) => {
            const rank: Record<string, number> = { high: 3, medium: 2, low: 1 };
            return (rank[b.priority] ?? 0) - (rank[a.priority] ?? 0) || b.createdAt.getTime() - a.createdAt.getTime();
          })
          .slice(0, 6)
          .map((question) => ({
            ...toOpenQuestionDTO(question),
            opportunityTitle: question.opportunity.roleTitle,
            company: question.opportunity.company
          })),
        (question) => `${question.opportunityId} ${question.question}`
      ),
      recentlyUpdatedOpportunities: recentlyUpdatedOpportunities.map(toOpportunityDTO)
    },
    recentAgentRuns: recentAgentRuns.map(toAgentRunDTO),
    recentOpportunities: recentOpportunities.map(toOpportunityDTO),
    recentConversations: recentConversations.map((thread) => ({
      ...toChatThreadDTO(thread),
      pendingCount: recentConversationCounts[thread.id]?.totalCount ?? 0
    })),
    pendingReviewSummary
  };
}
