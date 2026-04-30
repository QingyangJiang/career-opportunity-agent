import type { EvidenceDTO, MatchStrength, MemoryDTO } from "@/lib/types";
import type {
  AssessmentDraft,
  DecisionDraft,
  EvidenceClassification,
  LLMProvider,
  MatchResult,
  MemoryMatchDraft,
  MemorySuggestionDraft,
  OpenQuestionDraft,
  OpportunityDraft,
  RiskDraft,
  RoleSignals
} from "@/lib/llm/types";

const SIGNALS = [
  "Agent",
  "SFT",
  "DPO",
  "GRPO",
  "PPO",
  "RLHF",
  "RLVR",
  "Reward Model",
  "PRM",
  "Verifier",
  "LLM-as-a-Judge",
  "RAG",
  "工具调用",
  "多轮对话",
  "评测",
  "数据闭环",
  "事实一致性",
  "用户满意度"
];

const MEMORY_KEYWORDS: Record<string, string[]> = {
  "Agent / 工具调用": ["agent", "工具调用", "多轮", "互动教学", "任务完成率"],
  "后训练 / RL": ["grpo", "ppo", "dpo", "rlhf", "rlvr", "sft", "后训练"],
  "Reward / Verifier": ["reward", "verifier", "prm", "judge", "rubric", "guardrail", "评分"],
  "评测与数据闭环": ["评测", "闭环", "badcase", "数据配方", "灰度", "效果"],
  "真实业务落地": ["业务", "落地", "学习机", "k12", "线上"]
};

function contains(text: string, keyword: string) {
  return text.toLowerCase().includes(keyword.toLowerCase());
}

function pickSignals(content: string) {
  return SIGNALS.filter((signal) => contains(content, signal));
}

function parseSalary(content: string) {
  const match = content.match(/(\d{2,3})\s*k\s*[-~到]\s*(\d{2,3})\s*k[^，。,\n]*(\d{1,2})\s*薪/i);
  if (!match) return content.match(/薪资[^。,\n]+/)?.[0] ?? null;
  return `${match[1]}k-${match[2]}k，${match[3]} 薪`;
}

function compactSentence(content: string, fallback: string) {
  return content
    .replace(/\s+/g, " ")
    .split(/[。；;\n]/)
    .find((item) => item.trim().length > 12)
    ?.trim() ?? fallback;
}

function memoryText(memory: MemoryDTO) {
  return [memory.type, memory.title, memory.content, memory.tags.join(" ")].join(" ").toLowerCase();
}

function salaryScore(salaryRange?: string | null) {
  if (!salaryRange) return 55;
  const match = salaryRange.match(/(\d{2,3})k-(\d{2,3})k.*?(\d{1,2})/i);
  if (!match) return 65;
  const low = Number(match[1]) * Number(match[3]);
  const high = Number(match[2]) * Number(match[3]);
  if (high >= 1000 && low >= 700) return 86;
  if (high >= 1000) return 76;
  return 58;
}

export class MockLLMProvider implements LLMProvider {
  async classifyCareerInput(input: string) {
    const text = input.toLowerCase();
    const durable = ["以后", "优先", "不考虑", "目标", "记住", "偏好"].some((item) => text.includes(item));
    const jdLike = text.includes("jd") || text.includes("岗位职责") || text.includes("任职要求");
    const partialRole = text.includes("agent") || text.includes("grpo") || text.includes("reward") || text.includes("后训练");
    const missingFields = jdLike || partialRole ? ["公司/业务线", "薪资/职级", "团队和 owner 空间"].filter((item) => !input.includes(item)) : [];
    const sufficient = input.length > 220 && missingFields.length <= 1;
    return {
      intent: durable ? "update_memory" : jdLike || partialRole ? "analyze_evidence" : "ask_question",
      actionLevel: durable ? "suggest_memory_candidate" : sufficient ? "create_structured_objects" : jdLike || partialRole ? "show_structured_card" : "answer_only",
      evidenceSufficiency: sufficient ? "sufficient" : jdLike || partialRole ? "partial" : "none",
      missingFields,
      evidenceType: jdLike ? "jd" : "none",
      confidence: durable || sufficient ? 0.86 : 0.72,
      needsConfirmation: false,
      reason: "Mock chat-first classification.",
      shouldCreateObjects: sufficient,
      shouldCreateEvidence: sufficient,
      shouldExtractOpportunity: sufficient,
      shouldGenerateAssessment: sufficient,
      shouldGenerateRisks: sufficient,
      shouldGenerateOpenQuestions: sufficient,
      shouldGenerateDecision: sufficient,
      shouldSuggestMemoryUpdates: durable,
      shouldSuggestMemory: durable,
      shouldShowStructuredCard: jdLike || partialRole,
      shouldShowInfoGaps: missingFields.length > 0
    };
  }

