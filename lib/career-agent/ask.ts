import { prisma } from "@/lib/db/prisma";
import { getLLMProvider } from "@/lib/llm/provider";
import { toEvidenceDTO } from "@/lib/evidence/serializers";
import { toMemoryDTO } from "@/lib/memory/serializers";
import {
  toDecisionDTO,
  toOpportunityDTO,
  toRiskDTO
} from "@/lib/opportunity/serializers";
import type { EvidenceDTO, MemoryDTO, OpportunityDTO } from "@/lib/types";
import type { ConversationContext } from "@/lib/agent/router/types";

export type CitationKind = "memory" | "opportunity" | "evidence" | "risk" | "decision";

export interface CareerAgentCitation {
  kind: CitationKind;
  id: string;
  title: string;
  summary: string;
  href?: string;
}

export interface CareerAskResponse {
  mode: "answer" | "clarify";
  answer: string;
  sections: {
    conclusion: string;
    evidence: string[];
    risks: string[];
    nextActions: string[];
    citationSummary: string[];
  };
  citations: CareerAgentCitation[];
}

const SIGNALS = [
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
  "owner",
  "闭环",
  "业务",
  "落地",
  "k12",
  "薪资",
  "总包",
  "风险",
  "面试",
  "问题",
  "offer"
];

function scoreText(text: string, query: string) {
  const normalizedText = text.toLowerCase();
  const normalizedQuery = query.toLowerCase();
  const directHit = normalizedText.includes(normalizedQuery) ? 4 : 0;
  return SIGNALS.reduce((sum, signal) => sum + (normalizedQuery.includes(signal) && normalizedText.includes(signal) ? 2 : 0), directHit);
}

function uniqById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function memoryCitation(memory: MemoryDTO): CareerAgentCitation {
  return {
    kind: "memory",
    id: memory.id,
    title: memory.title,
    summary: `${memory.type}: ${memory.content}`,
    href: `/memories?memory=${memory.id}`
  };
}

function opportunityCitation(opportunity: OpportunityDTO): CareerAgentCitation {
  return {
    kind: "opportunity",
    id: opportunity.id,
    title: opportunity.roleTitle,
    summary: `${opportunity.company} · ${opportunity.directionTags.join(", ")} · ${opportunity.salaryRange ?? "薪资待确认"}`,
    href: `/opportunities?opportunity=${opportunity.id}`
  };
}

function evidenceCitation(evidence: EvidenceDTO): CareerAgentCitation {
  return {
    kind: "evidence",
    id: evidence.id,
    title: evidence.title,
    summary: evidence.content.slice(0, 160),
    href: `/evidence?evidence=${evidence.id}`
  };
}

export function isAmbiguousCareerQuestion(question: string): boolean {
  const text = question.trim().toLowerCase();
  const vagueInputs = ["测试", "测试 query", "你好", "帮我看看", "分析下", "test", "hello"];
  if (!text) return true;
  if (vagueInputs.includes(text)) return true;
  return text.length < 8 && !SIGNALS.some((signal) => text.includes(signal));
}

export function clarifyAskResponse(): CareerAskResponse {
  const message =
    "这个问题还不够具体。你可以问：这个岗位适合我吗？帮我分析这段 JD；我下一步该推进哪个机会；帮我准备某个岗位的面试反问。";
  return {
    mode: "clarify",
    answer: message,
    sections: {
      conclusion: message,
      evidence: [],
      risks: [],
      nextActions: [
        "粘贴一段 JD 或猎头消息，让系统自动转入 Evidence 分析。",
        "提出一个具体决策问题，例如“这个岗位适合我吗？”",
        "指定一个机会，让系统准备面试反问。"
      ],
      citationSummary: []
    },
    citations: []
  };
}

