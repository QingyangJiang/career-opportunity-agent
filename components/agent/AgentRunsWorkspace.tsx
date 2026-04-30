"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, CheckCircle2, ClipboardList, Inbox, PlayCircle, RefreshCw, X } from "lucide-react";
import type { AgentRunDTO, AgentStepDTO, MemorySuggestionDTO, OpportunityDetailDTO } from "@/lib/types";
import { MEMORY_TYPES } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

interface SuggestionDraft {
  suggestedType: string;
  title: string;
  content: string;
  tags: string;
  confidence: number;
  sourceEvidenceIds: string;
}

function draftFromSuggestion(suggestion: MemorySuggestionDTO): SuggestionDraft {
  return {
    suggestedType: suggestion.suggestedType,
    title: suggestion.title,
    content: suggestion.content,
    tags: suggestion.tags.join(", "),
    confidence: suggestion.confidence,
    sourceEvidenceIds: suggestion.sourceEvidenceIds.join(", ")
  };
}

function stepOutput<T = unknown>(steps: AgentStepDTO[] | undefined, name: string): T | null {
  const step = steps?.find((item) => item.stepName === name);
  return step?.output as T | null;
}

function sourceLabel(run: AgentRunDTO) {
  if (run.triggerType === "home_quick_start") return "Chat · Home Quick Start";
  if (run.chatThreadId) return "Chat";
  return run.triggerType ?? "Manual";
}

