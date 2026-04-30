import { loadEnvConfig } from "@next/env";
import { existsSync, mkdirSync, readdirSync, copyFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { judgeCase, type CaseObservation, type EvalExpectations, type TurnObservation } from "./judge";

interface EvalCase {
  id: string;
  title: string;
  provider: "deepseek-flash" | "mock-smoke";
  turns: Array<{ user: string }>;
  expectations: EvalExpectations;
}

interface CliOptions {
  provider: "deepseek-flash" | "mock-smoke";
  caseId?: string;
  maxCases?: number;
}

const EVAL_CONFIG = {
  provider: "deepseek" as const,
  model: "deepseek-v4-flash",
  thinking: "disabled" as const,
  reasoningEffort: "none" as const,
  temperature: 0.2,
  maxTokens: 2000,
  timeoutMs: 60000,
  stream: false
};

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const get = (name: string) => args.find((arg) => arg.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
  const provider = (get("provider") ?? "deepseek-flash") as CliOptions["provider"];
  if (provider !== "deepseek-flash" && provider !== "mock-smoke") {
    throw new Error(`Unsupported provider ${provider}. Use deepseek-flash or mock-smoke.`);
  }
  return {
    provider,
    caseId: get("case"),
    maxCases: get("maxCases") ? Number(get("maxCases")) : undefined
  };
}

function loadCases(options: CliOptions): EvalCase[] {
  const casesDir = resolve("evals/career-agent/cases");
  const all = readdirSync(casesDir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => JSON.parse(require("node:fs").readFileSync(join(casesDir, file), "utf8")) as EvalCase);
  const filtered = all.filter((item) => (options.caseId ? item.id === options.caseId : true));
  const providerCases =
    options.provider === "mock-smoke"
      ? filtered.slice(0, 1).map((item) => ({
          ...item,
          provider: "mock-smoke" as const,
          expectations: {
            shouldCreateEvidence: false,
            shouldCreateOpportunity: false,
            shouldCreateDecision: false,
            maxMemorySuggestions: 0,
            maxRisks: 0,
            maxOpenQuestions: 0
          }
        }))
      : filtered.filter((item) => item.provider === "deepseek-flash");
  return typeof options.maxCases === "number" ? providerCases.slice(0, options.maxCases) : providerCases;
}

function prepareEvalDb() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const historyDir = resolve("evals/career-agent/history");
  mkdirSync(historyDir, { recursive: true });
  const dbPath = join(historyDir, `eval-${stamp}.db`);
  const source = resolve("prisma/dev.db");
  if (existsSync(source)) copyFileSync(source, dbPath);
  process.env.DATABASE_URL = `file:../evals/career-agent/history/${dbPath.split("/").pop()}`;
  return dbPath;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function countPending(metadata: any) {
  const created = metadata?.createdObjects ?? {};
  return (created.memorySuggestionsCount ?? 0) + (created.risksCount ?? 0) + (created.openQuestionsCount ?? 0);
}

async function observeCase(testCase: EvalCase, providerConfig: any): Promise<CaseObservation> {
  const { sendMessage } = await import("../../lib/chat/service");
  const { prisma } = await import("../../lib/db/prisma");
  let threadId: string | null = null;
  const turns: TurnObservation[] = [];
  const memoryBefore = await prisma.memory.count();
  for (const [index, turn] of testCase.turns.entries()) {
    const started = performance.now();
    let result: any;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        result = await withTimeout(
          sendMessage(threadId, turn.user, "auto", { triggerType: "eval", providerConfig }),
          providerConfig.timeoutMs ?? 60000,
          `${testCase.id} turn ${index + 1}`
        );
        break;
      } catch (error) {
        if (attempt === 1 || error instanceof Error && error.message.includes("timed out")) throw error;
      }
    }
    const latencyMs = Math.round(performance.now() - started);
    threadId = result.thread.id;
    const metadata = (result.assistantMessage.metadata ?? {}) as any;
    const created = metadata.createdObjects ?? {};
    const provider = metadata.provider ?? {};
    const conversationContext = metadata.conversationContext ?? {};
    const memoryAfter = await prisma.memory.count();
    turns.push({
      user: turn.user,
      assistant: result.assistantMessage.content,
      intent: metadata.classification?.intent,
      currentInputType: metadata.answerPlan?.currentInputType ?? metadata.classification?.currentInputType,
      conversationIntent: metadata.answerPlan?.conversationIntent,
      actionLevel: metadata.actionLevel ?? metadata.classification?.actionLevel,
      followUpType: metadata.classification?.followUpType ?? conversationContext.followUpType,
      evidenceSufficiency: metadata.evidenceSufficiency ?? metadata.classification?.evidenceSufficiency,
      memorySignalStrength: metadata.memorySignalStrength ?? metadata.classification?.memorySignalStrength,
      provider: provider.provider,
      model: provider.model,
      agentRunId: result.assistantMessage.agentRunId,
      agentRunStatus: result.result.agentRun.status,
      agentStepsCount: metadata.agentSteps?.length ?? result.result.agentRun.steps?.length ?? 0,
      createdEvidence: Boolean(created.evidence),
      createdOpportunity: Boolean(created.opportunity),
      createdDecision: Boolean(created.decision),
      memorySuggestionsCount: created.memorySuggestionsCount ?? 0,
      risksCount: created.risksCount ?? 0,
      openQuestionsCount: created.openQuestionsCount ?? 0,
      pendingActionsCount: countPending(metadata),
      directMemoryCreated: memoryAfter - memoryBefore,
      memorySuggestionTypes: (created.memorySuggestions ?? []).map((item: any) => item.suggestedType),
      artifactTypes: (metadata.artifactActions ?? []).map((item: any) => item.type),
      structuredCardsCount: metadata.structuredCards?.length ?? 0,
      missingFieldsCount: metadata.missingFields?.length ?? 0,
      shouldShowInfoGaps: metadata.shouldShowInfoGaps ?? metadata.classification?.shouldShowInfoGaps,
      latencyMs,
      tokenUsage: provider.tokenUsage,
      usedRecentMessagesCount: conversationContext.usedRecentMessagesCount ?? metadata.classification?.usedRecentMessagesCount,
      usedLastAssistantAnswer: conversationContext.usedLastAssistantAnswer ?? metadata.classification?.usedLastAssistantAnswer,
      resolvedReference: conversationContext.resolvedReference ?? metadata.classification?.resolvedReference
    });
  }
  return {
    id: testCase.id,
    title: testCase.title,
    provider: providerConfig.provider,
    model: providerConfig.model,
    turns
  };
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function writeReports(payload: any) {
  writeFileSync(resolve("evals/career-agent/report.json"), JSON.stringify(payload, null, 2));
  const lines: string[] = [];
  lines.push("# Career Agent Eval Report", "");
  lines.push(`- provider/model: ${payload.provider}/${payload.model}`);
  lines.push(`- total cases: ${payload.summary.totalCases}`);
  lines.push(`- passed cases: ${payload.summary.passedCases}`);
  lines.push(`- failed cases: ${payload.summary.failedCases}`);
  lines.push(`- hard assertion pass rate: ${(payload.summary.hardPassRate * 100).toFixed(1)}%`);
  lines.push(`- average soft score: ${payload.summary.averageSoftScore.toFixed(2)} / 5`);
  lines.push(`- avg latency: ${payload.summary.avgLatencyMs}ms`);
  lines.push(`- p95 latency: ${payload.summary.p95LatencyMs}ms`);
  lines.push(`- timeout failures: ${payload.summary.timeoutCount}`);
  lines.push(`- stop reason: ${payload.stopReason}`, "");
  lines.push("## Cases", "");
  for (const item of payload.results) {
    lines.push(`### ${item.case.id}: ${item.case.title}`);
    lines.push(`- pass/fail: ${item.judgement.passed ? "PASS" : "FAIL"}`);
    lines.push(`- latency: ${item.observation.turns.reduce((sum: number, turn: any) => sum + turn.latencyMs, 0) + (item.observation.timeoutLatencyMs ?? 0)}ms`);
    lines.push(`- provider/model: ${item.observation.provider}/${item.observation.model}`);
    lines.push(`- error taxonomy: ${item.judgement.errorTaxonomy.join(", ") || "none"}`);
    lines.push(`- suggested fix: ${item.judgement.suggestedFixes.join(" | ") || "none"}`);
    lines.push("- turns:");
    for (const turn of item.observation.turns) {
      lines.push(`  - user: ${turn.user}`);
      lines.push(`    assistant summary: ${turn.assistant.slice(0, 220).replace(/\n/g, " ")}${turn.assistant.length > 220 ? "..." : ""}`);
      lines.push(`    created: evidence=${turn.createdEvidence}, opportunity=${turn.createdOpportunity}, decision=${turn.createdDecision}, memorySuggestions=${turn.memorySuggestionsCount}, risks=${turn.risksCount}, openQuestions=${turn.openQuestionsCount}`);
      lines.push(`    trace: agentRun=${turn.agentRunId ?? "missing"}, steps=${turn.agentStepsCount}, actionLevel=${turn.actionLevel}, evidence=${turn.evidenceSufficiency}`);
      if (turn.intent === "follow_up") lines.push(`    follow-up: type=${turn.followUpType}, usedLastAssistant=${turn.usedLastAssistantAnswer}, resolved=${turn.resolvedReference ?? ""}`);
    }
    const failed = item.judgement.hardAssertions.filter((assertion: any) => !assertion.passed);
    lines.push(`- hard assertion failures: ${failed.map((assertion: any) => `${assertion.name} (${assertion.detail})`).join("; ") || "none"}`, "");
  }
  lines.push("## Before / After", "");
  lines.push("Initial run is the baseline for this harness. Future runs can compare against files in `evals/career-agent/history/`.");
  lines.push("");
  writeFileSync(resolve("evals/career-agent/report.md"), lines.join("\n"));
}

