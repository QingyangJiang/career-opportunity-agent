"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, BrainCircuit, BriefcaseBusiness, FileText, History, Home, MessageSquarePlus, MessageSquareText, Sparkles, Trash2 } from "lucide-react";
import type { ChatThreadDTO } from "@/lib/types";

const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/chat", label: "Chat", icon: MessageSquareText },
  { href: "/memories", label: "Memories", icon: BrainCircuit },
  { href: "/evidence", label: "Evidence", icon: FileText },
  { href: "/opportunities", label: "Opportunities", icon: BriefcaseBusiness },
  { href: "/agent-runs", label: "Agent Runs", icon: History }
];

const pinnedItems = [
  { href: "/chat/new", label: "New career task" },
  { href: "/agent-runs", label: "Review agent traces" }
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function shortDate(value: string) {
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric" });
}

export function AppSidebar() {
  const pathname = usePathname();
  const [threads, setThreads] = useState<ChatThreadDTO[]>([]);
  const [archivedThreads, setArchivedThreads] = useState<ChatThreadDTO[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [archiveNotice, setArchiveNotice] = useState<{ threadId: string; title: string } | null>(null);

  async function loadThreads() {
    void Promise.all([
      fetch("/api/chat/threads?status=active").then((response) => (response.ok ? response.json() : [])),
      fetch("/api/chat/threads?status=archived").then((response) => (response.ok ? response.json() : []))
    ])
      .then(([activeItems, archivedItems]: [ChatThreadDTO[], ChatThreadDTO[]]) => {
        setThreads(activeItems.slice(0, 8));
        setArchivedThreads(archivedItems.slice(0, 12));
      })
      .catch(() => {
        setThreads([]);
        setArchivedThreads([]);
      });
  }

  useEffect(() => {
    void loadThreads();
  }, [pathname]);

  useEffect(() => {
    function onChanged() {
      void loadThreads();
    }
    window.addEventListener("pending-actions:changed", onChanged);
    window.addEventListener("chat-threads:changed", onChanged);
    return () => {
      window.removeEventListener("pending-actions:changed", onChanged);
      window.removeEventListener("chat-threads:changed", onChanged);
    };
  }, []);

  async function archiveThread(threadId: string) {
    const thread = threads.find((item) => item.id === threadId);
    await fetch(`/api/chat/threads/${threadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived" })
    });
    if (thread) setArchiveNotice({ threadId, title: thread.title });
    window.dispatchEvent(new Event("chat-threads:changed"));
  }

  async function unarchiveThread(threadId: string) {
    await fetch(`/api/chat/threads/${threadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" })
    });
    setArchiveNotice(null);
    setShowArchived(false);
    window.dispatchEvent(new Event("chat-threads:changed"));
  }

  async function deleteThread(threadId: string) {
    const confirmed = window.confirm("Delete this chat thread?");
    if (!confirmed) return;
    await fetch(`/api/chat/threads/${threadId}`, { method: "DELETE" });
    window.dispatchEvent(new Event("chat-threads:changed"));
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200/70 bg-[#f7faf9]/95 px-3 py-4 backdrop-blur lg:flex">
      <Link href="/" className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-semibold text-ink">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-teal-50 text-focus">
          <BrainCircuit size={16} />
        </span>
        <span>Career Memory Agent</span>
      </Link>

      <Link
        href="/chat/new"
        className="mt-4 inline-flex h-9 items-center justify-start gap-2 rounded-md border border-teal-200 bg-white px-3 text-sm font-semibold text-focus transition hover:border-teal-300 hover:bg-teal-50"
      >
        <MessageSquarePlus size={16} />
        New Chat
      </Link>

      <nav className="mt-4 space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex h-9 items-center gap-2.5 rounded-md px-3 text-sm font-medium transition ${
                active ? "bg-teal-50 text-focus" : "text-slate-600 hover:bg-white/75 hover:text-ink"
              }`}
            >
              <Icon size={16} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-5">
        <div className="mb-1.5 flex items-center gap-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          <Sparkles size={13} />
          Pinned
        </div>
        <div className="space-y-0.5">
          {pinnedItems.map((item) => (
            <Link key={item.href} href={item.href} className="block rounded-md px-3 py-1.5 text-sm text-slate-600 transition hover:bg-white/75 hover:text-ink">
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-5 min-h-0 flex-1 overflow-hidden">
        <div className="mb-1.5 flex items-center justify-between gap-2 px-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Recent</p>
          <button
            className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium transition ${
              showArchived ? "bg-teal-50 text-focus" : "text-slate-400 hover:bg-white hover:text-focus"
            }`}
            type="button"
            onClick={() => setShowArchived((value) => !value)}
            aria-expanded={showArchived}
          >
            Archived{archivedThreads.length ? ` ${archivedThreads.length}` : ""}
          </button>
        </div>
        {archiveNotice ? (
          <div className="mb-1.5 rounded-md bg-teal-50 px-2.5 py-2 text-xs text-slate-700">
            <div className="line-clamp-1">Conversation archived</div>
            <button className="mt-1 font-semibold text-focus" type="button" onClick={() => unarchiveThread(archiveNotice.threadId)}>
              Undo
            </button>
          </div>
        ) : null}
        <div className="max-h-full space-y-px overflow-y-auto pr-1">
          {threads.length ? (
            threads.map((thread) => {
              const selected = pathname === `/chat/${thread.id}`;
              return (
                <div
                  key={thread.id}
                  className={`group relative rounded-md transition ${
                    selected ? "bg-teal-50" : "hover:bg-white/75"
                  }`}
                >
                  <Link href={`/chat/${thread.id}`} className="block min-h-[58px] px-2.5 py-1.5 pr-20">
                    <p className="line-clamp-2 text-[13px] font-medium leading-[18px] text-ink">{thread.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{shortDate(thread.lastMessageAt)}</p>
                  </Link>
                  {thread.pendingCount ? (
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold leading-4 text-amber-700 ring-1 ring-amber-100">
                      {thread.pendingCount} pending
                    </span>
                  ) : null}
                  <div className="absolute bottom-1 right-1.5 flex gap-1 opacity-0 transition group-hover:opacity-100">
                    <button
                      className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-white hover:text-ink"
                      title="Archive"
                      onClick={() => archiveThread(thread.id)}
                    >
                      <Archive size={12} />
                    </button>
                    <button
                      className="flex h-6 w-6 items-center justify-center rounded-md text-red-400 transition hover:bg-red-50 hover:text-red-600"
                      title="Delete"
                      onClick={() => deleteThread(thread.id)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="px-3 py-2 text-sm text-slate-500">No conversations yet</p>
          )}
        </div>
      </div>

      {showArchived ? (
        <div className="fixed left-64 top-[420px] z-40 w-80 rounded-xl border border-slate-200 bg-white p-2 shadow-[0_18px_48px_rgba(15,23,42,0.14)]">
          <div className="flex items-center justify-between px-2 pb-2 pt-1">
            <div>
              <p className="text-sm font-semibold text-ink">Archived conversations</p>
              <p className="text-xs text-slate-500">{archivedThreads.length} archived</p>
            </div>
            <button
              className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-ink"
              type="button"
              onClick={() => setShowArchived(false)}
            >
              Close
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {archivedThreads.length ? (
              <div className="space-y-px">
                {archivedThreads.map((thread) => (
                  <div key={thread.id} className="group relative rounded-lg transition hover:bg-slate-50">
                    <Link
                      href={`/chat/${thread.id}`}
                      className="block min-h-[56px] px-2.5 py-2 pr-24"
                      onClick={() => setShowArchived(false)}
                    >
                      <p className="line-clamp-2 text-[13px] font-medium leading-[18px] text-ink">{thread.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{shortDate(thread.lastMessageAt)}</p>
                    </Link>
                    {thread.pendingCount ? (
                      <span className="absolute right-2 top-2 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold leading-4 text-amber-700 ring-1 ring-amber-100">
                        {thread.pendingCount} pending
                      </span>
                    ) : null}
                    <button
                      className="absolute bottom-2 right-2 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-500 transition hover:bg-teal-50 hover:text-focus"
                      type="button"
                      onClick={() => unarchiveThread(thread.id)}
                    >
                      Unarchive
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-2 py-4 text-sm text-slate-500">No archived conversations yet.</p>
            )}
          </div>
        </div>
      ) : null}

      <div className="mt-4 border-t border-slate-200/70 px-2 pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Provider</p>
        <p className="mt-1 text-xs font-medium text-slate-600">MockLLMProvider</p>
      </div>
    </aside>
  );
}
