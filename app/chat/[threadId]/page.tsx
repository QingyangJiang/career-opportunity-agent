import { Suspense } from "react";
import { ChatWorkspace } from "@/components/chat/ChatWorkspace";

export default function ChatThreadPage({ params }: { params: { threadId: string } }) {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">Loading chat...</div>}>
      <ChatWorkspace initialThreadId={params.threadId} />
    </Suspense>
  );
}
