"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, History, LayoutGrid, List, Plus, RotateCcw, Save, Search, Trash2, X } from "lucide-react";
import type { MemoryDTO, MemoryVersionDTO } from "@/lib/types";
import { MEMORY_TYPES } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

type ViewMode = "board" | "table";

interface MemoryDraft {
  type: string;
  title: string;
  content: string;
  tags: string;
  confidence: number;
  userVerified: boolean;
  status: string;
  sourceEvidenceIds: string;
  changeReason: string;
}

const emptyDraft: MemoryDraft = {
  type: "Skill",
  title: "",
  content: "",
  tags: "",
  confidence: 0.75,
  userVerified: true,
  status: "active",
  sourceEvidenceIds: "",
  changeReason: "Manual edit"
};

function draftFromMemory(memory: MemoryDTO): MemoryDraft {
  return {
    type: memory.type,
    title: memory.title,
    content: memory.content,
    tags: memory.tags.join(", "),
    confidence: memory.confidence,
    userVerified: memory.userVerified,
    status: memory.status,
    sourceEvidenceIds: memory.sourceEvidenceIds.join(", "),
    changeReason: "Manual edit"
  };
}

function payloadFromDraft(draft: MemoryDraft) {
  return {
    type: draft.type,
    title: draft.title,
    content: draft.content,
    tags: draft.tags,
    confidence: Number(draft.confidence),
    userVerified: draft.userVerified,
    status: draft.status,
    sourceEvidenceIds: draft.sourceEvidenceIds,
    changeReason: draft.changeReason || "Manual edit"
  };
}

