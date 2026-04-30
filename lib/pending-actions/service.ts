import type { ChatMessage } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { toMemorySuggestionDTO } from "@/lib/memory/serializers";
import { toOpenQuestionDTO, toRiskDTO } from "@/lib/opportunity/serializers";
import { parseJson } from "@/lib/utils/json";
import type { MemorySuggestionDTO, OpenQuestionDTO, RiskDTO } from "@/lib/types";

interface MessageMetadataRefs {
  createdObjects?: {
    memorySuggestions?: Array<{ id: string }>;
    risks?: Array<{ id: string }>;
    openQuestions?: Array<{ id: string }>;
  };
}

export interface PendingActionGroups {
  memoryUpdates: MemorySuggestionDTO[];
  risks: RiskDTO[];
  openQuestions: OpenQuestionDTO[];
  totalCount: number;
}

export interface PendingThreadCounts {
  memoryUpdatesCount: number;
  risksCount: number;
  openQuestionsCount: number;
  totalCount: number;
}

export interface PendingReviewSummary {
  pendingMemoryUpdatesCount: number;
  opportunityActionsCount: number;
  conversationsWithPendingCount: number;
  unlinkedPendingCount: number;
}

function emptyGroups(): PendingActionGroups {
  return { memoryUpdates: [], risks: [], openQuestions: [], totalCount: 0 };
}

function refsFromMessage(message: Pick<ChatMessage, "metadataJson">) {
  const metadata = parseJson<MessageMetadataRefs>(message.metadataJson ?? "{}", {});
  return {
    memorySuggestionIds: new Set(metadata.createdObjects?.memorySuggestions?.map((item) => item.id).filter(Boolean) ?? []),
    riskIds: new Set(metadata.createdObjects?.risks?.map((item) => item.id).filter(Boolean) ?? []),
    openQuestionIds: new Set(metadata.createdObjects?.openQuestions?.map((item) => item.id).filter(Boolean) ?? [])
  };
}

function mergeGroups(groups: PendingActionGroups[]): PendingActionGroups {
  const memorySeen = new Set<string>();
  const riskSeen = new Set<string>();
  const questionSeen = new Set<string>();
  const memoryUpdates = groups.flatMap((group) => group.memoryUpdates).filter((item) => {
    if (memorySeen.has(item.id)) return false;
    memorySeen.add(item.id);
    return true;
  });
  const risks = groups.flatMap((group) => group.risks).filter((item) => {
    if (riskSeen.has(item.id)) return false;
    riskSeen.add(item.id);
    return true;
  });
  const openQuestions = groups.flatMap((group) => group.openQuestions).filter((item) => {
    if (questionSeen.has(item.id)) return false;
    questionSeen.add(item.id);
    return true;
  });
  return {
    memoryUpdates,
    risks,
    openQuestions,
    totalCount: memoryUpdates.length + risks.length + openQuestions.length
  };
}

async function groupsFromRefs(refs: {
  memorySuggestionIds?: Set<string>;
  riskIds?: Set<string>;
  openQuestionIds?: Set<string>;
  agentRunIds?: Set<string>;
}): Promise<PendingActionGroups> {
  const memoryOr = [
    ...(refs.memorySuggestionIds?.size ? [{ id: { in: [...refs.memorySuggestionIds] } }] : []),
    ...(refs.agentRunIds?.size ? [{ agentRunId: { in: [...refs.agentRunIds] } }] : [])
  ];
  const [memoryUpdates, risks, openQuestions] = await Promise.all([
    memoryOr.length
      ? prisma.memorySuggestion.findMany({
          where: {
            status: "pending",
            OR: memoryOr
          }
        })
      : Promise.resolve([]),
    refs.riskIds?.size
      ? prisma.risk.findMany({ where: { id: { in: [...refs.riskIds] }, status: "active" } })
      : Promise.resolve([]),
    refs.openQuestionIds?.size
      ? prisma.openQuestion.findMany({ where: { id: { in: [...refs.openQuestionIds] }, status: { in: ["unasked", "asked"] } } })
      : Promise.resolve([])
  ]);

  return {
    memoryUpdates: memoryUpdates.map(toMemorySuggestionDTO),
    risks: risks.map(toRiskDTO),
    openQuestions: openQuestions.map(toOpenQuestionDTO),
    totalCount: memoryUpdates.length + risks.length + openQuestions.length
  };
}

export async function getPendingActionsForMessage(messageId: string): Promise<PendingActionGroups> {
  const message = await prisma.chatMessage.findUnique({ where: { id: messageId } });
  if (!message || message.role !== "assistant") return emptyGroups();
  const refs = refsFromMessage(message);
  const agentRunIds = new Set<string>();
  if (message.agentRunId) agentRunIds.add(message.agentRunId);
  return groupsFromRefs({ ...refs, agentRunIds });
}

export async function getPendingActionsForThread(threadId: string): Promise<PendingActionGroups> {
  const messages = await prisma.chatMessage.findMany({ where: { threadId, role: "assistant" } });
  const groups = await Promise.all(messages.map((message) => getPendingActionsForMessage(message.id)));
  return mergeGroups(groups);
}

export async function getPendingCountsByThread(threadIds: string[]): Promise<Record<string, PendingThreadCounts>> {
  const uniqueThreadIds = [...new Set(threadIds)];
  const entries = await Promise.all(
    uniqueThreadIds.map(async (threadId) => {
      const group = await getPendingActionsForThread(threadId);
      return [
        threadId,
        {
          memoryUpdatesCount: group.memoryUpdates.length,
          risksCount: group.risks.length,
          openQuestionsCount: group.openQuestions.length,
          totalCount: group.totalCount
        }
      ] as const;
    })
  );
  return Object.fromEntries(entries);
}

export async function getPendingReviewSummary(): Promise<PendingReviewSummary> {
  const [pendingMemoryUpdatesCount, activeRisksCount, openQuestionsCount, threads] = await Promise.all([
    prisma.memorySuggestion.count({ where: { status: "pending" } }),
    prisma.risk.count({ where: { status: "active" } }),
    prisma.openQuestion.count({ where: { status: { in: ["unasked", "asked"] } } }),
    prisma.chatThread.findMany({ where: { status: "active" }, select: { id: true } })
  ]);
  const counts = await getPendingCountsByThread(threads.map((thread) => thread.id));
  const linkedPending = Object.values(counts).reduce((sum, item) => sum + item.totalCount, 0);
  const totalPending = pendingMemoryUpdatesCount + activeRisksCount + openQuestionsCount;
  return {
    pendingMemoryUpdatesCount,
    opportunityActionsCount: activeRisksCount + openQuestionsCount,
    conversationsWithPendingCount: Object.values(counts).filter((item) => item.totalCount > 0).length,
    unlinkedPendingCount: Math.max(0, totalPending - linkedPending)
  };
}
