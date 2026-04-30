"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BriefcaseBusiness, Clock3, FileText, History, MessageSquarePlus, Send, Sparkles } from "lucide-react";
import type { CareerAgentMode } from "@/lib/agent/router/types";
import type { CommandCenterData } from "@/lib/command-center/service";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

const modeLabels: Array<{ value: CareerAgentMode; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "ask_only", label: "Ask only" },
  { value: "analyze_as_evidence", label: "Analyze as evidence" }
];

const starterCards = [
  {
    title: "Analyze a JD",
    description: "Paste a JD, I'll extract the opportunity, match your memory, and generate risks.",
    prompt: "帮我分析这段 JD 是否适合我："
  },
  {
    title: "Prepare an interview",
    description: "Turn an opportunity into project talking points, likely questions, and counter-questions.",
    prompt: "帮我准备淘天交叉面"
  },
  {
    title: "Compare opportunities",
    description: "Compare roles by direction, owner space, compensation, and long-term growth.",
    prompt: "同花顺和淘天哪个更适合我？"
  },
  {
    title: "Update career memory",
    description: "Tell me your new preference or goal; I'll create memory suggestions for review.",
    prompt: "我以后想优先看 Agentic RL 岗位，帮我生成记忆建议。"
  },
  {
    title: "Review pending actions",
    description: "Review memory updates, open questions, and opportunity risks.",
    prompt: "帮我看一下当前有哪些待处理的职业决策动作。"
  },
  {
    title: "Tailor resume bullets",
    description: "Adapt your project bullets to a target JD.",
    prompt: "帮我把项目经历改写成更匹配目标 JD 的简历 bullet。"
  }
];