async function main() {
  loadEnvConfig(process.cwd());
  const options = parseArgs();
  const cases = loadCases(options);
  const providerConfig =
    options.provider === "mock-smoke"
      ? { provider: "mock", model: "MockLLMProvider", providerLabel: "MockLLMProvider", thinking: "disabled", reasoningEffort: "none", timeoutMs: 60000 }
      : { ...EVAL_CONFIG, providerLabel: "DeepSeek Flash" };

  if (options.provider === "deepseek-flash" && !process.env.DEEPSEEK_API_KEY?.trim()) {
    const payload = {
      provider: "deepseek",
      model: "deepseek-v4-flash",
      skipped: true,
      stopReason: "missing DEEPSEEK_API_KEY",
      summary: { totalCases: cases.length, passedCases: 0, failedCases: 0, hardPassRate: 0, averageSoftScore: 0, avgLatencyMs: 0, p95LatencyMs: 0, timeoutCount: 0 },
      results: []
    };
    writeReports(payload);
    console.log("DeepSeek Flash eval skipped: DEEPSEEK_API_KEY is not configured.");
    return;
  }

  const dbPath = prepareEvalDb();
  const results = [];
  for (const testCase of cases) {
    let observation: CaseObservation;
    try {
      observation = await observeCase(testCase, providerConfig);
    } catch (error) {
      observation = {
        id: testCase.id,
        title: testCase.title,
        provider: providerConfig.provider,
        model: providerConfig.model,
        turns: [],
        timedOut: error instanceof Error && error.message.includes("timed out"),
        timeoutLatencyMs: error instanceof Error && error.message.includes("timed out") ? providerConfig.timeoutMs ?? 60000 : undefined,
        error: error instanceof Error ? error.message : String(error)
      };
    }
    const judgement = judgeCase(observation, testCase.expectations);
    results.push({ case: testCase, observation, judgement });
    console.log(`${judgement.passed ? "PASS" : "FAIL"} ${testCase.id}`);
  }

  const latencies = results.flatMap((item) => {
    const turnLatencies = item.observation.turns.map((turn) => turn.latencyMs);
    return item.observation.timeoutLatencyMs ? [...turnLatencies, item.observation.timeoutLatencyMs] : turnLatencies;
  });
  const hardAssertions = results.flatMap((item) => item.judgement.hardAssertions);
  const hardPassRate = hardAssertions.length ? hardAssertions.filter((item) => item.passed).length / hardAssertions.length : 0;
  const averageSoftScore = results.length ? results.reduce((sum, item) => sum + item.judgement.averageSoftScore, 0) / results.length : 0;
  const avgLatencyMs = latencies.length ? Math.round(latencies.reduce((sum, item) => sum + item, 0) / latencies.length) : 0;
  const p95LatencyMs = percentile(latencies, 95);
  const passedCases = results.filter((item) => item.judgement.passed).length;
  const latencyWarning = avgLatencyMs > 15000 || p95LatencyMs > 30000;
  const stopReason =
    latencyWarning
      ? "latency warning"
      : hardPassRate >= 0.95 && averageSoftScore >= 4.2
        ? "quality threshold met"
        : "max iterations not run; report generated for minimal-fix review";
  const payload = {
    provider: providerConfig.provider,
    model: providerConfig.model,
    evalConfig: providerConfig,
    dbPath,
    stopReason,
    summary: {
      totalCases: results.length,
      passedCases,
      failedCases: results.length - passedCases,
      hardPassRate,
      averageSoftScore,
      avgLatencyMs,
      p95LatencyMs,
      timeoutCount: results.filter((item) => item.observation.timedOut).length
    },
    results
  };
  writeReports(payload);
  console.log(`Report written to evals/career-agent/report.md`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
