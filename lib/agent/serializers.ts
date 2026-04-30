import type { AgentRun, AgentStep, ChatMessage, ChatThread } from "@prisma/client";
import type { AgentRunDTO, AgentStepDTO } from "@/lib/types";
import { toMemorySuggestionDTO } from "@/lib/memory/serializers";
import { parseJson } from "@/lib/utils/json";

type AgentRunWithRelations = AgentRun & {
  steps?: AgentStep[];
  suggestions?: Parameters<typeof toMemorySuggestionDTO>[0][];
  chatThread?: ChatThread | null;
  sourceMessage?: ChatMessage | null;
};

export function toAgentStepDTO(step: AgentStep): AgentStepDTO {
  return {
    id: step.id,
    agentRunId: step.agentRunId,
    stepName: step.stepName,
    inputSummary: step.inputSummary,
    output: parseJson<unknown>(step.outputJson, {}),
    status: step.status,
    errorMessage: step.errorMessage,
    createdAt: step.createdAt.toISOString()
  };
}

export function toAgentRunDTO(run: AgentRunWithRelations): AgentRunDTO {
  return {
    id: run.id,
    workflowType: run.workflowType,
    input: parseJson<unknown>(run.inputJson, {}),
    triggerType: run.triggerType,
    detectedIntent: run.detectedIntent,
    actionPlan: parseJson<unknown[]>(run.actionPlanJson, []),
    sourceMessageText: run.sourceMessageText,
    chatThreadId: run.chatThreadId,
    sourceMessageId: run.sourceMessageId,
    chatThreadTitle: run.chatThread?.title ?? null,
    sourceMessageContent: run.sourceMessage?.content ?? null,
    status: run.status,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    steps: run.steps?.map(toAgentStepDTO),
    suggestions: run.suggestions?.map(toMemorySuggestionDTO)
  };
}
