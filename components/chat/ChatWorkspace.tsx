"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bot,
  BrainCircuit,
  Check,
  ChevronDown,
  Circle,
  CircleAlert,
  MessageSquarePlus,
  Loader2,
  Plus,
  Send,
  User
} from "lucide-react";
import type { CareerAgentCitation, CitationKind } from "@/lib/career-agent/ask";
import type { CareerAgentMode, ExecutedAction, RouterCreatedObjects, RouterLinks } from "@/lib/agent/router/types";
import type { LLMProviderConfig } from "@/lib/llm/config";
import type { AgentStepDTO, ChatMessageDTO, ChatThreadDTO, MemorySuggestionDTO, OpenQuestionDTO, RiskDTO } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";

const modeLabels: Array<{ value: CareerAgentMode; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "ask_only", label: "Ask only" },
  { value: "analyze_as_evidence", label: "Analyze as evidence" }
];

const emptyChatStarters = [
  { label: "Analyze a JD", prompt: "帮我分析这段 JD 是否适合我：" },
  { label: "Compare two opportunities", prompt: "同花顺和淘天哪个更适合我？" },
  { label: "Update career memory", prompt: "我以后想优先看 Agentic RL 岗位，帮我生成记忆建议。" },
  { label: "Prepare an interview", prompt: "帮我准备淘天交叉面。" }
];

const providerOptions: Array<{
  label: string;
  description: string;
  config: LLMProviderConfig;
  deprecated?: boolean;
}> = [
  { label: "MockLLMProvider", description: "Stable local mock", config: { provider: "mock", model: "MockLLMProvider", providerLabel: "MockLLMProvider", thinking: "disabled", reasoningEffort: "none" } },
  {
    label: "DeepSeek Flash",
    description: "deepseek-v4-flash · thinking disabled",
    config: { provider: "deepseek", model: "deepseek-v4-flash", providerLabel: "DeepSeek Flash", thinking: "disabled", reasoningEffort: "none" }
  },
  {
    label: "DeepSeek Pro",
    description: "deepseek-v4-pro · high reasoning",
    config: { provider: "deepseek", model: "deepseek-v4-pro", providerLabel: "DeepSeek Pro", thinking: "enabled", reasoningEffort: "high" }
  },
  {
    label: "DeepSeek Pro Max Thinking",
    description: "deepseek-v4-pro · max reasoning",
    config: { provider: "deepseek", model: "deepseek-v4-pro", providerLabel: "DeepSeek Pro Max Thinking", thinking: "enabled", reasoningEffort: "max" }
  }
];

const citationGroups: Array<{ kind: CitationKind; label: string }> = [
  { kind: "memory", label: "Memory" },
  { kind: "opportunity", label: "Opportunity" },
  { kind: "evidence", label: "Evidence" },
  { kind: "risk", label: "Risk" },
  { kind: "decision", label: "Decision" }
];

interface AssistantMetadata {
  classification?: {
    intent: string;
    confidence: number;
    reason?: string;
    followUpType?: string;
    usedRecentMessagesCount?: number;
    usedLastAssistantAnswer?: boolean;
    threadTopicSummary?: string;
    resolvedReference?: string;
    shouldSuggestMemory?: boolean;
    shouldShowInfoGaps?: boolean;
    shouldCreateObjects?: boolean;
  };
  actionPlan?: string[];
  executedActions?: ExecutedAction[];
  createdObjects?: RouterCreatedObjects;
  pendingActions?: string[];
  links?: RouterLinks;
  citations?: CareerAgentCitation[];
  contextRefs?: Array<{ entityType: string; entityId: string; title: string; summary?: string }>;
  provider?: {
    provider?: string;
    model?: string;
    providerLabel?: string | null;
    thinking?: string | null;
    reasoningEffort?: string | null;
    latencyMs?: number;
    tokenUsage?: unknown;
    hasReasoningContent?: boolean;
    error?: string;
  };
  agentSteps?: AgentStepDTO[];
  conversationContext?: {
    usedRecentMessagesCount?: number;
    usedLastAssistantAnswer?: boolean;
    threadTopicSummary?: string;
    lastAssistantAnswerSummary?: string;
    resolvedReference?: string;
    followUpType?: string;
    referencedCompanies?: string[];
    referencedRoles?: string[];
  };
  actionLevel?: string;
  evidenceSufficiency?: string;
  memorySignalStrength?: string;
  missingFields?: string[];
  shouldShowInfoGaps?: boolean;
  shouldShowStructuredCard?: boolean;
  skippedReason?: string;
  preRouterHints?: {
    hasExplicitMemorySignal?: boolean;
    hasFollowUpSignal?: boolean;
    hasEvidenceLikeText?: boolean;
    hasStrongJDSignal?: boolean;
    hasInterviewSignal?: boolean;
  };
  policyGuardCorrections?: string[];
  answerPlan?: {
    currentInputType?: string;
    conversationIntent?: string;
    responseMode?: string;
    shouldAnswerFirst?: boolean;
    groundingTarget?: string;
    usedLongTermMemory?: boolean;
    memoryUsedFor?: string;
    blockedArtifacts?: string[];
    groundingCheck?: string;
  };
  artifactActions?: Array<{
    type: string;
    confidence: number;
    reason: string;
    requiresUserConfirmation: boolean;
    writePolicy: string;
  }>;
  commitPolicy?: {
    memory?: string;
    evidence?: string;
    opportunity?: string;
    decision?: string;
    riskOpenQuestionLimit?: number;
  };
  structuredCards?: Array<{
    type: "job_analysis" | "opportunity_comparison" | "interview_prep" | string;
    title: string;
    evidenceSufficiency?: string;
    items?: string[];
  }>;
  error?: string;
}

