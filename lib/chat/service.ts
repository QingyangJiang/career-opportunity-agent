import { prisma } from "@/lib/db/prisma";
import { CareerAgentRouter } from "@/lib/agent/router/CareerAgentRouter";
import { toChatMessageDTO, toChatThreadDTO } from "@/lib/chat/serializers";
import { toMemoryDTO } from "@/lib/memory/serializers";
import {
  toDecisionDTO,
  toOpportunityDTO,
  toRiskDTO
} from "@/lib/opportunity/serializers";
import { toEvidenceDTO } from "@/lib/evidence/serializers";
import { stringifyJson } from "@/lib/utils/json";
import { normalizeText } from "@/lib/utils/normalize";
import { getPendingCountsByThread } from "@/lib/pending-actions/service";
import { getThreadModelConfig, threadModelData } from "@/lib/chat/model-config";
import {
  isDeepSeekConfigured,
  normalizeProviderConfig,
  providerMetadata,
  withProviderConfig,
  type LLMProviderConfig
} from "@/lib/llm/config";
import type { CareerAgentMode, ConversationContext, RouterExecutionResult } from "@/lib/agent/router/types";
import type { CareerAgentCitation } from "@/lib/career-agent/ask";
import type { ChatMessageDTO, ChatThreadDTO } from "@/lib/types";

const CONTEXT_SIGNALS = [
  "agent",
  "后训练",
  "rl",
  "grpo",
  "ppo",
  "rlhf",
  "rlvr",
  "reward",
  "verifier",
  "judge",
  "评测",
  "闭环",
  "面试",
  "交叉面",
  "淘天",
  "同花顺",
  "豆包",
  "字节"
];

export interface ChatContextRef {
  entityType: "memory" | "opportunity" | "evidence" | "risk" | "decision" | "agent_run" | "chat_message";
  entityId: string;
  title: string;
  summary?: string;
}

export interface ChatSendResult {
  thread: ChatThreadDTO;
  userMessage: ChatMessageDTO;
  assistantMessage: ChatMessageDTO;
  result: RouterExecutionResult;
}

export interface ChatSendOptions {
  triggerType?: "chat" | "home_quick_start" | "manual" | string;
  providerConfig?: LLMProviderConfig;
}

function scoreText(text: string, query: string) {
  const normalizedText = normalizeText(text);
  const normalizedQuery = normalizeText(query);
  const directHit = normalizedText.includes(normalizedQuery) ? 8 : 0;
  return CONTEXT_SIGNALS.reduce((sum, signal) => {
    const normalizedSignal = normalizeText(signal);
    return sum + (normalizedQuery.includes(normalizedSignal) && normalizedText.includes(normalizedSignal) ? 2 : 0);
  }, directHit);
}

function compactTitle(input: string) {
  const clean = input.replace(/\s+/g, " ").trim();
  if (!clean) return "New Career Chat";
  return clean.length > 36 ? `${clean.slice(0, 36)}...` : clean;
}

function isUntitled(title: string) {
  return title === "New Career Chat" || title === "新的职业对话";
}

