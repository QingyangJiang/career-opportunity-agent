import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { EvidenceDTO, MemoryDTO } from "@/lib/types";
import type {
  AssessmentDraft,
  CareerInputClassificationDraft,
  DecisionDraft,
  EvidenceClassification,
  LLMProvider,
  MatchResult,
  MemorySuggestionDraft,
  OpenQuestionDraft,
  OpportunityDraft,
  RiskDraft,
  RoleSignals,
  ProviderUsageMetadata
} from "@/lib/llm/types";
import {
  DEEPSEEK_BASE_URL,
  DEEPSEEK_DEFAULT_MODEL,
  DEEPSEEK_DEFAULT_REASONING_EFFORT,
  DEEPSEEK_REASONING_MODEL,
  isDeepSeekConfigured,
  type LLMProviderConfig
} from "@/lib/llm/config";

class DeepSeekProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeepSeekProviderError";
  }
}

const jsonSystemPrompt =
  "You are a career memory analysis engine in an ongoing multi-turn conversation. Use recent conversation messages to resolve short follow-up questions. Please output valid JSON only. Do not output markdown. Do not output explanatory text outside JSON.";

const MEMORY_TYPES = ["ProfileFact", "Skill", "ProjectClaim", "Preference", "Constraint", "CareerGoal", "CurrentTask", "ComparisonTarget", "HistoricalConclusion"];

function asStringArray(value: unknown, fallback: string[] = []) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : fallback;
}

function asNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function confidenceLabel(value: unknown) {
  const text = asString(value, "medium").toLowerCase();
  if (text.includes("high") || text === "高") return "high";
  if (text.includes("low") || text === "低") return "low";
  return "medium";
}

function severity(value: unknown) {
  const text = asString(value, "medium").toLowerCase();
  if (text.includes("high") || text === "高") return "high";
  if (text.includes("low") || text === "低") return "low";
  return "medium";
}

function decisionValue(value: unknown) {
  const text = asString(value, "watch").toLowerCase();
  if (text.includes("pursue") || text.includes("推进")) return "pursue";
  if (text.includes("reject") || text.includes("拒")) return "reject";
  if (text.includes("pause") || text.includes("缓")) return "pause";
  return "maybe";
}

function safeJsonParse<T>(content: string): T {
  try {
    return JSON.parse(content) as T;
  } catch (error) {
    throw new DeepSeekProviderError(`DeepSeek returned invalid structured output. No objects were created. ${error instanceof Error ? error.message : ""}`.trim());
  }
}

