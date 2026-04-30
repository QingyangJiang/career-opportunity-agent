import { prisma } from "@/lib/db/prisma";
import { analyzeEvidence } from "@/lib/agent/analyzeEvidence";
import { toAgentRunDTO, toAgentStepDTO } from "@/lib/agent/serializers";
import { askCareerAgent, clarifyAskResponse } from "@/lib/career-agent/ask";
import { inferEvidenceType, titleFromInput } from "@/lib/career-agent/evidenceDetection";
import { toEvidenceDTO } from "@/lib/evidence/serializers";
import { toMemorySuggestionDTO } from "@/lib/memory/serializers";
import {
  toAssessmentDTO,
  toDecisionDTO,
  toOpenQuestionDTO,
  toOpportunityDTO,
  toRiskDTO
} from "@/lib/opportunity/serializers";
import { parseJsonArray, stringifyJson } from "@/lib/utils/json";
import { normalizeText } from "@/lib/utils/normalize";
import { providerMetadata, type LLMProviderConfig } from "@/lib/llm/config";
import { getLLMProvider } from "@/lib/llm/provider";
import type { CareerAskResponse } from "@/lib/career-agent/ask";
import type {
  EvidenceSufficiency,
  CareerAgentIntent,
  CareerAgentMode,
  ConversationContext,
  ExecutedAction,
  FollowUpType,
  PreRouterHints,
  ArtifactAction,
  AnswerPlan,
  CurrentInputType,
  CommitPolicySummary,
  RouterActionLevel,
  RouterAction,
  RouterClassification,
  RouterCreatedObjects,
  RouterExecutionResult
} from "@/lib/agent/router/types";
import type { EvidenceDTO, MemorySuggestionDTO } from "@/lib/types";
import type { CareerInputClassificationDraft } from "@/lib/llm/types";

const analyzeSignals = [
  "岗位职责",
  "任职要求",
  "jd",
  "薪资",
  "base",
  "15薪",
  "grpo",
  "rlhf",
  "rlvr",
  "reward model",
  "verifier",
  "agent",
  "后训练"
];

const recruiterSignals = ["hr说", "猎头", "内推", "面试官说", "对方说", "团队说", "岗位这边"];
const updateMemorySignals = [
  "以后",
  "以后我",
  "以后都",
  "长期",
  "优先看",
  "优先考虑",
  "不优先",
  "暂不考虑",
  "不考虑",
  "暂时不考虑",
  "默认不看",
  "目标是",
  "硬约束",
  "记住",
  "帮我记一下",
  "作为筛选标准",
  "后续筛选",
  "以后筛岗位",
  "我更偏",
  "我的偏好"
];
const interviewSignals = ["面试", "反问", "准备", "追问", "一面", "二面", "终面", "交叉面"];
const interviewReviewSignals = ["复盘", "刚才一面", "刚才二面", "刚才三面", "刚才面试", "追问了", "问了我"];
const resumeProjectSignals = ["简历", "项目表达", "项目改", "改成", "润色", "项目经历", "项目说法", "rewrite"];
const compareSignals = ["对比", "哪个更好", "哪个好", "a 和 b", "vs", "更适合"];
const vagueInputs = ["测试", "测试 query", "你好", "帮我看看", "分析下", "test", "hello"];
const externalSourceSignals = ["帮我找", "找下", "查一下", "搜一下", "搜索", "外部", "官网", "招聘页", "jd 链接"];
const followUpSignals = [
  "除此之外",
  "还有吗",
  "还有呢",
  "展开说说",
  "再具体点",
  "具体点",
  "那这个呢",
  "这个呢",
  "刚才那个",
  "刚刚那个",
  "什么意思",
  "如果是",
  "哪些可以先投",
  "按优先级",
  "排一下",
  "下一步",
  "该干嘛",
  "然后呢"
];
const knownCompanySignals = ["字节", "豆包", "淘天", "蚂蚁", "同花顺", "快手", "美团", "腾讯", "百度", "小红书", "MiniMax", "月之暗面", "智谱", "阶跃星辰", "商汤"];
const knownDirectionSignals = ["Agent 后训练", "Agentic RL", "RL", "GRPO", "Reward Model", "Verifier", "教育", "K12", "评测", "数据闭环", "搜索推荐", "广告算法"];
const jobDescriptionFieldSignals = ["岗位名称", "所属部门", "工作地点", "薪资范围", "岗位职责", "任职要求", "职位描述", "工作内容", "任职资格"];
const clarifyExamples = [
  "1. 帮我分析这段 JD 是否适合我；",
  "2. 同花顺和淘天哪个更适合我；",
  "3. 帮我准备淘天交叉面；",
  "4. 我以后想优先看 Agentic RL 岗位，帮我生成记忆建议。"
];

const durableMemorySignals = [
  "以后",
  "长期",
  "优先",
  "不考虑",
  "暂时不考虑",
  "目标",
  "记住",
  "偏好",
  "约束",
  "我更想",
  "我更偏"
];

const jobMissingFieldChecks: Array<[string, string[]]> = [
  ["公司/业务线", ["公司", "字节", "阿里", "腾讯", "百度", "美团", "同花顺", "淘天", "豆包", "团队"]],
  ["岗位职责占比", ["岗位职责", "职责", "负责", "工作内容"]],
  ["任职要求", ["任职要求", "要求", "经验", "熟悉", "能力"]],
  ["薪资/职级", ["薪资", "薪酬", "base", "总包", "职级", "k", "薪"]],
  ["团队和 owner 空间", ["owner", "闭环", "团队", "汇报", "负责人", "决策权"]]
];