function shortDate(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function CommandCenter() {
  const router = useRouter();
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [quickInput, setQuickInput] = useState("");
  const [mode, setMode] = useState<CareerAgentMode>("auto");
  const [loading, setLoading] = useState(true);
  const [startingChat, setStartingChat] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/command-center")
      .then((response) => response.json())
      .then((payload: CommandCenterData) => setData(payload))
      .finally(() => setLoading(false));
  }, []);

  const pendingReviewCount = useMemo(() => {
    if (!data) return 0;
    return data.pendingReviewSummary.pendingMemoryUpdatesCount + data.pendingReviewSummary.opportunityActionsCount;
  }, [data]);

  async function startInChat() {
    const clean = quickInput.trim();
    if (!clean) {
      router.push("/chat/new");
      return;
    }
    if (startingChat) return;

    setStartingChat(true);
    setStartError(null);
    try {
      const response = await fetch("/api/chat/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: clean, mode })
      });
      const result = (await response.json()) as { redirectTo?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Failed to start chat.");
      router.push(result.redirectTo ?? "/chat/new");
    } catch (error) {
      setStartError(error instanceof Error ? error.message : "Failed to start chat.");
      setStartingChat(false);
    }
  }

  if (loading || !data) {
    return <EmptyState title="Loading workspace" />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 py-4">
      <section className="pt-8 text-center">
        <p className="text-sm font-medium text-slate-500">Welcome back.</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-normal text-ink">Career Agent is ready.</h1>
        <p className="mx-auto mt-3 max-w-2xl text-base leading-7 text-slate-600">
          Describe a career task in your own words. I will route it through your local memory, evidence, opportunities, and agent trace.
        </p>
      </section>

      <section className="mx-auto max-w-4xl rounded-lg border border-line bg-white p-4 shadow-subtle">
        <textarea
          className="min-h-36 w-full resize-none rounded-md border-0 bg-white px-2 py-2 text-base leading-7 text-ink outline-none"
          placeholder="What career task can I help with?"
          value={quickInput}
          onChange={(event) => setQuickInput(event.target.value)}
        />
        <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {modeLabels.map((item) => (
              <button
                key={item.value}
                type="button"
                className={mode === item.value ? "btn-primary h-8 px-2.5" : "btn h-8 px-2.5"}
                onClick={() => setMode(item.value)}
              >
                {item.label}
              </button>
            ))}
            <Badge tone="neutral">Provider: MockLLMProvider</Badge>
          </div>
          <button className="btn-primary h-10 px-4" onClick={startInChat} disabled={startingChat}>
            <Send size={16} />
            {startingChat ? "Starting" : "Start in Chat"}
          </button>
        </div>
        {startError ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{startError}</p> : null}
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {starterCards.map((card) => (
          <button
            key={card.title}
            type="button"
            className="rounded-lg border border-line bg-white p-4 text-left transition hover:border-focus hover:shadow-subtle"
            onClick={() => setQuickInput(card.prompt)}
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-mist text-focus">
              <Sparkles size={16} />
            </div>
            <h2 className="text-base font-semibold text-ink">{card.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{card.description}</p>
          </button>
        ))}
      </section>

      <section className="grid gap-3 md:grid-cols-5">
        {[
          ["Memories", data.stats.memoriesCount],
          ["Opportunities", data.stats.opportunitiesCount],
          ["Pending reviews", pendingReviewCount],
          ["Open questions", data.stats.openQuestionsCount],
          ["Recent agent runs", data.recentAgentRuns.length]
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-line bg-white p-4">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="rounded-lg border border-line bg-white p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-ink">Pending Review Summary</h2>
              <p className="mt-1 text-sm text-slate-500">Review specific actions from the Chat message that created them.</p>
            </div>
            <Link href="/chat" className="btn">
              Review in Chat
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-line bg-mist p-3">
              <p className="text-xs font-medium text-slate-500">Pending Memory Updates</p>
              <p className="mt-2 text-2xl font-semibold text-ink">{data.pendingReviewSummary.pendingMemoryUpdatesCount}</p>
            </div>
            <div className="rounded-md border border-line bg-mist p-3">
              <p className="text-xs font-medium text-slate-500">Opportunity Actions</p>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {data.pendingReviewSummary.opportunityActionsCount}
              </p>
            </div>
            <div className="rounded-md border border-line bg-mist p-3">
              <p className="text-xs font-medium text-slate-500">Conversations needing review</p>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {data.pendingReviewSummary.conversationsWithPendingCount}
              </p>
            </div>
          </div>
          {data.pendingReviewSummary.unlinkedPendingCount ? (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {data.pendingReviewSummary.unlinkedPendingCount} pending item(s) are not linked to a chat thread yet.
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link className="btn-primary" href={data.recentConversations.find((thread) => thread.pendingCount)?.id ? `/chat/${data.recentConversations.find((thread) => thread.pendingCount)?.id}` : "/chat"}>
              <MessageSquarePlus size={15} />
              Review in Chat
            </Link>
            <Link className="btn" href="/opportunities">
              <BriefcaseBusiness size={15} />
              Open Opportunities
            </Link>
          </div>
        </div>

        <div className="rounded-lg border border-line bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <Clock3 size={17} className="text-focus" />
            <h2 className="text-lg font-semibold text-ink">Recent conversations</h2>
          </div>
          <div className="space-y-2">
            {data.recentConversations.length ? (
              data.recentConversations.slice(0, 6).map((thread) => (
                <Link key={thread.id} href={`/chat/${thread.id}`} className="group block rounded-md border border-line px-3 py-2.5 hover:border-focus">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm font-semibold text-ink">{thread.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{shortDate(thread.lastMessageAt)}</p>
                    </div>
                    <ArrowRight size={15} className="shrink-0 text-slate-400 group-hover:text-focus" />
                  </div>
                </Link>
              ))
            ) : (
              <EmptyState title="No conversations yet" />
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-line bg-white p-4">
          <FileText size={17} className="text-focus" />
          <h2 className="mt-3 text-base font-semibold text-ink">Local-first memory</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Long-term Memory is written only after you accept a MemorySuggestion.</p>
        </div>
        <div className="rounded-lg border border-line bg-white p-4">
          <History size={17} className="text-focus" />
          <h2 className="mt-3 text-base font-semibold text-ink">Traceable agent runs</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Every Chat execution keeps an AgentRun and AgentStep trace.</p>
        </div>
        <div className="rounded-lg border border-line bg-white p-4">
          <BriefcaseBusiness size={17} className="text-focus" />
          <h2 className="mt-3 text-base font-semibold text-ink">Opportunity workflow</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Evidence analysis still creates opportunities, risks, questions, decisions, and review actions.</p>
        </div>
      </section>
    </div>
  );
}