export function MemoryWorkspace() {
  const [memories, setMemories] = useState<MemoryDTO[]>([]);
  const [versions, setVersions] = useState<MemoryVersionDTO[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MemoryDraft>(emptyDraft);
  const [isCreating, setIsCreating] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [tag, setTag] = useState("");
  const [status, setStatus] = useState("active");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const selected = memories.find((memory) => memory.id === selectedId) ?? null;

  async function loadMemories() {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (type !== "all") params.set("type", type);
    if (tag) params.set("tag", tag);
    params.set("status", status);
    const response = await fetch(`/api/memories?${params.toString()}`);
    setMemories(await response.json());
    setLoading(false);
  }

  async function loadVersions(memoryId: string) {
    const response = await fetch(`/api/memories/${memoryId}/versions`);
    setVersions(await response.json());
  }

  useEffect(() => {
    void loadMemories();
  }, [search, type, tag, status]);

  useEffect(() => {
    if (selected) {
      setDraft(draftFromMemory(selected));
      void loadVersions(selected.id);
    } else if (!isCreating) {
      setVersions([]);
    }
  }, [selectedId]);

  const grouped = useMemo(() => {
    return memories.reduce<Record<string, MemoryDTO[]>>((acc, memory) => {
      acc[memory.type] = acc[memory.type] ?? [];
      acc[memory.type].push(memory);
      return acc;
    }, {});
  }, [memories]);

  function startCreate() {
    setIsCreating(true);
    setSelectedId(null);
    setVersions([]);
    setDraft({ ...emptyDraft, changeReason: "Created manually" });
  }

  async function saveDraft() {
    setSaving(true);
    const payload = payloadFromDraft(draft);
    const response = await fetch(isCreating ? "/api/memories" : `/api/memories/${selectedId}`, {
      method: isCreating ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const saved = (await response.json()) as MemoryDTO;
    await loadMemories();
    setIsCreating(false);
    setSelectedId(saved.id);
    await loadVersions(saved.id);
    setSaving(false);
  }

  async function archiveSelected() {
    if (!selected) return;
    await fetch(`/api/memories/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived", changeReason: "Archived from detail panel" })
    });
    setSelectedId(null);
    await loadMemories();
  }

  async function deleteSelected() {
    if (!selected) return;
    await fetch(`/api/memories/${selected.id}`, { method: "DELETE" });
    setSelectedId(null);
    await loadMemories();
  }

  async function rollback(versionId: string) {
    if (!selected) return;
    const response = await fetch(`/api/memories/${selected.id}/rollback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionId })
    });
    const restored = (await response.json()) as MemoryDTO;
    await loadMemories();
    setSelectedId(restored.id);
    await loadVersions(restored.id);
  }

  const drawerOpen = isCreating || Boolean(selected);

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 border-b border-line pb-4 lg:flex-row lg:items-end">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Memories</h1>
          <p className="mt-1 text-sm text-slate-600">透明、可编辑、可回滚的职业记忆原子。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn" onClick={() => setViewMode(viewMode === "board" ? "table" : "board")}>
            {viewMode === "board" ? <List size={16} /> : <LayoutGrid size={16} />}
            {viewMode === "board" ? "Table View" : "Board View"}
          </button>
          <button className="btn-primary" onClick={startCreate}>
            <Plus size={16} />
            New Memory
          </button>
        </div>
      </div>

      <div className="grid gap-3 rounded-lg border border-line bg-white p-3 lg:grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-400" size={16} />
          <input
            className="field pl-9"
            placeholder="Search title, content, tags"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <select className="field" value={type} onChange={(event) => setType(event.target.value)}>
          <option value="all">All types</option>
          {MEMORY_TYPES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <input className="field" placeholder="Filter tag" value={tag} onChange={(event) => setTag(event.target.value)} />
        <select className="field" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="rejected">Rejected</option>
          <option value="all">All status</option>
        </select>
      </div>

      {loading ? (
        <EmptyState title="Loading memories" />
      ) : memories.length === 0 ? (
        <EmptyState title="No memories yet" text="新增一条 Memory，或先运行 Evidence 分析后接受 MemorySuggestion。" />
      ) : viewMode === "board" ? (
        <div className="grid gap-4 xl:grid-cols-3">
          {Object.entries(grouped).map(([group, items]) => (
            <section key={group} className="min-w-0 rounded-lg border border-line bg-white p-3">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ink">{group}</h2>
                <Badge>{items.length}</Badge>
              </div>
              <div className="space-y-3">
                {items.map((memory) => (
                  <button
                    key={memory.id}
                    className="w-full rounded-md border border-line bg-white p-3 text-left transition hover:border-focus hover:bg-teal-50/40"
                    onClick={() => {
                      setIsCreating(false);
                      setSelectedId(memory.id);
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-sm font-semibold text-ink">{memory.title}</h3>
                      <Badge tone={memory.userVerified ? "green" : "amber"}>{memory.userVerified ? "verified" : "draft"}</Badge>
                    </div>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{memory.content}</p>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {memory.tags.slice(0, 4).map((item) => (
                        <Badge key={item} tone="blue">
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-mist text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Title</th>
                <th className="px-3 py-3">Tags</th>
                <th className="px-3 py-3">Confidence</th>
                <th className="px-3 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {memories.map((memory) => (
                <tr
                  key={memory.id}
                  className="cursor-pointer border-t border-line transition hover:bg-teal-50/40"
                  onClick={() => {
                    setIsCreating(false);
                    setSelectedId(memory.id);
                  }}
                >
                  <td className="px-3 py-3">{memory.type}</td>
                  <td className="px-3 py-3 font-medium text-ink">{memory.title}</td>
                  <td className="px-3 py-3 text-slate-600">{memory.tags.join(", ")}</td>
                  <td className="px-3 py-3">{Math.round(memory.confidence * 100)}%</td>
                  <td className="px-3 py-3">{memory.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {drawerOpen ? (
        <aside className="fixed inset-y-0 right-0 z-30 flex w-full max-w-2xl flex-col border-l border-line bg-white shadow-subtle">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-ink">{isCreating ? "New Memory" : "Memory Detail"}</h2>
              <p className="text-xs text-slate-500">{selected?.id ?? "Manual memory"}</p>
            </div>
            <button
              className="btn"
              onClick={() => {
                setSelectedId(null);
                setIsCreating(false);
              }}
              aria-label="Close detail"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-medium text-slate-700">
                Type
                <select className="field" value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}>
                  {MEMORY_TYPES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700">
                Status
                <select
                  className="field"
                  value={draft.status}
                  onChange={(event) => setDraft({ ...draft, status: event.target.value })}
                >
                  <option value="active">active</option>
                  <option value="archived">archived</option>
                  <option value="rejected">rejected</option>
                </select>
              </label>
            </div>

            <label className="space-y-1 text-sm font-medium text-slate-700">
              Title
              <input className="field" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
            </label>

            <label className="space-y-1 text-sm font-medium text-slate-700">
              Content
              <textarea
                className="field min-h-32"
                value={draft.content}
                onChange={(event) => setDraft({ ...draft, content: event.target.value })}
              />
            </label>

            <label className="space-y-1 text-sm font-medium text-slate-700">
              Tags
              <input className="field" value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} />
            </label>

            <label className="space-y-1 text-sm font-medium text-slate-700">
              Source Evidence IDs
              <input
                className="field"
                value={draft.sourceEvidenceIds}
                onChange={(event) => setDraft({ ...draft, sourceEvidenceIds: event.target.value })}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Confidence {Math.round(draft.confidence * 100)}%
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={draft.confidence}
                  onChange={(event) => setDraft({ ...draft, confidence: Number(event.target.value) })}
                  className="w-full accent-teal-700"
                />
              </label>
              <label className="flex items-center gap-2 rounded-md border border-line bg-mist px-3 py-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={draft.userVerified}
                  onChange={(event) => setDraft({ ...draft, userVerified: event.target.checked })}
                />
                User verified
              </label>
            </div>

            <label className="space-y-1 text-sm font-medium text-slate-700">
              Change reason
              <input
                className="field"
                value={draft.changeReason}
                onChange={(event) => setDraft({ ...draft, changeReason: event.target.value })}
              />
            </label>

            {!isCreating ? (
              <section className="rounded-lg border border-line bg-mist p-3">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                  <History size={16} />
                  Version History
                </div>
                <div className="space-y-2">
                  {versions.map((version) => (
                    <div key={version.id} className="rounded-md border border-line bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-ink">{version.changeReason}</p>
                          <p className="text-xs text-slate-500">{new Date(version.createdAt).toLocaleString()}</p>
                          <p className="mt-1 text-xs text-slate-600">{version.snapshot.title}</p>
                        </div>
                        <button className="btn" onClick={() => rollback(version.id)} title="Rollback to this version">
                          <RotateCcw size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-4">
            <div className="flex gap-2">
              {!isCreating ? (
                <>
                  <button className="btn" onClick={archiveSelected}>
                    <Archive size={16} />
                    Archive
                  </button>
                  <button className="btn-danger" onClick={deleteSelected}>
                    <Trash2 size={16} />
                    Delete
                  </button>
                </>
              ) : null}
            </div>
            <button className="btn-primary" onClick={saveDraft} disabled={saving || !draft.title || !draft.content}>
              <Save size={16} />
              {saving ? "Saving" : "Save"}
            </button>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