interface SendResponse {
  thread: ChatThreadDTO;
  userMessage: ChatMessageDTO;
  assistantMessage: ChatMessageDTO;
}

interface PendingActionGroups {
  memoryUpdates: MemorySuggestionDTO[];
  risks: RiskDTO[];
  openQuestions: OpenQuestionDTO[];
  totalCount: number;
}

type StepStatus = "pending" | "running" | "completed" | "failed";

interface WorkingStep {
  key: string;
  label: string;
  status: StepStatus;
  summary?: string;
}

function assistantMetadata(message: ChatMessageDTO): AssistantMetadata {
  return (message.metadata ?? {}) as AssistantMetadata;
}

function intentTone(intent?: string) {
  if (intent === "clarify" || intent === "invalid_input" || intent === "needs_external_source") return "amber";
  if (intent === "update_memory") return "blue";
  return "green";
}

function intentLabel(intent?: string) {
  const labels: Record<string, string> = {
    analyze_evidence: "Analyze evidence",
    ask_question: "Ask question",
    update_memory: "Update memory",
    follow_up: "Follow-up",
    prepare_interview: "Prepare interview",
    compare_opportunities: "Compare opportunities",
    interview_review: "Interview review",
    rewrite_resume_project: "Project rewrite",
    needs_external_source: "Needs external source",
    invalid_input: "Invalid input",
    clarify: "Clarify"
  };
  return intent ? labels[intent] ?? intent : "Unknown";
}

function createdObjectsSummary(objects?: RouterCreatedObjects) {
  if (!objects) return [];
  return [
    ["Evidence", objects.evidence ? 1 : 0],
    ["Opportunity", objects.opportunity ? 1 : 0],
    ["Assessment", objects.assessment ? 1 : 0],
    ["Risks", objects.risksCount],
    ["OpenQuestions", objects.openQuestionsCount],
    ["Decision", objects.decision ? 1 : 0],
    ["MemorySuggestions", objects.memorySuggestionsCount]
  ] as Array<[string, number]>;
}

function providerLabel(config: LLMProviderConfig) {
  if (config.provider !== "deepseek") return "Career Agent · Mock";
  if (config.model === "deepseek-v4-pro" && config.reasoningEffort === "max") return "DeepSeek Pro Max";
  if (config.model === "deepseek-v4-pro") return "DeepSeek Pro";
  return "DeepSeek Flash";
}

function stepLabel(stepName: string) {
  const labels: Record<string, string> = {
    understand_request: "Understanding request",
    classify_input: "Classifying intent",
    retrieve_context: "Retrieving career memory",
    classify_evidence: "Checking opportunities and evidence",
    plan_actions: "Planning actions",
    calling_deepseek_provider: "Calling DeepSeekProvider",
    waiting_for_model_response: "Waiting for model response",
    parse_structured_json: "Parsing structured output",
    validate_structured_json: "Validating JSON",
    dedupe_checks: "Deduplicating objects",
    memory_safety_checks: "Memory safety checks",
    create_evidence: "Creating draft objects",
    extract_opportunity: "Extracting opportunity",
    match_with_memories: "Matching with career memory",
    generate_assessment: "Generating assessment",
    generate_risks: "Generating risks",
    generate_open_questions: "Generating open questions",
    generate_decision: "Generating decision",
    suggest_memory_updates: "Creating memory suggestions",
    answer_question: "Composing response",
    show_structured_card: "Preparing enhancement card",
    compose_response: "Composing response",
    provider_configuration: "Checking provider configuration",
    run_failed: "Run failed"
  };
  return labels[stepName] ?? stepName.replaceAll("_", " ");
}

function optimisticSteps(config: LLMProviderConfig, mode: CareerAgentMode): WorkingStep[] {
  const base: WorkingStep[] = [
    { key: "understand_request", label: "正在理解你的问题", status: "running" },
    { key: "retrieve_context", label: "正在结合历史记忆", status: "pending" },
    { key: "classify_input", label: "正在分析是否需要结构化处理", status: "pending" },
    { key: "compose_response", label: "正在生成建议", status: "pending" }
  ];
  const deepseek: WorkingStep[] =
    config.provider === "deepseek"
      ? [
          { key: "calling_deepseek_provider", label: "Calling DeepSeek", status: "pending" },
          { key: "parse_response", label: "Parsing response", status: "pending" },
          { key: "compose_deepseek_answer", label: "Composing answer", status: "pending" }
        ]
      : [];
  const structured: WorkingStep[] =
    mode === "analyze_as_evidence"
      ? [
          { key: "dedupe_checks", label: "Deduplicating objects", status: "pending" },
          { key: "memory_safety_checks", label: "Memory safety checks", status: "pending" },
          { key: "create_draft_objects", label: "Creating draft objects", status: "pending" }
        ]
      : [];
  return [...base, ...deepseek, ...structured];
}

function advanceSteps(steps: WorkingStep[]): WorkingStep[] {
  const runningIndex = steps.findIndex((step) => step.status === "running");
  if (runningIndex === -1) return steps;
  const nextIndex = Math.min(runningIndex + 1, steps.length - 1);
  return steps.map((step, index) => {
    if (index < nextIndex) return { ...step, status: "completed" as const };
    if (index === nextIndex) return { ...step, status: "running" as const };
    return step;
  });
}

function threadProviderConfig(thread: ChatThreadDTO): LLMProviderConfig {
  return {
    provider: thread.provider === "deepseek" ? "deepseek" : "mock",
    model: thread.model,
    providerLabel: thread.providerLabel,
    thinking: thread.thinking === "enabled" ? "enabled" : "disabled",
    reasoningEffort:
      thread.reasoningEffort === "high" || thread.reasoningEffort === "max" || thread.reasoningEffort === "medium" || thread.reasoningEffort === "low"
        ? thread.reasoningEffort
        : "none"
  };
}