export function AgentRunsWorkspace() {
  const [runs, setRuns] = useState<AgentRunDTO[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, SuggestionDraft>>({});
  const [sourceOpportunity, setSourceOpportunity] = useState<OpportunityDetailDTO | null>(null);

  const selected = runs.find((run) => run.id === selectedId) ?? null;

  async function loadRuns(preferredId?: string | null) {
    setLoading(true);
    const response = await fetch("/api/agent-runs");
    const data = (await response.json()) as AgentRunDTO[];
    setRuns(data);
    const queryId =
      preferredId ??
      (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("run") : null);
    const nextSelected = queryId && data.some((run) => run.id === queryId) ? queryId : selectedId ?? data[0]?.id ?? null;
    setSelectedId(nextSelected);
    setLoading(false);
  }

  useEffect(() => {
    void loadRuns();
  }, []);

  useEffect(() => {
    if (!selected?.suggestions) return;
    setDrafts((current) => {
      const next = { ...current };
      selected.suggestions?.forEach((suggestion) => {
        next[suggestion.id] = next[suggestion.id] ?? draftFromSuggestion(suggestion);
      });
      return next;
    });
  }, [selectedId, selected?.suggestions?.length]);

  const artifacts = useMemo(() => {
    return {
      opportunity: stepOutput<{ draft: unknown; opportunityId: string }>(selected?.steps, "extract_opportunity"),
      assessment: stepOutput(selected?.steps, "generate_assessment"),
      risks: stepOutput(selected?.steps, "generate_risks"),
      questions: stepOutput(selected?.steps, "generate_open_questions"),
      decision: stepOutput(selected?.steps, "generate_decision")
    };
  }, [selected]);

  useEffect(() => {
    const opportunityId = artifacts.opportunity?.opportunityId;
    if (!opportunityId) {
      setSourceOpportunity(null);
      return;
    }
    void fetch(`/api/opportunities/${opportunityId}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((detail: OpportunityDetailDTO | null) => setSourceOpportunity(detail));
  }, [artifacts.opportunity?.opportunityId]);

  async function acceptSuggestion(suggestion: MemorySuggestionDTO) {
    const draft = drafts[suggestion.id] ?? draftFromSuggestion(suggestion);
    await fetch(`/api/memory-suggestions/${suggestion.id}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: draft.suggestedType,
        title: draft.title,
        content: draft.content,
        tags: draft.tags,
        confidence: draft.confidence,
        sourceEvidenceIds: draft.sourceEvidenceIds
      })
    });
    await loadRuns(selectedId);
  }

  async function rejectSuggestion(suggestion: MemorySuggestionDTO) {
    await fetch(`/api/memory-suggestions/${suggestion.id}/reject`, { method: "POST" });
    await loadRuns(selectedId);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 border-b border-line pb-4 lg:flex-row lg:items-end">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Agent Runs</h1>
          <p className="mt-1 text-sm text-slate-600">查看 Analyze Evidence 的每一步 trace，并手动处理 MemorySuggestions。</p>
        </div>
        <button className="btn" onClick={() => loadRuns(selectedId)}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {loading ? (
        <EmptyState title="Loading runs" />
      ) : runs.length === 0 ? (
        <EmptyState title="No agent runs" text="到 Evidence 页面点击 Analyze with Agent 后，这里会出现完整 workflow trace。" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <aside className="rounded-lg border border-line bg-white">
            <div className="border-b border-line p-3 text-sm font-semibold text-ink">Run List</div>
            <div className="max-h-[720px] overflow-y-auto p-2">
              {runs.map((run) => (
                <button
                  key={run.id}
                  className={`w-full rounded-md border p-3 text-left transition ${
                    selectedId === run.id ? "border-focus bg-teal-50" : "border-line bg-white hover:border-focus"
                  }`}
                  onClick={() => setSelectedId(run.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-ink">{run.workflowType}</h2>
                    <Badge tone={run.status === "completed" ? "green" : run.status === "failed" ? "red" : "amber"}>
                      {run.status}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{new Date(run.createdAt).toLocaleString()}</p>
                  <p className="mt-1 text-xs text-slate-500">{run.steps?.length ?? 0} steps · {run.suggestions?.length ?? 0} suggestions</p>
                  <p className="mt-1 text-xs text-slate-500">Source: {sourceLabel(run)}</p>
                </button>
              ))}
            </div>
          </aside>

          {selected ? (
            <section className="space-y-4">
              <div className="rounded-lg border border-line bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <PlayCircle size={17} className="text-focus" />
                      <h2 className="text-lg font-semibold text-ink">{selected.workflowType}</h2>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{selected.id}</p>
                    {selected.chatThreadId ? (
                      <div className="mt-3 space-y-1 text-sm text-slate-700">
                        <p>
                          <span className="font-semibold text-ink">Source:</span> {sourceLabel(selected)}
                        </p>
                        <p>
                          <span className="font-semibold text-ink">Thread:</span>{" "}
                          {selected.chatThreadTitle ?? selected.chatThreadId}
                        </p>
                        <p className="line-clamp-2">
                          <span className="font-semibold text-ink">User message:</span>{" "}
                          {selected.sourceMessageContent ?? selected.sourceMessageText ?? "Unavailable"}
                        </p>
                        <a className="inline-flex font-medium text-focus hover:underline" href={`/chat/${selected.chatThreadId}`}>
                          Open source chat
                        </a>
                      </div>
                    ) : null}
                  </div>
                  <Badge tone={selected.status === "completed" ? "green" : selected.status === "failed" ? "red" : "amber"}>
                    {selected.status}
                  </Badge>
                </div>
              </div>

              <section className="rounded-lg border border-line bg-white p-4">
                <div className="mb-3 flex items-center gap-2">
                  <ClipboardList size={17} className="text-focus" />
                  <h3 className="text-base font-semibold text-ink">Generated Artifacts</h3>
                </div>
                <div className="grid gap-3 xl:grid-cols-2">
                  {Object.entries(artifacts).map(([name, value]) => (
                    <div key={name} className="rounded-md border border-line bg-mist p-3">
                      <p className="mb-2 text-sm font-semibold capitalize text-ink">{name}</p>
                      <pre className="max-h-64 overflow-auto text-xs leading-5 text-slate-700">
                        {value ? JSON.stringify(value, null, 2) : "Not generated"}
                      </pre>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-line bg-white p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Inbox size={17} className="text-focus" />
                  <h3 className="text-base font-semibold text-ink">Pending Actions</h3>
                </div>
                <div className="grid gap-3 xl:grid-cols-2">
                  <div className="rounded-md border border-line bg-mist p-3">
                    <p className="text-sm font-semibold text-ink">Memory Updates</p>
                    {selected.suggestions?.length ? (
                      <div className="mt-2 space-y-2">
                        {selected.suggestions.map((suggestion) => (
                          <div key={suggestion.id} className="rounded-md border border-line bg-white p-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge tone={suggestion.status === "pending" ? "amber" : suggestion.status === "accepted" ? "green" : "red"}>
                                {suggestion.status}
                              </Badge>
                              <p className="text-sm font-semibold text-ink">{suggestion.title}</p>
                            </div>
                            {suggestion.handledAt ? <p className="mt-1 text-xs text-slate-500">Handled {new Date(suggestion.handledAt).toLocaleString()}</p> : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-slate-500">No MemorySuggestions generated.</p>
                    )}
                  </div>
                  <div className="rounded-md border border-line bg-mist p-3">
                    <p className="text-sm font-semibold text-ink">Opportunity Follow-ups</p>
                    {sourceOpportunity ? (
                      <div className="mt-2 space-y-2">
                        {sourceOpportunity.openQuestions.slice(0, 4).map((question) => (
                          <div key={question.id} className="rounded-md border border-line bg-white p-2">
                            <Badge tone={question.status === "answered" ? "green" : "amber"}>{question.status}</Badge>
                            <p className="mt-1 line-clamp-2 text-sm text-slate-700">{question.question}</p>
                            {question.answer ? <p className="mt-1 text-xs text-slate-500">Answer: {question.answer}</p> : null}
                          </div>
                        ))}
                        {sourceOpportunity.risks.slice(0, 4).map((risk) => (
                          <div key={risk.id} className="rounded-md border border-line bg-white p-2">
                            <Badge tone={risk.status === "resolved" ? "green" : "amber"}>{risk.status}</Badge>
                            <p className="mt-1 line-clamp-2 text-sm text-slate-700">{risk.title}</p>
                            {risk.mitigation ? <p className="mt-1 text-xs text-slate-500">Mitigation: {risk.mitigation}</p> : null}
                          </div>
                        ))}
                        <a className="btn h-8 px-2" href={`/opportunities?opportunity=${sourceOpportunity.id}`}>
                          Open Opportunity
                        </a>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-slate-500">No Opportunity follow-ups generated.</p>
                    )}
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-line bg-white p-4">
                <div className="mb-3 flex items-center gap-2">
                  <CheckCircle2 size={17} className="text-focus" />
                  <h3 className="text-base font-semibold text-ink">Step Trace</h3>
                </div>
                <div className="space-y-3">
                  {selected.steps?.map((step) => (
                    <details key={step.id} className="rounded-md border border-line bg-white p-3" open>
                      <summary className="cursor-pointer text-sm font-semibold text-ink">
                        {step.stepName} <Badge tone={step.status === "completed" ? "green" : "red"}>{step.status}</Badge>
                      </summary>
                      <p className="mt-2 text-xs text-slate-500">{step.inputSummary}</p>
                      {step.errorMessage ? <p className="mt-2 text-sm text-red-700">{step.errorMessage}</p> : null}
                      <pre className="mt-3 max-h-80 overflow-auto rounded-md bg-slate-950 p-3 text-xs leading-5 text-slate-100">
                        {JSON.stringify(step.output, null, 2)}
                      </pre>
                    </details>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-line bg-white p-4">
                <h3 className="mb-3 text-base font-semibold text-ink">MemorySuggestions</h3>
                {selected.suggestions?.length ? (
                  <div className="space-y-3">
                    {selected.suggestions.map((suggestion) => {
                      const draft = drafts[suggestion.id] ?? draftFromSuggestion(suggestion);
                      const pending = suggestion.status === "pending";
                      return (
                        <div key={suggestion.id} className="rounded-md border border-line p-3">
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap gap-2">
                              <Badge tone={pending ? "amber" : suggestion.status === "accepted" ? "green" : "red"}>
                                {suggestion.status}
                              </Badge>
                              <Badge tone="blue">{suggestion.suggestedType}</Badge>
                              <Badge>{Math.round(suggestion.confidence * 100)}%</Badge>
                            </div>
                            {pending ? (
                              <div className="flex gap-2">
                                <button className="btn-primary" onClick={() => acceptSuggestion(suggestion)}>
                                  <Check size={16} />
                                  Accept
                                </button>
                                <button className="btn-danger" onClick={() => rejectSuggestion(suggestion)}>
                                  <X size={16} />
                                  Reject
                                </button>
                              </div>
                            ) : null}
                          </div>

                          {pending ? (
                            <div className="grid gap-3">
                              <select
                                className="field"
                                value={draft.suggestedType}
                                onChange={(event) =>
                                  setDrafts({
                                    ...drafts,
                                    [suggestion.id]: { ...draft, suggestedType: event.target.value }
                                  })
                                }
                              >
                                {MEMORY_TYPES.map((item) => (
                                  <option key={item} value={item}>
                                    {item}
                                  </option>
                                ))}
                              </select>
                              <input
                                className="field"
                                value={draft.title}
                                onChange={(event) =>
                                  setDrafts({ ...drafts, [suggestion.id]: { ...draft, title: event.target.value } })
                                }
                              />
                              <textarea
                                className="field min-h-24"
                                value={draft.content}
                                onChange={(event) =>
                                  setDrafts({ ...drafts, [suggestion.id]: { ...draft, content: event.target.value } })
                                }
                              />
                              <div className="grid gap-3 sm:grid-cols-3">
                                <input
                                  className="field"
                                  value={draft.tags}
                                  onChange={(event) =>
                                    setDrafts({ ...drafts, [suggestion.id]: { ...draft, tags: event.target.value } })
                                  }
                                />
                                <input
                                  className="field"
                                  value={draft.sourceEvidenceIds}
                                  onChange={(event) =>
                                    setDrafts({
                                      ...drafts,
                                      [suggestion.id]: { ...draft, sourceEvidenceIds: event.target.value }
                                    })
                                  }
                                />
                                <label className="space-y-1 text-xs font-medium text-slate-600">
                                  Confidence {Math.round(draft.confidence * 100)}%
                                  <input
                                    className="w-full accent-teal-700"
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={draft.confidence}
                                    onChange={(event) =>
                                      setDrafts({
                                        ...drafts,
                                        [suggestion.id]: { ...draft, confidence: Number(event.target.value) }
                                      })
                                    }
                                  />
                                </label>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <h4 className="text-sm font-semibold text-ink">{suggestion.title}</h4>
                              <p className="mt-2 text-sm leading-6 text-slate-700">{suggestion.content}</p>
                            </div>
                          )}
                          <p className="mt-3 text-xs leading-5 text-slate-500">Reason: {suggestion.reason}</p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState title="No suggestions" />
                )}
              </section>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