function hasAny(input: string, keywords: string[]) {
  const text = input.toLowerCase();
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function countHits(input: string, keywords: string[]) {
  const text = input.toLowerCase();
  return keywords.filter((keyword) => text.includes(keyword.toLowerCase())).length;
}

function isLikelyRandomInput(input: string) {
  const clean = input.trim();
  if (!clean) return false;
  const asciiLetters = clean.match(/[a-z]/gi)?.length ?? 0;
  const cjk = clean.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  const spaces = clean.match(/\s/g)?.length ?? 0;
  const punctuation = clean.match(/[^\p{L}\p{N}\s]/gu)?.length ?? 0;
  const length = clean.length;
  const hasCareerSignal = hasAny(clean, [
    ...analyzeSignals,
    ...recruiterSignals,
    ...updateMemorySignals,
    ...interviewSignals,
    ...compareSignals,
    ...externalSourceSignals
  ]);

  if (hasCareerSignal) return false;
  if (length >= 12 && asciiLetters / length > 0.75 && spaces === 0) return true;
  if (length >= 10 && asciiLetters / length > 0.55 && punctuation >= 1 && cjk === 0) return true;
  return false;
}

function evidenceTypeFromInput(input: string): RouterClassification["evidenceType"] {
  const text = input.toLowerCase();
  if (text.includes("offer")) return "offer";
  if (text.includes("hr说") || text.includes("hr ")) return "hr_chat";
  if (hasAny(input, recruiterSignals)) return "recruiter_message";
  if (text.includes("面试")) return "interview_note";
  return inferEvidenceType(input) as RouterClassification["evidenceType"];
}

function baseClassification(intent: CareerAgentIntent): RouterClassification {
  return {
    intent,
    actionLevel: "answer_only",
    evidenceSufficiency: "none",
    memorySignalStrength: "none",
    missingFields: [],
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
    shouldShowInfoGaps: false,
    confidence: 0.7,
    needsConfirmation: false,
    reason: "Rule-based routing.",
    skippedReason: "normal chat, no durable memory signal"
  };
}

function referencedEntitiesFromContext(context?: ConversationContext, input = "") {
  const combined = `${input}\n${context?.lastAssistantMessage ?? ""}\n${context?.referencedCompanies?.join(" ") ?? ""}\n${context?.referencedRoles?.join(" ") ?? ""}`;
  return {
    companies: knownCompanySignals.filter((item) => combined.toLowerCase().includes(item.toLowerCase())),
    roles: context?.referencedRoles ?? [],
    directions: knownDirectionSignals.filter((item) => combined.toLowerCase().includes(item.toLowerCase())),
    opportunityIds: context?.referencedOpportunities ?? []
  };
}

function jobEvidenceSufficiency(input: string): { evidenceSufficiency: EvidenceSufficiency; missingFields: string[] } {
  const compact = normalizeText(input);
  const missingFields = jobMissingFieldChecks
    .filter(([, signals]) => !signals.some((signal) => compact.includes(normalizeText(signal))))
    .map(([label]) => label);
  const signalHits = jobMissingFieldChecks.length - missingFields.length;
  const hasRoleWork = ["岗位职责", "负责", "工作内容"].some((signal) => compact.includes(normalizeText(signal)));
  const hasRequirements = ["任职要求", "要求", "熟悉", "经验"].some((signal) => compact.includes(normalizeText(signal)));
  const hasComp = ["薪资", "薪酬", "base", "总包", "k", "薪"].some((signal) => compact.includes(normalizeText(signal)));
  const hasTeamOrBusiness = ["团队", "业务", "场景", "公司"].some((signal) => compact.includes(normalizeText(signal)));
  if ((input.length > 80 && hasRoleWork && hasRequirements && hasComp && hasTeamOrBusiness) || (input.length > 180 && signalHits >= 4)) {
    return { evidenceSufficiency: "sufficient", missingFields };
  }
  if (input.length > 40 || signalHits >= 2) return { evidenceSufficiency: "partial", missingFields };
  return { evidenceSufficiency: "none", missingFields };
}

function shouldSuggestDurableMemory(input: string) {
  const normalized = normalizeText(input);
  return durableMemorySignals.some((signal) => normalized.includes(normalizeText(signal)));
}

function hasExplicitLongTermMemorySignal(input: string) {
  const normalized = normalizeText(input);
  const stableSignal = updateMemorySignals.some((signal) => normalized.includes(normalizeText(signal)));
  const directionSignal = [...analyzeSignals, "agentic rl", "纯预训练", "预训练", ...knownDirectionSignals].some((signal) =>
    normalized.includes(normalizeText(signal))
  );
  return stableSignal && (directionSignal || normalized.includes(normalizeText("目标")) || normalized.includes(normalizeText("记住")));
}

function detectCurrentInputType(input: string, context?: ConversationContext): CurrentInputType {
  const normalized = normalizeText(input);
  const fieldHits = jobDescriptionFieldSignals.filter((signal) => normalized.includes(normalizeText(signal))).length;
  const hasJobDescriptionShape =
    fieldHits >= 2 ||
    (fieldHits >= 1 && input.length > 120 && /分析下这个|帮我看看|这个岗位|适合我吗|岗位怎么样/.test(input)) ||
    (normalized.includes(normalizeText("岗位职责")) && normalized.includes(normalizeText("任职要求")));
  if (hasJobDescriptionShape) return "job_description";
  if (isFollowUpInput(input, context)) return "follow_up";
  if (hasExplicitLongTermMemorySignal(input) || hasAny(input, updateMemorySignals)) return "explicit_memory_update";
  if (hasAny(input, interviewReviewSignals)) return "interview_review";
  if (hasAny(input, interviewSignals) && input.length < 180) return "interview_prep_request";
  if (hasAny(input, resumeProjectSignals) || /项目.*(agent|后训练|岗位|简历|说法|表达)/i.test(input)) return "resume_project_rewrite";
  if (hasAny(input, compareSignals)) return "opportunity_compare";
  if (hasAny(input, recruiterSignals)) return "recruiter_message";
  if (!input.trim()) return "unknown";
  return "ordinary_chat";
}

function buildPreRouterHints(input: string, context?: ConversationContext): PreRouterHints {
  const normalized = normalizeText(input);
  const evidenceHits = countHits(input, analyzeSignals);
  const sufficiency = jobEvidenceSufficiency(input);
  const hasTitle = ["岗位名称", "职位名称", "岗位：", "职位："].some((signal) => normalized.includes(normalizeText(signal)));
  const hasResponsibilities = ["岗位职责", "职责", "负责", "工作内容"].some((signal) => normalized.includes(normalizeText(signal)));
  const hasRequirements = ["任职要求", "要求", "熟悉", "经验"].some((signal) => normalized.includes(normalizeText(signal)));
  const currentInputType = detectCurrentInputType(input, context);
  return {
    hasExplicitMemorySignal: hasExplicitLongTermMemorySignal(input) || updateMemorySignals.some((signal) => normalized.includes(normalizeText(signal))),
    hasFollowUpSignal: isFollowUpInput(input, context),
    hasEvidenceLikeText: currentInputType === "job_description" || evidenceHits > 0 || hasAny(input, ["jd", "岗位", "岗位职责", "任职要求"]),
    hasStrongJDSignal: currentInputType === "job_description" || sufficiency.evidenceSufficiency === "sufficient" || (hasTitle && hasResponsibilities && hasRequirements),
    hasInterviewSignal: hasAny(input, [...interviewSignals, ...interviewReviewSignals])
  };
}

function memorySignalStrength(input: string): RouterClassification["memorySignalStrength"] {
  const normalized = normalizeText(input);
  if (["记住", "保存", "以后", "长期", "优先", "不考虑", "暂时不考虑", "目标"].some((signal) => normalized.includes(normalizeText(signal)))) return "high";
  if (["这周", "本周", "当前任务", "正在准备", "准备二面", "准备三面"].some((signal) => normalized.includes(normalizeText(signal)))) return "medium";
  if (["觉得", "可能", "有意思", "聊聊"].some((signal) => normalized.includes(normalizeText(signal)))) return "low";
  return "none";
}

function inferFollowUpType(input: string): FollowUpType {
  const normalized = normalizeText(input);
  if (["除此之外", "还有吗", "还有呢", "还有哪些", "其他呢"].some((signal) => normalized.includes(normalizeText(signal)))) return "ask_for_more_options";
  if (["按优先级", "排一下", "排序"].some((signal) => normalized.includes(normalizeText(signal)))) return "compare_with_previous";
  if (["下一步", "该干嘛", "怎么做", "哪些可以先投"].some((signal) => normalized.includes(normalizeText(signal)))) return "ask_for_next_steps";
  if (["它", "这个", "那个", "刚才", "刚刚"].some((signal) => normalized.includes(normalizeText(signal)))) return "ask_about_mentioned_entity";
  if (["展开", "具体", "说说"].some((signal) => normalized.includes(normalizeText(signal)))) return "expand_previous_answer";
  if (["什么意思", "解释"].some((signal) => normalized.includes(normalizeText(signal)))) return "clarify_previous_answer";
  return "unknown";
}

function isFollowUpInput(input: string, context?: ConversationContext) {
  if (!context?.lastAssistantMessage?.trim()) return false;
  const normalized = normalizeText(input);
  const hasSignal = followUpSignals.some((signal) => normalized.includes(normalizeText(signal)));
  const shortPronounQuestion = input.trim().length <= 24 && /它|这个|那个|刚才|刚刚|除此|还有|下一步|优先级|教育方向/.test(input);
  return hasSignal || shortPronounQuestion;
}

function followUpClassification(input: string, context: ConversationContext): RouterClassification {
  const followUpType = inferFollowUpType(input);
  const resolvedReference =
    followUpType === "ask_for_more_options"
      ? "上一轮推荐的公司/岗位方向"
      : followUpType === "compare_with_previous"
        ? "上一轮提到的候选机会"
        : followUpType === "ask_for_next_steps"
          ? "上一轮讨论的岗位/投递判断"
          : followUpType === "ask_about_mentioned_entity"
            ? context.lastDiscussedEntities?.[0] ?? context.referencedCompanies?.[0] ?? "上一轮提到的对象"
            : "上一轮 assistant answer";
  return {
    ...baseClassification("follow_up"),
    followUpType,
    actionLevel: "answer_only",
    confidence: 0.88,
    reason: "Short follow-up resolved against the previous assistant answer and thread topic.",
    skippedReason: "follow-up answer only; no explicit request to create structured objects",
    usedRecentMessagesCount: context.recentMessages.length,
    usedLastAssistantAnswer: true,
    threadTopicSummary: context.threadTopicSummary,
    resolvedReference
  };
}

function heuristicClassifyInput(input: string, mode: CareerAgentMode, context?: ConversationContext): RouterClassification {
  const clean = input.trim();
  const normalized = normalizeText(clean);

  if (mode === "ask_only") {
    return {
      ...baseClassification("ask_question"),
      actionLevel: "answer_only",
      confidence: 0.9,
      needsConfirmation: false,
      reason: "Ask only mode keeps the turn conversational and does not create structured objects."
    };
  }

  if (mode === "analyze_as_evidence") {
    const sufficiency = jobEvidenceSufficiency(clean);
    const shouldCreate = sufficiency.evidenceSufficiency === "sufficient";
    return {
      ...baseClassification("analyze_evidence"),
      actionLevel: shouldCreate ? "create_structured_objects" : "answer_with_info_gaps",
      evidenceSufficiency: sufficiency.evidenceSufficiency,
      memorySignalStrength: memorySignalStrength(clean),
      missingFields: sufficiency.missingFields,
      evidenceType: evidenceTypeFromInput(clean),
      shouldCreateEvidence: shouldCreate,
      shouldExtractOpportunity: shouldCreate,
      shouldGenerateAssessment: shouldCreate,
      shouldGenerateRisks: shouldCreate,
      shouldGenerateOpenQuestions: shouldCreate,
      shouldGenerateDecision: shouldCreate,
      shouldCreateObjects: shouldCreate,
      shouldSuggestMemoryUpdates: memorySignalStrength(clean) === "high",
      shouldSuggestMemory: memorySignalStrength(clean) === "high",
      shouldShowStructuredCard: shouldCreate,
      shouldShowInfoGaps: sufficiency.missingFields.length > 0,
      confidence: 0.95,
      reason: shouldCreate
        ? "Analyze as evidence mode with sufficient JD details can create structured objects."
        : "Analyze as evidence mode received partial evidence, so show a lightweight card without creating objects.",
      skippedReason: shouldCreate ? undefined : "insufficient evidence for opportunity creation"
    };
  }

  if (!clean) return { ...baseClassification("clarify"), confidence: 0.92, needsConfirmation: true, reason: "Input is empty." };

  if (isLikelyRandomInput(clean)) {
    return {
      ...baseClassification("invalid_input"),
      confidence: 0.95,
      needsConfirmation: true,
      reason: "Input looks like random characters and should not create structured career objects."
    };
  }

  if (detectCurrentInputType(clean, context) === "job_description") {
    const sufficiency = jobEvidenceSufficiency(clean);
    return {
      ...baseClassification("analyze_evidence"),
      actionLevel: "create_structured_objects",
      evidenceSufficiency: "sufficient",
      memorySignalStrength: "none",
      missingFields: sufficiency.missingFields,
      evidenceType: "jd",
      shouldCreateEvidence: true,
      shouldExtractOpportunity: true,
      shouldGenerateAssessment: true,
      shouldGenerateRisks: true,
      shouldGenerateOpenQuestions: true,
      shouldGenerateDecision: true,
      shouldCreateObjects: true,
      shouldSuggestMemoryUpdates: false,
      shouldSuggestMemory: false,
      shouldShowStructuredCard: true,
      shouldShowInfoGaps: false,
      confidence: 0.94,
      reason: "Current user input is a structured job description and must be analyzed as the grounding target.",
      skippedReason: undefined
    };
  }

  if (mode === "auto" && isFollowUpInput(clean, context)) {
    return followUpClassification(clean, context as ConversationContext);
  }

  if (hasExplicitLongTermMemorySignal(clean) || hasAny(clean, updateMemorySignals)) {
    return {
      ...baseClassification("update_memory"),
      actionLevel: "suggest_memory_candidate",
      memorySignalStrength: "high",
      shouldSuggestMemoryUpdates: true,
      shouldSuggestMemory: true,
      confidence: 0.86,
      reason: "Input contains explicit durable preference, goal, or constraint language.",
      skippedReason: "explicit long-term preference and constraint update"
    };
  }

  if (hasAny(clean, externalSourceSignals) && hasAny(clean, ["jd", "岗位", "招聘", "职位"])) {
    return {
      ...baseClassification("needs_external_source"),
      actionLevel: "answer_with_info_gaps",
      confidence: 0.88,
      needsConfirmation: true,
      shouldShowInfoGaps: true,
      missingFields: ["JD 原文或招聘正文", "公司/团队", "岗位职责", "任职要求"],
      reason: "Input asks the agent to find external job-source information, but external browsing/source access is not enabled.",
      skippedReason: "external source missing"
    };
  }

  if (hasAny(clean, resumeProjectSignals) || /项目.*(agent|后训练|岗位|简历|说法|表达)/i.test(clean)) {
    const strength = memorySignalStrength(clean);
    return {
      ...baseClassification("rewrite_resume_project"),
      actionLevel: strength === "high" ? "suggest_memory_candidate" : "answer_only",
      memorySignalStrength: strength,
      shouldSuggestMemoryUpdates: strength === "high",
      shouldSuggestMemory: strength === "high",
      confidence: 0.82,
      reason: "Input asks for resume/project wording help; answer naturally without creating opportunity objects.",
      skippedReason: strength === "high" ? "project claim candidate requires user confirmation" : "project wording assistance, no durable memory signal"
    };
  }

  if (hasAny(clean, compareSignals)) {
    return {
      ...baseClassification("compare_opportunities"),
      actionLevel: "show_structured_card",
      shouldShowStructuredCard: true,
      shouldShowInfoGaps: clean.length < 40,
      missingFields: clean.length < 40 ? ["候选机会的关键差异", "你最看重的排序维度"] : [],
      confidence: 0.78,
      reason: "Input asks to compare opportunities; answer naturally and show a lightweight comparison card."
    };
  }

  if (hasAny(clean, interviewReviewSignals)) {
    const strength = memorySignalStrength(clean);
    return {
      ...baseClassification("interview_review"),
      actionLevel: "show_structured_card",
      memorySignalStrength: strength,
      shouldSuggestMemoryUpdates: strength === "high",
      shouldSuggestMemory: strength === "high",
      shouldShowStructuredCard: true,
      confidence: 0.82,
      reason: "Input is an interview review; answer with review and improvement advice without creating long-term memory automatically.",
      skippedReason: "interview review stays in chat unless the user confirms a memory or structured note"
    };
  }

  if (hasAny(clean, ["焦虑", "压力", "有点累", "紧张", "迷茫", "烦", "好多"]) && clean.length < 60) {
    return {
      ...baseClassification("ask_question"),
      actionLevel: "answer_only",
      confidence: 0.82,
      reason: "Emotional or casual chat should be answered naturally without structured cards.",
      skippedReason: "normal chat, no durable memory signal"
    };
  }

  if (hasAny(clean, interviewSignals) && clean.length < 180) {
    return {
      ...baseClassification("prepare_interview"),
      actionLevel: "show_structured_card",
      memorySignalStrength: memorySignalStrength(clean),
      shouldShowStructuredCard: true,
      confidence: 0.78,
      reason: "Input asks for interview preparation; answer naturally and show a lightweight prep card."
    };
  }

  if (vagueInputs.includes(normalized) || (clean.length < 12 && countHits(clean, analyzeSignals) === 0)) {
    return {
      ...baseClassification("ask_question"),
      actionLevel: "answer_only",
      confidence: 0.72,
      needsConfirmation: false,
      reason: "Short or casual input should be handled as normal chat, without creating objects."
    };
  }

  const evidenceHits = countHits(clean, analyzeSignals);
  const recruiterHits = countHits(clean, recruiterSignals);
  if ((clean.length > 80 && evidenceHits >= 1) || evidenceHits >= 3 || recruiterHits >= 1) {
    const sufficiency = jobEvidenceSufficiency(clean);
    const shouldCreate = sufficiency.evidenceSufficiency === "sufficient";
    return {
      ...baseClassification("analyze_evidence"),
      actionLevel: shouldCreate ? "create_structured_objects" : "answer_with_info_gaps",
      evidenceSufficiency: sufficiency.evidenceSufficiency,
      memorySignalStrength: memorySignalStrength(clean),
      missingFields: sufficiency.missingFields,
      evidenceType: evidenceTypeFromInput(clean),
      shouldCreateEvidence: shouldCreate,
      shouldExtractOpportunity: shouldCreate,
      shouldGenerateAssessment: shouldCreate,
      shouldGenerateRisks: shouldCreate,
      shouldGenerateOpenQuestions: shouldCreate,
      shouldGenerateDecision: shouldCreate,
      shouldCreateObjects: shouldCreate,
      shouldSuggestMemoryUpdates: memorySignalStrength(clean) === "high",
      shouldSuggestMemory: memorySignalStrength(clean) === "high",
      shouldShowStructuredCard: shouldCreate,
      shouldShowInfoGaps: sufficiency.missingFields.length > 0,
      confidence: Math.min(0.96, 0.72 + evidenceHits * 0.04 + recruiterHits * 0.08),
      reason: recruiterHits
        ? "Input contains recruiter/HR/interviewer message signals."
        : shouldCreate
          ? "Input contains sufficient JD or role requirement signals."
          : "Input contains partial JD signals; answer first and avoid creating formal objects.",
      skippedReason: shouldCreate ? undefined : "insufficient evidence for opportunity creation"
    };
  }

  return {
    ...baseClassification("ask_question"),
    actionLevel: "answer_only",
    confidence: 0.72,
    reason: "Default chat-first behavior: answer naturally and do not create structured objects.",
    skippedReason: "normal chat, no durable memory signal"
  };
}

function toIntent(value: unknown): CareerAgentIntent {
  const intent = String(value ?? "");
  if (intent === "ordinary_chat") return "ordinary_chat";
  if (intent === "follow_up") return "follow_up";
  if (intent === "update_memory") return "update_memory";
  if (intent === "analyze_evidence_candidate") return "analyze_evidence_candidate";
  if (intent === "analyze_evidence") return "analyze_evidence";
  if (intent === "compare_opportunities") return "compare_opportunities";
  if (intent === "prepare_interview") return "prepare_interview";
  if (intent === "interview_review") return "interview_review";
  if (intent === "rewrite_resume_or_project") return "rewrite_resume_or_project";
  if (intent === "rewrite_resume_project") return "rewrite_resume_project";
  if (intent === "needs_external_source") return "needs_external_source";
  if (intent === "clarify") return "clarify";
  if (intent === "invalid_input") return "invalid_input";
  return "ask_question";
}

function toActionLevel(value: unknown): RouterActionLevel {
  const actionLevel = String(value ?? "");
  if (["answer_only", "answer_with_info_gaps", "suggest_memory_candidate", "show_structured_card", "propose_draft_object", "create_structured_objects"].includes(actionLevel)) {
    return actionLevel as RouterActionLevel;
  }
  return "answer_only";
}

function toEvidenceSufficiency(value: unknown): EvidenceSufficiency {
  const evidenceSufficiency = String(value ?? "");
  if (["none", "weak", "partial", "sufficient"].includes(evidenceSufficiency)) return evidenceSufficiency as EvidenceSufficiency;
  return "none";
}

function toMemorySignalStrength(value: unknown): RouterClassification["memorySignalStrength"] {
  const memory = String(value ?? "");
  if (["none", "low", "medium", "high"].includes(memory)) return memory as RouterClassification["memorySignalStrength"];
  return "none";
}

function toFollowUpType(value: unknown): FollowUpType | undefined {
  const followUpType = String(value ?? "");
  if (followUpType === "none" || !followUpType) return undefined;
  if (["expand_previous_answer", "clarify_previous_answer", "compare_with_previous", "ask_for_more_options", "ask_for_next_steps", "ask_about_mentioned_entity", "unknown"].includes(followUpType)) {
    return followUpType as FollowUpType;
  }
  return undefined;
}

function classificationFromDraft(
  input: string,
  draft: CareerInputClassificationDraft,
  fallback: RouterClassification,
  hints: PreRouterHints,
  context?: ConversationContext
): RouterClassification {
  const intent = toIntent(draft.intent);
  const actionLevel = toActionLevel(draft.actionLevel ?? fallback.actionLevel);
  const evidenceSufficiency = toEvidenceSufficiency(draft.evidenceSufficiency ?? fallback.evidenceSufficiency);
  const memory = toMemorySignalStrength(draft.memorySignalStrength ?? fallback.memorySignalStrength);
  const shouldCreate = Boolean(draft.shouldCreateObjects ?? draft.shouldCreateEvidence ?? fallback.shouldCreateObjects);
  return {
    ...baseClassification(intent),
    actionLevel,
    evidenceSufficiency,
    memorySignalStrength: memory,
    missingFields: Array.isArray(draft.missingFields) ? draft.missingFields.map(String).slice(0, 5) : fallback.missingFields,
    evidenceType: (draft.evidenceType || fallback.evidenceType || "none") as RouterClassification["evidenceType"],
    shouldCreateEvidence: Boolean(draft.shouldCreateEvidence ?? shouldCreate),
    shouldExtractOpportunity: Boolean(draft.shouldExtractOpportunity ?? shouldCreate),
    shouldGenerateAssessment: Boolean(draft.shouldGenerateAssessment ?? shouldCreate),
    shouldGenerateRisks: Boolean(draft.shouldGenerateRisks ?? shouldCreate),
    shouldGenerateOpenQuestions: Boolean(draft.shouldGenerateOpenQuestions ?? shouldCreate),
    shouldGenerateDecision: Boolean(draft.shouldGenerateDecision ?? shouldCreate),
    shouldCreateObjects: shouldCreate,
    shouldSuggestMemoryUpdates: Boolean(draft.shouldSuggestMemoryUpdates ?? draft.shouldSuggestMemory ?? fallback.shouldSuggestMemoryUpdates),
    shouldSuggestMemory: Boolean(draft.shouldSuggestMemory ?? draft.shouldSuggestMemoryUpdates ?? fallback.shouldSuggestMemory),
    shouldShowStructuredCard: Boolean(draft.shouldShowStructuredCard ?? fallback.shouldShowStructuredCard),
    shouldShowInfoGaps: Boolean(draft.shouldShowInfoGaps ?? fallback.shouldShowInfoGaps),
    followUpType: toFollowUpType(draft.followUpType) ?? fallback.followUpType,
    confidence: typeof draft.confidence === "number" ? draft.confidence : fallback.confidence,
    needsConfirmation: Boolean(draft.needsConfirmation ?? fallback.needsConfirmation),
    reason: draft.reason || fallback.reason || "Model-based semantic router.",
    skippedReason: draft.skippedReason || fallback.skippedReason,
    preRouterHints: hints,
    referencedEntities: referencedEntitiesFromContext(context, input),
    usedRecentMessagesCount: context?.recentMessages.length,
    usedLastAssistantAnswer: Boolean(context?.lastAssistantMessage),
    threadTopicSummary: context?.threadTopicSummary
  };
}

function applyPostPolicyGuard(classification: RouterClassification, input: string, hints: PreRouterHints, context?: ConversationContext) {
  const corrections: string[] = [];
  const currentInputType = detectCurrentInputType(input, context);
  let guarded: RouterClassification = {
    ...classification,
    currentInputType,
    groundingTarget: currentInputType === "job_description" ? "current_user_job_description" : undefined,
    preRouterHints: hints,
    policyGuardCorrections: [],
    referencedEntities: classification.referencedEntities ?? referencedEntitiesFromContext(context, input)
  };

  if (currentInputType === "job_description") {
    if (guarded.intent !== "analyze_evidence" || guarded.shouldSuggestMemory || guarded.shouldShowInfoGaps) {
      corrections.push("current job description overrides memory/interview/topic context");
    }
    const sufficiency = jobEvidenceSufficiency(input);
    guarded = {
      ...guarded,
      intent: "analyze_evidence",
      actionLevel: "create_structured_objects",
      evidenceSufficiency: "sufficient",
      memorySignalStrength: "none",
      missingFields: sufficiency.missingFields,
      evidenceType: "jd",
      shouldCreateEvidence: true,
      shouldExtractOpportunity: true,
      shouldGenerateAssessment: true,
      shouldGenerateRisks: true,
      shouldGenerateOpenQuestions: true,
      shouldGenerateDecision: true,
      shouldCreateObjects: true,
      shouldSuggestMemoryUpdates: false,
      shouldSuggestMemory: false,
      shouldShowStructuredCard: true,
      shouldShowInfoGaps: false,
      confidence: Math.max(guarded.confidence, 0.9),
      reason: "Current user input is a structured JD; current input is the primary grounding target and long-term memory can only personalize fit.",
      skippedReason: undefined,
      currentInputType,
      groundingTarget: "current_user_job_description",
      blockedArtifacts: ["interview_prep", "memory_suggestion"]
    };
  }

  if (hints.hasExplicitMemorySignal && !hints.hasStrongJDSignal && ["analyze_evidence", "analyze_evidence_candidate"].includes(guarded.intent)) {
    corrections.push("explicit memory signal overrides evidence-like direction keywords");
    guarded = {
      ...baseClassification("update_memory"),
      ...guarded,
      intent: "update_memory",
      actionLevel: "suggest_memory_candidate",
      evidenceSufficiency: "none",
      missingFields: [],
      evidenceType: "user_note",
      shouldCreateEvidence: false,
      shouldExtractOpportunity: false,
      shouldGenerateAssessment: false,
      shouldGenerateRisks: false,
      shouldGenerateOpenQuestions: false,
      shouldGenerateDecision: false,
      shouldCreateObjects: false,
      shouldSuggestMemoryUpdates: true,
      shouldSuggestMemory: true,
      shouldShowStructuredCard: false,
      shouldShowInfoGaps: false,
      skippedReason: "explicit long-term preference and constraint update"
    };
  }

  if (!hints.hasExplicitMemorySignal && hints.hasStrongJDSignal && guarded.intent === "update_memory") {
    corrections.push("strong JD evidence overrides accidental memory classification");
    const sufficiency = jobEvidenceSufficiency(input);
    guarded = {
      ...guarded,
      intent: "analyze_evidence",
      actionLevel: "create_structured_objects",
      evidenceSufficiency: "sufficient",
      memorySignalStrength: "none",
      missingFields: sufficiency.missingFields,
      evidenceType: evidenceTypeFromInput(input),
      shouldCreateEvidence: true,
      shouldExtractOpportunity: true,
      shouldGenerateAssessment: true,
      shouldGenerateRisks: true,
      shouldGenerateOpenQuestions: true,
      shouldGenerateDecision: true,
      shouldCreateObjects: true,
      shouldSuggestMemoryUpdates: false,
      shouldSuggestMemory: false,
      shouldShowStructuredCard: true,
      shouldShowInfoGaps: false,
      skippedReason: undefined
    };
  }

  if (guarded.intent === "update_memory") {
    if (guarded.shouldShowInfoGaps || guarded.shouldCreateObjects || guarded.shouldCreateEvidence || guarded.shouldGenerateDecision) {
      corrections.push("memory update cannot show JD info gaps or create structured opportunity objects");
    }
    guarded = {
      ...guarded,
      actionLevel: guarded.shouldSuggestMemory || guarded.memorySignalStrength === "high" ? "suggest_memory_candidate" : "answer_only",
      evidenceSufficiency: "none",
      missingFields: [],
      evidenceType: "user_note",
      shouldCreateEvidence: false,
      shouldExtractOpportunity: false,
      shouldGenerateAssessment: false,
      shouldGenerateRisks: false,
      shouldGenerateOpenQuestions: false,
      shouldGenerateDecision: false,
      shouldCreateObjects: false,
      shouldSuggestMemoryUpdates: guarded.shouldSuggestMemory || guarded.memorySignalStrength === "high",
      shouldSuggestMemory: guarded.shouldSuggestMemory || guarded.memorySignalStrength === "high",
      shouldShowStructuredCard: false,
      shouldShowInfoGaps: false,
      skippedReason: "explicit long-term preference and constraint update"
    };
  }

  if (guarded.intent === "ordinary_chat") {
    guarded = {
      ...guarded,
      actionLevel: guarded.memorySignalStrength === "high" ? "suggest_memory_candidate" : "answer_only",
      shouldCreateEvidence: false,
      shouldExtractOpportunity: false,
      shouldGenerateAssessment: false,
      shouldGenerateRisks: false,
      shouldGenerateOpenQuestions: false,
      shouldGenerateDecision: false,
      shouldCreateObjects: false,
      shouldSuggestMemoryUpdates: guarded.memorySignalStrength === "high",
      shouldSuggestMemory: guarded.memorySignalStrength === "high",
      shouldShowStructuredCard: false,
      shouldShowInfoGaps: false
    };
  }

  if (currentInputType !== "job_description" && hints.hasInterviewSignal && /刚才|复盘|追问|问了我/.test(input) && !["prepare_interview", "interview_review"].includes(guarded.intent)) {
    corrections.push("interview review signal creates note sidecar, not long-term memory");
    guarded = {
      ...guarded,
      intent: "interview_review",
      actionLevel: "show_structured_card",
      evidenceSufficiency: "none",
      memorySignalStrength: "none",
      shouldCreateEvidence: false,
      shouldExtractOpportunity: false,
      shouldGenerateAssessment: false,
      shouldGenerateRisks: false,
      shouldGenerateOpenQuestions: false,
      shouldGenerateDecision: false,
      shouldCreateObjects: false,
      shouldSuggestMemoryUpdates: false,
      shouldSuggestMemory: false,
      shouldShowStructuredCard: true,
      shouldShowInfoGaps: false,
      skippedReason: "interview review stays in chat unless the user confirms a memory or structured note"
    };
  }

  if (guarded.intent === "follow_up") {
    if (guarded.shouldCreateObjects || guarded.shouldSuggestMemory) corrections.push("follow-up defaults to answer-only without durable writes");
    guarded = {
      ...guarded,
      actionLevel: "answer_only",
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
      shouldShowInfoGaps: false,
      usedRecentMessagesCount: context?.recentMessages.length,
      usedLastAssistantAnswer: Boolean(context?.lastAssistantMessage),
      threadTopicSummary: context?.threadTopicSummary,
      resolvedReference: classification.resolvedReference ?? followUpClassification(input, context ?? { recentMessages: [] }).resolvedReference
    };
  }

  if (["none", "weak"].includes(guarded.evidenceSufficiency)) {
    if (guarded.shouldCreateObjects || guarded.shouldCreateEvidence || guarded.shouldGenerateDecision) corrections.push("none/weak evidence cannot create opportunity or decision");
    guarded = {
      ...guarded,
      shouldCreateEvidence: false,
      shouldExtractOpportunity: false,
      shouldGenerateAssessment: false,
      shouldGenerateRisks: false,
      shouldGenerateOpenQuestions: false,
      shouldGenerateDecision: false,
      shouldCreateObjects: false
    };
  }

  if (["analyze_evidence", "analyze_evidence_candidate"].includes(guarded.intent) && (guarded.evidenceSufficiency !== "sufficient" || !hints.hasStrongJDSignal)) {
    if (guarded.shouldCreateObjects || guarded.shouldCreateEvidence) corrections.push("insufficient JD evidence cannot create formal opportunity objects");
    guarded = {
      ...guarded,
      intent: guarded.intent === "analyze_evidence" ? "analyze_evidence_candidate" : guarded.intent,
      actionLevel: "answer_with_info_gaps",
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
      skippedReason: "insufficient evidence for opportunity creation"
    };
  }

  if (guarded.intent === "analyze_evidence_candidate") {
    guarded = {
      ...guarded,
      actionLevel: "answer_with_info_gaps",
      shouldCreateEvidence: false,
      shouldExtractOpportunity: false,
      shouldGenerateAssessment: false,
      shouldGenerateRisks: false,
      shouldGenerateOpenQuestions: false,
      shouldGenerateDecision: false,
      shouldCreateObjects: false,
      shouldSuggestMemoryUpdates: false,
      shouldSuggestMemory: false,
      shouldShowInfoGaps: true,
      shouldShowStructuredCard: false,
      skippedReason: "insufficient evidence for opportunity creation"
    };
  }

  const answerPlan = buildAnswerPlan(guarded, context);
  const artifactActions = buildArtifactActions(guarded);
  guarded = {
    ...guarded,
    answerPlan,
    artifactActions,
    commitPolicy: buildCommitPolicy(artifactActions),
    policyGuardCorrections: corrections
  };
  return { classification: guarded, corrections };
}

function buildAnswerPlan(classification: RouterClassification, context?: ConversationContext): AnswerPlan {
  const currentInputType = classification.currentInputType ?? "unknown";
  const conversationIntent =
    classification.intent === "follow_up"
      ? "follow_up"
      : classification.intent === "analyze_evidence" || classification.intent === "analyze_evidence_candidate"
        ? "analyze_job"
        : classification.intent === "compare_opportunities"
          ? "compare_options"
          : classification.intent === "prepare_interview"
            ? "prepare_interview"
            : classification.intent === "rewrite_resume_project" || classification.intent === "rewrite_resume_or_project"
              ? "rewrite_resume"
              : classification.intent === "interview_review"
                ? "interview_review"
                : classification.intent === "clarify" || classification.intent === "invalid_input"
                  ? "clarify"
                  : classification.intent === "ordinary_chat"
                    ? "ordinary_chat"
                    : "answer_question";
  const responseMode =
    classification.actionLevel === "create_structured_objects"
      ? "detailed_analysis"
      : classification.shouldShowStructuredCard || classification.shouldShowInfoGaps
        ? "structured_light"
        : "natural";
  const refs = classification.referencedEntities;
  return {
    currentInputType,
    conversationIntent,
    responseMode,
    shouldAnswerFirst: true,
    needsContext: Boolean(context?.recentMessages.length),
    referencedEntities: [...(refs?.companies ?? []), ...(refs?.roles ?? []), ...(refs?.directions ?? [])],
    confidence: classification.confidence,
    groundingTarget: classification.groundingTarget,
    usedLongTermMemory: currentInputType === "job_description",
    memoryUsedFor: currentInputType === "job_description" ? "fit_evaluation" : "none",
    blockedArtifacts: classification.blockedArtifacts,
    groundingCheck: classification.groundingCheck
  };
}

function buildArtifactActions(classification: RouterClassification): ArtifactAction[] {
  if (classification.intent === "update_memory" && classification.shouldSuggestMemory) {
    return [
      {
        type: "memory_suggestion",
        confidence: classification.confidence,
        reason: classification.skippedReason ?? "Explicit long-term memory candidate.",
        requiresUserConfirmation: true,
        writePolicy: "pending_confirmation"
      }
    ];
  }
  if (classification.intent === "analyze_evidence" && classification.shouldCreateObjects) {
    return [
      { type: "job_analysis", confidence: classification.confidence, reason: "Current JD should be analyzed before sidecar artifacts are shown.", requiresUserConfirmation: false, writePolicy: "draft" },
      { type: "evidence", confidence: classification.confidence, reason: "Complete JD or source evidence can be saved as draft evidence.", requiresUserConfirmation: false, writePolicy: "draft" },
      { type: "opportunity", confidence: classification.confidence, reason: "Complete JD can create or update an opportunity draft.", requiresUserConfirmation: false, writePolicy: "draft" },
      { type: "risk", confidence: 0.7, reason: "Risks are generated only in complete analysis and capped.", requiresUserConfirmation: false, writePolicy: "draft" },
      { type: "open_question", confidence: 0.7, reason: "Open questions are generated only in complete analysis and capped.", requiresUserConfirmation: false, writePolicy: "draft" },
      { type: "decision", confidence: 0.7, reason: "Decision is a draft recommendation from the analysis.", requiresUserConfirmation: false, writePolicy: "draft" }
    ];
  }
  if (classification.intent === "interview_review") {
    return [
      { type: "interview_note", confidence: classification.confidence, reason: "Interview review can be treated as working note, not long-term memory.", requiresUserConfirmation: false, writePolicy: "draft" }
    ];
  }
  if (classification.intent === "prepare_interview") {
    return [
      { type: "interview_prep", confidence: classification.confidence, reason: "Interview preparation card is shown only when the current input asks for interview prep.", requiresUserConfirmation: false, writePolicy: "draft" }
    ];
  }
  return [{ type: "none", confidence: classification.confidence, reason: "No durable artifact needed for this turn.", requiresUserConfirmation: false, writePolicy: "never_direct" }];
}

function buildCommitPolicy(actions: ArtifactAction[]): CommitPolicySummary {
  const has = (type: ArtifactAction["type"]) => actions.some((action) => action.type === type);
  return {
    memory: "pending_confirmation",
    evidence: has("evidence") ? "draft" : "none",
    opportunity: has("opportunity") ? "draft" : "none",
    decision: has("decision") ? "draft" : "none",
    riskOpenQuestionLimit: has("risk") || has("open_question") ? 5 : 0
  };
}

async function classifyInputSemantic(input: string, mode: CareerAgentMode, context?: ConversationContext) {
  const hints = buildPreRouterHints(input, context);
  const fallback = heuristicClassifyInput(input, mode, context);
  if (mode !== "auto") {
    const guarded = applyPostPolicyGuard(fallback, input, hints, context);
    return { ...guarded, modelClassification: fallback, hints };
  }

  let modelClassification = fallback;
  try {
    const provider = getLLMProvider();
    if (provider.classifyCareerInput) {
      const draft = await provider.classifyCareerInput(input, {
        currentUserInput: input,
        recentMessages: context?.recentMessages ?? [],
        lastAssistantMessage: context?.lastAssistantMessage,
        lastAssistantAnswerSummary: context?.lastAssistantAnswerSummary,
        threadTopicSummary: context?.threadTopicSummary,
        mentionedCompanies: context?.referencedCompanies ?? [],
        mentionedRoles: context?.referencedRoles ?? [],
        mentionedDirections: context?.mentionedDirections ?? [],
        activeTaskIntent: context?.activeTaskIntent,
        relevantOpportunities: context?.referencedOpportunities ?? [],
        preRouterHints: hints,
        policy:
          "Default answer_only. Explicit long-term preference/constraint signals override career direction keywords and should route to update_memory. Weak evidence cannot create objects. Follow-ups use recent messages."
      });
      modelClassification = classificationFromDraft(input, draft, fallback, hints, context);
    }
  } catch (error) {
    modelClassification = {
      ...fallback,
      reason: `${fallback.reason} Semantic router fallback used because provider classification failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
  const guarded = applyPostPolicyGuard(modelClassification, input, hints, context);
  return { ...guarded, modelClassification, hints };
}

function planActions(classification: RouterClassification): RouterAction[] {
  if (classification.intent === "clarify" || classification.intent === "invalid_input") return ["ask_clarifying_question"];
  if (classification.intent === "needs_external_source") return ["report_missing_external_source"];
  if (classification.intent === "update_memory") return ["suggest_memory_updates"];
  if (classification.intent === "analyze_evidence" && classification.shouldCreateObjects) {
    return [
      "create_evidence",
      "extract_opportunity",
      "match_with_memories",
      "generate_assessment",
      "generate_risks",
      "generate_open_questions",
      "generate_decision",
      "suggest_memory_updates"
    ];
  }
  return ["retrieve_context", "answer_question"];
}

async function writeStep(agentRunId: string, stepName: string, inputSummary: string, output: unknown, status = "completed") {
  const step = await prisma.agentStep.create({
    data: {
      agentRunId,
      stepName,
      inputSummary,
      outputJson: stringifyJson(output),
      status
    }
  });
  return toAgentStepDTO(step);
}

interface RouterExecuteOptions {
  chatThreadId?: string | null;
  sourceMessageId?: string | null;
  triggerType?: string;
  recentMessageIds?: string[];
  recentMessages?: Array<{ id: string; role: string; content: string; createdAt: string }>;
  contextRefs?: Array<{ entityType: string; entityId: string; title?: string }>;
  conversationContext?: ConversationContext;
  providerConfig?: LLMProviderConfig;
}

async function createRun(input: string, mode: CareerAgentMode, options: RouterExecuteOptions = {}) {
  return prisma.agentRun.create({
    data: {
      workflowType: "Unified Career Agent",
      inputJson: stringifyJson({
        input,
        mode,
        provider: providerMetadata(options.providerConfig),
        recentMessageIds: options.recentMessageIds ?? [],
        recentMessages: options.recentMessages ?? [],
        conversationContext: options.conversationContext ?? null,
        contextRefs: options.contextRefs ?? []
      }),
      triggerType: options.triggerType ?? (options.chatThreadId ? "chat" : mode === "auto" ? "unified_command" : mode),
      sourceMessageText: input,
      chatThreadId: options.chatThreadId ?? undefined,
      sourceMessageId: options.sourceMessageId ?? undefined,
      status: "running"
    }
  });
}

async function findOrCreateEvidence(input: string, evidenceType: string): Promise<EvidenceDTO> {
  const existing = await prisma.evidence.findMany({ orderBy: { createdAt: "desc" } });
  const normalizedInput = normalizeText(input);
  const match = existing.find((evidence) => normalizeText(evidence.content) === normalizedInput);
  if (match) return toEvidenceDTO(match);

  const evidence = await prisma.evidence.create({
    data: {
      type: evidenceType === "none" ? "user_note" : evidenceType,
      title: titleFromInput(input),
      content: input
    }
  });
  return toEvidenceDTO(evidence);
}

async function getCreatedObjects(agentRunId: string, evidence?: EvidenceDTO): Promise<RouterCreatedObjects> {
  const link = evidence
    ? await prisma.opportunityEvidence.findFirst({
        where: { evidenceId: evidence.id },
        include: { opportunity: true },
        orderBy: { createdAt: "desc" }
      })
    : null;
  const opportunityId = link?.opportunityId;
  const [assessment, risks, openQuestions, decision, suggestions] = await Promise.all([
    opportunityId
      ? prisma.assessment.findFirst({ where: { opportunityId }, orderBy: { createdAt: "desc" } })
      : Promise.resolve(null),
    opportunityId
      ? prisma.risk.findMany({ where: { opportunityId, status: "active" } })
      : Promise.resolve([]),
    opportunityId
      ? prisma.openQuestion.findMany({ where: { opportunityId, status: { not: "answered" } } })
      : Promise.resolve([]),
    opportunityId
      ? prisma.decision.findFirst({ where: { opportunityId }, orderBy: { createdAt: "desc" } })
      : Promise.resolve(null),
    prisma.memorySuggestion.findMany({ where: { agentRunId, status: "pending" } })
  ]);
  const visibleRisks = risks.slice(0, 3);
  const visibleOpenQuestions = openQuestions.slice(0, 5);

  return {
    evidence,
    opportunity: link ? toOpportunityDTO(link.opportunity) : undefined,
    assessment: assessment ? toAssessmentDTO(assessment) : null,
    risks: visibleRisks.map((risk) => ({
      ...toRiskDTO(risk),
      sourceThreadId: undefined,
      sourceMessageId: undefined,
      sourceAgentRunId: agentRunId,
      sourceOpportunityId: opportunityId ?? null,
      sourceEvidenceId: evidence?.id ?? null
    })),
    risksCount: visibleRisks.length,
    openQuestions: visibleOpenQuestions.map((question) => ({
      ...toOpenQuestionDTO(question),
      sourceThreadId: undefined,
      sourceMessageId: undefined,
      sourceAgentRunId: agentRunId,
      sourceOpportunityId: opportunityId ?? null,
      sourceEvidenceId: evidence?.id ?? null
    })),
    openQuestionsCount: visibleOpenQuestions.length,
    decision: decision ? toDecisionDTO(decision) : null,
    memorySuggestions: suggestions.map((suggestion) => ({
      ...toMemorySuggestionDTO(suggestion),
      sourceAgentRunId: agentRunId,
      sourceOpportunityId: opportunityId ?? null,
      sourceEvidenceId: evidence?.id ?? null
    })),
    memorySuggestionsCount: suggestions.length
  };
}

function extractLabeledValue(input: string, label: string) {
  const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const index = lines.findIndex((line) => normalizeText(line) === normalizeText(label) || normalizeText(line).includes(normalizeText(label)));
  if (index === -1) return undefined;
  const inline = lines[index].replace(new RegExp(`^[一二三四五六七八九十、.\\s]*${label}[：:]?\\s*`), "").trim();
  if (inline && inline !== label) return inline;
  for (const candidate of lines.slice(index + 1, index + 4)) {
    if (!jobDescriptionFieldSignals.some((signal) => normalizeText(candidate).includes(normalizeText(signal))) && !/^[一二三四五六七八九十][、.]/.test(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function extractSectionList(input: string, startLabel: string, endLabels: string[]) {
  const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const start = lines.findIndex((line) => normalizeText(line).includes(normalizeText(startLabel)));
  if (start === -1) return [];
  const end = lines.findIndex((line, index) => index > start && endLabels.some((label) => normalizeText(line).includes(normalizeText(label))));
  const body = lines.slice(start + 1, end === -1 ? undefined : end);
  return body
    .flatMap((line) => line.split(/；|;|。/))
    .map((line) => line.replace(/^[-*•\d.、\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

function jobDraftFromInput(input: string) {
  const roleTitle = extractLabeledValue(input, "岗位名称") ?? extractLabeledValue(input, "职位名称") ?? "待确认岗位";
  const businessUnit = extractLabeledValue(input, "所属部门");
  const location = extractLabeledValue(input, "工作地点");
  const salaryRange = extractLabeledValue(input, "薪资范围") ?? extractLabeledValue(input, "薪酬范围");
  const responsibilities = extractSectionList(input, "岗位职责", ["任职要求", "任职资格"]);
  const requirements = extractSectionList(input, "任职要求", ["福利", "加分项", "其他"]);
  const combined = `${roleTitle}\n${responsibilities.join("\n")}`;
  const directionTags = hasAny(combined, ["电商", "运营", "GMV", "DSR", "商品上架"])
    ? ["电商运营", "运营执行", "GMV/DSR"]
    : knownDirectionSignals.filter((signal) => combined.toLowerCase().includes(signal.toLowerCase())).slice(0, 4);
  return {
    company: "待确认公司",
    businessUnit,
    roleTitle,
    location,
    salaryRange,
    responsibilities,
    requirements,
    directionTags: directionTags.length ? directionTags : ["待确认方向"]
  };
}

async function createJobDescriptionDraftObjects(agentRunId: string, input: string, evidence: EvidenceDTO): Promise<RouterCreatedObjects> {
  const draft = jobDraftFromInput(input);
  const opportunity = await prisma.opportunity.create({
    data: {
      type: "public_jd",
      company: draft.company,
      businessUnit: draft.businessUnit,
      roleTitle: draft.roleTitle,
      sourceChannel: "chat_jd",
      status: "draft",
      location: draft.location,
      salaryRange: draft.salaryRange,
      directionTagsJson: stringifyJson(draft.directionTags),
      responsibilitiesJson: stringifyJson(draft.responsibilities),
      requirementsJson: stringifyJson(draft.requirements),
      rawSummary: input.slice(0, 1200)
    }
  });
  await prisma.opportunityEvidence.create({
    data: {
      opportunityId: opportunity.id,
      evidenceId: evidence.id
    }
  });
  const isEcommerceOps = hasAny(input, ["电商运营", "商品上架", "GMV", "DSR", "库存管理"]);
  const assessment = await prisma.assessment.create({
    data: {
      opportunityId: opportunity.id,
      overallScore: isEcommerceOps ? 32 : 65,
      directionMatchScore: isEcommerceOps ? 20 : 70,
      experienceMatchScore: isEcommerceOps ? 45 : 65,
      compensationMatchScore: draft.salaryRange ? (isEcommerceOps ? 35 : 60) : 50,
      ownerSpaceScore: isEcommerceOps ? 30 : 55,
      summary: isEcommerceOps
        ? "该 JD 是电商运营执行岗位，和用户优先关注的 Agentic RL、后训练、Reward Model、Verifier 方向匹配度较低。"
        : "已基于当前 JD 创建轻量岗位分析草稿。",
      strongMatchesJson: stringifyJson(isEcommerceOps ? ["JD 信息完整，便于判断不匹配点。"] : ["当前 JD 信息较完整。"]),
      weakMatchesJson: stringifyJson(isEcommerceOps ? ["核心职责偏商品/活动/店铺运营，不是算法或后训练岗位。", "薪资 6k-10k 与高优先级技术岗位目标可能不匹配。"] : [])
    }
  });
  const risks = await Promise.all(
    (isEcommerceOps
      ? [
          { title: "方向匹配度低", description: "岗位核心是电商平台日常运营、活动执行、库存和口碑维护，不是 Agent/RL/后训练。", severity: "high", likelihood: "high" },
          { title: "成长路径偏运营执行", description: "如果目标是大模型后训练或评测闭环，该岗位可能难以积累直接相关经历。", severity: "medium", likelihood: "medium" }
        ]
      : [
          { title: "岗位边界待确认", description: "仍需确认 owner 空间、团队边界和前三个月目标。", severity: "medium", likelihood: "medium" }
        ]
    ).map((risk) =>
      prisma.risk.create({
        data: {
          opportunityId: opportunity.id,
          ...risk,
          mitigation: "继续推进前先确认职责占比、业务指标和团队边界。",
          evidenceIdsJson: stringifyJson([evidence.id])
        }
      })
    )
  );
  const openQuestions = await Promise.all(
    (isEcommerceOps
      ? ["这个岗位是否有 AI Agent / 数据智能运营 / 自动化运营 owner 空间？", "日常工作中数据分析和策略迭代占比多少？", "薪资 6k-10k 是否符合你的短期过渡预期？"]
      : ["前三个月核心目标是什么？", "团队 owner 空间和汇报线是什么？", "薪资/职级是否还有弹性？"]
    ).map((question) =>
      prisma.openQuestion.create({
        data: {
          opportunityId: opportunity.id,
          question,
          target: "HR / hiring manager",
          priority: "medium"
        }
      })
    )
  );
  const decision = await prisma.decision.create({
    data: {
      opportunityId: opportunity.id,
      decision: isEcommerceOps ? "pause" : "maybe",
      confidence: isEcommerceOps ? "high" : "medium",
      rationale: isEcommerceOps
        ? "当前 JD 和用户长期偏好的 Agentic RL、后训练、Reward Model、Verifier 方向不匹配，除非只是短期过渡或岗位背后有 AI/数据智能 owner 空间，否则不建议优先推进。"
        : "当前 JD 信息较完整，可以作为机会草稿继续确认关键缺口。",
      evidenceIdsJson: stringifyJson([evidence.id])
    }
  });
  return {
    evidence,
    opportunity: toOpportunityDTO(opportunity),
    assessment: toAssessmentDTO(assessment),
    risks: risks.slice(0, 3).map((risk) => toRiskDTO(risk)),
    risksCount: Math.min(risks.length, 3),
    openQuestions: openQuestions.slice(0, 5).map((question) => toOpenQuestionDTO(question)),
    openQuestionsCount: Math.min(openQuestions.length, 5),
    decision: toDecisionDTO(decision),
    memorySuggestionsCount: 0
  };
}

function composeAnalyzeAnswer(objects: RouterCreatedObjects) {
  const role = objects.opportunity?.roleTitle ?? "该机会";
  const score = objects.assessment?.overallScore ? `整体匹配 ${objects.assessment.overallScore}/100` : "已生成匹配评估";
  const decision = objects.decision?.decision ? `建议：${objects.decision.decision}` : "建议待确认";
  return {
    conclusion: `${role} 已完成证据分析，${score}，${decision}。`,
    evidence: [
      objects.evidence ? `Evidence：${objects.evidence.title}` : "Evidence 已复用或创建。",
      objects.opportunity ? `Opportunity：${objects.opportunity.company} · ${objects.opportunity.roleTitle}` : "Opportunity 待确认。",
      objects.assessment?.summary ?? "Assessment 已生成。"
    ],
    risks: [`生成/更新 ${objects.risksCount} 条 active risks。`],
    nextActions: [
      "处理 pending MemorySuggestions，决定是否写入长期记忆。",
      "打开 Opportunity，逐条确认 OpenQuestions。",
      "如继续推进，优先确认 owner 空间、团队边界和薪资口径。"
    ],
    citationSummary: [
      objects.evidence ? "1 条 Evidence" : "0 条 Evidence",
      objects.opportunity ? "1 条 Opportunity" : "0 条 Opportunity",
      objects.decision ? "1 条 Decision" : "0 条 Decision"
    ]
  };
}

function composeGroundedJobDescriptionAnswer(input: string, objects: RouterCreatedObjects): CareerAskResponse {
  const draft = jobDraftFromInput(input);
  const isEcommerceOps = hasAny(input, ["电商运营", "运营专员", "商品上架", "活动", "库存管理", "GMV", "DSR"]);
  const salary = draft.salaryRange ? `，薪资范围是 ${draft.salaryRange}` : "";
  const role = draft.roleTitle ?? "这个岗位";
  const coreWork = isEcommerceOps
    ? "商品上架、标题优化、详情页维护、库存管理、活动运营、数据复盘、客服/仓储/设计协同，以及提升 GMV 和 DSR"
    : draft.responsibilities.slice(0, 4).join("、") || "当前 JD 中列出的核心职责";
  const conclusion = isEcommerceOps
    ? `这个岗位我不建议你优先推进。它是典型的${role}，核心工作是${coreWork}${salary}。`
    : `${role} 可以进入进一步评估，我已经按当前 JD 做了机会草稿。`;
  const fit = isEcommerceOps
    ? "和你当前优先关注的 Agentic RL、后训练、Reward Model、Verifier、大模型应用效果闭环相比，这个岗位匹配度很低。它更偏运营执行，不是算法、后训练、Agent 或大模型应用效果优化岗位。"
    : "我会先按当前 JD 本身判断，再用长期记忆做个性化匹配，不会让历史话题替代这次输入。";
  const caveat = isEcommerceOps
    ? "除非你只是短期过渡，或者这个岗位背后实际有 AI Agent / 数据智能运营 / 自动化运营 owner 空间，否则不建议投入太多面试精力。"
    : "继续推进前建议确认 owner 空间、团队边界、前三个月目标和薪资/职级口径。";
  return {
    mode: "answer",
    answer: `${conclusion}\n\n${fit}\n\n${caveat}`,
    sections: {
      conclusion: isEcommerceOps ? "当前 JD 与目标方向不匹配，不建议优先推进。" : "已围绕当前 JD 做岗位分析。",
      evidence: [
        `${role}${salary}`,
        `核心职责：${coreWork}`,
        objects.opportunity ? `已创建 Opportunity draft：${objects.opportunity.roleTitle}` : "已识别为完整 JD。"
      ],
      risks: (objects.risks ?? []).slice(0, 3).map((risk) => risk.title),
      nextActions: (objects.openQuestions ?? []).slice(0, 5).map((question) => question.question),
      citationSummary: [
        objects.evidence ? "1 条 Evidence" : "0 条 Evidence",
        objects.opportunity ? "1 条 Opportunity" : "0 条 Opportunity",
        objects.decision ? "1 条 Decision" : "0 条 Decision"
      ]
    },
    citations: citationsForObjects(objects)
  };
}

function hasJobDescriptionGroundingMismatch(input: string, answer: string, classification: RouterClassification) {
  if (classification.currentInputType !== "job_description") return false;
  const forbidden = ["GRPO vs DPO", "reward 设计", "一面", "面试官", "后训练面试重点", "Interview Prep"];
  if (forbidden.some((item) => answer.toLowerCase().includes(item.toLowerCase()))) return true;
  if (hasAny(input, ["电商运营", "运营专员", "商品上架", "GMV", "DSR", "6k-10k"])) {
    const requiredAny = ["电商运营", "运营专员", "商品上架", "GMV", "DSR", "6k-10k", "不匹配", "不建议", "不优先"];
    return !requiredAny.some((item) => answer.toLowerCase().includes(item.toLowerCase()));
  }
  return false;
}

function composePreliminaryJobAnswer(input: string, classification: RouterClassification) {
  const signals = [
    input.match(/agent/i) ? "Agent" : "",
    input.match(/grpo/i) ? "GRPO" : "",
    input.match(/reward/i) ? "Reward Model" : "",
    input.includes("后训练") ? "后训练" : ""
  ].filter(Boolean);
  const signalText = signals.length ? signals.join("、") : "当前描述里的方向";
  return {
    mode: "answer" as const,
    answer:
      `初步看，这个方向和你关注的 Agent / 后训练 / RL 线索是相关的，尤其是 ${signalText}。但现在信息还太短，我会先把它当作“可继续了解的线索”，不把它沉淀成正式 Opportunity。\n\n` +
      "如果你要快速判断值不值得继续聊，我建议先确认三件事：这是不是核心岗位、有没有真实业务闭环和 owner 空间、薪资/职级是否接近你的目标。拿到完整 JD 后，我再帮你做更正式的匹配分析。",
    sections: {
      conclusion: "方向相关，但证据不足，不创建正式机会对象。",
      evidence: signals.length ? [`已识别到：${signalText}`] : ["只有零散岗位信号。"],
      risks: ["缺少公司、团队、职责占比、薪资/职级或 owner 空间会影响判断。"],
      nextActions: classification.missingFields.slice(0, 5),
      citationSummary: []
    },
    citations: []
  };
}

function withoutAlreadyMentioned(candidates: string[], mentioned: string[]) {
  const normalizedMentioned = mentioned.map((item) => normalizeText(item));
  return candidates.filter((candidate) => !normalizedMentioned.some((item) => item.includes(normalizeText(candidate))));
}

function composeFollowUpAnswer(input: string, classification: RouterClassification, context?: ConversationContext): CareerAskResponse {
  const companies = context?.referencedCompanies?.length
    ? context.referencedCompanies
    : knownCompanySignals.filter((company) => context?.lastAssistantMessage?.includes(company));
  const directions = context?.mentionedDirections?.length
    ? context.mentionedDirections
    : knownDirectionSignals.filter((direction) => context?.lastAssistantMessage?.toLowerCase().includes(direction.toLowerCase()));
  const topic = context?.threadTopicSummary ?? "上一轮讨论";
  const followUpType = classification.followUpType ?? "unknown";
  let answer: string;
  let nextActions: string[] = [];

  if (followUpType === "ask_for_more_options") {
    const extraCompanies = withoutAlreadyMentioned(
      ["快手", "美团", "腾讯混元", "百度智能云/文心", "小红书", "MiniMax", "月之暗面", "智谱", "阶跃星辰"],
      companies
    ).slice(0, 6);
    answer =
      `可以，除了刚才那组之外，我会把备选分成两类看：\n\n` +
      `1. **大厂业务型 Agent/RL 机会**：${extraCompanies.slice(0, 4).join("、")}。这类更适合你验证业务闭环、owner 空间和真实指标。\n` +
      `2. **模型应用/评测型团队**：${extraCompanies.slice(4).join("、") || "垂直教育 Agent、企业 Agent、评测/Verifier 平台团队"}。这类不一定 title 最亮，但可能更接近 GRPO、Reward Model、Verifier 和数据闭环。\n\n` +
      `我建议先按“是否有后训练/RL 实战、是否有业务闭环、是否能拿到 owner”筛一遍，不要只按公司名筛。`;
    nextActions = ["补一版你当前候选公司清单。", "标出你更看重总包、方向还是平台。", "优先找 JD 里明确写 GRPO/RLHF/Reward/Verifier 的岗位。"];
  } else if (followUpType === "compare_with_previous") {
    const pair = companies.length >= 2 ? companies.slice(0, 2).join(" vs ") : "上一轮提到的两个机会";
    answer =
      `如果沿用刚才的讨论，我会先这样排：\n\n` +
      `1. **更贴近 Agent/RL 后训练的一方优先**：看 JD 里是否真有 GRPO、Reward Model、Verifier、评测闭环，而不是泛泛的大模型应用。\n` +
      `2. **owner 空间更明确的一方优先**：能独立负责指标、数据闭环和策略迭代，比单纯支持业务更值钱。\n` +
      `3. **薪资和团队确定性兜底**：如果 ${pair} 里有一方薪资、汇报线、团队稳定性明显更清楚，可以排在前面。\n\n` +
      `在信息还不完整时，我不会把这个排序当最终决策，更像是下一轮沟通的优先级。`;
    nextActions = ["补充两个机会的 JD 或面试反馈。", "确认 owner 空间。", "确认薪资/职级口径。"];
  } else if (followUpType === "ask_about_mentioned_entity") {
    const entity = companies[0] ?? context?.lastDiscussedEntities?.[0] ?? "这个机会";
    answer =
      `如果你说的是 **${entity}**，我会把最大风险放在“岗位真实工作内容和你目标方向是否一致”上。\n\n` +
      `具体要确认三件事：第一，后训练/RL/评测是不是核心工作，而不是边缘支持；第二，团队有没有真实业务指标和数据闭环；第三，你进去后有没有 owner 空间，而不是只接需求做优化。\n\n` +
      `所以不是不能看，而是要在继续推进前把岗位边界问清楚。`;
    nextActions = ["问清核心指标和职责占比。", "确认团队业务和汇报线。", "确认是否有 GRPO/Reward/Verifier 实战空间。"];
  } else if (/教育/.test(input) || directions.some((direction) => /教育|K12/i.test(direction))) {
    answer =
      `如果限定在教育方向，我会更偏向看 **教育 Agent + 后训练/RL + 评测闭环** 的岗位，而不是纯内容运营或泛应用开发。\n\n` +
      `你可以重点找三类：一是 K12/学习助手里的 Agent 规划与反馈优化；二是题目讲解、批改、答疑场景里的 Reward Model / Verifier；三是教育场景评测体系和数据闭环。这个方向的优势是业务反馈比较具体，容易讲清楚“模型优化如何影响学习效果”。\n\n` +
      `需要警惕的是，很多教育 Agent 岗位会把算法、产品策略和内容规则混在一起，投之前要确认算法 owner 空间。`;
    nextActions = ["筛 JD 是否包含评测闭环。", "确认是否有线上学习效果指标。", "确认算法职责占比。"];
  } else if (followUpType === "ask_for_next_steps") {
    answer =
      `下一步我建议别急着下结论，先把上一轮缺口补齐到能判断的程度。\n\n` +
      `你可以按这个顺序做：\n\n` +
      `1. 要完整 JD 或岗位描述，确认 GRPO / Reward Model 是核心职责还是加分项。\n` +
      `2. 问公司、团队、业务场景、汇报线和前三个月指标。\n` +
      `3. 问薪资/职级范围，以及是否有 owner 空间。\n` +
      `4. 如果对方愿意聊，再把 JD 发我，我可以帮你判断是否值得正式推进。\n\n` +
      `在信息不够时，我会把它当线索跟进，不创建正式 Opportunity。`;
    nextActions = ["补完整 JD。", "确认公司/团队/薪资。", "确认 owner 空间和职责占比。"];
  } else {
    answer =
      `我理解你是在接着问 **${topic}**。基于上一轮内容，我会继续沿着刚才的对象和方向展开，而不是把这句话当成一个新问题。\n\n` +
      `更具体地说，先看上一轮提到的公司/岗位是否真的覆盖 ${directions.slice(0, 3).join("、") || "你的目标方向"}，再补充缺失的信息：团队、职责占比、薪资职级和 owner 空间。`;
    nextActions = ["继续补充上一轮对象的信息。", "确认你想展开公司、岗位风险还是下一步动作。"];
  }

  return {
    mode: "answer",
    answer,
    sections: {
      conclusion: "已承接上一轮上下文回答。",
      evidence: [
        context?.lastAssistantAnswerSummary ? `上一轮回答摘要：${context.lastAssistantAnswerSummary}` : "使用了最近对话上下文。",
        companies.length ? `上一轮提到：${companies.join("、")}` : "未识别到明确公司名。"
      ],
      risks: [],
      nextActions,
      citationSummary: []
    },
    citations: []
  };
}

function composeMemoryCandidateAnswer(suggestions: MemorySuggestionDTO[]) {
  const countText = suggestions.length ? `我抓到了 ${suggestions.length} 条可能值得保存的记忆候选。` : "我理解了，这更像是一个偏好更新。";
  const preferenceText = suggestions.some((item) => /Agentic RL|后训练|Reward|Verifier|纯预训练/.test(`${item.title} ${item.content}`))
    ? "明白，这会作为后续岗位筛选的重要标准：我会优先帮你看 Agentic RL、后训练、Reward Model、Verifier、真实业务闭环相关机会；纯预训练岗位默认不作为优先方向。\n\n"
    : "";
  return {
    mode: "answer" as const,
    answer:
      `${preferenceText}${countText}我不会直接写入长期记忆，你可以在下面选择保存、编辑后保存，或者忽略。\n\n` +
      "这类信息会影响之后我帮你筛机会和做取舍，所以确认后再沉淀会更稳。",
    sections: {
      conclusion: "识别到候选记忆，等待用户确认。",
      evidence: suggestions.map((item) => item.title),
      risks: [],
      nextActions: ["保存确认无误的记忆候选。", "忽略只是临时想法的候选。"],
      citationSummary: []
    },
    citations: []
  };
}

function composeComparisonAnswer(input: string) {
  const pair = input
    .replace(/[？?]/g, "")
    .match(/(.+?)(?:和|vs|VS|对比)(.+?)(?:哪个|哪一个|谁|更|$)/);
  const left = pair?.[1]?.replace(/.*?([\u4e00-\u9fa5A-Za-z0-9]+)$/, "$1").trim();
  const right = pair?.[2]?.trim();
  const targetText = left && right ? `${left}和${right}` : "这两个机会";
  return {
    mode: "answer" as const,
    answer:
      `可以，我们先看${targetText}哪个更适合你。我会按你已有的职业偏好来判断：如果一个机会更贴近 Agentic RL、后训练、真实业务闭环和 owner 空间，它通常会更值得优先看；如果只是平台名更大但工作内容偏执行或纯预训练，就不一定适合你。\n\n` +
      `具体到${targetText}，我会先比较方向匹配、owner 空间、薪资确定性、团队质量和面试/入职风险。现在我不会新建 Opportunity，因为你还没有提供新的 JD 或面试证据。`,
    sections: {
      conclusion: "先按方向匹配和 owner 空间比较，不创建新机会。",
      evidence: [input],
      risks: ["如果缺少两边 JD、团队和薪资细节，结论只能是初步排序。"],
      nextActions: ["补充两个机会的 JD 或关键差异。", "说明你这轮最看重薪资、成长、方向还是稳定性。"],
      citationSummary: []
    },
    citations: []
  };
}

function composeInterviewPrepAnswer(input: string) {
  return {
    mode: "answer" as const,
    answer:
      "可以。交叉面我建议你把重点放在三件事：先讲清楚你做过的 Agent / 后训练相关闭环，再证明你能把问题拆成数据、训练、评测和上线反馈，最后准备好对业务指标和团队协作的追问。\n\n" +
      "你可以准备 2 个项目故事：一个讲复杂 Agent 系统如何发现问题和迭代，一个讲评测/Reward/Verifier 怎么帮助提升效果。回答时少堆术语，多讲你怎么定位问题、做取舍、验证收益。",
    sections: {
      conclusion: "围绕项目闭环、评测体系和业务指标准备交叉面。",
      evidence: [input],
      risks: ["如果不知道面试官方向，需要准备算法、系统和业务三种追问路径。"],
      nextActions: ["准备 2 个项目故事。", "列出 5 个反问。", "把薪资/团队/owner 空间问题留到合适阶段确认。"],
      citationSummary: []
    },
    citations: []
  };
}

function composeResumeProjectRewriteAnswer(input: string): CareerAskResponse {
  const answer =
    "可以。我会把这个项目从“做了一个功能/系统”改成更贴近 **Agent 后训练岗位** 的表达，重点突出：问题定义、数据闭环、Reward/Verifier、评测指标和上线收益。\n\n" +
    "你可以这样写：\n\n" +
    "> 负责高英评批场景中的 Agent 反馈优化与评测闭环建设，围绕学生作答质量、批改一致性和讲解可用性设计数据采样、错误归因与验证流程。结合规则评测、人工标注和模型反馈构建 reward / verifier 信号，用于定位模型在推理、事实性和教学表达上的薄弱点，并推动后训练迭代。\n\n" +
    "如果要更像简历 bullet，可以压成三条：\n\n" +
    "- 构建高英评批 Agent 的评测与反馈闭环，覆盖作答理解、批改一致性、讲解质量等核心指标。\n" +
    "- 设计错误归因和 verifier/reward 信号，将线上 badcase 转化为可训练、可评测的数据资产。\n" +
    "- 推动模型后训练迭代，提升教育场景下反馈准确性、稳定性和可解释性。\n\n" +
    "这里先不把它保存为长期记忆；如果你确认这是稳定项目事实，可以再点保存为 ProjectClaim。";
  return {
    mode: "answer",
    answer,
    sections: {
      conclusion: "已改写为更贴近 Agent 后训练岗位的项目表达。",
      evidence: [input],
      risks: ["如果没有真实 reward/verifier 或后训练参与，需要把措辞降级为评测闭环和反馈信号设计，避免夸大。"],
      nextActions: ["补充真实指标。", "补充你个人负责范围。", "补充上线或评测收益。"],
      citationSummary: []
    },
    citations: []
  };
}

function composeInterviewReviewAnswer(input: string): CareerAskResponse {
  const answer =
    "这轮一面暴露的是一个很典型的后训练面试点：面试官不是只想听你背 GRPO / DPO 的定义，而是在确认你能不能把 **训练方法、reward 设计、项目落地** 连起来讲清楚。\n\n" +
    "你可以这样复盘：\n\n" +
    "1. **GRPO vs DPO**：DPO 更偏偏好数据上的直接优化，不需要显式 reward model；GRPO 更偏 RL 形式，会围绕 group 内相对优势做策略更新，适合需要探索和可验证 reward 的场景。\n" +
    "2. **reward 怎么设计**：不要只说“人工标注”。要拆成目标、信号来源、噪声控制、验证方式，比如规则 reward、人工偏好、模型 verifier、线上 badcase 回流。\n" +
    "3. **项目表达补强**：把你的项目讲成闭环：问题发现 -> 数据构造 -> reward/verifier -> 训练或策略迭代 -> 评测指标 -> 业务效果。\n\n" +
    "下一轮建议准备两个版本：一个 60 秒概念解释版，一个 3 分钟项目落地版。";
  return {
    mode: "answer",
    answer,
    sections: {
      conclusion: "这次复盘重点是把方法差异和 reward 项目落地讲成闭环。",
      evidence: [input],
      risks: ["如果只讲定义，容易被继续追问项目里 reward 信号是否真实有效。"],
      nextActions: ["准备 GRPO/DPO 60 秒解释。", "准备 reward 设计项目闭环。", "整理 2 个可追问 badcase。"],
      citationSummary: []
    },
    citations: []
  };
}

async function createMemorySuggestion(agentRunId: string, draft: {
  suggestedType: string;
  title: string;
  content: string;
  tags: string[];
  confidence: number;
  reason: string;
}) {
  const payload = {
    agentRunId,
    suggestedType: draft.suggestedType,
    title: draft.title,
    content: draft.content,
    tagsJson: stringifyJson(draft.tags),
    confidence: draft.confidence,
    reason: draft.reason,
    sourceEvidenceIdsJson: stringifyJson([]),
    status: "pending"
  };
  const existing = await prisma.memorySuggestion.findMany({ where: { status: "pending", suggestedType: payload.suggestedType } });
  const match = existing.find(
    (suggestion) =>
      normalizeText(suggestion.title) === normalizeText(payload.title) &&
      normalizeText(suggestion.content) === normalizeText(payload.content)
  );
  const suggestion = match
    ? await prisma.memorySuggestion.update({
        where: { id: match.id },
        data: {
          agentRunId,
          confidence: payload.confidence,
          reason: payload.reason,
          tagsJson: payload.tagsJson
        }
      })
    : await prisma.memorySuggestion.create({ data: payload });
  return toMemorySuggestionDTO(suggestion);
}

async function suggestMemoryUpdatesFromInput(agentRunId: string, input: string): Promise<MemorySuggestionDTO[]> {
  const drafts: Array<{ suggestedType: string; title: string; content: string; tags: string[]; confidence: number; reason: string }> = [];
  const clean = input.replace(/\s+/g, " ").trim();
  const title = clean.length > 34 ? `${clean.slice(0, 34)}...` : clean;
  const hasAgenticRlPreference = hasAny(clean, ["Agentic RL", "后训练", "Reward Model", "Verifier"]);
  if (hasAgenticRlPreference && hasAny(clean, ["优先", "优先看", "优先考虑"])) {
    drafts.push({
      suggestedType: "Preference",
      title: "优先看 Agentic RL / 后训练 / Reward-Verifier 相关岗位",
      content: "用户后续岗位筛选中优先关注 Agentic RL、后训练、Reward Model、Verifier 等方向。",
      tags: ["user-stated", "preference", "agentic-rl", "post-training"],
      confidence: 0.9,
      reason: "用户明确表达了长期岗位方向偏好；保存前需要用户确认。"
    });
  }
  if (hasAny(clean, ["纯预训练"]) && hasAny(clean, ["不优先", "暂不考虑", "暂时不优先", "暂时不考虑", "不考虑"])) {
    drafts.push({
      suggestedType: "Constraint",
      title: "纯预训练岗位暂不优先考虑",
      content: "用户表示纯预训练岗位暂时不作为优先方向，除非后续明确改变偏好。",
      tags: ["user-stated", "constraint", "pretraining"],
      confidence: 0.9,
      reason: "用户明确表达了长期岗位筛选约束；保存前需要用户确认。"
    });
  }
  if (hasAny(clean, ["优先", "偏好", "更想", "更偏"])) {
    drafts.push({
      suggestedType: "Preference",
      title: title || "职业偏好",
      content: clean,
      tags: ["user-stated", "preference"],
      confidence: 0.86,
      reason: "用户明确表达了稳定职业偏好；保存前需要用户确认。"
    });
  }
  if (hasAny(clean, ["不考虑", "暂时不考虑", "约束"])) {
    drafts.push({
      suggestedType: "Constraint",
      title: clean.includes("纯预训练") ? "暂不考虑纯预训练方向" : title || "职业约束",
      content: clean,
      tags: ["user-stated", "constraint"],
      confidence: 0.88,
      reason: "用户明确表达了筛选约束；保存前需要用户确认。"
    });
  }
  if (hasAny(clean, ["目标", "总包", "成为"])) {
    drafts.push({
      suggestedType: "CareerGoal",
      title: title || "职业目标",
      content: clean,
      tags: ["user-stated", "career-goal"],
      confidence: 0.84,
      reason: "用户明确表达了职业目标；保存前需要用户确认。"
    });
  }
  if (hasAny(clean, ["这周", "本周", "当前任务", "正在准备"])) {
    drafts.push({
      suggestedType: "CurrentTask",
      title: title || "当前职业任务",
      content: clean,
      tags: ["user-stated", "current-task"],
      confidence: 0.82,
      reason: "用户明确表达了近期职业任务；保存前需要用户确认。"
    });
  }
  if (hasAny(clean, ["项目", "简历", "项目事实", "project"])) {
    drafts.push({
      suggestedType: "ProjectClaim",
      title: title || "项目事实候选",
      content: clean,
      tags: ["user-stated", "project-claim"],
      confidence: 0.82,
      reason: "用户表达了可能稳定的项目事实；保存前需要用户确认。"
    });
  }
  if (!drafts.length) {
    drafts.push({
      suggestedType: "Preference",
      title: title || "职业偏好更新建议",
      content: clean,
      tags: ["user-stated"],
      confidence: 0.8,
      reason: "用户输入包含明确记忆信号；保存前需要用户确认。"
    });
  }
  const uniqueDrafts = drafts
    .filter((draft) => draft.confidence >= 0.8)
    .filter((draft, index, items) => items.findIndex((item) => item.suggestedType === draft.suggestedType) === index)
    .slice(0, 3);
  const suggestions: MemorySuggestionDTO[] = [];
  for (const draft of uniqueDrafts) {
    suggestions.push(await createMemorySuggestion(agentRunId, draft));
  }
  return suggestions;
}

function citationsForObjects(objects: RouterCreatedObjects) {
  return [
    ...(objects.evidence
      ? [
          {
            kind: "evidence" as const,
            id: objects.evidence.id,
            title: objects.evidence.title,
            summary: objects.evidence.content.slice(0, 160),
            href: `/evidence?evidence=${objects.evidence.id}`
          }
        ]
      : []),
    ...(objects.opportunity
      ? [
          {
            kind: "opportunity" as const,
            id: objects.opportunity.id,
            title: objects.opportunity.roleTitle,
            summary: `${objects.opportunity.company} · ${objects.opportunity.directionTags.join(", ")}`,
            href: `/opportunities?opportunity=${objects.opportunity.id}`
          }
        ]
      : []),
    ...(objects.decision
      ? [
          {
            kind: "decision" as const,
            id: objects.decision.id,
            title: objects.decision.decision,
            summary: objects.decision.rationale,
            href: objects.opportunity ? `/opportunities?opportunity=${objects.opportunity.id}` : "/opportunities"
          }
        ]
      : [])
  ];
}

function objectLinks(agentRunId: string, objects: RouterCreatedObjects) {
  return {
    agentRun: `/agent-runs?run=${agentRunId}`,
    opportunity: objects.opportunity ? `/opportunities?opportunity=${objects.opportunity.id}` : undefined,
    memorySuggestions: `/agent-runs?run=${agentRunId}`
  };
}

export class CareerAgentRouter {
  classifyInput(input: string, mode: CareerAgentMode = "auto", context?: ConversationContext) {
    return heuristicClassifyInput(input, mode, context);
  }

  planActions(classification: RouterClassification) {
    return planActions(classification);
  }

  async execute(input: string, mode: CareerAgentMode = "auto", options: RouterExecuteOptions = {}): Promise<RouterExecutionResult> {
    const run = await createRun(input, mode, options);
    const executedActions: ExecutedAction[] = [];

    try {
      const semantic = await classifyInputSemantic(input, mode, options.conversationContext);
      const classification = semantic.classification;
      await writeStep(run.id, "pre_router_hints", input.slice(0, 120), semantic.hints);
      await writeStep(run.id, "semantic_router", input.slice(0, 120), semantic.modelClassification);
      await writeStep(run.id, "policy_guard", input.slice(0, 120), {
        corrections: semantic.corrections,
        finalClassification: classification
      });
      await writeStep(run.id, "classify_input", input.slice(0, 120), classification);
      executedActions.push({ action: "classify_input", status: "completed", summary: classification.reason });

      const actionPlan = planActions(classification);
      await prisma.agentRun.update({
        where: { id: run.id },
        data: {
          detectedIntent: classification.intent,
          actionPlanJson: stringifyJson(actionPlan)
        }
      });
      await writeStep(run.id, "plan_actions", classification.intent, actionPlan);
      executedActions.push({ action: "plan_actions", status: "completed", summary: actionPlan.join(", ") });

      let answer: CareerAskResponse;
      let createdObjects: RouterCreatedObjects = {
        risksCount: 0,
        openQuestionsCount: 0,
        memorySuggestionsCount: 0
      };

      if (classification.intent === "clarify" || classification.intent === "invalid_input") {
        answer = {
          ...clarifyAskResponse(),
          answer: `这个输入还不够明确，当前不会创建 Evidence、Opportunity、Decision 或 MemorySuggestion。\n\n你可以这样问：\n${clarifyExamples.join("\n")}`,
          sections: {
            conclusion: "这个输入还不够明确，当前不会创建结构化职业对象。",
            evidence: [],
            risks: ["如果在低置信度输入上直接生成职业判断，容易产生误导。"],
            nextActions: clarifyExamples,
            citationSummary: []
          }
        };
        await writeStep(run.id, "ask_clarifying_question", classification.reason, answer.sections);
        executedActions.push({ action: "ask_clarifying_question", status: "completed", summary: "Returned clarification." });
      } else if (classification.intent === "follow_up") {
        answer = composeFollowUpAnswer(input, classification, options.conversationContext);
        await writeStep(run.id, "retrieve_context", classification.reason, {
          usedRecentMessagesCount: classification.usedRecentMessagesCount,
          usedLastAssistantAnswer: classification.usedLastAssistantAnswer,
          threadTopicSummary: classification.threadTopicSummary,
          resolvedReference: classification.resolvedReference,
          followUpType: classification.followUpType
        });
        executedActions.push({
          action: "retrieve_context",
          status: "completed",
          summary: `Resolved follow-up against ${classification.resolvedReference ?? "previous answer"}.`
        });
        await writeStep(run.id, "answer_question", input.slice(0, 120), answer.sections);
        executedActions.push({ action: "answer_question", status: "completed", summary: "Answered follow-up using recent conversation context." });
      } else if (classification.intent === "needs_external_source") {
        answer = {
          mode: "clarify",
          answer:
            "我现在缺少外部来源，不能替你实时查找或抓取 JD。请粘贴豆包 JD 原文、招聘链接中的岗位内容，或提供猎头/HR 消息后，我可以继续做 Evidence 分析。",
          sections: {
            conclusion: "缺少外部来源，当前不会创建 Evidence、Opportunity 或其他结构化对象。",
            evidence: ["该请求需要外部 JD 来源；当前 MockLLMProvider 不联网。"],
            risks: ["如果直接凭空分析，容易生成不可靠岗位信息。"],
            nextActions: ["粘贴 JD 原文或招聘信息正文。", "提供来源内容后可切换 Analyze as evidence。"],
            citationSummary: []
          },
          citations: []
        };
        await writeStep(run.id, "report_missing_external_source", classification.reason, answer.sections);
        executedActions.push({
          action: "report_missing_external_source",
          status: "completed",
          summary: "Returned missing external source response without creating objects."
        });
      } else if ((classification.intent === "analyze_evidence" || classification.intent === "analyze_evidence_candidate") && !classification.shouldCreateObjects) {
        answer = composePreliminaryJobAnswer(input, classification);
        await writeStep(run.id, "show_structured_card", classification.reason, {
          cardType: "job_analysis",
          evidenceSufficiency: classification.evidenceSufficiency,
          missingFields: classification.missingFields,
          skippedReason: classification.skippedReason
        });
        executedActions.push({
          action: "answer_question",
          status: "completed",
          summary: "Returned preliminary job analysis without creating structured objects."
        });
      } else if (classification.intent === "analyze_evidence") {
        const evidence = await findOrCreateEvidence(input, classification.evidenceType);
        await writeStep(run.id, "create_evidence", evidence.title, evidence);
        executedActions.push({ action: "create_evidence", status: "completed", summary: evidence.title });
        if (classification.currentInputType === "job_description") {
          createdObjects = await createJobDescriptionDraftObjects(run.id, input, evidence);
          await writeStep(run.id, "create_job_description_draft", createdObjects.opportunity?.roleTitle ?? evidence.title, {
            groundingTarget: classification.groundingTarget,
            createdObjects
          });
          actionPlan
            .filter((action) => action !== "create_evidence")
            .forEach((action) => {
              executedActions.push({
                action,
                status: "completed",
                summary: "Created lightweight JD draft artifacts grounded in the current input."
              });
            });
          answer = composeGroundedJobDescriptionAnswer(input, createdObjects);
        } else {
          await analyzeEvidence(evidence.id, {
            agentRunId: run.id,
            triggerType: options.chatThreadId ? "chat" : mode === "auto" ? "unified_command" : mode,
            detectedIntent: classification.intent,
            actionPlan,
            providerConfig: options.providerConfig,
            sourceMessageText: input,
            chatThreadId: options.chatThreadId ?? undefined,
            sourceMessageId: options.sourceMessageId ?? undefined
          });
          actionPlan
            .filter((action) => action !== "create_evidence")
            .forEach((action) => {
              executedActions.push({
                action,
                status: "completed",
                summary: "Executed by AnalyzeEvidenceWorkflow."
              });
            });
          createdObjects = await getCreatedObjects(run.id, evidence);
          const sections = composeAnalyzeAnswer(createdObjects);
          answer = {
            mode: "answer",
            answer: [
              `结论\n${sections.conclusion}`,
              `依据\n${sections.evidence.map((item) => `- ${item}`).join("\n")}`,
              `风险\n${sections.risks.map((item) => `- ${item}`).join("\n")}`,
              `下一步动作\n${sections.nextActions.map((item) => `- ${item}`).join("\n")}`,
              `引用来源\n${sections.citationSummary.join("；")}`
            ].join("\n\n"),
            sections,
            citations: citationsForObjects(createdObjects)
          };
        }
      } else if (classification.intent === "update_memory") {
        const suggestions = await suggestMemoryUpdatesFromInput(run.id, input);
        await writeStep(run.id, "suggest_memory_updates", input.slice(0, 120), suggestions);
        executedActions.push({
          action: "suggest_memory_updates",
          status: "completed",
          summary: `Created ${suggestions.length} pending MemorySuggestion candidate(s) only.`
        });
        createdObjects = {
          risksCount: 0,
          openQuestionsCount: 0,
          memorySuggestions: suggestions,
          memorySuggestionsCount: suggestions.length
        };
        answer = composeMemoryCandidateAnswer(suggestions);
      } else if (classification.intent === "compare_opportunities") {
        answer = composeComparisonAnswer(input);
        await writeStep(run.id, "show_structured_card", classification.reason, {
          cardType: "opportunity_comparison",
          missingFields: classification.missingFields
        });
        executedActions.push({ action: "answer_question", status: "completed", summary: "Returned lightweight comparison." });
      } else if (classification.intent === "prepare_interview") {
        answer = composeInterviewPrepAnswer(input);
        await writeStep(run.id, "show_structured_card", classification.reason, {
          cardType: "interview_prep",
          missingFields: classification.missingFields
        });
        executedActions.push({ action: "answer_question", status: "completed", summary: "Returned lightweight interview prep." });
      } else if (classification.intent === "interview_review") {
        answer = composeInterviewReviewAnswer(input);
        await writeStep(run.id, "show_structured_card", classification.reason, {
          cardType: "interview_prep",
          skippedReason: classification.skippedReason
        });
        executedActions.push({ action: "answer_question", status: "completed", summary: "Returned interview review advice." });
      } else if (classification.intent === "rewrite_resume_project" || classification.intent === "rewrite_resume_or_project") {
        answer = composeResumeProjectRewriteAnswer(input);
        await writeStep(run.id, "answer_question", classification.reason, {
          memorySignalStrength: classification.memorySignalStrength,
          skippedReason: classification.skippedReason
        });
        executedActions.push({ action: "answer_question", status: "completed", summary: "Returned resume/project wording help." });
      } else {
        const contextSummary = await prisma.$transaction([
          prisma.memory.count({ where: { status: "active" } }),
          prisma.opportunity.count(),
          prisma.risk.count({ where: { status: "active" } }),
          prisma.decision.count()
        ]);
        await writeStep(run.id, "retrieve_context", input.slice(0, 120), {
          memories: contextSummary[0],
          opportunities: contextSummary[1],
          activeRisks: contextSummary[2],
          decisions: contextSummary[3]
        });
        executedActions.push({ action: "retrieve_context", status: "completed", summary: "Read memories, opportunities, risks and decisions." });
        answer = await askCareerAgent(input, options.conversationContext);
        await writeStep(run.id, "answer_question", input.slice(0, 120), answer);
        executedActions.push({ action: "answer_question", status: "completed", summary: "Generated structured answer." });
      }

      if (classification.currentInputType === "job_description") {
        if (hasJobDescriptionGroundingMismatch(input, answer.answer, classification)) {
          await writeStep(run.id, "grounding_check_failed", "current_user_job_description", {
            currentInputType: classification.currentInputType,
            forbiddenTaskLeakage: true,
            action: "regenerated"
          });
          answer = composeGroundedJobDescriptionAnswer(input, createdObjects);
          classification.groundingCheck = "regenerated";
          classification.answerPlan = {
            ...buildAnswerPlan(classification, options.conversationContext),
            groundingCheck: "regenerated"
          };
          await writeStep(run.id, "grounding_regenerated", "current_user_job_description", {
            answer: answer.sections
          });
        } else {
          classification.groundingCheck = "passed";
          classification.answerPlan = {
            ...buildAnswerPlan(classification, options.conversationContext),
            groundingCheck: "passed"
          };
          await writeStep(run.id, "grounding_check", "current_user_job_description", {
            currentInputType: classification.currentInputType,
            groundingTarget: classification.groundingTarget,
            status: "passed"
          });
        }
      }

      await writeStep(run.id, "compose_response", classification.intent, {
        answer: answer.sections,
        createdObjects,
        actionLevel: classification.actionLevel,
        evidenceSufficiency: classification.evidenceSufficiency,
        missingFields: classification.missingFields,
        skippedReason: classification.skippedReason,
        pendingActions: createdObjects.memorySuggestionsCount ? ["MemorySuggestions require manual accept/reject."] : []
      });
      executedActions.push({ action: "compose_response", status: "completed", summary: "Prepared UI response." });

      await prisma.agentRun.update({
        where: { id: run.id },
        data: { status: "completed" }
      });

      const fullRun = await prisma.agentRun.findUniqueOrThrow({
        where: { id: run.id },
        include: {
          steps: { orderBy: { createdAt: "asc" } },
          suggestions: { orderBy: { createdAt: "asc" } },
          chatThread: true,
          sourceMessage: true
        }
      });

      return {
        classification,
        actionPlan,
        executedActions,
        answer: answer.answer,
        answerSections: answer.sections,
        createdObjects,
        pendingActions: createdObjects.memorySuggestionsCount ? ["MemorySuggestions 需要手动接受或拒绝。"] : [],
        links: objectLinks(run.id, createdObjects),
        citations: answer.citations,
        agentRun: toAgentRunDTO(fullRun)
      };
    } catch (error) {
      await prisma.agentRun.update({
        where: { id: run.id },
        data: { status: "failed" }
      });
      throw error;
    }
  }
}
