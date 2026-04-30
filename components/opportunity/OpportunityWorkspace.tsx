"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleHelp, ExternalLink, Target } from "lucide-react";
import type { OpportunityDTO, OpportunityDetailDTO } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

function scoreTone(score: number) {
  if (score >= 80) return "green" as const;
  if (score >= 65) return "amber" as const;
  return "red" as const;
}

function strengthTone(strength: string) {
  if (strength === "high") return "green" as const;
  if (strength === "medium") return "blue" as const;
  if (strength === "low") return "amber" as const;
  return "red" as const;
}

export function OpportunityWorkspace() {
  const [items, setItems] = useState<OpportunityDTO[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OpportunityDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadItems() {
    setLoading(true);
    const response = await fetch("/api/opportunities");
    const data = (await response.json()) as OpportunityDTO[];
    setItems(data);
    const queryId = new URLSearchParams(window.location.search).get("opportunity");
    if (queryId && data.some((item) => item.id === queryId)) {
      setSelectedId(queryId);
    } else if (!selectedId && data[0]) {
      setSelectedId(data[0].id);
    }
    setLoading(false);
  }

  async function loadDetail(id: string) {
    const response = await fetch(`/api/opportunities/${id}`);
    setDetail(await response.json());
  }

  useEffect(() => {
    void loadItems();
  }, []);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId]);

  if (!loading && items.length === 0) {
    return (
      <div className="space-y-5">
        <div className="border-b border-line pb-4">
          <h1 className="text-2xl font-semibold text-ink">Opportunities</h1>
          <p className="mt-1 text-sm text-slate-600">机会会由 Evidence 分析流程生成或更新。</p>
        </div>
        <EmptyState
          title="No opportunities yet"
          text="先到 Evidence 页面打开 demo JD，点击 Analyze with Agent 后会生成机会、评估、风险和匹配关系。"
          action={
            <Link className="btn-primary" href="/evidence">
              Go to Evidence
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 border-b border-line pb-4 lg:flex-row lg:items-end">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Opportunities</h1>
          <p className="mt-1 text-sm text-slate-600">查看机会对象、评估、风险、问题和 Opportunity-Memory Match。</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <aside className="rounded-lg border border-line bg-white">
          <div className="border-b border-line p-3 text-sm font-semibold text-ink">Opportunity List</div>
          <div className="max-h-[720px] overflow-y-auto p-2">
            {items.map((item) => (
              <button
                key={item.id}
                className={`w-full rounded-md border p-3 text-left transition ${
                  selectedId === item.id ? "border-focus bg-teal-50" : "border-line bg-white hover:border-focus"
                }`}
                onClick={() => setSelectedId(item.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-ink">{item.roleTitle}</h2>
                    <p className="mt-1 text-xs text-slate-500">{item.company}</p>
                  </div>
                  <Badge>{item.status}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {item.directionTags.slice(0, 3).map((tag) => (
                    <Badge key={tag} tone="blue">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </aside>

        {detail ? (
          <section className="space-y-4">
            <div className="rounded-lg border border-line bg-white p-4">
              <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="blue">{detail.type}</Badge>
                    <Badge>{detail.status}</Badge>
                    {detail.salaryRange ? <Badge tone="green">{detail.salaryRange}</Badge> : null}
                  </div>
                  <h2 className="mt-3 text-xl font-semibold text-ink">{detail.roleTitle}</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {detail.company}
                    {detail.businessUnit ? ` · ${detail.businessUnit}` : ""}
                    {detail.location ? ` · ${detail.location}` : ""}
                  </p>
                </div>
                {detail.sourceUrl ? (
                  <a className="btn" href={detail.sourceUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={16} />
                    Source
                  </a>
                ) : null}
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-700">{detail.rawSummary}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {detail.directionTags.map((tag) => (
                  <Badge key={tag} tone="blue">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>

            {detail.latestAssessment ? (
              <div className="rounded-lg border border-line bg-white p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Target size={17} className="text-focus" />
                  <h3 className="text-base font-semibold text-ink">Latest Assessment</h3>
                </div>
                <div className="grid gap-3 sm:grid-cols-5">
                  {[
                    ["Overall", detail.latestAssessment.overallScore],
                    ["Direction", detail.latestAssessment.directionMatchScore],
                    ["Experience", detail.latestAssessment.experienceMatchScore],
                    ["Comp", detail.latestAssessment.compensationMatchScore],
                    ["Owner", detail.latestAssessment.ownerSpaceScore]
                  ].map(([label, score]) => (
                    <div key={label} className="rounded-md border border-line bg-mist p-3">
                      <p className="text-xs text-slate-500">{label}</p>
                      <p className="mt-1 text-xl font-semibold text-ink">{score}</p>
                      <Badge tone={scoreTone(Number(score))}>{Number(score) >= 80 ? "strong" : "watch"}</Badge>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-700">{detail.latestAssessment.summary}</p>
              </div>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-2">
              <section className="rounded-lg border border-line bg-white p-4">
                <div className="mb-3 flex items-center gap-2">
                  <CheckCircle2 size={17} className="text-focus" />
                  <h3 className="text-base font-semibold text-ink">Responsibilities</h3>
                </div>
                <ul className="space-y-2 text-sm leading-6 text-slate-700">
                  {detail.responsibilities.map((item) => (
                    <li key={item} className="rounded-md bg-mist px-3 py-2">
                      {item}
                    </li>
                  ))}
                </ul>
              </section>

              <section className="rounded-lg border border-line bg-white p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Target size={17} className="text-focus" />
                  <h3 className="text-base font-semibold text-ink">Requirements</h3>
                </div>
                <ul className="space-y-2 text-sm leading-6 text-slate-700">
                  {detail.requirements.map((item) => (
                    <li key={item} className="rounded-md bg-mist px-3 py-2">
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <section className="rounded-lg border border-line bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <Target size={17} className="text-focus" />
                <h3 className="text-base font-semibold text-ink">Opportunity-Memory Match View</h3>
              </div>
              <div className="space-y-3">
                {detail.memoryMatches.map((match) => (
                  <div key={match.id} className="rounded-md border border-line p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-ink">{match.requirement}</p>
                      <Badge tone={strengthTone(match.strength)}>{match.strength}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-slate-700">
                      匹配记忆：{match.memoryTitle ?? "未找到直接匹配"}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{match.rationale}</p>
                    {match.evidenceIds.length ? (
                      <p className="mt-2 text-xs text-slate-500">Evidence: {match.evidenceIds.join(", ")}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>

            <div className="grid gap-4 xl:grid-cols-3">
              <section className="rounded-lg border border-line bg-white p-4">
                <div className="mb-3 flex items-center gap-2">
                  <AlertTriangle size={17} className="text-amber-700" />
                  <h3 className="text-base font-semibold text-ink">Risks</h3>
                </div>
                <div className="space-y-3">
                  {detail.risks.map((risk) => (
                    <div key={risk.id} className="rounded-md border border-line p-3">
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={risk.severity === "high" ? "red" : risk.severity === "medium" ? "amber" : "neutral"}>
                          {risk.severity}
                        </Badge>
                        <Badge>{risk.likelihood}</Badge>
                      </div>
                      <h4 className="mt-2 text-sm font-semibold text-ink">{risk.title}</h4>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{risk.description}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-line bg-white p-4">
                <div className="mb-3 flex items-center gap-2">
                  <CircleHelp size={17} className="text-sky-700" />
                  <h3 className="text-base font-semibold text-ink">Open Questions</h3>
                </div>
                <div className="space-y-3">
                  {detail.openQuestions.map((question) => (
                    <div key={question.id} className="rounded-md border border-line p-3">
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={question.priority === "high" ? "amber" : "neutral"}>{question.priority}</Badge>
                        <Badge tone="blue">{question.target}</Badge>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-700">{question.question}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-line bg-white p-4">
                <div className="mb-3 flex items-center gap-2">
                  <CheckCircle2 size={17} className="text-focus" />
                  <h3 className="text-base font-semibold text-ink">Decisions</h3>
                </div>
                <div className="space-y-3">
                  {detail.decisions.map((decision) => (
                    <div key={decision.id} className="rounded-md border border-line p-3">
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={decision.decision === "pursue" ? "green" : "amber"}>{decision.decision}</Badge>
                        <Badge>{decision.confidence}</Badge>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-700">{decision.rationale}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </section>
        ) : (
          <EmptyState title="Loading opportunity detail" />
        )}
      </div>
    </div>
  );
}