  async classifyEvidence(evidence: EvidenceDTO): Promise<EvidenceClassification> {
    const content = `${evidence.title}\n${evidence.content}`;
    const signals = pickSignals(content);
    const evidenceType = evidence.type || (contains(content, "岗位职责") ? "jd" : "user_note");
    return {
      evidenceType,
      confidence: signals.length >= 5 ? 0.92 : 0.72,
      signals
    };
  }

  async extractOpportunity(evidence: EvidenceDTO): Promise<OpportunityDraft> {
    const content = `${evidence.title}\n${evidence.content}`;
    const signals = pickSignals(content);
    const directionTags = [
      ...(signals.includes("Agent") ? ["Agent"] : []),
      ...(signals.some((item) => ["SFT", "DPO", "GRPO", "PPO", "RLHF", "RLVR"].includes(item))
        ? ["后训练/RL"]
        : []),
      ...(signals.some((item) => ["Reward Model", "Verifier", "LLM-as-a-Judge", "PRM"].includes(item))
        ? ["Reward/Verifier"]
        : []),
      ...(signals.some((item) => ["评测", "数据闭环"].includes(item)) ? ["评测与数据闭环"] : []),
      ...(contains(content, "真实业务") ? ["真实业务落地"] : [])
    ];

    const roleTitle = contains(evidence.title, "JD")
      ? evidence.title.replace(/\s*JD\s*/i, "").trim()
      : contains(content, "算法专家")
        ? "大模型 Agent 后训练算法专家"
        : evidence.title;

    const responsibilities = [
      signals.some((item) => ["SFT", "DPO", "GRPO", "RLHF", "RLVR"].includes(item))
        ? "负责 Agent 场景下的 SFT、DPO、GRPO、RLHF/RLVR 后训练"
        : "",
      contains(content, "工具调用") ? "构建多轮工具调用任务的评测与数据闭环" : "",
      signals.some((item) => ["Reward Model", "Verifier", "LLM-as-a-Judge"].includes(item))
        ? "设计 Reward Model、Verifier、LLM-as-a-Judge 等评价机制"
        : "",
      contains(content, "用户满意度") || contains(content, "任务完成率")
        ? "优化真实业务 Agent 的任务完成率、事实一致性和用户满意度"
        : ""
    ].filter(Boolean);

    const requirements = [
      signals.some((item) => ["PPO", "GRPO", "DPO"].includes(item)) ? "熟悉 PPO/GRPO/DPO" : "",
      contains(content, "应用落地") || contains(content, "真实业务") ? "具备大模型应用落地经验" : "",
      contains(content, "工具调用") ? "熟悉 Agent 工具调用、多轮对话" : "",
      contains(content, "RAG") ? "熟悉 RAG 与事实一致性优化" : "",
      signals.some((item) => ["Reward Model", "Verifier", "LLM-as-a-Judge"].includes(item))
        ? "具备 Reward/Verifier/LLM-as-a-Judge 设计经验"
        : ""
    ].filter(Boolean);

    return {
      type: evidence.type === "recruiter_message" ? "recruiter_lead" : "public_jd",
      company: "待确认公司",
      businessUnit: "Agent / 大模型业务",
      roleTitle,
      sourceChannel: evidence.type === "jd" ? "JD 原文" : evidence.type,
      sourceUrl: evidence.sourceUrl,
      status: "discovered",
      location: null,
      salaryRange: parseSalary(content),
      directionTags: Array.from(new Set(directionTags)),
      responsibilities,
      requirements,
      rawSummary: compactSentence(content, "该机会涉及大模型 Agent 后训练、评测与业务效果闭环。")
    };
  }

  async extractRoleSignals(evidence: EvidenceDTO, opportunity: OpportunityDraft): Promise<RoleSignals> {
    const content = `${evidence.title}\n${evidence.content}`;
    return {
      directionTags: opportunity.directionTags,
      senioritySignals: contains(content, "专家") ? ["专家岗", "需要独立方案设计能力"] : ["资深能力待确认"],
      compensationSignals: opportunity.salaryRange ? [opportunity.salaryRange] : ["薪资未明确"],
      ownerSpaceSignals: [
        ...(contains(content, "构建") || contains(content, "设计") ? ["有系统设计空间"] : []),
        ...(contains(content, "闭环") ? ["强调效果闭环"] : []),
        ...(contains(content, "真实业务") ? ["真实业务指标导向"] : [])
      ],
      missingSignals: [
        ...(!contains(content, "团队") ? ["团队规模与汇报线未说明"] : []),
        ...(!contains(content, "职级") ? ["职级与绩效口径未说明"] : []),
        ...(!contains(content, "公司") ? ["公司与业务单元需确认"] : [])
      ]
    };
  }