export async function askCareerAgent(question: string, conversationContext?: ConversationContext): Promise<CareerAskResponse> {
  const cleanQuestion = question.trim();
  if (isAmbiguousCareerQuestion(cleanQuestion) && !conversationContext?.lastAssistantMessage) {
    const answer = "我在。你可以随便说现在卡在哪里，也可以直接丢一段 JD、面试问题或两个机会让我帮你一起看。";
    return {
      mode: "answer",
      answer,
      sections: { conclusion: answer, evidence: [], risks: [], nextActions: [], citationSummary: [] },
      citations: []
    };
  }

  if (/焦虑|压力|紧张|有点累|迷茫|烦/.test(cleanQuestion)) {
    const answer =
      "听起来你现在不是缺一个大计划，而是事情堆在一起让脑子很满。先别急着把所有面试都一次性想完，可以先把它们拆成三类：最重要的一场、最不确定的一场、最容易准备的一场。\n\n" +
      "今天先做一个很小的动作就够：选一场最近的面试，整理 2 个项目故事和 3 个你想反问的问题。你把具体公司或面试类型发我，我可以继续帮你把准备清单压到可执行。";
    return {
      mode: "answer",
      answer,
      sections: {
        conclusion: "先降负荷，再拆面试优先级。",
        evidence: [],
        risks: [],
        nextActions: ["选最近或最重要的一场面试。", "准备 2 个项目故事。", "准备 3 个反问。"],
        citationSummary: []
      },
      citations: []
    };
  }

  if (/需要提供哪些信息|补充哪些信息|还需要什么信息/.test(cleanQuestion)) {
    const answer =
      "如果你想让我判断一个岗位是否适合你，最有用的信息是：完整 JD、公司/团队、薪资职级、工作内容里各部分占比、owner 空间、面试进展，以及你这轮最看重什么。\n\n" +
      "不用一次性都补齐。你可以先发 JD 原文，我会先给初步判断；缺的部分我会在回答后用小提示列出来。";
    return {
      mode: "answer",
      answer,
      sections: {
        conclusion: "先发最关键证据，不需要填表。",
        evidence: [],
        risks: [],
        nextActions: ["完整 JD", "公司/团队", "薪资职级", "owner 空间", "当前优先级"],
        citationSummary: []
      },
      citations: []
    };
  }

  const [memoriesRaw, opportunitiesRaw, risksRaw, decisionsRaw, evidenceRaw] = await Promise.all([
    prisma.memory.findMany({ where: { status: "active" }, orderBy: { updatedAt: "desc" } }),
    prisma.opportunity.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        assessments: { orderBy: { createdAt: "desc" }, take: 1 },
        evidenceLinks: { include: { evidence: true }, take: 2 }
      }
    }),
    prisma.risk.findMany({
      orderBy: { createdAt: "desc" },
      include: { opportunity: true },
      take: 8
    }),
    prisma.decision.findMany({
      orderBy: { createdAt: "desc" },
      include: { opportunity: true },
      take: 8
    }),
    prisma.evidence.findMany({ orderBy: { updatedAt: "desc" }, take: 8 })
  ]);

  const memories = memoriesRaw.map(toMemoryDTO);
  const opportunities = opportunitiesRaw.map(toOpportunityDTO);

  const scoredMemories = memories
    .map((memory) => ({
      memory,
      score:
        scoreText([memory.title, memory.content, memory.tags.join(" "), memory.type].join(" "), cleanQuestion) +
        (["Preference", "Constraint", "CareerGoal", "Project", "ProjectClaim"].includes(memory.type) ? 1 : 0)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item) => item.memory);

  const scoredOpportunities = opportunities
    .map((opportunity) => ({
      opportunity,
      score: scoreText(
        [
          opportunity.roleTitle,
          opportunity.company,
          opportunity.directionTags.join(" "),
          opportunity.requirements.join(" "),
          opportunity.rawSummary ?? ""
        ].join(" "),
        cleanQuestion
      )
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.opportunity);

  const topRisks = risksRaw.slice(0, 3).map(toRiskDTO);
  const topDecisions = decisionsRaw.slice(0, 3).map(toDecisionDTO);
  const linkedEvidenceIds = new Set<string>();
  scoredMemories.forEach((memory) => memory.sourceEvidenceIds.forEach((id) => linkedEvidenceIds.add(id)));
  opportunitiesRaw
    .filter((opportunity) => scoredOpportunities.some((item) => item.id === opportunity.id))
    .forEach((opportunity) => opportunity.evidenceLinks.forEach((link) => linkedEvidenceIds.add(link.evidenceId)));

  const linkedEvidence = evidenceRaw
    .map(toEvidenceDTO)
    .filter((evidence) => linkedEvidenceIds.has(evidence.id))
    .slice(0, 3);

  const conclusion = scoredOpportunities.length
    ? "可以优先推进与 Agent / 后训练 / RL / Reward-Verifier 相关的机会，但推进前要把 owner 空间、团队边界和薪资口径问清楚。"
    : "可以继续围绕 Agent / 后训练 / RL 方向探索，但当前机会证据不足，建议先补充或分析一条具体 JD。";

  const evidence = [
    scoredMemories.length
      ? `相关记忆：${scoredMemories.slice(0, 4).map((memory) => memory.title).join("、")}。`
      : "相关记忆不足，需要补充项目、偏好或约束。",
    scoredOpportunities.length
      ? `相关机会：${scoredOpportunities.map((opportunity) => opportunity.roleTitle).join("、")}。`
      : "当前没有足够相关的 Opportunity 可引用。",
    topDecisions.length
      ? `最近决策：${topDecisions.map((decision) => `${decision.decision}（${decision.confidence}）`).join("、")}。`
      : "当前没有可引用的 Decision。"
  ];

  const risks = topRisks.length
    ? topRisks.map((risk) => `${risk.title}：${risk.description}`)
    : ["目前没有已记录风险，但仍建议确认团队、指标和薪资兑现方式。"];

  const nextActions = [
    "如果你要投递，先问清前三个月核心指标、团队规模、汇报线和 owner 边界。",
    "把薪资拆成 base、年终、绩效系数、签字费、股票和保底口径。",
    scoredOpportunities.length
      ? "打开相关 Opportunity，逐条处理 OpenQuestions 和 Risks。"
      : "粘贴一条具体 JD，用统一输入入口生成 Opportunity 和 Assessment。"
  ];

  const citationSummary = [
    `${scoredMemories.length} 条 Memory`,
    `${scoredOpportunities.length} 条 Opportunity`,
    `${linkedEvidence.length} 条 Evidence`,
    `${topRisks.length} 条 Risk`,
    `${topDecisions.length} 条 Decision`
  ];

  const fallbackAnswer = [
    `结论\n${conclusion}`,
    `依据\n${evidence.map((item) => `- ${item}`).join("\n")}`,
    `风险\n${risks.map((item) => `- ${item}`).join("\n")}`,
    `下一步动作\n${nextActions.map((item) => `- ${item}`).join("\n")}`,
    `引用来源\n${citationSummary.join("；")}`
  ].join("\n\n");

  const citations = uniqById<CareerAgentCitation>([
    ...scoredMemories.slice(0, 4).map(memoryCitation),
    ...scoredOpportunities.slice(0, 3).map(opportunityCitation),
    ...linkedEvidence.map(evidenceCitation),
    ...topRisks.slice(0, 2).map((risk) => ({
      kind: "risk" as const,
      id: risk.id,
      title: risk.title,
      summary: risk.description,
      href: `/opportunities?opportunity=${risk.opportunityId}`
    })),
    ...topDecisions.slice(0, 2).map((decision) => ({
      kind: "decision" as const,
      id: decision.id,
      title: decision.decision,
      summary: decision.rationale,
      href: `/opportunities?opportunity=${decision.opportunityId}`
    }))
  ]);

  let answer = fallbackAnswer;
  const provider = getLLMProvider();
  if (provider.answerCareerQuestion) {
    answer = await provider.answerCareerQuestion(cleanQuestion, {
      conversationContext,
      memories: scoredMemories,
      opportunities: scoredOpportunities,
      risks: topRisks,
      decisions: topDecisions,
      evidence: linkedEvidence,
      fallbackSections: { conclusion, evidence, risks, nextActions, citationSummary }
    });
  }

  return {
    mode: "answer",
    answer,
    sections: {
      conclusion,
      evidence,
      risks,
      nextActions,
      citationSummary
    },
    citations
  };
}
