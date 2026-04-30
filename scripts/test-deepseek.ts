import { loadEnvConfig } from "@next/env";
import { DeepSeekProvider } from "../lib/llm/deepseek-provider";
import { isDeepSeekConfigured } from "../lib/llm/config";
import type { AssessmentDraft, OpportunityDraft } from "../lib/llm/types";
import type { EvidenceDTO } from "../lib/types";

async function main() {
  loadEnvConfig(process.cwd());
  if (!isDeepSeekConfigured()) {
    console.log("DeepSeek smoke test skipped: DEEPSEEK_API_KEY is not configured.");
    return;
  }

  const flash = new DeepSeekProvider({
    provider: "deepseek",
    model: process.env.DEEPSEEK_DEFAULT_MODEL || "deepseek-v4-flash",
    thinking: "disabled"
  });

  const basic = await flash.chat?.("请用一句中文回复：DeepSeek API connected.");
  if (!basic?.trim()) throw new Error("basic chat returned empty content");
  console.log("basic chat: ok");

  const classification = await flash.classifyCareerInput?.("测试 query");
  if (!classification || classification.intent !== "clarify") {
    throw new Error(`expected clarify, got ${classification?.intent}`);
  }
  console.log("JSON classification: ok");

  const external = await flash.classifyCareerInput?.("帮我找下豆包的 JD");
  if (!external || !["needs_external_source", "missing_context"].includes(external.intent)) {
    throw new Error(`expected needs_external_source, got ${external?.intent}`);
  }
  console.log("needs external source: ok");

  const evidence: EvidenceDTO = {
    id: "smoke-evidence",
    title: "Agent RL JD smoke test",
    type: "jd",
    sourceUrl: null,
    content: "岗位职责：负责 Agent 场景下的 GRPO、RLHF、Reward Model 和 Verifier；构建评测和数据闭环；薪资 70k-90k，15薪。",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const jdClassification = await flash.classifyCareerInput?.(evidence.content);
  if (!jdClassification || jdClassification.intent !== "analyze_evidence") {
    throw new Error(`expected analyze_evidence, got ${jdClassification?.intent}`);
  }
  const opportunity = await flash.extractOpportunity(evidence);
  if (!opportunity.roleTitle || !opportunity.directionTags.length) {
    throw new Error("extractOpportunity returned incomplete JSON");
  }
  const assessment = await flash.generateAssessment(opportunity, [], {
    matches: [],
    matchedMemoryIds: [],
    coverageScore: 0,
    gapSignals: []
  });
  const risks = await flash.generateRisks(opportunity, [], assessment);
  const openQuestions = await flash.generateOpenQuestions(opportunity, risks);
  const decision = await flash.generateDecision(opportunity, assessment, risks);
  const memorySuggestions = await flash.suggestMemoryUpdates(evidence, opportunity, assessment);
  if (!decision.decision || !Array.isArray(openQuestions) || !Array.isArray(memorySuggestions)) {
    throw new Error("analyze evidence JSON smoke test returned incomplete data");
  }
  console.log("analyze evidence JSON: ok");

  const memoryEvidence: EvidenceDTO = {
    ...evidence,
    id: "smoke-memory-input",
    title: "Memory preference smoke test",
    type: "user_note",
    content: "以后我优先看 Agentic RL，纯预训练暂不考虑"
  };
  const memoryOpportunity: OpportunityDraft = {
    type: "user_note",
    company: "self",
    roleTitle: "Career preference",
    status: "discovered",
    directionTags: ["Agentic RL"],
    responsibilities: [],
    requirements: [],
    rawSummary: memoryEvidence.content
  };
  const memoryAssessment: AssessmentDraft = {
    overallScore: 70,
    directionMatchScore: 70,
    experienceMatchScore: 70,
    compensationMatchScore: 50,
    ownerSpaceScore: 50,
    summary: memoryEvidence.content,
    strongMatches: [],
    weakMatches: []
  };
  const suggestions = await flash.suggestMemoryUpdates(memoryEvidence, memoryOpportunity, memoryAssessment);
  if (!suggestions.length) throw new Error("expected memory suggestions");
  console.log("update memory JSON: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