  async matchOpportunityWithMemories(opportunity: OpportunityDraft, memories: MemoryDTO[]): Promise<MatchResult> {
    const activeMemories = memories.filter((memory) => memory.status === "active");
    const requirements = Array.from(new Set([...opportunity.requirements, ...opportunity.directionTags]));
    const matches: MemoryMatchDraft[] = requirements.map((requirement) => {
      const keywordGroup = Object.entries(MEMORY_KEYWORDS).find(([label]) => requirement.includes(label.split(" ")[0]));
      const keywords =
        keywordGroup?.[1] ??
        requirement
          .split(/[ /、,，]+/)
          .map((item) => item.trim())
          .filter((item) => item.length > 1);

      const scored = activeMemories
        .map((memory) => {
          const text = memoryText(memory);
          const score = keywords.reduce((sum, keyword) => sum + (contains(text, keyword) ? 1 : 0), 0);
          return { memory, score };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || b.memory.confidence - a.memory.confidence);

      if (!scored[0]) {
        return {
          requirement,
          memoryId: null,
          memoryTitle: null,
          strength: "gap" as const,
          rationale: "当前职业记忆中没有找到直接证据，建议面试前补充或确认。",
          evidenceIds: []
        };
      }

      const top = scored[0];
      const strength: MatchStrength =
        top.score >= 3 || top.memory.type === "Project" || top.memory.type === "ProjectClaim" ? "high" : top.score === 2 ? "medium" : "low";
      return {
        requirement,
        memoryId: top.memory.id,
        memoryTitle: top.memory.title,
        strength,
        rationale: `${top.memory.title} 中出现 ${keywords.filter((keyword) => contains(memoryText(top.memory), keyword)).join("、")} 等相关证据。`,
        evidenceIds: top.memory.sourceEvidenceIds
      };
    });

    const covered = matches.filter((match) => match.strength !== "gap").length;
    return {
      matches,
      matchedMemoryIds: Array.from(new Set(matches.map((match) => match.memoryId).filter(Boolean))) as string[],
      coverageScore: requirements.length ? Math.round((covered / requirements.length) * 100) : 0,
      gapSignals: matches.filter((match) => match.strength === "gap").map((match) => match.requirement)
    };
  }

  async generateAssessment(
    opportunity: OpportunityDraft,
    memories: MemoryDTO[],
    matchResult: MatchResult
  ): Promise<AssessmentDraft> {
    const directionMatchScore = Math.min(95, 62 + matchResult.coverageScore * 0.35);
    const projectMatches = matchResult.matches.filter((match) => match.strength === "high").length;
    const experienceMatchScore = Math.min(94, 58 + projectMatches * 9 + matchResult.matches.length * 2);
    const compensationMatchScore = salaryScore(opportunity.salaryRange);
    const prefersOwner = memories.some((memory) => memory.title.includes("owner") || memory.content.includes("owner"));
    const ownerSpaceScore = opportunity.rawSummary.includes("构建") || opportunity.rawSummary.includes("闭环")
      ? prefersOwner
        ? 84
        : 76
      : 62;
    const overallScore = Math.round(
      directionMatchScore * 0.32 +
        experienceMatchScore * 0.28 +
        compensationMatchScore * 0.2 +
        ownerSpaceScore * 0.2
    );

    return {
      overallScore,
      directionMatchScore: Math.round(directionMatchScore),
      experienceMatchScore: Math.round(experienceMatchScore),
      compensationMatchScore,
      ownerSpaceScore,
      summary:
        overallScore >= 80
          ? "方向匹配度高，尤其贴合 Agent 后训练、Reward/Verifier 和真实业务效果闭环。建议推进，同时补齐团队边界、职级和薪资兑现方式。"
          : "机会存在一定相关性，但关键能力或约束仍需更多证据确认，建议谨慎推进。",
      strongMatches: matchResult.matches
        .filter((match) => match.strength === "high")
        .map((match) => ({
          requirement: match.requirement,
          memoryTitle: match.memoryTitle,
          rationale: match.rationale
        })),
      weakMatches: matchResult.matches
        .filter((match) => match.strength === "low" || match.strength === "gap")
        .map((match) => ({
          requirement: match.requirement,
          memoryTitle: match.memoryTitle,
          rationale: match.rationale
        }))
    };
  }

  async generateRisks(
    opportunity: OpportunityDraft,
    _memories: MemoryDTO[],
    assessment: AssessmentDraft
  ): Promise<RiskDraft[]> {
    const risks: RiskDraft[] = [
      {
        title: "团队与业务边界未确认",
        description: "JD 强调 Agent 后训练和业务效果，但没有说明团队规模、汇报线、owner 范围和上线决策权。",
        severity: "medium",
        likelihood: "medium",
        mitigation: "向 HR 或面试官确认团队目标、你负责的指标，以及是否拥有数据、训练、评测和上线闭环的完整权限。",
        evidenceIds: []
      },
      {
        title: "岗位范围可能过宽",
        description: "同一 JD 覆盖 SFT/DPO/GRPO/RLHF、Reward/Verifier、工具调用评测和业务指标优化，实际职责优先级需要澄清。",
        severity: "medium",
        likelihood: "high",
        mitigation: "要求对方给出前三个月最核心的任务、当前最大瓶颈和评价标准。",
        evidenceIds: []
      }
    ];

    if (assessment.compensationMatchScore < 80) {
      risks.push({
        title: "薪资与目标总包可能不稳",
        description: `当前薪资信息为 ${opportunity.salaryRange ?? "未明确"}，与目标总包 100w+ 的匹配仍依赖职级、绩效和股票/奖金口径。`,
        severity: "medium",
        likelihood: "unknown",
        mitigation: "尽早确认 base、年终、签字费、股票、绩效系数和保底情况。",
        evidenceIds: []
      });
    }

    if (opportunity.company === "待确认公司") {
      risks.push({
        title: "公司和 BU 信息缺失",
        description: "Evidence 中未明确公司与业务单元，无法判断平台资源、组织稳定性和战略优先级。",
        severity: "low",
        likelihood: "high",
        mitigation: "补充公司、BU、产品线和直接业务负责人信息后重新评估。",
        evidenceIds: []
      });
    }

    return risks.slice(0, 3);
  }

  async generateOpenQuestions(opportunity: OpportunityDraft, risks: RiskDraft[]): Promise<OpenQuestionDraft[]> {
    const questions: OpenQuestionDraft[] = [
      {
        question: "这个岗位前三个月最核心的业务指标是什么？任务完成率、工具调用成功率、事实一致性分别如何衡量？",
        target: "interviewer",
        priority: "high",
        status: "unasked"
      },
      {
        question: "岗位是否拥有数据构造、训练策略、评测体系和线上灰度闭环的 owner 空间？",
        target: "interviewer",
        priority: "high",
        status: "unasked"
      },
      {
        question: `薪资 ${opportunity.salaryRange ?? "范围"} 对应的职级、base、年终和绩效口径是什么？`,
        target: "hr",
        priority: "high",
        status: "unasked"
      },
      {
        question: `当前最大风险是否为：${risks[0]?.title ?? "岗位职责不清"}？`,
        target: "recruiter",
        priority: "medium",
        status: "unasked"
      }
    ];
    return questions.slice(0, 5);
  }

  async generateDecision(
    _opportunity: OpportunityDraft,
    assessment: AssessmentDraft,
    risks: RiskDraft[]
  ): Promise<DecisionDraft> {
    const hasHighRisk = risks.some((risk) => risk.severity === "high");
    return {
      decision: assessment.overallScore >= 78 && !hasHighRisk ? "pursue" : assessment.overallScore >= 65 ? "maybe" : "pause",
      confidence: assessment.overallScore >= 82 ? "high" : "medium",
      rationale:
        assessment.overallScore >= 78
          ? "方向和经验匹配度较高，建议优先推进；但在正式投入前要确认 owner 空间、团队边界和薪资口径。"
          : "匹配度尚可但证据不足，建议先补充关键信息再决定是否投入更多时间。",
      evidenceIds: []
    };
  }

  async suggestMemoryUpdates(
    evidence: EvidenceDTO,
    opportunity: OpportunityDraft,
    assessment: AssessmentDraft
  ): Promise<MemorySuggestionDraft[]> {
    const suggestions: MemorySuggestionDraft[] = [
      {
        suggestedType: "HistoricalConclusion",
        title: "Agent 后训练机会优先级较高",
        content: `基于 ${evidence.title} 的分析，该机会在 Agent、后训练/RL、Reward/Verifier 和真实业务效果闭环上与当前职业记忆高度重合，当前匹配评分为 ${assessment.overallScore}。`,
        tags: ["opportunity-analysis", "agent", "post-training"],
        confidence: 0.78,
        reason: "Evidence 中多个岗位信号与现有技能、项目和偏好相互印证，但仍需用户确认是否沉淀为长期职业判断。",
        sourceEvidenceIds: [evidence.id]
      }
    ];
    return suggestions.filter((item) => evidence.content.includes("以后") || evidence.content.includes("优先") || evidence.content.includes("目标") || evidence.content.includes("记住"));
  }
}