async function retrieveRelevantContext(input: string): Promise<ChatContextRef[]> {
  const [memoriesRaw, opportunitiesRaw, evidenceRaw, risksRaw, decisionsRaw] = await Promise.all([
    prisma.memory.findMany({ where: { status: "active" }, orderBy: { updatedAt: "desc" }, take: 30 }),
    prisma.opportunity.findMany({ orderBy: { updatedAt: "desc" }, take: 30 }),
    prisma.evidence.findMany({ orderBy: { updatedAt: "desc" }, take: 20 }),
    prisma.risk.findMany({ where: { status: "active" }, orderBy: { updatedAt: "desc" }, take: 20 }),
    prisma.decision.findMany({ orderBy: { updatedAt: "desc" }, take: 20 })
  ]);

  const memoryRefs = memoriesRaw
    .map(toMemoryDTO)
    .map((memory) => ({
      ref: {
        entityType: "memory" as const,
        entityId: memory.id,
        title: memory.title,
        summary: memory.content.slice(0, 160)
      },
      score: scoreText([memory.type, memory.title, memory.content, memory.tags.join(" ")].join(" "), input)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item) => item.ref);

  const opportunityRefs = opportunitiesRaw
    .map(toOpportunityDTO)
    .map((opportunity) => ({
      ref: {
        entityType: "opportunity" as const,
        entityId: opportunity.id,
        title: `${opportunity.company} · ${opportunity.roleTitle}`,
        summary: [opportunity.directionTags.join(", "), opportunity.rawSummary].filter(Boolean).join(" · ").slice(0, 180)
      },
      score: scoreText(
        [
          opportunity.company,
          opportunity.roleTitle,
          opportunity.directionTags.join(" "),
          opportunity.requirements.join(" "),
          opportunity.rawSummary ?? ""
        ].join(" "),
        input
      )
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item) => item.ref);

  const evidenceRefs = evidenceRaw
    .map(toEvidenceDTO)
    .map((evidence) => ({
      ref: {
        entityType: "evidence" as const,
        entityId: evidence.id,
        title: evidence.title,
        summary: evidence.content.slice(0, 180)
      },
      score: scoreText([evidence.type, evidence.title, evidence.content].join(" "), input)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.ref);

  const riskRefs = risksRaw
    .map(toRiskDTO)
    .map((risk) => ({
      ref: {
        entityType: "risk" as const,
        entityId: risk.id,
        title: risk.title,
        summary: risk.description.slice(0, 180)
      },
      score: scoreText([risk.title, risk.description, risk.severity, risk.likelihood].join(" "), input)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.ref);

  const decisionRefs = decisionsRaw
    .map(toDecisionDTO)
    .map((decision) => ({
      ref: {
        entityType: "decision" as const,
        entityId: decision.id,
        title: decision.decision,
        summary: decision.rationale.slice(0, 180)
      },
      score: scoreText([decision.decision, decision.confidence, decision.rationale].join(" "), input)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.ref);

  return [...memoryRefs, ...opportunityRefs, ...evidenceRefs, ...riskRefs, ...decisionRefs];
}

async function saveContextAttachments(threadId: string, refs: ChatContextRef[]) {
  const attachable = refs.filter((ref) =>
    ["memory", "opportunity", "evidence", "agent_run"].includes(ref.entityType)
  );
  for (const ref of attachable) {
    await prisma.chatContextAttachment.upsert({
      where: {
        threadId_entityType_entityId: {
          threadId,
          entityType: ref.entityType,
          entityId: ref.entityId
        }
      },
      create: {
        threadId,
        entityType: ref.entityType,
        entityId: ref.entityId
      },
      update: {}
    });
  }
}

function citationRefs(citations: CareerAgentCitation[]): ChatContextRef[] {
  return citations.map((citation) => ({
    entityType: citation.kind,
    entityId: citation.id,
    title: citation.title,
    summary: citation.summary
  }));
}

function providerRuntimeFromSteps(steps: ChatSendResult["result"]["agentRun"]["steps"] | undefined) {
  const runtime = steps
    ?.map((step) => {
      const output = step.output as { providerRuntime?: Record<string, unknown> } | null;
      return output?.providerRuntime;
    })
    .filter(Boolean)
    .at(-1);
  if (!runtime) return {};
  return {
    latencyMs: typeof runtime.apiLatencyMs === "number" ? runtime.apiLatencyMs : undefined,
    tokenUsage: runtime.tokenUsage,
    hasReasoningContent: Boolean(runtime.reasoningContentPresent),
    error: typeof runtime.error === "string" ? runtime.error : undefined
  };
}

const COMPANY_CONTEXT_SIGNALS = ["字节", "豆包", "淘天", "蚂蚁", "同花顺", "快手", "美团", "腾讯", "百度", "小红书", "MiniMax", "月之暗面", "智谱", "阶跃星辰", "商汤"];
const ROLE_CONTEXT_SIGNALS = ["Agent", "后训练", "RL", "GRPO", "PPO", "RLHF", "Reward Model", "Verifier", "评测", "数据闭环", "教育", "K12", "交叉面"];

function uniqueSignals(text: string, signals: string[]) {
  const lower = text.toLowerCase();
  return signals.filter((signal, index) => signals.indexOf(signal) === index && lower.includes(signal.toLowerCase()));
}

function summarizeText(text = "", max = 180) {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

function parseAssistantMetadata(message: { metadataJson: string | null }) {
  try {
    return message.metadataJson ? JSON.parse(message.metadataJson) as Record<string, any> : {};
  } catch {
    return {};
  }
}

function buildConversationContext(
  thread: { summary?: string | null },
  recentMessages: Array<{ id: string; role: string; content: string; metadataJson: string | null; createdAt: Date }>,
  currentUserMessageId: string,
  contextRefs: ChatContextRef[]
): ConversationContext {
  const previousMessages = recentMessages.filter((message) => message.id !== currentUserMessageId);
  const lastAssistant = [...previousMessages].reverse().find((message) => message.role === "assistant");
  const lastUser = [...previousMessages].reverse().find((message) => message.role === "user");
  const lastAssistantMetadata = lastAssistant ? parseAssistantMetadata(lastAssistant) : {};
  const combinedText = previousMessages.map((message) => message.content).join("\n");
  const referencedCompanies = uniqueSignals(combinedText, COMPANY_CONTEXT_SIGNALS);
  const mentionedDirections = uniqueSignals(combinedText, ROLE_CONTEXT_SIGNALS);
  const referencedOpportunities = contextRefs.filter((ref) => ref.entityType === "opportunity").map((ref) => ref.title);
  const topicSummary =
    thread.summary ||
    lastAssistantMetadata.threadTopicSummary ||
    (referencedCompanies.length || mentionedDirections.length
      ? `用户正在讨论${[...referencedCompanies.slice(0, 4), ...mentionedDirections.slice(0, 4)].join("、")}相关的职业选择`
      : lastUser?.content
        ? `用户正在讨论：${summarizeText(lastUser.content, 80)}`
        : undefined);

  return {
    recentMessages: recentMessages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content.slice(0, 1000),
      createdAt: message.createdAt.toISOString()
    })),
    lastUserMessage: lastUser?.content,
    lastAssistantMessage: lastAssistant?.content,
    lastAssistantAnswerSummary: summarizeText(lastAssistant?.content, 220),
    threadTopicSummary: topicSummary,
    lastDiscussedEntities: [...referencedCompanies.slice(0, 6), ...mentionedDirections.slice(0, 6)],
    activeTaskIntent: typeof lastAssistantMetadata.classification?.intent === "string" ? lastAssistantMetadata.classification.intent : undefined,
    referencedOpportunities,
    referencedCompanies,
    referencedRoles: mentionedDirections,
    mentionedDirections
  };
}

function nextThreadSummary(previousSummary: string | null | undefined, input: string, answer: string, classification: { intent?: string; followUpType?: string }, context: ConversationContext) {
  const companies = uniqueSignals(`${input}\n${answer}\n${context.referencedCompanies?.join(" ") ?? ""}`, COMPANY_CONTEXT_SIGNALS);
  const directions = uniqueSignals(`${input}\n${answer}\n${context.mentionedDirections?.join(" ") ?? ""}`, ROLE_CONTEXT_SIGNALS);
  if (companies.length || directions.length) {
    return `用户正在讨论${[...companies.slice(0, 4), ...directions.slice(0, 4)].join("、")}相关的职业选择`;
  }
  if (classification.intent === "follow_up" && previousSummary) return previousSummary;
  return previousSummary || summarizeText(input, 120);
}

export async function listChatThreads(includeArchived = false, status?: "active" | "archived"): Promise<ChatThreadDTO[]> {
  const threads = await prisma.chatThread.findMany({
    where: status ? { status } : includeArchived ? undefined : { status: "active" },
    orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
    take: 50
  });
  const counts = await getPendingCountsByThread(threads.map((thread) => thread.id));
  return threads.map((thread) => ({
    ...toChatThreadDTO(thread),
    pendingCount: counts[thread.id]?.totalCount ?? 0
  }));
}

export async function getChatThread(threadId: string): Promise<ChatThreadDTO | null> {
  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      attachments: { orderBy: { createdAt: "desc" } }
    }
  });
  if (!thread) return null;
  const counts = await getPendingCountsByThread([thread.id]);
  return { ...toChatThreadDTO(thread), pendingCount: counts[thread.id]?.totalCount ?? 0 };
}

export async function createChatThread(title = "New Career Chat", modelConfig?: LLMProviderConfig): Promise<ChatThreadDTO> {
  const thread = await prisma.chatThread.create({
    data: {
      title,
      status: "active",
      ...threadModelData(modelConfig)
    }
  });
  return toChatThreadDTO(thread);
}

export async function updateChatThreadModelConfig(threadId: string, config: LLMProviderConfig) {
  const thread = await prisma.chatThread.update({
    where: { id: threadId },
    data: threadModelData(config)
  });
  return toChatThreadDTO(thread);
}

export async function updateChatThreadStatus(threadId: string, status: "active" | "archived") {
  const thread = await prisma.chatThread.update({
    where: { id: threadId },
    data: { status }
  });
  return toChatThreadDTO(thread);
}

export async function deleteChatThread(threadId: string) {
  await prisma.chatThread.delete({ where: { id: threadId } });
}

export async function sendMessage(
  threadId: string | null | undefined,
  userInput: string,
  mode: CareerAgentMode = "auto",
  options: ChatSendOptions = {}
): Promise<ChatSendResult> {
  const cleanInput = userInput.trim();
  if (!cleanInput) {
    throw new Error("input is required");
  }

  const requestedProvider = options.providerConfig ? normalizeProviderConfig(options.providerConfig) : null;
  const thread =
    threadId && threadId !== "new"
      ? await prisma.chatThread.findUniqueOrThrow({ where: { id: threadId } })
      : await prisma.chatThread.create({
          data: {
            title: compactTitle(cleanInput),
            status: "active",
            ...threadModelData(requestedProvider)
          }
        });
  const selectedProvider = requestedProvider ?? getThreadModelConfig(thread);

  const userMessage = await prisma.chatMessage.create({
    data: {
      threadId: thread.id,
      role: "user",
      content: cleanInput,
      metadataJson: stringifyJson({ mode })
    }
  });

  if (selectedProvider.provider === "deepseek" && !isDeepSeekConfigured()) {
    const failedRun = await prisma.agentRun.create({
      data: {
        workflowType: "Unified Career Agent",
        inputJson: stringifyJson({
          input: cleanInput,
          mode,
          provider: providerMetadata(selectedProvider),
          error: "DeepSeek API key is not configured."
        }),
        triggerType: options.triggerType ?? "chat",
        detectedIntent: "provider_error",
        actionPlanJson: stringifyJson([]),
        sourceMessageText: cleanInput,
        chatThreadId: thread.id,
        sourceMessageId: userMessage.id,
        status: "failed"
      }
    });
    await prisma.agentStep.create({
      data: {
        agentRunId: failedRun.id,
        stepName: "provider_configuration",
        inputSummary: selectedProvider.model ?? "deepseek",
        outputJson: stringifyJson(providerMetadata(selectedProvider)),
        status: "failed",
        errorMessage: "DeepSeek API key is not configured. Please set DEEPSEEK_API_KEY."
      }
    });
    const failedRunWithSteps = await prisma.agentRun.findUnique({
      where: { id: failedRun.id },
      include: { steps: { orderBy: { createdAt: "asc" } } }
    });
    const assistantMessage = await prisma.chatMessage.create({
      data: {
        threadId: thread.id,
        role: "assistant",
        content: "DeepSeek API key is not configured. Please set DEEPSEEK_API_KEY.",
        agentRunId: failedRun.id,
        metadataJson: stringifyJson({
          classification: { intent: "provider_error", confidence: 1, reason: "Missing DeepSeek API key." },
          provider: providerMetadata(selectedProvider),
          createdObjects: { risksCount: 0, openQuestionsCount: 0, memorySuggestionsCount: 0 },
          pendingActions: [],
          citations: [],
          agentSteps: failedRunWithSteps?.steps.map((step) => ({
            id: step.id,
            agentRunId: step.agentRunId,
            stepName: step.stepName,
            inputSummary: step.inputSummary,
            output: {},
            status: step.status,
            errorMessage: step.errorMessage,
            createdAt: step.createdAt.toISOString()
          })),
          error: "DeepSeek API key is not configured. Please set DEEPSEEK_API_KEY."
        })
      }
    });
    const updatedThread = await prisma.chatThread.update({
      where: { id: thread.id },
      data: {
        title: isUntitled(thread.title) ? compactTitle(cleanInput) : thread.title,
        status: "active",
        lastMessageAt: assistantMessage.createdAt
      },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        attachments: { orderBy: { createdAt: "desc" } }
      }
    });
    return {
      thread: { ...toChatThreadDTO(updatedThread), pendingCount: 0 },
      userMessage: toChatMessageDTO(userMessage),
      assistantMessage: toChatMessageDTO(assistantMessage),
      result: {
        classification: {
          intent: "clarify",
          actionLevel: "answer_with_info_gaps",
          evidenceSufficiency: "none",
          memorySignalStrength: "none",
          missingFields: ["DEEPSEEK_API_KEY"],
          evidenceType: "none",
          shouldCreateEvidence: false,
          shouldExtractOpportunity: false,
          shouldGenerateAssessment: false,
          shouldGenerateRisks: false,
          shouldGenerateOpenQuestions: false,
          shouldGenerateDecision: false,
          shouldCreateObjects: false,
          shouldSuggestMemoryUpdates: false,
          shouldSuggestMemory: false,
          shouldShowStructuredCard: false,
          shouldShowInfoGaps: true,
          confidence: 1,
          needsConfirmation: false,
          reason: "Missing DeepSeek API key.",
          skippedReason: "provider configuration missing"
        },
        actionPlan: [],
        executedActions: [{ action: "classify_input", status: "failed", summary: "Missing DeepSeek API key." }],
        answer: "DeepSeek API key is not configured. Please set DEEPSEEK_API_KEY.",
        answerSections: {
          conclusion: "DeepSeek API key is not configured.",
          evidence: [],
          risks: [],
          nextActions: ["Set DEEPSEEK_API_KEY and retry.", "Switch back to MockLLMProvider for local testing."],
          citationSummary: []
        },
        createdObjects: { risksCount: 0, openQuestionsCount: 0, memorySuggestionsCount: 0 },
        pendingActions: [],
        links: { agentRun: `/agent-runs?run=${failedRun.id}` },
        citations: [],
        agentRun: {
          id: failedRun.id,
          workflowType: failedRun.workflowType,
          input: {},
          triggerType: failedRun.triggerType,
          detectedIntent: failedRun.detectedIntent,
          actionPlan: [],
          sourceMessageText: failedRun.sourceMessageText,
          chatThreadId: failedRun.chatThreadId,
          sourceMessageId: failedRun.sourceMessageId,
          status: failedRun.status,
          createdAt: failedRun.createdAt.toISOString(),
          updatedAt: failedRun.updatedAt.toISOString()
        }
      }
    };
  }

  const recentMessages = (
    await prisma.chatMessage.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: "desc" },
      take: 10
    })
  ).reverse();
  const recentMessageIds = recentMessages.map((message) => message.id);
  const recentThreadMessageRefs: ChatContextRef[] = recentMessages
    .filter((message) => message.id !== userMessage.id)
    .map((message) => ({
      entityType: "chat_message",
      entityId: message.id,
      title: `${message.role} message`,
      summary: message.content.slice(0, 220)
    }));
  const contextRefs = await retrieveRelevantContext(cleanInput);
  await saveContextAttachments(thread.id, contextRefs);
  const conversationContext = buildConversationContext(thread, recentMessages, userMessage.id, contextRefs);

  const router = new CareerAgentRouter();
  const preflightClassification = router.classifyInput(cleanInput, mode, conversationContext);
  const preflightActionPlan = router.planActions(preflightClassification);
  let result: RouterExecutionResult;
  try {
    result = await withProviderConfig(selectedProvider, () =>
      router.execute(cleanInput, mode, {
        chatThreadId: thread.id,
        sourceMessageId: userMessage.id,
        triggerType: options.triggerType ?? "chat",
        providerConfig: selectedProvider,
        recentMessageIds,
        recentMessages: recentMessages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content.slice(0, 1000),
          createdAt: message.createdAt.toISOString()
        })),
        conversationContext,
        contextRefs
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Career Agent run failed.";
    const failedRun = await prisma.agentRun.findFirst({
      where: { sourceMessageId: userMessage.id },
      orderBy: { createdAt: "desc" },
      include: { steps: { orderBy: { createdAt: "asc" } } }
    });
    if (failedRun) {
      await prisma.agentStep.create({
        data: {
          agentRunId: failedRun.id,
          stepName: "run_failed",
          inputSummary: "Career Agent run failed",
          outputJson: stringifyJson({ message }),
          status: "failed",
          errorMessage: message
        }
      });
    }
    const failedRunWithSteps = failedRun
      ? await prisma.agentRun.findUnique({ where: { id: failedRun.id }, include: { steps: { orderBy: { createdAt: "asc" } } } })
      : null;
    const assistantMessage = await prisma.chatMessage.create({
      data: {
        threadId: thread.id,
        role: "assistant",
        content: message.includes("invalid structured output")
          ? "DeepSeek returned invalid structured output. No objects were created."
          : message,
        agentRunId: failedRun?.id,
        metadataJson: stringifyJson({
          classification: { intent: "provider_error", confidence: 1, reason: message },
          provider: providerMetadata(selectedProvider),
          createdObjects: { risksCount: 0, openQuestionsCount: 0, memorySuggestionsCount: 0 },
          pendingActions: [],
          citations: [],
          agentSteps: failedRunWithSteps?.steps.map((step) => ({
            id: step.id,
            agentRunId: step.agentRunId,
            stepName: step.stepName,
            inputSummary: step.inputSummary,
            output: {},
            status: step.status,
            errorMessage: step.errorMessage,
            createdAt: step.createdAt.toISOString()
          })),
          error: message
        })
      }
    });
    const updatedThread = await prisma.chatThread.update({
      where: { id: thread.id },
      data: {
        title: isUntitled(thread.title) ? compactTitle(cleanInput) : thread.title,
        status: "active",
        lastMessageAt: assistantMessage.createdAt
      },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        attachments: { orderBy: { createdAt: "desc" } }
      }
    });
    return {
      thread: { ...toChatThreadDTO(updatedThread), pendingCount: 0 },
      userMessage: toChatMessageDTO(userMessage),
      assistantMessage: toChatMessageDTO(assistantMessage),
      result: {
        classification: { ...preflightClassification, intent: "clarify", reason: message },
        actionPlan: [],
        executedActions: [{ action: "classify_input", status: "failed", summary: message }],
        answer: assistantMessage.content,
        answerSections: {
          conclusion: assistantMessage.content,
          evidence: [],
          risks: [],
          nextActions: ["Retry the request.", "Switch to MockLLMProvider for local validation."],
          citationSummary: []
        },
        createdObjects: { risksCount: 0, openQuestionsCount: 0, memorySuggestionsCount: 0 },
        pendingActions: [],
        links: failedRun ? { agentRun: `/agent-runs?run=${failedRun.id}` } : {},
        citations: [],
        agentRun: {
          id: failedRun?.id ?? "failed",
          workflowType: failedRun?.workflowType ?? "Unified Career Agent",
          input: {},
          triggerType: failedRun?.triggerType,
          detectedIntent: failedRun?.detectedIntent,
          actionPlan: [],
          sourceMessageText: failedRun?.sourceMessageText ?? cleanInput,
          chatThreadId: thread.id,
          sourceMessageId: userMessage.id,
          status: "failed",
          createdAt: (failedRun?.createdAt ?? assistantMessage.createdAt).toISOString(),
          updatedAt: (failedRun?.updatedAt ?? assistantMessage.createdAt).toISOString()
        }
      }
    };
  }

  const resultRefs = [
    ...recentThreadMessageRefs,
    ...contextRefs,
    ...citationRefs(result.citations),
    {
      entityType: "agent_run" as const,
      entityId: result.agentRun.id,
      title: result.agentRun.workflowType,
      summary: result.classification.intent
    }
  ];
  await saveContextAttachments(thread.id, resultRefs);

  const assistantMetadata = {
    classification: result.classification,
    actionLevel: result.classification.actionLevel,
    evidenceSufficiency: result.classification.evidenceSufficiency,
    memorySignalStrength: result.classification.memorySignalStrength,
    missingFields: result.classification.missingFields,
    shouldShowInfoGaps: result.classification.shouldShowInfoGaps,
    shouldShowStructuredCard: result.classification.shouldShowStructuredCard,
    preRouterHints: result.classification.preRouterHints,
    policyGuardCorrections: result.classification.policyGuardCorrections,
    answerPlan: result.classification.answerPlan,
    artifactActions: result.classification.artifactActions,
    commitPolicy: result.classification.commitPolicy,
    skippedReason: result.classification.skippedReason,
    structuredCards: result.classification.shouldShowStructuredCard
      ? [
          {
            type:
              result.classification.intent === "compare_opportunities"
                ? "opportunity_comparison"
                : result.classification.intent === "prepare_interview" || result.classification.intent === "interview_review"
                  ? "interview_prep"
                  : "job_analysis",
            title:
              result.classification.intent === "compare_opportunities"
                ? "Opportunity Comparison"
                : result.classification.intent === "prepare_interview" || result.classification.intent === "interview_review"
                  ? "Interview Prep"
                  : "Job Analysis",
            evidenceSufficiency: result.classification.evidenceSufficiency,
            items: result.answerSections.nextActions.slice(0, 5)
          }
        ]
      : [],
    actionPlan: result.actionPlan,
    executedActions: result.executedActions,
    createdObjects: {
      ...result.createdObjects,
      memorySuggestions: result.createdObjects.memorySuggestions?.map((item) => ({
        ...item,
        sourceThreadId: thread.id,
        sourceMessageId: userMessage.id,
        sourceAgentRunId: result.agentRun.id
      })),
      risks: result.createdObjects.risks?.map((item) => ({
        ...item,
        sourceThreadId: thread.id,
        sourceMessageId: userMessage.id,
        sourceAgentRunId: result.agentRun.id
      })),
      openQuestions: result.createdObjects.openQuestions?.map((item) => ({
        ...item,
        sourceThreadId: thread.id,
        sourceMessageId: userMessage.id,
        sourceAgentRunId: result.agentRun.id
      }))
    },
    pendingActions: result.pendingActions,
    links: result.links,
    citations: result.citations,
    contextRefs: resultRefs,
    provider: { ...providerMetadata(selectedProvider), ...providerRuntimeFromSteps(result.agentRun.steps) },
    agentSteps: result.agentRun.steps ?? [],
    conversationContext: {
      usedRecentMessagesCount: result.classification.usedRecentMessagesCount ?? conversationContext.recentMessages.length,
      usedLastAssistantAnswer: result.classification.usedLastAssistantAnswer ?? Boolean(conversationContext.lastAssistantMessage),
      threadTopicSummary: result.classification.threadTopicSummary ?? conversationContext.threadTopicSummary,
      lastAssistantAnswerSummary: conversationContext.lastAssistantAnswerSummary,
      resolvedReference: result.classification.resolvedReference,
      followUpType: result.classification.followUpType,
      referencedCompanies: conversationContext.referencedCompanies,
      referencedRoles: conversationContext.referencedRoles
    },
    recentMessageIds,
    recentMessages: recentMessages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content.slice(0, 300),
      createdAt: message.createdAt.toISOString()
    })),
    preflight: {
      classification: preflightClassification,
      actionPlan: preflightActionPlan
    }
  };

  const assistantMessage = await prisma.chatMessage.create({
    data: {
      threadId: thread.id,
      role: "assistant",
      content: result.answer,
      agentRunId: result.agentRun.id,
      metadataJson: stringifyJson(assistantMetadata)
    }
  });

  const updatedThread = await prisma.chatThread.update({
    where: { id: thread.id },
    data: {
      title: isUntitled(thread.title) ? compactTitle(cleanInput) : thread.title,
      summary: nextThreadSummary(thread.summary, cleanInput, result.answer, result.classification, conversationContext),
      status: "active",
      lastMessageAt: assistantMessage.createdAt
    },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      attachments: { orderBy: { createdAt: "desc" } }
    }
  });
  const pendingCounts = await getPendingCountsByThread([thread.id]);

  return {
    thread: { ...toChatThreadDTO(updatedThread), pendingCount: pendingCounts[thread.id]?.totalCount ?? 0 },
    userMessage: toChatMessageDTO(userMessage),
    assistantMessage: toChatMessageDTO(assistantMessage),
    result
  };
}