function ModelProviderSelector({
  value,
  onChange
}: {
  value: LLMProviderConfig;
  onChange: (config: LLMProviderConfig) => void;
}) {
  return (
    <details className="group relative">
      <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-lg px-2.5 text-sm font-semibold text-ink transition hover:bg-white">
        {providerLabel(value)}
        <ChevronDown size={14} className="text-slate-500 transition group-open:rotate-180" />
      </summary>
      <div className="absolute left-0 top-10 z-20 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_12px_36px_rgba(15,23,42,0.12)]">
        {providerOptions.map((option) => {
          const active =
            option.config.provider === value.provider &&
            option.config.model === value.model &&
            option.config.reasoningEffort === value.reasoningEffort;
          return (
            <button
              key={option.label}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-50"
              type="button"
              onClick={() => onChange(option.config)}
            >
              <span>
                <span className="block text-sm font-medium text-ink">{option.label}</span>
                <span className="block text-xs text-slate-500">{option.description}</span>
              </span>
              {active ? <span className="text-xs text-focus">Active</span> : null}
            </button>
          );
        })}
      </div>
    </details>
  );
}

function GroupedCitations({ citations }: { citations: CareerAgentCitation[] }) {
  const grouped = useMemo(
    () =>
      citationGroups
        .map((group) => ({
          ...group,
          items: citations.filter((citation) => citation.kind === group.kind)
        }))
        .filter((group) => group.items.length),
    [citations]
  );

  if (!grouped.length) return null;

  return (
    <details className="mt-3 rounded-md border border-line bg-white">
      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-ink">
        Citations ({citations.length})
      </summary>
      <div className="space-y-2 border-t border-line p-2">
        {grouped.map((group) => (
          <details key={group.kind} className="rounded-md border border-line bg-mist">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-ink">
              {group.label} ({group.items.length})
            </summary>
            <div className="space-y-2 border-t border-line p-2">
              {group.items.map((citation) => (
                <Link
                  key={`${citation.kind}-${citation.id}`}
                  href={citation.href ?? "/"}
                  className="block rounded-md border border-line bg-white px-3 py-2 transition hover:border-focus"
                >
                  <p className="text-sm font-semibold text-ink">{citation.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{citation.summary}</p>
                </Link>
              ))}
            </div>
          </details>
        ))}
      </div>
    </details>
  );
}

function AgentSummary({ message }: { message: ChatMessageDTO }) {
  const metadata = assistantMetadata(message);
  const classification = metadata.classification;
  const memorySuggestionsCount = metadata.createdObjects?.memorySuggestionsCount ?? 0;
  const agentSteps = metadata.agentSteps ?? [];

  if (!classification && !message.agentRunId) return null;

  return (
    <details className="mt-3 rounded-md border border-line bg-mist">
      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-ink">Agent Summary</summary>
      <div className="space-y-3 border-t border-line p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={intentTone(classification?.intent)}>{intentLabel(classification?.intent)}</Badge>
          {typeof classification?.confidence === "number" ? (
            <Badge>{Math.round(classification.confidence * 100)}% confidence</Badge>
          ) : null}
          <Badge tone={memorySuggestionsCount ? "amber" : "neutral"}>
            {memorySuggestionsCount} pending MemorySuggestions
          </Badge>
          {metadata.provider?.provider ? (
            <Badge tone={metadata.provider.provider === "deepseek" ? "blue" : "neutral"}>
              {metadata.provider.provider}: {metadata.provider.model}
              {metadata.provider.thinking === "enabled" ? ` · thinking ${metadata.provider.reasoningEffort ?? ""}` : ""}
            </Badge>
          ) : null}
          {typeof metadata.provider?.latencyMs === "number" ? <Badge>{metadata.provider.latencyMs}ms latency</Badge> : null}
          {metadata.provider?.hasReasoningContent ? <Badge tone="neutral">Reasoning content detected</Badge> : null}
          {metadata.actionLevel ? <Badge tone="neutral">{metadata.actionLevel.replaceAll("_", " ")}</Badge> : null}
          {metadata.evidenceSufficiency ? <Badge tone="neutral">evidence: {metadata.evidenceSufficiency}</Badge> : null}
          {metadata.memorySignalStrength ? <Badge tone="neutral">memory: {metadata.memorySignalStrength}</Badge> : null}
          {typeof classification?.shouldSuggestMemory === "boolean" ? (
            <Badge tone={classification.shouldSuggestMemory ? "blue" : "neutral"}>suggest memory: {String(classification.shouldSuggestMemory)}</Badge>
          ) : null}
          {typeof classification?.shouldShowInfoGaps === "boolean" ? (
            <Badge tone={classification.shouldShowInfoGaps ? "amber" : "neutral"}>info gaps: {String(classification.shouldShowInfoGaps)}</Badge>
          ) : null}
          {typeof classification?.shouldCreateObjects === "boolean" ? (
            <Badge tone={classification.shouldCreateObjects ? "blue" : "neutral"}>create objects: {String(classification.shouldCreateObjects)}</Badge>
          ) : null}
          {(classification?.followUpType ?? metadata.conversationContext?.followUpType) ? (
            <Badge tone="blue">follow-up: {classification?.followUpType ?? metadata.conversationContext?.followUpType}</Badge>
          ) : null}
          {typeof metadata.conversationContext?.usedRecentMessagesCount === "number" ? (
            <Badge tone="neutral">recent: {metadata.conversationContext.usedRecentMessagesCount}</Badge>
          ) : null}
          {metadata.conversationContext?.usedLastAssistantAnswer ? <Badge tone="neutral">used last assistant</Badge> : null}
          {metadata.preRouterHints?.hasExplicitMemorySignal ? <Badge tone="blue">explicit memory hint</Badge> : null}
          {metadata.policyGuardCorrections?.length ? <Badge tone="amber">guard corrections: {metadata.policyGuardCorrections.length}</Badge> : null}
          {metadata.answerPlan?.conversationIntent ? <Badge tone="neutral">answer: {metadata.answerPlan.conversationIntent}</Badge> : null}
          {metadata.answerPlan?.responseMode ? <Badge tone="neutral">mode: {metadata.answerPlan.responseMode}</Badge> : null}
          {metadata.answerPlan?.currentInputType ? <Badge tone="blue">input: {metadata.answerPlan.currentInputType}</Badge> : null}
          {metadata.answerPlan?.groundingTarget ? <Badge tone="neutral">grounding: {metadata.answerPlan.groundingTarget}</Badge> : null}
          {metadata.answerPlan?.memoryUsedFor ? <Badge tone="neutral">memory used for: {metadata.answerPlan.memoryUsedFor}</Badge> : null}
          {metadata.answerPlan?.groundingCheck ? (
            <Badge tone={metadata.answerPlan.groundingCheck === "passed" ? "blue" : "amber"}>grounding check: {metadata.answerPlan.groundingCheck}</Badge>
          ) : null}
        </div>

        {metadata.error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
            {metadata.error}
          </div>
        ) : null}

        {metadata.executedActions?.length ? (
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Executed Actions</p>
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              {metadata.executedActions.map((action) => (
                <p key={`${message.id}-${action.action}-${action.summary}`} className="flex items-center gap-2 text-xs text-slate-700">
                  <Check size={13} className={action.status === "completed" ? "text-focus" : "text-amber-700"} />
                  {action.action.replaceAll("_", " ")}
                </p>
              ))}
            </div>
          </div>
        ) : null}

        {agentSteps.length ? (
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Executed Steps</p>
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              {agentSteps.map((step) => (
                <p key={step.id} className="flex min-w-0 items-center gap-2 text-xs text-slate-700">
                  <StepIcon status={step.status === "failed" ? "failed" : step.status === "running" ? "running" : "completed"} />
                  <span className="truncate">{stepLabel(step.stepName)}</span>
                </p>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">Created Objects</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-700 sm:grid-cols-4">
            {createdObjectsSummary(metadata.createdObjects).map(([label, count]) => (
              <span key={label} className="rounded-md border border-line bg-white px-2 py-1">
                {label}: {count}
              </span>
            ))}
          </div>
        </div>

        {metadata.skippedReason ? (
          <div className="rounded-md border border-line bg-white px-3 py-2 text-xs leading-5 text-slate-600">
            Skipped reason: {metadata.skippedReason}
          </div>
        ) : null}

        {metadata.policyGuardCorrections?.length ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
            Policy guard: {metadata.policyGuardCorrections.join("; ")}
          </div>
        ) : null}

        {metadata.artifactActions?.length ? (
          <div className="rounded-md border border-line bg-white px-3 py-2 text-xs leading-5 text-slate-600">
            <p className="font-semibold text-ink">Artifact sidecar</p>
            <p>{metadata.artifactActions.map((action) => `${action.type} (${action.writePolicy})`).join(", ")}</p>
          </div>
        ) : null}

        {metadata.conversationContext?.threadTopicSummary || metadata.conversationContext?.resolvedReference ? (
          <div className="rounded-md border border-line bg-white px-3 py-2 text-xs leading-5 text-slate-600">
            {metadata.conversationContext.threadTopicSummary ? <p>Thread topic: {metadata.conversationContext.threadTopicSummary}</p> : null}
            {metadata.conversationContext.resolvedReference ? <p>Resolved reference: {metadata.conversationContext.resolvedReference}</p> : null}
          </div>
        ) : null}

        {metadata.pendingActions?.length ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
            {metadata.pendingActions.join(" ")}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {message.agentRunId ? (
            <Link className="btn" href={`/agent-runs?run=${message.agentRunId}`}>
              View Agent Run
            </Link>
          ) : null}
          {memorySuggestionsCount ? (
            <Link className="btn" href={`/agent-runs?run=${message.agentRunId}`}>
              Handle Memory Suggestions
            </Link>
          ) : null}
        </div>

        <GroupedCitations citations={metadata.citations ?? []} />
      </div>
    </details>
  );
}

function PendingActions({ message, onChanged }: { message: ChatMessageDTO; onChanged?: () => void }) {
  const metadata = assistantMetadata(message);
  const [memorySuggestions, setMemorySuggestions] = useState<MemorySuggestionDTO[]>(
    metadata.createdObjects?.memorySuggestions ?? []
  );
  const [risks, setRisks] = useState<RiskDTO[]>(metadata.createdObjects?.risks ?? []);
  const [openQuestions, setOpenQuestions] = useState<OpenQuestionDTO[]>(metadata.createdObjects?.openQuestions ?? []);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function refreshPendingActions() {
    const response = await fetch(`/api/pending-actions/messages/${message.id}`);
    if (!response.ok) return;
    const data = (await response.json()) as PendingActionGroups;
    setMemorySuggestions(data.memoryUpdates);
    setRisks(data.risks);
    setOpenQuestions(data.openQuestions);
    setLoaded(true);
  }

  useEffect(() => {
    void refreshPendingActions();
  }, [message.id]);

  const pendingSuggestions = memorySuggestions.filter((item) => item.status === "pending");
  const activeRisks = risks.filter((item) => item.status === "active");
  const pendingQuestions = openQuestions.filter((item) => item.status !== "answered");
  const decision = metadata.createdObjects?.decision;
  const opportunityCount = activeRisks.length + pendingQuestions.length + (decision ? 1 : 0);

  if (!pendingSuggestions.length && !opportunityCount) return null;

  async function acceptSuggestion(suggestion: MemorySuggestionDTO, edit = false) {
    const title = edit ? window.prompt("Title", suggestion.title) : suggestion.title;
    if (title === null) return;
    const content = edit ? window.prompt("Content", suggestion.content) : suggestion.content;
    if (content === null) return;
    setWorkingId(suggestion.id);
    try {
      const response = await fetch(`/api/memory-suggestions/${suggestion.id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edit ? { title, content } : {})
      });
      const result = (await response.json()) as { suggestion: MemorySuggestionDTO };
      setMemorySuggestions((items) => items.map((item) => (item.id === suggestion.id ? result.suggestion : item)));
      await refreshPendingActions();
      onChanged?.();
    } finally {
      setWorkingId(null);
    }
  }

  async function rejectSuggestion(suggestion: MemorySuggestionDTO) {
    setWorkingId(suggestion.id);
    try {
      const response = await fetch(`/api/memory-suggestions/${suggestion.id}/reject`, { method: "POST" });
      const result = (await response.json()) as MemorySuggestionDTO;
      setMemorySuggestions((items) => items.map((item) => (item.id === suggestion.id ? result : item)));
      await refreshPendingActions();
      onChanged?.();
    } finally {
      setWorkingId(null);
    }
  }

  async function updateRisk(risk: RiskDTO, data: Record<string, unknown>) {
    setWorkingId(risk.id);
    try {
      const response = await fetch(`/api/risks/${risk.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      const result = (await response.json()) as RiskDTO;
      setRisks((items) => items.map((item) => (item.id === risk.id ? result : item)));
      await refreshPendingActions();
      onChanged?.();
    } finally {
      setWorkingId(null);
    }
  }

  async function updateQuestion(question: OpenQuestionDTO, data: Record<string, unknown>) {
    setWorkingId(question.id);
    try {
      const response = await fetch(`/api/open-questions/${question.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      const result = (await response.json()) as OpenQuestionDTO;
      setOpenQuestions((items) => items.map((item) => (item.id === question.id ? result : item)));
      await refreshPendingActions();
      onChanged?.();
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-semibold uppercase text-slate-500">Pending from this response</p>
      {pendingSuggestions.length ? (
        <details className="rounded-md border border-amber-200 bg-amber-50/60">
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-amber-950">
            Memory Updates ({pendingSuggestions.length})
          </summary>
          <div className="space-y-2 border-t border-amber-200 p-2">
            {pendingSuggestions.map((suggestion) => (
              <div key={suggestion.id} className="rounded-md border border-amber-200 bg-white px-3 py-2">
                <p className="text-sm font-semibold text-ink">{suggestion.title}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{suggestion.reason}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className="btn-primary h-8 px-2" disabled={workingId === suggestion.id} onClick={() => acceptSuggestion(suggestion)}>
                    Save
                  </button>
                  <button className="btn h-8 px-2" disabled={workingId === suggestion.id} onClick={() => acceptSuggestion(suggestion, true)}>
                    Edit & Save
                  </button>
                  <button className="btn-danger h-8 px-2" disabled={workingId === suggestion.id} onClick={() => rejectSuggestion(suggestion)}>
                    Ignore
                  </button>
                  {suggestion.sourceAgentRunId ? (
                    <Link className="btn h-8 px-2" href={`/agent-runs?run=${suggestion.sourceAgentRunId}`}>
                      View Agent Run
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {opportunityCount ? (
        <details className="rounded-md border border-line bg-mist">
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-ink">
            Opportunity Follow-ups ({opportunityCount})
          </summary>
          <div className="space-y-2 border-t border-line p-2">
            {pendingQuestions.map((question) => (
              <div key={question.id} className="rounded-md border border-line bg-white px-3 py-2">
                <p className="text-sm font-semibold text-ink">{question.question}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {question.priority} · {question.target} · {question.status}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className="btn h-8 px-2" disabled={workingId === question.id} onClick={() => updateQuestion(question, { status: "asked" })}>
                    Mark Asked
                  </button>
                  <button
                    className="btn h-8 px-2"
                    disabled={workingId === question.id}
                    onClick={() => {
                      const answer = window.prompt("Answer", question.answer ?? "");
                      if (answer !== null) void updateQuestion(question, { answer });
                    }}
                  >
                    Add Answer
                  </button>
                  <Link className="btn h-8 px-2" href={`/opportunities?opportunity=${question.opportunityId}`}>
                    Open Opportunity
                  </Link>
                </div>
              </div>
            ))}
            {activeRisks.map((risk) => (
              <div key={risk.id} className="rounded-md border border-line bg-white px-3 py-2">
                <p className="text-sm font-semibold text-ink">{risk.title}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{risk.description}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className="btn h-8 px-2" disabled={workingId === risk.id} onClick={() => updateRisk(risk, { status: "resolved" })}>
                    Mark Resolved
                  </button>
                  <button
                    className="btn h-8 px-2"
                    disabled={workingId === risk.id}
                    onClick={() => {
                      const mitigation = window.prompt("Mitigation", risk.mitigation ?? "");
                      if (mitigation !== null) void updateRisk(risk, { mitigation });
                    }}
                  >
                    Add Mitigation
                  </button>
                  <Link className="btn h-8 px-2" href={`/opportunities?opportunity=${risk.opportunityId}`}>
                    Open Opportunity
                  </Link>
                </div>
              </div>
            ))}
            {decision ? (
              <div className="rounded-md border border-line bg-white px-3 py-2">
                <p className="text-sm font-semibold text-ink">Decision follow-up: {decision.decision}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{decision.rationale}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link className="btn h-8 px-2" href={`/opportunities?opportunity=${decision.opportunityId}`}>
                    Open Opportunity
                  </Link>
                  {message.agentRunId ? (
                    <Link className="btn h-8 px-2" href={`/agent-runs?run=${message.agentRunId}`}>
                      View Agent Run
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "completed") return <Check size={14} className="text-focus" />;
  if (status === "failed") return <CircleAlert size={14} className="text-red-600" />;
  if (status === "running") return <Loader2 size={14} className="animate-spin text-focus" />;
  return <Circle size={10} className="text-slate-300" />;
}

function InfoGaps({ message }: { message: ChatMessageDTO }) {
  const metadata = assistantMetadata(message);
  const gaps = (metadata.missingFields ?? []).slice(0, 5);
  if (!metadata.shouldShowInfoGaps || !gaps.length) return null;
  return (
    <details className="mt-3 rounded-md border border-amber-200 bg-amber-50/60">
      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-amber-950">
        可能还需要补充的信息
      </summary>
      <ul className="space-y-1 border-t border-amber-200 px-4 py-3 text-xs leading-5 text-amber-900">
        {gaps.map((gap) => (
          <li key={gap} className="list-disc ml-4">
            {gap}
          </li>
        ))}
      </ul>
    </details>
  );
}

function StructuredEnhancementCards({ message }: { message: ChatMessageDTO }) {
  const metadata = assistantMetadata(message);
  const cards = metadata.structuredCards ?? [];
  if (!cards.length) return null;
  return (
    <div className="mt-3 space-y-2">
      {cards.map((card) => (
        <div key={`${message.id}-${card.type}`} className="rounded-md border border-line bg-white px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink">{card.title}</p>
            {card.evidenceSufficiency ? <Badge tone="neutral">{card.evidenceSufficiency}</Badge> : null}
          </div>
          {card.items?.length ? (
            <div className="mt-2 grid gap-1 text-xs leading-5 text-slate-600 sm:grid-cols-2">
              {card.items.slice(0, 5).map((item) => (
                <p key={item} className="rounded-md bg-slate-50 px-2 py-1">
                  {item}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function MemoryContext({ message }: { message: ChatMessageDTO }) {
  const metadata = assistantMetadata(message);
  const memories = (metadata.contextRefs ?? []).filter((ref) => ref.entityType === "memory").slice(0, 5);
  const candidates = metadata.createdObjects?.memorySuggestions ?? [];
  if (!memories.length && !candidates.length) return null;
  return (
    <details className="mt-3 rounded-md border border-line bg-white">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-semibold text-ink">
        <BrainCircuit size={15} className="text-focus" />
        Memory context
      </summary>
      <div className="space-y-2 border-t border-line p-3">
        {memories.length ? (
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Used in this reply</p>
            <div className="mt-2 space-y-1">
              {memories.map((memory) => (
                <p key={`${memory.entityType}-${memory.entityId}`} className="text-xs leading-5 text-slate-600">
                  {memory.title}
                </p>
              ))}
            </div>
          </div>
        ) : null}
        {candidates.length ? (
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Candidate memories</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              {candidates.length} pending candidate(s). Use Save, Edit & Save, or Ignore below.
            </p>
          </div>
        ) : null}
        <Link className="btn h-8 px-2" href="/memories">
          Open Memories
        </Link>
      </div>
    </details>
  );
}

function AgentStatusCard({ steps, failed }: { steps: WorkingStep[]; failed?: boolean }) {
  const current = steps.find((step) => step.status === "running" || step.status === "failed") ?? steps.at(-1);
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-50 text-focus">
        <Bot size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <details className="max-w-[760px] rounded-md border border-line bg-white/85 shadow-subtle" open>
          <summary className="cursor-pointer list-none px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">Career Agent is working...</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">{current?.label ?? "Preparing response"}</p>
              </div>
              <StepIcon status={failed ? "failed" : current?.status ?? "running"} />
            </div>
          </summary>
          <div className="space-y-1 border-t border-line px-4 py-3">
            {steps.map((step) => (
              <p key={step.key} className="flex items-center gap-2 text-xs leading-5 text-slate-700">
                <StepIcon status={step.status} />
                <span>{step.label}</span>
                {step.summary ? <span className="text-slate-400">{step.summary}</span> : null}
              </p>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}

function MessageBubble({ message, onPendingChanged }: { message: ChatMessageDTO; onPendingChanged?: () => void }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser ? (
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-50 text-focus">
          <Bot size={16} />
        </span>
      ) : null}
      <article className={isUser ? "max-w-[70%] rounded-2xl bg-focus px-4 py-2.5 text-white shadow-sm" : "min-w-0 flex-1"}>
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
        ) : (
          <div className="max-w-[760px]">
            <MarkdownRenderer content={message.content} />
            <InfoGaps message={message} />
            <StructuredEnhancementCards message={message} />
            <MemoryContext message={message} />
            <AgentSummary message={message} />
            <PendingActions message={message} onChanged={onPendingChanged} />
          </div>
        )}
      </article>
      {isUser ? (
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white">
          <User size={16} />
        </span>
      ) : null}
    </div>
  );
}

function ChatComposer({
  variant,
  input,
  mode,
  busy,
  error,
  onInputChange,
  onModeChange,
  onSend
}: {
  variant: "inline" | "docked";
  input: string;
  mode: CareerAgentMode;
  busy: boolean;
  error?: string | null;
  onInputChange: (value: string) => void;
  onModeChange: (mode: CareerAgentMode) => void;
  onSend: () => void;
}) {
  const composer = (
    <div className="mx-auto w-full max-w-[760px]">
      {error ? <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <div className="rounded-3xl border border-slate-200 bg-white p-2 shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
        <textarea
          className="max-h-44 min-h-14 w-full resize-none rounded-2xl border-0 bg-transparent px-3 py-2.5 text-sm leading-6 outline-none"
          placeholder="Message Career Agent..."
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSend();
            }
          }}
        />
        <div className="flex items-center justify-between gap-2 px-1 pb-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <button
              className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-teal-200 hover:text-focus"
              type="button"
              title="Attach"
            >
              <Plus size={16} />
            </button>
            <div className="flex rounded-full border border-slate-200 bg-slate-50/70 p-0.5">
              {modeLabels.map((item) => (
                <button
                  key={item.value}
                  className={`h-7 rounded-full px-2.5 text-xs font-medium transition ${
                    mode === item.value ? "bg-white text-focus shadow-sm" : "text-slate-500 hover:text-ink"
                  }`}
                  onClick={() => onModeChange(item.value)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <button
            className="flex h-8 min-w-8 items-center justify-center rounded-full bg-focus px-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:bg-teal-700/35"
            onClick={onSend}
            disabled={busy || !input.trim()}
            type="button"
          >
            {busy ? "Sending" : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  );

  if (variant === "inline") return composer;

  return (
    <div className="shrink-0 bg-gradient-to-t from-slate-50 via-slate-50/95 to-slate-50/20 px-5 pb-5 pt-3 backdrop-blur">
      {composer}
    </div>
  );
}

export function ChatWorkspace({ initialThreadId }: { initialThreadId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const [currentThread, setCurrentThread] = useState<ChatThreadDTO | null>(null);
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<CareerAgentMode>("auto");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [runningLabel, setRunningLabel] = useState<string | null>(null);
  const [workingSteps, setWorkingSteps] = useState<WorkingStep[]>([]);
  const [workingFailed, setWorkingFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefillApplied, setPrefillApplied] = useState(false);
  const [providerConfig, setProviderConfig] = useState<LLMProviderConfig>({
    provider: "mock",
    model: "MockLLMProvider",
    providerLabel: "MockLLMProvider",
    thinking: "disabled",
    reasoningEffort: "none"
  });
  const [modelNotice, setModelNotice] = useState<string | null>(null);
  const [deepseekConfigured, setDeepseekConfigured] = useState(true);

  const isNewChat = !currentThread?.id;
  const title = currentThread?.title ?? "New Career Chat";
  const showInlineStarter = !loading && !messages.length && !runningLabel;

  async function loadThread(threadId: string) {
    const response = await fetch(`/api/chat/threads/${threadId}`);
    if (!response.ok) {
      setCurrentThread(null);
      setMessages([]);
      return;
    }
    const data = (await response.json()) as ChatThreadDTO;
    setCurrentThread(data);
    setMessages(data.messages ?? []);
    setProviderConfig(threadProviderConfig(data));
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      if (initialThreadId && initialThreadId !== "new") {
        await loadThread(initialThreadId);
      } else {
        setCurrentThread(null);
        setMessages([]);
      }
      setLoading(false);
    }
    void load();
  }, [initialThreadId]);

  useEffect(() => {
    const prefill = searchParams.get("prefill");
    const queryMode = searchParams.get("mode") as CareerAgentMode | null;
    if (!prefillApplied && prefill) {
      setInput(prefill);
      setPrefillApplied(true);
    }
    if (queryMode && modeLabels.some((item) => item.value === queryMode)) {
      setMode(queryMode);
    }
  }, [searchParams, prefillApplied]);

  useEffect(() => {
    void fetch("/api/llm/status")
      .then((response) => (response.ok ? response.json() : { deepseekConfigured: true }))
      .then((payload: { deepseekConfigured?: boolean }) => setDeepseekConfigured(payload.deepseekConfigured !== false))
      .catch(() => setDeepseekConfigured(true));
  }, []);

  useEffect(() => {
    if (currentThread?.id) return;
    const stored = window.localStorage.getItem("career-agent-provider");
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as LLMProviderConfig;
      if (parsed.provider === "mock" || parsed.provider === "deepseek") setProviderConfig(parsed);
    } catch {
      window.localStorage.removeItem("career-agent-provider");
    }
  }, [currentThread?.id]);

  async function selectProvider(config: LLMProviderConfig) {
    setProviderConfig(config);
    setModelNotice(null);
    if (!currentThread?.id) {
      window.localStorage.setItem("career-agent-provider", JSON.stringify(config));
      return;
    }
    const response = await fetch(`/api/chat/threads/${currentThread.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelConfig: config })
    });
    if (!response.ok) {
      setError("Failed to update model for this chat.");
      return;
    }
    const updated = (await response.json()) as ChatThreadDTO;
    setCurrentThread((thread) => (thread ? { ...thread, ...updated } : updated));
    setProviderConfig(threadProviderConfig(updated));
    setModelNotice(`Model for this chat updated to ${providerLabel(threadProviderConfig(updated))}.`);
    window.dispatchEvent(new Event("chat-threads:changed"));
  }

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy, workingSteps]);

  useEffect(() => {
    if (!busy || !workingSteps.length) return;
    const timer = window.setInterval(() => {
      setWorkingSteps((steps) => advanceSteps(steps));
    }, 650);
    return () => window.clearInterval(timer);
  }, [busy, workingSteps.length]);

  async function send() {
    const clean = input.trim();
    if (!clean || busy) return;

    setBusy(true);
    setRunningLabel("Running CareerAgentRouter...");
    setWorkingFailed(false);
    setWorkingSteps(optimisticSteps(providerConfig, mode));
    setError(null);
    setInput("");
    const tempUserMessage: ChatMessageDTO = {
      id: `temp-${Date.now()}`,
      threadId: currentThread?.id ?? "new",
      role: "user",
      content: clean,
      metadata: { optimistic: true },
      createdAt: new Date().toISOString()
    };
    const previousMessages = messages;
    let failed = false;
    setMessages((items) => [...items, tempUserMessage]);
    try {
      const started = Date.now();
      const response = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: currentThread?.id ?? initialThreadId ?? null,
          input: clean,
          mode,
          providerConfig
        })
      });
      const elapsed = Date.now() - started;
      if (elapsed < 1800) {
        await new Promise((resolve) => window.setTimeout(resolve, 1800 - elapsed));
      }
      const data = (await response.json()) as SendResponse | { error?: string };
      if (!response.ok || !("thread" in data)) {
        throw new Error("error" in data && data.error ? data.error : "Chat send failed.");
      }
      setWorkingSteps((steps) => steps.map((step) => ({ ...step, status: "completed" })));
      setCurrentThread(data.thread);
      setMessages(data.thread.messages ?? [...messages, data.userMessage, data.assistantMessage]);
      window.dispatchEvent(new Event("chat-threads:changed"));
      if (data.thread.id !== initialThreadId) {
        router.replace(`/chat/${data.thread.id}`);
      }
    } catch (caught) {
      failed = true;
      setInput(clean);
      setError(caught instanceof Error ? caught.message : "Chat send failed.");
      setWorkingFailed(true);
      setWorkingSteps((steps) => {
        const runningIndex = steps.findIndex((step) => step.status === "running");
        return steps.map((step, index) =>
          index === Math.max(0, runningIndex) ? { ...step, status: "failed", summary: "Request failed" } : step
        );
      });
      setMessages(previousMessages.length ? [...previousMessages, tempUserMessage] : [tempUserMessage]);
    } finally {
      setBusy(false);
      if (!failed) {
        window.setTimeout(() => {
          setRunningLabel(null);
          setWorkingSteps([]);
          setWorkingFailed(false);
        }, 250);
      }
    }
  }

  return (
    <div className="flex h-[calc(100vh-40px)] overflow-hidden">
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-50/40">
        <header className="shrink-0 border-b border-slate-200/70 bg-slate-50/70 px-5 py-2.5">
          <div className="flex w-full items-center justify-between gap-4">
            <div className="min-w-0">
              <ModelProviderSelector value={providerConfig} onChange={selectProvider} />
              <p className="mt-0.5 line-clamp-1 px-2.5 text-[11px] text-slate-400">
                {currentThread?.status === "archived" ? "Archived · " : ""}
                {isNewChat ? "New thread" : title}
                {providerConfig.provider === "deepseek" ? " · DeepSeek" : ""}
              </p>
              {providerConfig.provider === "deepseek" && !deepseekConfigured ? (
                <p className="px-2.5 text-[11px] text-amber-700">API key missing</p>
              ) : modelNotice ? (
                <p className="px-2.5 text-[11px] text-focus">{modelNotice}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2 lg:hidden">
              <Link className="btn-primary" href="/chat/new">
                <MessageSquarePlus size={15} />
                New
              </Link>
            </div>
          </div>
        </header>

        <div ref={messagesContainerRef} className="min-h-0 flex-1 overflow-y-auto px-5">
          {loading ? (
            <EmptyState title="Loading chat" />
          ) : messages.length ? (
            <div className="mx-auto w-full max-w-[760px] space-y-6 pb-32 pt-7">
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  onPendingChanged={() => {
                    window.dispatchEvent(new Event("pending-actions:changed"));
                    if (currentThread?.id) void loadThread(currentThread.id);
                  }}
                />
              ))}
              {runningLabel ? (
                <AgentStatusCard steps={workingSteps} failed={workingFailed} />
              ) : null}
              <div ref={bottomRef} />
            </div>
          ) : (
            <>
              {runningLabel ? (
                <div className="mx-auto w-full max-w-[760px] space-y-5 pb-32 pt-7">
                  <div className="flex gap-3">
                    <AgentStatusCard steps={workingSteps} failed={workingFailed} />
                  </div>
                  <div ref={bottomRef} />
                </div>
              ) : (
                <div className="mx-auto flex min-h-full w-full max-w-[760px] flex-col justify-center px-1 pb-16 pt-8">
                  <div className="max-w-xl">
                    <h2 className="text-xl font-semibold text-ink">Start a career task</h2>
                    <p className="mt-1.5 text-sm leading-6 text-slate-600">
                      Ask a focused question, paste a JD, compare options, or update your career memory.
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {emptyChatStarters.map((starter) => (
                      <button
                        key={starter.label}
                        className="rounded-full border border-slate-200 bg-white/75 px-3 py-1.5 text-sm font-medium text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition hover:border-teal-200 hover:bg-teal-50 hover:text-focus"
                        type="button"
                        onClick={() => setInput(starter.prompt)}
                      >
                        {starter.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4">
                    <ChatComposer
                      variant="inline"
                      input={input}
                      mode={mode}
                      busy={busy}
                      error={error}
                      onInputChange={setInput}
                      onModeChange={setMode}
                      onSend={send}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {!showInlineStarter ? (
          <ChatComposer
            variant="docked"
            input={input}
            mode={mode}
            busy={busy}
            error={error}
            onInputChange={setInput}
            onModeChange={setMode}
            onSend={send}
          />
        ) : null}
      </section>
    </div>
  );
}