function guardedClassification(input: string): CareerInputClassificationDraft | null {
  const text = input.trim().toLowerCase();
  const compact = text.replace(/\s+/g, "");
  const stableMemorySignal = /(以后|长期|优先看|优先考虑|不优先|暂不考虑|不考虑|默认不看|目标是|硬约束|记住|帮我记一下|作为筛选标准|后续筛选|以后筛岗位)/i.test(input);
  const careerDirectionSignal = /(agentic rl|agent|后训练|reward model|verifier|纯预训练|预训练|rlhf|grpo)/i.test(input);
  const randomish = /^[a-z;,'".\d\s-]{10,}$/.test(text) && !/(agent|jd|rl|offer|interview|job|career)/i.test(text);
  if (!compact || ["测试", "测试query", "test", "hello", "你好"].includes(compact) || randomish) {
    return {
      intent: "clarify",
      evidenceType: "none",
      confidence: 0.95,
      needsConfirmation: false,
      reason: "Input is too vague, test-like, or random.",
      shouldCreateEvidence: false,
      shouldExtractOpportunity: false,
      shouldGenerateAssessment: false,
      shouldGenerateRisks: false,
      shouldGenerateOpenQuestions: false,
      shouldGenerateDecision: false,
      shouldSuggestMemoryUpdates: false
    };
  }
  if ((text.includes("找") || text.includes("搜") || text.includes("查")) && text.includes("jd")) {
    return {
      intent: "needs_external_source",
      evidenceType: "none",
      confidence: 0.9,
      needsConfirmation: false,
      reason: "The user asks to find an external JD; local-first mode needs pasted source text.",
      shouldCreateEvidence: false,
      shouldExtractOpportunity: false,
      shouldGenerateAssessment: false,
      shouldGenerateRisks: false,
      shouldGenerateOpenQuestions: false,
      shouldGenerateDecision: false,
      shouldSuggestMemoryUpdates: false
    };
  }
  if (stableMemorySignal && careerDirectionSignal || text.includes("以后") || text.includes("优先") || text.includes("不考虑") || text.includes("偏好") || text.includes("目标")) {
    return {
      intent: "update_memory",
      actionLevel: "suggest_memory_candidate",
      evidenceSufficiency: "none",
      memorySignalStrength: "high",
      missingFields: [],
      evidenceType: "user_note",
      confidence: 0.86,
      needsConfirmation: false,
      reason: "The user states an explicit durable career preference or constraint.",
      shouldCreateObjects: false,
      shouldCreateEvidence: false,
      shouldExtractOpportunity: false,
      shouldGenerateAssessment: false,
      shouldGenerateRisks: false,
      shouldGenerateOpenQuestions: false,
      shouldGenerateDecision: false,
      shouldSuggestMemoryUpdates: true,
      shouldSuggestMemory: true,
      shouldShowStructuredCard: false,
      shouldShowInfoGaps: false,
      skippedReason: "explicit long-term preference and constraint update"
    };
  }
  if (text.includes("岗位职责") || text.includes("任职要求") || text.includes("薪资") || /\bjd\b/i.test(text)) {
    return {
      intent: "analyze_evidence",
      evidenceType: "jd",
      confidence: 0.88,
      needsConfirmation: false,
      reason: "The input contains pasted JD-like evidence.",
      shouldCreateEvidence: true,
      shouldExtractOpportunity: true,
      shouldGenerateAssessment: true,
      shouldGenerateRisks: true,
      shouldGenerateOpenQuestions: true,
      shouldGenerateDecision: true,
      shouldSuggestMemoryUpdates: true
    };
  }
  return null;
}

function compactEvidence(evidence: EvidenceDTO) {
  return {
    id: evidence.id,
    title: evidence.title,
    type: evidence.type,
    sourceUrl: evidence.sourceUrl,
    content: evidence.content.slice(0, 9000)
  };
}

function normalizeMemorySuggestion(value: Record<string, unknown>, evidenceId?: string): MemorySuggestionDraft {
  const rawType = asString(value.suggestedType, "HistoricalConclusion");
  return {
    suggestedType: MEMORY_TYPES.includes(rawType) ? (rawType as MemorySuggestionDraft["suggestedType"]) : "HistoricalConclusion",
    title: asString(value.title, "Career memory suggestion"),
    content: asString(value.content, asString(value.reason, "Suggested career memory update.")),
    tags: asStringArray(value.tags),
    confidence: Math.max(0, Math.min(1, asNumber(value.confidence, 0.7))),
    reason: asString(value.reason, "Generated by DeepSeek from the provided career context."),
    sourceEvidenceIds: evidenceId ? [evidenceId] : []
  };
}

export class DeepSeekProvider implements LLMProvider {
  metadata: ProviderUsageMetadata = {};
  private readonly client: OpenAI;
  private readonly config: LLMProviderConfig;

  constructor(config: LLMProviderConfig = { provider: "deepseek" }) {
    this.config = {
      provider: "deepseek",
      model: config.model || (config.thinking === "enabled" ? DEEPSEEK_REASONING_MODEL : DEEPSEEK_DEFAULT_MODEL),
      thinking: config.thinking ?? "disabled",
      reasoningEffort: config.reasoningEffort ?? DEEPSEEK_DEFAULT_REASONING_EFFORT,
      temperature: config.temperature ?? 0.2,
      maxTokens: config.maxTokens ?? 2000,
      timeoutMs: config.timeoutMs ?? 60000,
      stream: config.stream ?? false
    };
    this.client = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY || "missing",
      baseURL: DEEPSEEK_BASE_URL,
      timeout: this.config.timeoutMs ?? 60000
    });
  }

  private assertConfigured() {
    if (!isDeepSeekConfigured()) {
      throw new DeepSeekProviderError("DeepSeek API key is not configured. Please set DEEPSEEK_API_KEY.");
    }
  }

  private async complete(messages: ChatCompletionMessageParam[], json = false, model = this.config.model || DEEPSEEK_DEFAULT_MODEL) {
    this.assertConfigured();
    const started = Date.now();
    try {
      const response = await this.client.chat.completions.create({
        model,
        messages,
        stream: false,
        response_format: json ? { type: "json_object" } : undefined,
        max_tokens: this.config.maxTokens ?? (json ? 1800 : 1200),
        temperature: this.config.temperature ?? 0.2,
        ...(this.config.thinking === "enabled" ? { reasoning_effort: this.config.reasoningEffort } : {}),
        extra_body: {
          thinking: { type: this.config.thinking === "enabled" ? "enabled" : "disabled" }
        }
      } as never);
      const choice = response.choices[0]?.message;
      const content = choice?.content;
      this.metadata = {
        apiLatencyMs: Date.now() - started,
        tokenUsage: response.usage,
        reasoningContentPresent: Boolean((choice as unknown as { reasoning_content?: string })?.reasoning_content)
      };
      if (!content) throw new DeepSeekProviderError("DeepSeek returned empty content.");
      return content;
    } catch (error) {
      const message = error instanceof Error ? error.message : "DeepSeek request failed.";
      this.metadata = { ...this.metadata, apiLatencyMs: Date.now() - started, error: message };
      if (error instanceof DeepSeekProviderError) throw error;
      throw new DeepSeekProviderError(message);
    }
  }

  private async completeJson<T>(task: string, payload: unknown, schemaExample: unknown, model = this.config.model || DEEPSEEK_DEFAULT_MODEL) {
    const content = await this.complete(
      [
        { role: "system", content: jsonSystemPrompt },
        {
          role: "user",
          content: JSON.stringify({
            task,
            instruction: "Please output valid JSON matching the schemaExample. Do not output markdown.",
            schemaExample,
            payload
          })
        }
      ],
      true,
      model
    );
    return safeJsonParse<T>(content);
  }

  chat(input: string, context?: unknown) {
    return this.complete([
      { role: "system", content: "You are a concise career agent. Answer in the user's language." },
      { role: "user", content: JSON.stringify({ input, context }) }
    ]);
  }

  async classifyCareerInput(input: string, context?: unknown): Promise<CareerInputClassificationDraft> {
    const guarded = guardedClassification(input);
    if (guarded) return guarded;
    return this.completeJson(
      "classifyCareerInput",
      { input, context },
      {
        routerRules:
          "Default answer_only. Explicit long-term preference/constraint signals override career direction keywords and must be update_memory. Weak JD snippets must be analyze_evidence_candidate and cannot create objects. Complete JD only can create_structured_objects. Follow-ups use recentMessages.",
        intent: "ordinary_chat | follow_up | update_memory | analyze_evidence | analyze_evidence_candidate | compare_opportunities | prepare_interview | rewrite_resume_or_project | interview_review | needs_external_source | clarify",
        followUpType: "none | expand_previous_answer | ask_for_more_options | clarify_previous_answer | ask_for_next_steps | ask_about_mentioned_entity | compare_with_previous",
        actionLevel: "answer_only | answer_with_info_gaps | suggest_memory_candidate | show_structured_card | propose_draft_object | create_structured_objects",
        evidenceSufficiency: "none | partial | sufficient",
        memorySignalStrength: "none | low | medium | high",
        missingFields: [],
        evidenceType: "jd | recruiter_message | hr_chat | interview_note | offer | user_note | none",
        confidence: 0.0,
        needsConfirmation: false,
        reason: "",
        shouldCreateObjects: false,
        shouldCreateEvidence: false,
        shouldExtractOpportunity: false,
        shouldGenerateAssessment: false,
        shouldGenerateRisks: false,
        shouldGenerateOpenQuestions: false,
        shouldGenerateDecision: false,
        shouldSuggestMemoryUpdates: false,
        shouldSuggestMemory: false,
        shouldShowStructuredCard: false,
        shouldShowInfoGaps: false,
        skippedReason: ""
      }
    );
  }

  answerCareerQuestion(input: string, context?: unknown) {
    return this.complete([
      {
        role: "system",
        content:
          "You are a concise career agent in an ongoing conversation. Always use recent conversation messages to resolve short follow-up questions. If the user asks “还有吗 / 除此之外 / 展开说说 / 那这个呢”, infer the reference from the last assistant answer. 当前是多轮对话，不是单轮问答；对“除此之外呢”“还有吗”“展开说说”这类省略句，要优先承接上一轮回答。如果上一轮在推荐公司，本轮就继续推荐公司；如果上一轮在分析岗位，本轮就继续展开岗位分析。Do not treat short follow-ups as standalone unless there is no usable context. For follow-up questions, answer naturally and do not create structured objects unless explicitly requested. Do not expose raw chain-of-thought."
      },
      { role: "user", content: JSON.stringify({ input, context }) }
    ]);
  }

  async classifyEvidence(evidence: EvidenceDTO): Promise<EvidenceClassification> {
    const data = await this.completeJson<Record<string, unknown>>("classifyEvidence", compactEvidence(evidence), {
      evidenceType: "jd",
      confidence: 0.8,
      signals: ["Agent", "RLHF"]
    });
    return {
      evidenceType: asString(data.evidenceType, evidence.type || "user_note"),
      confidence: Math.max(0, Math.min(1, asNumber(data.confidence, 0.7))),
      signals: asStringArray(data.signals)
    };
  }

  async extractOpportunity(evidence: EvidenceDTO): Promise<OpportunityDraft> {
    const data = await this.completeJson<Record<string, unknown>>("extractOpportunity", compactEvidence(evidence), {
      type: "public_jd",
      company: "待确认公司",
      businessUnit: "大模型业务",
      roleTitle: "Agent 后训练算法专家",
      sourceChannel: "JD 原文",
      sourceUrl: null,
      status: "discovered",
      location: null,
      salaryRange: "70k-90k，15薪",
      directionTags: ["Agent", "后训练/RL"],
      responsibilities: [],
      requirements: [],
      rawSummary: ""
    });
    return {
      type: asString(data.type, evidence.type === "recruiter_message" ? "recruiter_lead" : "public_jd"),
      company: asString(data.company, "待确认公司"),
      businessUnit: asString(data.businessUnit, "待确认业务"),
      roleTitle: asString(data.roleTitle ?? data.role, evidence.title),
      sourceChannel: asString(data.sourceChannel, evidence.type),
      sourceUrl: typeof data.sourceUrl === "string" ? data.sourceUrl : evidence.sourceUrl,
      status: asString(data.status, "discovered"),
      location: typeof data.location === "string" ? data.location : null,
      salaryRange: typeof data.salaryRange === "string" ? data.salaryRange : typeof data.salary === "string" ? data.salary : null,
      directionTags: asStringArray(data.directionTags ?? data.tags, ["待确认"]),
      responsibilities: asStringArray(data.responsibilities),
      requirements: asStringArray(data.requirements),
      rawSummary: asString(data.rawSummary ?? data.summary, evidence.content.slice(0, 180))
    };
  }

  async extractRoleSignals(_evidence: EvidenceDTO, opportunity: OpportunityDraft): Promise<RoleSignals> {
    return {
      directionTags: opportunity.directionTags,
      senioritySignals: [],
      compensationSignals: opportunity.salaryRange ? [opportunity.salaryRange] : ["薪资待确认"],
      ownerSpaceSignals: [],
      missingSignals: ["团队规模、汇报线、绩效口径需要确认"]
    };
  }

  async matchOpportunityWithMemories(opportunity: OpportunityDraft, memories: MemoryDTO[]): Promise<MatchResult> {
    const matched = memories.slice(0, 5);
    return {
      matches: opportunity.requirements.slice(0, 6).map((requirement, index) => ({
        requirement,
        memoryId: matched[index]?.id ?? null,
        memoryTitle: matched[index]?.title ?? null,
        strength: matched[index] ? "medium" : "gap",
        rationale: matched[index] ? `参考记忆：${matched[index].title}` : "当前没有直接记忆证据。",
        evidenceIds: matched[index]?.sourceEvidenceIds ?? []
      })),
      matchedMemoryIds: matched.map((memory) => memory.id),
      coverageScore: matched.length ? 65 : 35,
      gapSignals: matched.length ? [] : ["缺少直接项目证据"]
    };
  }

  async generateAssessment(opportunity: OpportunityDraft, memories: MemoryDTO[], matchResult: MatchResult): Promise<AssessmentDraft> {
    const data = await this.completeJson<Record<string, unknown>>("generateAssessment", { opportunity, memories: memories.slice(0, 8), matchResult }, {
      overallScore: 75,
      directionMatchScore: 80,
      experienceMatchScore: 70,
      compensationMatchScore: 70,
      ownerSpaceScore: 65,
      summary: "",
      strongMatches: [],
      weakMatches: []
    });
    return {
      overallScore: asNumber(data.overallScore ?? data.score, 70),
      directionMatchScore: asNumber(data.directionMatchScore, 70),
      experienceMatchScore: asNumber(data.experienceMatchScore, 65),
      compensationMatchScore: asNumber(data.compensationMatchScore, 65),
      ownerSpaceScore: asNumber(data.ownerSpaceScore, 65),
      summary: asString(data.summary, "DeepSeek generated opportunity assessment."),
      strongMatches: Array.isArray(data.strongMatches) ? (data.strongMatches as Array<Record<string, unknown>>) : [],
      weakMatches: Array.isArray(data.weakMatches) ? (data.weakMatches as Array<Record<string, unknown>>) : []
    };
  }

  async generateRisks(opportunity: OpportunityDraft, memories: MemoryDTO[], assessment: AssessmentDraft): Promise<RiskDraft[]> {
    const data = await this.completeJson<{ risks?: Array<Record<string, unknown>> }>("generateRisks", { opportunity, memories: memories.slice(0, 8), assessment }, {
      risks: [{ title: "", severity: "medium", likelihood: "medium", description: "", mitigation: "" }]
    });
    return (data.risks ?? []).slice(0, 8).map((risk) => ({
      title: asString(risk.title, "Role risk"),
      description: asString(risk.description, "需要进一步确认。"),
      severity: severity(risk.severity),
      likelihood: severity(risk.likelihood),
      mitigation: typeof risk.mitigation === "string" ? risk.mitigation : null,
      evidenceIds: []
    }));
  }

  async generateOpenQuestions(opportunity: OpportunityDraft, risks: RiskDraft[]): Promise<OpenQuestionDraft[]> {
    const data = await this.completeJson<{ openQuestions?: Array<Record<string, unknown>> }>("generateOpenQuestions", { opportunity, risks }, {
      openQuestions: [{ question: "", target: "hr", priority: "medium", reason: "" }]
    });
    return (data.openQuestions ?? []).slice(0, 8).map((question) => ({
      question: asString(question.question, "请确认团队和岗位边界。"),
      target: ["hr", "interviewer", "self"].includes(String(question.target)) ? (String(question.target) as OpenQuestionDraft["target"]) : "hr",
      priority: severity(question.priority) as OpenQuestionDraft["priority"],
      status: "unasked",
      answer: null
    }));
  }

  async generateDecision(opportunity: OpportunityDraft, assessment: AssessmentDraft, risks: RiskDraft[]): Promise<DecisionDraft> {
    const data = await this.completeJson<Record<string, unknown>>("generateDecision", { opportunity, assessment, risks }, {
      decision: "pursue",
      confidence: "medium",
      rationale: ""
    });
    return {
      decision: decisionValue(data.decision ?? data.value),
      confidence: confidenceLabel(data.confidence),
      rationale: asString(data.rationale, "基于当前信息建议继续观察并补充关键信息。"),
      evidenceIds: []
    };
  }

  async suggestMemoryUpdates(evidence: EvidenceDTO, opportunity: OpportunityDraft, assessment: AssessmentDraft): Promise<MemorySuggestionDraft[]> {
    const data = await this.completeJson<{ memorySuggestions?: Array<Record<string, unknown>> }>("suggestMemoryUpdates", { evidence: compactEvidence(evidence), opportunity, assessment }, {
      memorySuggestions: [{ suggestedType: "Preference", title: "", content: "", confidence: 0.7, reason: "" }]
    });
    return (data.memorySuggestions ?? []).slice(0, 5).map((item) => normalizeMemorySuggestion(item, evidence.id));
  }
}
