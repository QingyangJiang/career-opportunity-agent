"use client";

import { useEffect, useState } from "react";
import { FilePlus2, Play, Save, Trash2 } from "lucide-react";
import type { EvidenceDTO } from "@/lib/types";
import { EVIDENCE_TYPES } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

interface EvidenceDraft {
  type: string;
  title: string;
  content: string;
  sourceUrl: string;
}

const emptyDraft: EvidenceDraft = {
  type: "jd",
  title: "",
  content: "",
  sourceUrl: ""
};

function draftFromEvidence(evidence: EvidenceDTO): EvidenceDraft {
  return {
    type: evidence.type,
    title: evidence.title,
    content: evidence.content,
    sourceUrl: evidence.sourceUrl ?? ""
  };
}

export function EvidenceWorkspace() {
  const [items, setItems] = useState<EvidenceDTO[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EvidenceDraft>(emptyDraft);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const selected = items.find((item) => item.id === selectedId) ?? null;

  async function loadEvidence() {
    setLoading(true);
    const response = await fetch("/api/evidence");
    const data = (await response.json()) as EvidenceDTO[];
    setItems(data);
    if (!selectedId && data[0]) {
      setSelectedId(data[0].id);
      setDraft(draftFromEvidence(data[0]));
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadEvidence();
  }, []);

  useEffect(() => {
    if (selected && !isCreating) {
      setDraft(draftFromEvidence(selected));
    }
  }, [selectedId]);

  function startCreate() {
    setIsCreating(true);
    setSelectedId(null);
    setDraft(emptyDraft);
  }

  async function saveDraft() {
    setSaving(true);
    const response = await fetch(isCreating ? "/api/evidence" : `/api/evidence/${selectedId}`, {
      method: isCreating ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft)
    });
    const saved = (await response.json()) as EvidenceDTO;
    await loadEvidence();
    setIsCreating(false);
    setSelectedId(saved.id);
    setDraft(draftFromEvidence(saved));
    setSaving(false);
  }

  async function deleteSelected() {
    if (!selected) return;
    await fetch(`/api/evidence/${selected.id}`, { method: "DELETE" });
    setSelectedId(null);
    setDraft(emptyDraft);
    await loadEvidence();
  }

  async function analyzeSelected() {
    if (!selected) return;
    setAnalyzing(true);
    const response = await fetch(`/api/evidence/${selected.id}/analyze`, { method: "POST" });
    const run = await response.json();
    setAnalyzing(false);
    window.location.href = `/agent-runs?run=${run.id}`;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 border-b border-line pb-4 lg:flex-row lg:items-end">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Evidence</h1>
          <p className="mt-1 text-sm text-slate-600">保存 JD、猎头消息、HR 聊天、面试记录和项目素材。</p>
        </div>
        <button className="btn-primary" onClick={startCreate}>
          <FilePlus2 size={16} />
          New Evidence
        </button>
      </div>

      <div className="grid min-h-[680px] gap-4 lg:grid-cols-[360px_1fr]">
        <aside className="rounded-lg border border-line bg-white">
          <div className="border-b border-line p-3 text-sm font-semibold text-ink">Evidence List</div>
          <div className="max-h-[620px] overflow-y-auto p-2">
            {loading ? (
              <EmptyState title="Loading evidence" />
            ) : items.length === 0 ? (
              <EmptyState title="No evidence" text="新增一条 JD 或聊天记录后即可触发 Agent 分析。" />
            ) : (
              <div className="space-y-2">
                {items.map((item) => (
                  <button
                    key={item.id}
                    className={`w-full rounded-md border p-3 text-left transition ${
                      selectedId === item.id ? "border-focus bg-teal-50" : "border-line bg-white hover:border-focus"
                    }`}
                    onClick={() => {
                      setIsCreating(false);
                      setSelectedId(item.id);
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="truncate text-sm font-semibold text-ink">{item.title}</h2>
                      <Badge tone="blue">{item.type}</Badge>
                    </div>
                    <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600">{item.content}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        <section className="rounded-lg border border-line bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div>
              <h2 className="text-base font-semibold text-ink">{isCreating ? "New Evidence" : selected?.title ?? "Evidence Detail"}</h2>
              <p className="text-xs text-slate-500">{selected?.id ?? "Draft"}</p>
            </div>
            <div className="flex gap-2">
              {selected ? (
                <button className="btn" onClick={analyzeSelected} disabled={analyzing}>
                  <Play size={16} />
                  {analyzing ? "Analyzing" : "Analyze with Agent"}
                </button>
              ) : null}
              {selected ? (
                <button className="btn-danger" onClick={deleteSelected}>
                  <Trash2 size={16} />
                  Delete
                </button>
              ) : null}
              <button className="btn-primary" onClick={saveDraft} disabled={saving || !draft.title || !draft.content}>
                <Save size={16} />
                {saving ? "Saving" : "Save"}
              </button>
            </div>
          </div>

          <div className="space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
              <label className="space-y-1 text-sm font-medium text-slate-700">
                Type
                <select className="field" value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}>
                  {EVIDENCE_TYPES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700">
                Title
                <input className="field" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
              </label>
            </div>

            <label className="space-y-1 text-sm font-medium text-slate-700">
              Source URL
              <input
                className="field"
                value={draft.sourceUrl}
                onChange={(event) => setDraft({ ...draft, sourceUrl: event.target.value })}
              />
            </label>

            <label className="space-y-1 text-sm font-medium text-slate-700">
              Original Content
              <textarea
                className="field min-h-[420px]"
                value={draft.content}
                onChange={(event) => setDraft({ ...draft, content: event.target.value })}
              />
            </label>
          </div>
        </section>
      </div>
    </div>
  );
}
