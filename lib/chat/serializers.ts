import type { ChatContextAttachment, ChatMessage, ChatThread } from "@prisma/client";
import type { ChatContextAttachmentDTO, ChatMessageDTO, ChatThreadDTO } from "@/lib/types";
import { parseJson } from "@/lib/utils/json";

type ChatThreadWithRelations = ChatThread & {
  messages?: ChatMessage[];
  attachments?: ChatContextAttachment[];
};

export function toChatMessageDTO(message: ChatMessage): ChatMessageDTO {
  return {
    id: message.id,
    threadId: message.threadId,
    role: message.role,
    content: message.content,
    agentRunId: message.agentRunId,
    metadata: parseJson<unknown>(message.metadataJson, null),
    createdAt: message.createdAt.toISOString()
  };
}

export function toChatContextAttachmentDTO(attachment: ChatContextAttachment): ChatContextAttachmentDTO {
  return {
    id: attachment.id,
    threadId: attachment.threadId,
    entityType: attachment.entityType,
    entityId: attachment.entityId,
    createdAt: attachment.createdAt.toISOString()
  };
}

export function toChatThreadDTO(thread: ChatThreadWithRelations): ChatThreadDTO {
  return {
    id: thread.id,
    title: thread.title,
    summary: thread.summary,
    status: thread.status,
    provider: thread.provider,
    model: thread.model,
    providerLabel: thread.providerLabel,
    thinking: thread.thinking,
    reasoningEffort: thread.reasoningEffort,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
    lastMessageAt: thread.lastMessageAt.toISOString(),
    messages: thread.messages?.map(toChatMessageDTO),
    attachments: thread.attachments?.map(toChatContextAttachmentDTO)
  };
}
