import { ChatWorkspace } from "@/components/chat/ChatWorkspace";

export default function ChatThreadPage({ params }: { params: { threadId: string } }) {
  return <ChatWorkspace initialThreadId={params.threadId} />;
}
